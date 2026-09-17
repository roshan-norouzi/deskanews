import { BadRequestException, ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AutomationJobService } from '../../common/services/automation-job.service';
import { GapGptClient, type NewsImportance } from './gapgpt.client';
import { PublishingSettingsService } from './publishing-settings.service';
import type { PublishingSettings } from './dto/publishing-settings.dto';
import { WordPressClient, type ManagedWordPressPost } from './wordpress.client';
import type { ListWordPressPostsDto } from './dto/wordpress-post.dto';

export interface ImportanceView {
  importance: NewsImportance;
  score: number;
  reason: string;
  newsValues: string[];
  source: 'ai' | 'manual' | 'wordpress';
  evaluatedAt: string;
}

function enabled(value: string | undefined): boolean {
  return value === 'true';
}

function cleanText(value: string): string {
  return value
    .replace(/<script[\s\S]*?<\/script>/giu, ' ')
    .replace(/<style[\s\S]*?<\/style>/giu, ' ')
    .replace(/<[^>]*>/gu, ' ')
    .replace(/&nbsp;/giu, ' ')
    .replace(/&amp;/giu, '&')
    .replace(/&lt;/giu, '<')
    .replace(/&gt;/giu, '>')
    .replace(/&quot;/giu, '"')
    .replace(/&#0*39;/giu, "'")
    .replace(/\s+/gu, ' ')
    .trim();
}

function safeDate(value: string): Date | null {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

@Injectable()
export class WordPressMediaService {
  private readonly logger = new Logger(WordPressMediaService.name);
  private maintenanceRunning = false;
  private readonly lastAutomaticRun = new Map<string, number>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: PublishingSettingsService,
    private readonly wordpress: WordPressClient,
    private readonly gapGpt: GapGptClient,
    private readonly jobs: AutomationJobService,
  ) {}

  async settingsForMedia(tenantId: string): Promise<PublishingSettings> {
    const settings = await this.settings.getRaw(tenantId);
    if (!enabled(settings.wp_media_management_enabled)) {
      throw new ForbiddenException('مدیریت نوشته‌های WordPress غیرفعال است؛ ابتدا آن را در تنظیمات نشر هوشمند فعال کنید');
    }
    return settings;
  }

  async listPosts(tenantId: string, query: ListWordPressPostsDto) {
    const settings = await this.settingsForMedia(tenantId);
    const importanceEnabled = enabled(settings.wp_news_importance_enabled);
    const tagIds = importanceEnabled
      ? await this.wordpress.importanceTagIds(settings).catch(() => ({ important: null, normal: null }))
      : { important: null, normal: null };
    if (query.importance && !tagIds[query.importance]) {
      return { posts: [], page: query.page || 1, perPage: query.perPage || 20, total: 0, totalPages: 0 };
    }
    const { importance, ...wordpressQuery } = query;
    const result = await this.wordpress.listPosts(settings, {
      ...wordpressQuery,
      ...(importance ? { tagId: tagIds[importance] || undefined } : {}),
    });
    if (!importanceEnabled || !result.posts.length) {
      return { ...result, posts: result.posts.map((post) => ({ ...post, importanceEvaluation: null })) };
    }
    const postIds = result.posts.map((post) => post.id);
    const evaluations = await this.prisma.wordPressNewsEvaluation.findMany({ where: { tenantId, wordpressPostId: { in: postIds } } });
    const byPostId = new Map(evaluations.map((item) => [item.wordpressPostId, item]));
    const wordpressCorrections = result.posts.flatMap((post) => {
      const wordpressImportance = this.wordpressImportance(post, tagIds);
      const current = byPostId.get(post.id);
      if (!wordpressImportance || wordpressImportance === current?.importance) return [];
      return [this.persist(
        tenantId,
        post,
        wordpressImportance,
        wordpressImportance === 'important' ? 100 : 0,
        'برچسب اهمیت در WordPress توسط سردبیر اصلاح شد.',
        [],
        'manual',
      ).then(async (decision) => {
        if (wordpressImportance === 'important') await this.queueImportanceLearning(tenantId, post.id);
        return decision;
      })];
    });
    if (wordpressCorrections.length) await Promise.all(wordpressCorrections);
    return {
      ...result,
      posts: result.posts.map((post) => ({
        ...post,
        importanceEvaluation: this.importanceView(post, byPostId.get(post.id), tagIds),
      })),
    };
  }

  async getPost(tenantId: string, postId: string | number) {
    const settings = await this.settingsForMedia(tenantId);
    const post = await this.wordpress.getPost(settings, postId);
    if (!enabled(settings.wp_news_importance_enabled)) return { ...post, importanceEvaluation: null };
    const [evaluation, tagIds] = await Promise.all([
      this.prisma.wordPressNewsEvaluation.findUnique({ where: { tenantId_wordpressPostId: { tenantId, wordpressPostId: post.id } } }),
      this.wordpress.importanceTagIds(settings).catch(() => ({ important: null, normal: null })),
    ]);
    return { ...post, importanceEvaluation: this.importanceView(post, evaluation, tagIds) };
  }

  async evaluate(tenantId: string, postId: string | number, automatic = false) {
    const settings = await this.settings.getRaw(tenantId);
    if (!enabled(settings.wp_media_management_enabled) || !enabled(settings.wp_news_importance_enabled)) {
      if (automatic) return { skipped: true, reason: 'disabled' };
      throw new ForbiddenException('ارزیابی اهمیت خبر در تنظیمات مدیریت رسانه فعال نشده است');
    }
    if (automatic) {
      const current = await this.prisma.wordPressNewsEvaluation.findUnique({
        where: { tenantId_wordpressPostId: { tenantId, wordpressPostId: Number(postId) } },
        select: { source: true },
      });
      if (current?.source === 'manual') return { skipped: true, reason: 'manual-decision-protected' };
    }
    const [post, editorialExamples] = await Promise.all([
      automatic ? this.wordpress.getPost(settings, postId, true) : this.wordpress.getPost(settings, postId),
      this.editorialMemory(tenantId, settings),
    ]);
    if (!post) return { skipped: true, reason: 'wordpress-post-missing' };
    if (post.status !== 'publish') throw new BadRequestException('فقط نوشته‌های منتشرشده قابل ارزیابی اهمیت هستند');
    const evaluation = await this.gapGpt.evaluateNewsImportance(settings, {
      title: cleanText(post.title), excerpt: cleanText(post.excerpt), content: cleanText(post.content),
      audience: String(settings.wp_news_importance_audience || 'مخاطبان عمومی فارسی‌زبان سایت'),
      editorialExamples,
    });
    if (automatic) {
      const latest = await this.prisma.wordPressNewsEvaluation.findUnique({
        where: { tenantId_wordpressPostId: { tenantId, wordpressPostId: post.id } },
        select: { source: true },
      });
      if (latest?.source === 'manual') return { skipped: true, reason: 'manual-decision-protected' };
    }
    await this.wordpress.setImportanceTag(settings, post.id, evaluation.importance);
    return this.persist(tenantId, post, evaluation.importance, evaluation.score, evaluation.reason, evaluation.newsValues, 'ai');
  }

  async override(tenantId: string, postId: string | number, importance: NewsImportance) {
    const settings = await this.settingsForMedia(tenantId);
    if (!enabled(settings.wp_news_importance_enabled)) throw new ForbiddenException('ارزیابی اهمیت خبر فعال نیست');
    const post = await this.wordpress.getPost(settings, postId);
    if (post.status !== 'publish') throw new BadRequestException('فقط نوشته‌های منتشرشده قابل برچسب‌گذاری اهمیت هستند');
    await this.wordpress.setImportanceTag(settings, post.id, importance, post);
    const decision = await this.persist(
      tenantId,
      post,
      importance,
      importance === 'important' ? 100 : 0,
      importance === 'important'
        ? 'تصمیم سردبیر ثبت شد؛ استخراج دلایل اهمیت در صف پردازش است.'
        : 'این خبر به تشخیص سردبیر در گروه خبرهای عادی قرار گرفت.',
      [],
      'manual',
    );
    if (importance === 'important') {
      await this.queueImportanceLearning(tenantId, post.id);
    }
    return decision;
  }

  async learnFromImportantDecision(tenantId: string, postId: string | number) {
    const settings = await this.settings.getRaw(tenantId);
    const wordpressPostId = Number(postId);
    if (!Number.isSafeInteger(wordpressPostId) || wordpressPostId < 1) throw new BadRequestException('شناسه نوشته WordPress معتبر نیست');
    const current = await this.prisma.wordPressNewsEvaluation.findUnique({
      where: { tenantId_wordpressPostId: { tenantId, wordpressPostId } },
      select: { id: true, source: true, importance: true },
    });
    if (!current || current.source !== 'manual' || current.importance !== 'important') {
      return { skipped: true, reason: 'decision-changed' };
    }
    const post = await this.wordpress.getPost(settings, wordpressPostId);
    const learned = await this.gapGpt.extractEditorialImportanceReasons(settings, {
      title: cleanText(post.title),
      excerpt: cleanText(post.excerpt),
      content: cleanText(post.content),
      audience: String(settings.wp_news_importance_audience || 'مخاطبان عمومی فارسی‌زبان سایت'),
    });
    const updated = await this.prisma.wordPressNewsEvaluation.updateMany({
      where: { id: current.id, tenantId, source: 'manual', importance: 'important' },
      data: { reason: learned.reason, newsValues: learned.newsValues as Prisma.InputJsonValue },
    });
    return { updated: updated.count, reason: learned.reason, newsValues: learned.newsValues };
  }

  async automationStatus(tenantId: string) {
    const settings = await this.settings.getRaw(tenantId);
    const [evaluationGroups, latestAiEvaluation, jobGroups, latestJob, latestFailedJob] = await Promise.all([
      this.prisma.wordPressNewsEvaluation.groupBy({
        by: ['source', 'importance'],
        where: { tenantId },
        _count: { _all: true },
      }),
      this.prisma.wordPressNewsEvaluation.findFirst({
        where: { tenantId, source: 'ai' },
        orderBy: { evaluatedAt: 'desc' },
        select: { wordpressPostId: true, postTitle: true, importance: true, score: true, reason: true, evaluatedAt: true },
      }),
      this.prisma.automationJob.groupBy({
        by: ['status'],
        where: { tenantId, type: { in: ['wordpress.importance.evaluate', 'wordpress.importance.reevaluate-all'] } },
        _count: { _all: true },
      }),
      this.prisma.automationJob.findFirst({
        where: { tenantId, type: { in: ['wordpress.importance.evaluate', 'wordpress.importance.reevaluate-all'] } },
        orderBy: { createdAt: 'desc' },
        select: { id: true, status: true, attempts: true, maxAttempts: true, createdAt: true, startedAt: true, completedAt: true, lastError: true },
      }),
      this.prisma.automationJob.findFirst({
        where: { tenantId, type: { in: ['wordpress.importance.evaluate', 'wordpress.importance.reevaluate-all'] }, status: 'dead' },
        orderBy: { completedAt: 'desc' },
        select: { id: true, attempts: true, completedAt: true, lastError: true },
      }),
    ]);
    const evaluations = { ai: 0, manual: 0, important: 0, normal: 0, total: 0 };
    for (const row of evaluationGroups) {
      const count = row._count._all;
      if (row.source === 'ai') evaluations.ai += count;
      if (row.source === 'manual') evaluations.manual += count;
      if (row.importance === 'important') evaluations.important += count;
      if (row.importance === 'normal') evaluations.normal += count;
      evaluations.total += count;
    }
    const jobs = { queued: 0, running: 0, completed: 0, dead: 0, cancelled: 0 };
    for (const row of jobGroups) {
      if (row.status in jobs) jobs[row.status as keyof typeof jobs] = row._count._all;
    }
    return {
      enabled: enabled(settings.wp_media_management_enabled) && enabled(settings.wp_news_importance_enabled),
      automaticEnabled: enabled(settings.wp_news_importance_auto_enabled),
      intervalMinutes: Math.max(1, Math.min(1440, Number.parseInt(settings.wp_news_importance_interval_minutes || '5', 10) || 5)),
      lastSchedulerScanAt: this.lastAutomaticRun.get(tenantId) ? new Date(this.lastAutomaticRun.get(tenantId)!).toISOString() : null,
      evaluations,
      jobs,
      latestAiEvaluation: latestAiEvaluation ? { ...latestAiEvaluation, evaluatedAt: latestAiEvaluation.evaluatedAt.toISOString() } : null,
      latestJob,
      latestFailedJob,
    };
  }

  async editorialMemorySummary(tenantId: string) {
    const settings = await this.settings.getRaw(tenantId);
    const exampleLimit = Math.max(0, Math.min(40, Number.parseInt(settings.wp_news_importance_memory_examples || '12', 10) || 0));
    const [decisions, learningJobGroups] = await Promise.all([
      this.prisma.wordPressNewsEvaluation.findMany({
        where: { tenantId, source: 'manual' },
        orderBy: [{ updatedAt: 'desc' }],
        take: 500,
        select: { importance: true, reason: true, newsValues: true, updatedAt: true },
      }),
      this.prisma.automationJob.groupBy({
        by: ['status'],
        where: { tenantId, type: 'wordpress.importance.learn', status: { in: ['queued', 'running', 'dead'] } },
        _count: { _all: true },
      }),
    ]);

    const importantDecisions = decisions.filter((item) => item.importance === 'important');
    const normalDecisions = decisions.filter((item) => item.importance === 'normal');
    const reasonCounts = new Map<string, { text: string; count: number; updatedAt: Date }>();
    const valueCounts = new Map<string, number>();
    let lastLearnedAt: Date | null = null;
    for (const decision of importantDecisions) {
      const reason = cleanText(decision.reason);
      const isLearned = reason
        && !reason.includes('در صف پردازش')
        && !reason.startsWith('تصمیم سردبیر ثبت شد')
        && !reason.startsWith('برچسب اهمیت در WordPress');
      if (!isLearned) continue;
      const key = reason.toLocaleLowerCase('fa');
      const current = reasonCounts.get(key);
      reasonCounts.set(key, current
        ? { ...current, count: current.count + 1, updatedAt: current.updatedAt > decision.updatedAt ? current.updatedAt : decision.updatedAt }
        : { text: reason, count: 1, updatedAt: decision.updatedAt });
      if (!lastLearnedAt || decision.updatedAt > lastLearnedAt) lastLearnedAt = decision.updatedAt;
      if (Array.isArray(decision.newsValues)) {
        for (const value of new Set(decision.newsValues.map((item) => String(item).trim()).filter(Boolean))) {
          valueCounts.set(value, (valueCounts.get(value) || 0) + 1);
        }
      }
    }

    const perClassLimit = Math.ceil(exampleLimit / 2);
    const activeExamples = Math.min(exampleLimit,
      Math.min(normalDecisions.length, perClassLimit) + Math.min(importantDecisions.length, perClassLimit));
    const jobs = { pending: 0, failed: 0 };
    for (const row of learningJobGroups) {
      if (row.status === 'queued' || row.status === 'running') jobs.pending += row._count._all;
      if (row.status === 'dead') jobs.failed += row._count._all;
    }
    return {
      enabled: exampleLimit > 0,
      exampleLimit,
      activeExamples,
      decisions: { total: decisions.length, important: importantDecisions.length, normal: normalDecisions.length },
      learnedRules: [...reasonCounts.values()]
        .sort((left, right) => right.count - left.count || right.updatedAt.getTime() - left.updatedAt.getTime())
        .slice(0, 12)
        .map(({ text, count }) => ({ text, count })),
      newsValues: [...valueCounts.entries()]
        .map(([key, count]) => ({ key, count }))
        .sort((left, right) => right.count - left.count || left.key.localeCompare(right.key))
        .slice(0, 10),
      lastLearnedAt: lastLearnedAt?.toISOString() || null,
      learningJobs: jobs,
    };
  }

  async queueEvaluations(tenantId: string, limit?: number, automatic = false) {
    const settings = await this.settings.getRaw(tenantId);
    if (!enabled(settings.wp_media_management_enabled) || !enabled(settings.wp_news_importance_enabled)) return { queued: 0, skipped: true };
    if (automatic && !enabled(settings.wp_news_importance_auto_enabled)) return { queued: 0, skipped: true, reason: 'automatic-disabled' };
    const queueLimit = limit ?? Math.max(1, Math.min(50, Number.parseInt(settings.wp_news_importance_batch_size || '20', 10) || 20));
    let queued = 0;
    let scanned = 0;
    const tagIds = await this.wordpress.importanceTagIds(settings).catch(() => ({ important: null, normal: null }));
    for (let page = 1; page <= 5 && queued < queueLimit; page += 1) {
      const result = await this.wordpress.listPosts(settings, { status: 'publish', page, perPage: 20 });
      if (!result.posts.length) break;
      scanned += result.posts.length;
      const evaluations = await this.prisma.wordPressNewsEvaluation.findMany({
        where: { tenantId, wordpressPostId: { in: result.posts.map((post) => post.id) } },
        select: { wordpressPostId: true, wordpressModifiedAt: true, source: true, importance: true },
      });
      const byPostId = new Map(evaluations.map((item) => [item.wordpressPostId, item]));
      for (const post of result.posts) {
        if (queued >= queueLimit) break;
        const current = byPostId.get(post.id);
        const wordpressImportance = this.wordpressImportance(post, tagIds);
        if (wordpressImportance && wordpressImportance !== current?.importance) {
          await this.persist(tenantId, post, wordpressImportance, wordpressImportance === 'important' ? 100 : 0, 'برچسب اهمیت در WordPress توسط کاربر اصلاح شد.', [], 'manual');
          if (wordpressImportance === 'important') await this.queueImportanceLearning(tenantId, post.id);
          continue;
        }
        const modifiedAt = safeDate(post.modified);
        if (current?.source === 'manual') continue;
        if (current && (!modifiedAt || (current.wordpressModifiedAt && current.wordpressModifiedAt >= modifiedAt))) continue;
        const job = await this.jobs.enqueue({
          tenantId,
          type: 'wordpress.importance.evaluate',
          payload: { postId: String(post.id) },
          dedupeKey: `wordpress:${post.id}:importance:${post.modified || 'unknown'}`,
          priority: 5,
          maxAttempts: 4,
        });
        if (job.created) queued += 1;
      }
      if (result.posts.length < 20 || (Number.isFinite(result.totalPages) && page >= result.totalPages)) break;
    }
    return { queued, scanned };
  }

  async queueAllReevaluations(tenantId: string) {
    const settings = await this.settings.getRaw(tenantId);
    if (!enabled(settings.wp_media_management_enabled) || !enabled(settings.wp_news_importance_enabled)) {
      throw new ForbiddenException('ارزیابی اهمیت خبر در تنظیمات مدیریت رسانه فعال نشده است');
    }
    const batchId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const queued = await this.jobs.enqueue({
      tenantId,
      type: 'wordpress.importance.reevaluate-all',
      payload: { batchId },
      dedupeKey: 'wordpress:importance:reevaluate-all',
      priority: 7,
      maxAttempts: 4,
    });
    return {
      started: queued.created,
      alreadyRunning: !queued.created,
      message: queued.created
        ? 'بازارزیابی همه خبرها در صف قرار گرفت.'
        : 'بازارزیابی همه خبرها از قبل در صف یا در حال اجرا است.',
    };
  }

  async reevaluateAll(tenantId: string, batchId: string) {
    const settings = await this.settings.getRaw(tenantId);
    if (!enabled(settings.wp_media_management_enabled) || !enabled(settings.wp_news_importance_enabled)) {
      return { skipped: true, reason: 'disabled' };
    }
    let queued = 0;
    let scanned = 0;
    let preservedManual = 0;
    let page = 1;
    let totalPages = 1;
    do {
      const result = await this.wordpress.listPosts(settings, { status: 'publish', page, perPage: 100 });
      if (!result.posts.length) break;
      scanned += result.posts.length;
      totalPages = Math.max(1, Math.min(1000, Number.isFinite(result.totalPages) ? result.totalPages : page));
      const evaluations = await this.prisma.wordPressNewsEvaluation.findMany({
        where: { tenantId, wordpressPostId: { in: result.posts.map((post) => post.id) } },
        select: { wordpressPostId: true, source: true },
      });
      const manualPostIds = new Set(evaluations.filter((item) => item.source === 'manual').map((item) => item.wordpressPostId));
      for (const post of result.posts) {
        if (manualPostIds.has(post.id)) {
          preservedManual += 1;
          continue;
        }
        const job = await this.jobs.enqueue({
          tenantId,
          type: 'wordpress.importance.evaluate',
          payload: { postId: String(post.id), reevaluationBatchId: batchId },
          dedupeKey: `wordpress:${post.id}:importance:reevaluate:${batchId}`,
          priority: 5,
          maxAttempts: 4,
        });
        if (job.created) queued += 1;
      }
      page += 1;
    } while (page <= totalPages);
    return { queued, scanned, preservedManual };
  }

  @Interval('wordpress-news-importance-maintenance', 60_000)
  async maintenance() {
    if (this.maintenanceRunning) return;
    this.maintenanceRunning = true;
    try {
      const tenants = await this.prisma.tenantModule.findMany({
        where: { moduleId: 'smart-publishing', enabled: true, tenant: { isActive: true } },
        select: { tenantId: true },
      });
      for (const tenant of tenants) {
        const settings = await this.settings.getRaw(tenant.tenantId);
        if (!enabled(settings.wp_media_management_enabled) || !enabled(settings.wp_news_importance_enabled) || !enabled(settings.wp_news_importance_auto_enabled)) {
          this.lastAutomaticRun.delete(tenant.tenantId);
          continue;
        }
        const intervalMinutes = Math.max(1, Math.min(1440, Number.parseInt(settings.wp_news_importance_interval_minutes || '5', 10) || 5));
        const now = Date.now();
        if (now - (this.lastAutomaticRun.get(tenant.tenantId) || 0) < intervalMinutes * 60_000) continue;
        this.lastAutomaticRun.set(tenant.tenantId, now);
        await this.queueEvaluations(tenant.tenantId, undefined, true).catch((error) => {
          this.logger.warn(`WordPress importance scheduling failed for tenant ${tenant.tenantId}: ${error instanceof Error ? error.message : 'unknown error'}`);
        });
      }
    } catch (error) {
      this.logger.error(`WordPress importance maintenance failed: ${error instanceof Error ? error.message : 'unknown error'}`);
    } finally {
      this.maintenanceRunning = false;
    }
  }

  private importanceView(
    post: ManagedWordPressPost,
    evaluation: { importance: string; score: number; reason: string; newsValues: Prisma.JsonValue; source: string; evaluatedAt: Date } | null | undefined,
    tagIds: { important: number | null; normal: number | null },
  ): ImportanceView | null {
    const wordpressImportance = this.wordpressImportance(post, tagIds);
    if (!evaluation && !wordpressImportance) return null;
    const newsValues = evaluation && Array.isArray(evaluation.newsValues)
      ? evaluation.newsValues.map((item) => String(item)).filter(Boolean).slice(0, 10)
      : [];
    return {
      importance: wordpressImportance || (evaluation?.importance === 'important' ? 'important' : 'normal'),
      score: evaluation?.score ?? (wordpressImportance === 'important' ? 100 : 0),
      reason: evaluation?.reason || 'برچسب اهمیت در WordPress ثبت شده است.',
      newsValues,
      source: wordpressImportance && wordpressImportance !== evaluation?.importance ? 'wordpress' : evaluation?.source === 'manual' ? 'manual' : 'ai',
      evaluatedAt: evaluation?.evaluatedAt.toISOString() || '',
    };
  }

  private async editorialMemory(tenantId: string, settings: PublishingSettings) {
    const exampleLimit = Math.max(0, Math.min(40, Number.parseInt(settings.wp_news_importance_memory_examples || '12', 10) || 0));
    if (exampleLimit === 0) return [];
    const decisions = await this.prisma.wordPressNewsEvaluation.findMany({
      where: { tenantId, source: 'manual' },
      orderBy: [{ overriddenAt: 'desc' }, { updatedAt: 'desc' }],
      take: Math.min(200, Math.max(20, exampleLimit * 5)),
      select: { postTitle: true, importance: true, reason: true },
    });
    const perClassLimit = Math.ceil(exampleLimit / 2);
    const important = decisions
      .filter((item) => item.importance === 'important' && cleanText(item.postTitle))
      .slice(0, perClassLimit)
      .map((item) => ({ title: cleanText(item.postTitle), importance: 'important' as const, reason: cleanText(item.reason) }));
    const normal = decisions
      .filter((item) => item.importance === 'normal' && cleanText(item.postTitle))
      .slice(0, perClassLimit)
      .map((item) => ({ title: cleanText(item.postTitle), importance: 'normal' as const, reason: cleanText(item.reason) }));
    const balanced = [] as Array<{ title: string; importance: NewsImportance; reason?: string }>;
    for (let index = 0; index < Math.max(important.length, normal.length); index += 1) {
      if (normal[index]) balanced.push(normal[index]);
      if (important[index]) balanced.push(important[index]);
    }
    return balanced.slice(0, exampleLimit);
  }

  private wordpressImportance(post: ManagedWordPressPost, tagIds: { important: number | null; normal: number | null }): NewsImportance | null {
    const tags = Array.isArray(post.tags) ? post.tags : [];
    if (tagIds.important && tags.includes(tagIds.important)) return 'important';
    if (tagIds.normal && tags.includes(tagIds.normal)) return 'normal';
    return null;
  }

  private queueImportanceLearning(tenantId: string, postId: number) {
    return this.jobs.enqueue({
      tenantId,
      type: 'wordpress.importance.learn',
      payload: { postId: String(postId) },
      dedupeKey: `wordpress:${postId}:importance:learn`,
      priority: 8,
      maxAttempts: 4,
    });
  }

  private persist(
    tenantId: string,
    post: ManagedWordPressPost,
    importance: NewsImportance,
    score: number,
    reason: string,
    newsValues: string[],
    source: 'ai' | 'manual',
  ) {
    const now = new Date();
    const values = newsValues as Prisma.InputJsonValue;
    return this.prisma.wordPressNewsEvaluation.upsert({
      where: { tenantId_wordpressPostId: { tenantId, wordpressPostId: post.id } },
      create: {
        tenantId, wordpressPostId: post.id, postTitle: cleanText(post.title).slice(0, 1000), postUrl: post.link,
        wordpressModifiedAt: safeDate(post.modified), importance, score, reason, newsValues: values, source,
        evaluatedAt: now, overriddenAt: source === 'manual' ? now : null,
      },
      update: {
        postTitle: cleanText(post.title).slice(0, 1000), postUrl: post.link,
        wordpressModifiedAt: safeDate(post.modified), importance, score, reason, newsValues: values, source,
        evaluatedAt: now, overriddenAt: source === 'manual' ? now : null,
      },
    });
  }
}

import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { GapGptClient } from './gapgpt.client';
import { NewsroomService } from './newsroom.service';
import { PublishingSettingsService } from './publishing-settings.service';
import { SourceReaderService } from './source-reader.service';

function parseReportDate(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new BadRequestException('تاریخ گزارش معتبر نیست');
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new BadRequestException('تاریخ گزارش معتبر نیست');
  return date;
}

const DAILY_REPORT_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const REJECT_RETENTION_MS = 3 * 24 * 60 * 60 * 1000;

@Injectable()
export class DailyReportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly newsroom: NewsroomService,
    private readonly settings: PublishingSettingsService,
    private readonly gapGpt: GapGptClient,
    private readonly sourceReader: SourceReaderService,
  ) {}

  async overview(tenantId: string) {
    const cutoff = new Date(Date.now() - DAILY_REPORT_MAX_AGE_MS);
    const [feeds, reports, articles, addedArticles, rejectedArticles] = await Promise.all([
      this.prisma.newsFeed.findMany({ where: { tenantId, purpose: 'daily-report' }, orderBy: { createdAt: 'desc' } }),
      this.prisma.dailyReport.findMany({
        where: { tenantId },
        include: {
          items: { include: { article: { select: { id: true, featuredImageUrl: true } } }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] },
          decisions: { select: { articleId: true, decision: true } },
        },
        orderBy: { reportDate: 'desc' },
        take: 60,
      }),
      this.prisma.newsArticle.findMany({
        where: {
          tenantId,
          feed: { purpose: 'daily-report' },
          publishedAtSource: { gte: cutoff, lte: new Date() },
          status: { notIn: ['rejected', 'report_added'] },
          dailyReportItems: { none: {} },
        },
        include: { feed: { select: { id: true, name: true } } },
        orderBy: [{ publishedAtSource: 'desc' }, { createdAt: 'desc' }],
        take: 300,
      }),
      this.prisma.newsArticle.findMany({
        where: {
          tenantId,
          feed: { purpose: 'daily-report' },
          status: { not: 'rejected' },
          publishedAtSource: { gte: cutoff, lte: new Date() },
          dailyReportItems: { some: {} },
        },
        include: { feed: { select: { id: true, name: true } } },
        orderBy: [{ publishedAtSource: 'desc' }, { createdAt: 'desc' }],
        take: 300,
      }),
      this.prisma.newsArticle.findMany({
        where: {
          tenantId,
          feed: { purpose: 'daily-report' },
          status: 'rejected',
          purgeAfter: { gt: new Date() },
        },
        include: { feed: { select: { id: true, name: true } } },
        orderBy: [{ publishedAtSource: 'desc' }, { createdAt: 'desc' }],
        take: 300,
      }),
    ]);
    return { feeds, reports, articles, addedArticles, rejectedArticles, activeReportId: reports[0]?.id || '' };
  }

  async createReport(tenantId: string, reportDate: string) {
    const date = parseReportDate(reportDate);
    const duplicate = await this.prisma.dailyReport.findFirst({ where: { tenantId, reportDate: date } });
    if (duplicate) throw new ConflictException('برای این تاریخ قبلاً گزارش ساخته شده است');
    return this.prisma.dailyReport.create({ data: { tenantId, reportDate: date }, include: { items: true, decisions: true } });
  }

  async updateReport(tenantId: string, reportId: string, reportDate: string) {
    const report = await this.prisma.dailyReport.findFirst({ where: { id: reportId, tenantId } });
    if (!report) throw new NotFoundException('گزارش روزانه یافت نشد');
    const date = parseReportDate(reportDate);
    const duplicate = await this.prisma.dailyReport.findFirst({ where: { tenantId, reportDate: date, NOT: { id: reportId } } });
    if (duplicate) throw new ConflictException('برای این تاریخ قبلاً گزارش ساخته شده است');
    return this.prisma.dailyReport.update({
      where: { id: report.id },
      data: { reportDate: date, archivedAt: null, ...(report.status === 'archived' ? { status: 'draft' } : {}) },
    });
  }

  async deleteReport(tenantId: string, reportId: string) {
    const report = await this.prisma.dailyReport.findFirst({
      where: { id: reportId, tenantId },
      include: { items: { select: { articleId: true } } },
    });
    if (!report) throw new NotFoundException('گزارش روزانه یافت نشد');
    const articleIds = [...new Set(report.items.map((item) => item.articleId).filter((id): id is string => Boolean(id)))];
    await this.prisma.$transaction(async (tx) => {
      await tx.dailyReport.delete({ where: { id: report.id } });
      for (const articleId of articleIds) {
        const remainingItems = await tx.dailyReportItem.count({ where: { articleId } });
        if (!remainingItems) {
          await tx.newsArticle.updateMany({
            where: { id: articleId, tenantId, status: 'report_added' },
            data: { status: 'report_available' },
          });
        }
      }
    });
    return { ok: true };
  }

  async sync(tenantId: string) {
    const feeds = await this.prisma.newsFeed.findMany({ where: { tenantId, purpose: 'daily-report', enabled: true } });
    if (!feeds.length) throw new BadRequestException('هیچ فید فعال برای دیلی ریپورت ثبت نشده است');
    const results: Array<{ feedId: string; ok: boolean; created?: number; error?: string }> = [];
    for (const feed of feeds) {
      try {
        const result = await this.newsroom.fetchFeed(tenantId, feed.id);
        results.push({ feedId: feed.id, ok: true, created: result.created });
      } catch (error) {
        results.push({ feedId: feed.id, ok: false, error: error instanceof Error ? error.message : 'خطای دریافت فید' });
      }
    }
    return { ok: results.every((item) => item.ok), feeds: results, created: results.reduce((sum, item) => sum + (item.created || 0), 0) };
  }

  async addItem(tenantId: string, reportId: string, articleId: string) {
    const [report, article] = await Promise.all([
      this.prisma.dailyReport.findFirst({ where: { id: reportId, tenantId } }),
      this.prisma.newsArticle.findFirst({ where: { id: articleId, tenantId, feed: { purpose: 'daily-report' } } }),
    ]);
    if (!report) throw new NotFoundException('گزارش روزانه یافت نشد');
    this.assertMutable(report.status);
    if (!article) throw new NotFoundException('خبر دیلی ریپورت یافت نشد');
    if (article.status === 'rejected') throw new BadRequestException('خبر ردشده را ابتدا به جریان فعال بازگردانید');
    if (!article.publishedAtSource || article.publishedAtSource < new Date(Date.now() - DAILY_REPORT_MAX_AGE_MS) || article.publishedAtSource > new Date()) {
      throw new BadRequestException('فقط خبرهای ۲۴ ساعت گذشته قابل افزودن به دیلی ریپورت هستند');
    }
    const duplicate = await this.prisma.dailyReportItem.findFirst({ where: { reportId, articleId } });
    if (duplicate) throw new ConflictException('این خبر قبلاً به گزارش اضافه شده است');
    const sortOrder = await this.prisma.dailyReportItem.count({ where: { reportId } });
    const item = await this.prisma.$transaction(async (tx) => {
      await tx.dailyReportArticleDecision.deleteMany({ where: { reportId, articleId } });
      const created = await tx.dailyReportItem.create({
        data: {
          tenantId,
          reportId,
          articleId,
          originalTitle: article.originalTitle,
          originalUrl: article.originalUrl || article.canonicalUrl,
          sourceName: article.sourceName,
          sourcePublishedAt: article.publishedAtSource,
          segment: 'Neutral',
          sourceTier: 'Tier 1',
          sortOrder,
        },
      });
      await tx.newsArticle.update({
        where: { id: article.id },
        data: { status: 'report_added', rejectedAt: null, purgeAfter: null, lastError: '' },
      });
      await tx.dailyReport.update({ where: { id: report.id }, data: { status: 'draft' } });
      return created;
    });
    return item;
  }

  async removeItem(tenantId: string, reportId: string, itemId: string) {
    const item = await this.prisma.dailyReportItem.findFirst({
      where: { id: itemId, reportId, tenantId },
      include: { report: { select: { status: true } } },
    });
    if (!item) throw new NotFoundException('خبر گزارش یافت نشد');
    this.assertMutable(item.report.status);
    await this.prisma.$transaction(async (tx) => {
      await tx.dailyReportItem.delete({ where: { id: item.id } });
      if (item.articleId) {
        const remainingItems = await tx.dailyReportItem.count({ where: { articleId: item.articleId } });
        if (!remainingItems) {
          await tx.newsArticle.updateMany({
            where: { id: item.articleId, tenantId, status: 'report_added' },
            data: { status: 'report_available' },
          });
        }
      }
    });
    await this.refreshReportStatus(tenantId, reportId);
    return { ok: true };
  }

  async rejectArticle(tenantId: string, reportId: string, articleId: string) {
    const [report, article] = await Promise.all([
      this.prisma.dailyReport.findFirst({ where: { id: reportId, tenantId } }),
      this.prisma.newsArticle.findFirst({ where: { id: articleId, tenantId, feed: { purpose: 'daily-report' } } }),
    ]);
    if (!report) throw new NotFoundException('گزارش روزانه یافت نشد');
    this.assertMutable(report.status);
    if (!article) throw new NotFoundException('خبر دیلی ریپورت یافت نشد');
    const rejectedAt = new Date();
    await this.prisma.$transaction([
      this.prisma.dailyReportItem.deleteMany({ where: { reportId, articleId, tenantId } }),
      this.prisma.dailyReportArticleDecision.upsert({
        where: { reportId_articleId: { reportId, articleId } },
        create: { tenantId, reportId, articleId, decision: 'rejected' },
        update: { decision: 'rejected' },
      }),
      this.prisma.newsArticle.update({
        where: { id: article.id },
        data: {
          status: 'rejected',
          rejectedAt,
          purgeAfter: new Date(rejectedAt.getTime() + REJECT_RETENTION_MS),
          processingStartedAt: null,
          lastError: '',
        },
      }),
    ]);
    await this.refreshReportStatus(tenantId, reportId);
    return { ok: true };
  }

  async restoreArticle(tenantId: string, reportId: string, articleId: string) {
    const [report, article] = await Promise.all([
      this.prisma.dailyReport.findFirst({ where: { id: reportId, tenantId } }),
      this.prisma.newsArticle.findFirst({ where: { id: articleId, tenantId, feed: { purpose: 'daily-report' } } }),
    ]);
    if (!report) throw new NotFoundException('گزارش روزانه یافت نشد');
    this.assertMutable(report.status);
    if (!article) throw new NotFoundException('خبر دیلی ریپورت یافت نشد');
    await this.prisma.$transaction([
      this.prisma.dailyReportArticleDecision.deleteMany({ where: { tenantId, reportId, articleId } }),
      this.prisma.newsArticle.update({
        where: { id: article.id },
        data: { status: 'report_available', rejectedAt: null, purgeAfter: null, lastError: '' },
      }),
    ]);
    return { ok: true };
  }

  async prepareItem(tenantId: string, itemId: string) {
    const item = await this.prisma.dailyReportItem.findFirst({
      where: { id: itemId, tenantId },
      include: { article: true, report: { select: { status: true } } },
    });
    if (!item) throw new NotFoundException('خبر گزارش یافت نشد');
    this.assertMutable(item.report.status);
    const claimed = await this.prisma.dailyReportItem.updateMany({
      where: { id: item.id, tenantId, status: { in: ['pending', 'failed', 'ready'] } },
      data: { status: 'processing', lastError: '' },
    });
    if (!claimed.count) throw new ConflictException('این خبر هم‌اکنون در حال پردازش است');
    try {
      const settings = await this.settings.getRaw(tenantId);
      let sourceText = item.article?.originalContent || item.article?.originalSummary || item.originalTitle;
      if (item.originalUrl) {
        try {
          const source = await this.sourceReader.readArticleOrFallback(item.originalUrl, {
            text: sourceText,
            title: item.originalTitle,
            canonicalUrl: item.article?.canonicalUrl || item.originalUrl,
            featuredImageUrl: item.article?.featuredImageUrl || '',
            author: item.sourceName,
          });
          if (source.text.trim()) {
            sourceText = source.text;
            if (item.articleId) await this.prisma.newsArticle.update({ where: { id: item.articleId }, data: { originalContent: source.text } });
          }
        } catch { /* RSS content remains the safe fallback. */ }
      }
      const prepared = await this.gapGpt.prepareDailyReport(settings, {
        sourceName: item.sourceName,
        title: item.originalTitle,
        text: sourceText,
      });
      const updated = await this.prisma.dailyReportItem.update({
        where: { id: item.id },
        data: { englishTitle: prepared.title, bullets: prepared.bullets, status: 'ready', lastError: '' },
      });
      await this.refreshReportStatus(tenantId, item.reportId);
      return updated;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'خطای ناشناخته آماده‌سازی گزارش';
      await this.prisma.dailyReportItem.update({ where: { id: item.id }, data: { status: 'failed', lastError: message.slice(0, 1000) } });
      await this.refreshReportStatus(tenantId, item.reportId);
      throw new BadRequestException(`تبدیل خبر به گزارش انگلیسی انجام نشد: ${message}`);
    }
  }

  async prepareAll(tenantId: string, reportId: string) {
    const report = await this.prisma.dailyReport.findFirst({ where: { id: reportId, tenantId }, include: { items: { select: { id: true, status: true } } } });
    if (!report) throw new NotFoundException('گزارش روزانه یافت نشد');
    this.assertMutable(report.status);
    if (!report.items.length) throw new BadRequestException('ابتدا حداقل یک خبر به گزارش اضافه کنید');
    let prepared = 0;
    const errors: string[] = [];
    for (const item of report.items) {
      if (item.status === 'ready') continue;
      try { await this.prepareItem(tenantId, item.id); prepared++; }
      catch (error) { errors.push(error instanceof Error ? error.message : 'خطای آماده‌سازی'); }
    }
    await this.refreshReportStatus(tenantId, reportId);
    return { ok: errors.length === 0, prepared, failed: errors.length, errors };
  }

  private async refreshReportStatus(tenantId: string, reportId: string) {
    const report = await this.prisma.dailyReport.findFirst({ where: { id: reportId, tenantId }, select: { status: true } });
    if (!report || report.status === 'archived') return;
    const items = await this.prisma.dailyReportItem.findMany({ where: { tenantId, reportId }, select: { status: true } });
    const status = items.length > 0 && items.every((item) => item.status === 'ready') ? 'ready' : 'draft';
    await this.prisma.dailyReport.updateMany({ where: { id: reportId, tenantId }, data: { status } });
  }

  private assertMutable(status: string) {
    if (status === 'archived') throw new BadRequestException('گزارش آرشیوشده قابل تغییر نیست');
  }

}

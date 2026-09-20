import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { GapGptClient } from './gapgpt.client';
import { PublishingSettingsService } from './publishing-settings.service';
import { SourceReaderService } from './source-reader.service';
import { WordPressClient } from './wordpress.client';
import { extractDestinationCategoriesFromSite, slugifyCategoryName } from './destination-site-category-extractor';
import type { WordPressCategory } from './wordpress-category';
import type { DestinationCategoryStatus } from './dto/destination-category.dto';

const GENERAL_EXTERNAL_ID = '0';
const GENERAL_NAME = 'عمومی';
const GENERAL_SLUG = 'general';

type SyncCategorySnapshot = {
  id: string;
  externalId: string;
  name: string;
  slug: string;
  parentExternalId: string;
  serviceUrl: string;
  rssUrl: string;
  status: string;
};

type SyncCategoryChange = {
  id: string;
  externalId: string;
  name: string;
  previousName?: string;
  serviceUrl?: string;
  previousServiceUrl?: string;
  rssUrl?: string;
  previousRssUrl?: string;
};

function normalizeCategoryUrl(value: string | null | undefined): string {
  return String(value || '').trim();
}

function categorySnapshot(row: {
  id: string;
  externalId: string;
  name: string;
  slug: string;
  parentExternalId: string | null;
  serviceUrl: string | null;
  rssUrl: string | null;
  status: string;
}): SyncCategorySnapshot {
  return {
    id: row.id,
    externalId: row.externalId,
    name: row.name,
    slug: row.slug,
    parentExternalId: row.parentExternalId || '',
    serviceUrl: normalizeCategoryUrl(row.serviceUrl),
    rssUrl: normalizeCategoryUrl(row.rssUrl),
    status: row.status,
  };
}

function categoryFieldsChanged(
  existing: SyncCategorySnapshot,
  remote: { name: string; slug: string; parentExternalId: string; serviceUrl: string; rssUrl: string },
): boolean {
  return existing.name !== remote.name
    || existing.slug !== remote.slug
    || existing.parentExternalId !== (remote.parentExternalId || '')
    || normalizeCategoryUrl(existing.serviceUrl) !== normalizeCategoryUrl(remote.serviceUrl)
    || normalizeCategoryUrl(existing.rssUrl) !== normalizeCategoryUrl(remote.rssUrl);
}

@Injectable()
export class DestinationCategoryService {
  private readonly logger = new Logger(DestinationCategoryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: PublishingSettingsService,
    private readonly wordpress: WordPressClient,
    private readonly sourceReader: SourceReaderService,
    private readonly gapGpt: GapGptClient,
  ) {}

  private resolvePlatform(settings: Record<string, string>): string {
    return String(settings.destination_platform || 'wordpress').trim() || 'wordpress';
  }

  async ensureGeneralCategory(tenantId: string, platform: string) {
    return this.prisma.destinationCategory.upsert({
      where: {
        tenantId_platform_externalId: { tenantId, platform, externalId: GENERAL_EXTERNAL_ID },
      },
      create: {
        tenantId,
        platform,
        externalId: GENERAL_EXTERNAL_ID,
        name: GENERAL_NAME,
        slug: GENERAL_SLUG,
        status: 'approved',
        isGeneral: true,
        syncedAt: new Date(),
      },
      update: {
        name: GENERAL_NAME,
        slug: GENERAL_SLUG,
        isGeneral: true,
        status: 'approved',
      },
    });
  }

  private resolveSiteUrl(settings: Record<string, string>, override?: string): string {
    const trimmed = String(override ?? '').trim();
    if (trimmed) return trimmed;
    const platform = this.resolvePlatform(settings);
    if (platform === 'wordpress') return String(settings.wp_site_url ?? '').trim();
    if (platform === 'iransamaneh') return String(settings.is_site_url ?? '').trim();
    return String(settings.ns_site_url ?? '').trim();
  }

  async syncFromDestination(tenantId: string, _userId?: string, siteUrlOverride?: string) {
    const raw = await this.settings.getRaw(tenantId);
    const platform = this.resolvePlatform(raw);

    const siteUrl = this.resolveSiteUrl(raw, siteUrlOverride);
    if (!siteUrl) {
      throw new BadRequestException('آدرس سایت مقصد را وارد کنید');
    }

    await this.ensureGeneralCategory(tenantId, platform);
    const extractedCategories = await extractDestinationCategoriesFromSite(siteUrl, this.wordpress, this.sourceReader);
    const now = new Date();
    const seenExternalIds = new Set<string>([GENERAL_EXTERNAL_ID]);
    const changes = {
      added: [] as SyncCategoryChange[],
      updated: [] as SyncCategoryChange[],
      removed: [] as SyncCategoryChange[],
    };

    for (const category of extractedCategories) {
      const externalId = String(category.externalId);
      seenExternalIds.add(externalId);
      const remote = {
        name: category.name,
        slug: category.slug,
        parentExternalId: category.parentExternalId || '',
        serviceUrl: category.serviceUrl || '',
        rssUrl: category.rssUrl || '',
      };
      const existing = await this.prisma.destinationCategory.findUnique({
        where: { tenantId_platform_externalId: { tenantId, platform, externalId } },
      });
      if (existing) {
        const before = categorySnapshot(existing);
        const changed = categoryFieldsChanged(before, remote);
        const nextStatus = existing.status === 'stale' || (existing.status === 'approved' && changed)
          ? 'pending'
          : existing.status;

        await this.prisma.destinationCategory.update({
          where: { id: existing.id },
          data: {
            name: remote.name,
            slug: remote.slug,
            parentExternalId: remote.parentExternalId,
            serviceUrl: remote.serviceUrl || existing.serviceUrl,
            rssUrl: remote.rssUrl || existing.rssUrl,
            syncedAt: now,
            status: nextStatus,
          },
        });

        if (existing.status === 'stale') {
          changes.updated.push({
            id: existing.id,
            externalId,
            name: remote.name,
            previousName: before.name,
            serviceUrl: remote.serviceUrl || before.serviceUrl,
            previousServiceUrl: before.serviceUrl,
            rssUrl: remote.rssUrl || before.rssUrl,
            previousRssUrl: before.rssUrl,
          });
        } else if (changed) {
          changes.updated.push({
            id: existing.id,
            externalId,
            name: remote.name,
            previousName: before.name,
            serviceUrl: remote.serviceUrl || before.serviceUrl,
            previousServiceUrl: before.serviceUrl,
            rssUrl: remote.rssUrl || before.rssUrl,
            previousRssUrl: before.rssUrl,
          });
        }
      } else {
        await this.prisma.destinationCategory.create({
          data: {
            tenantId,
            platform,
            externalId,
            name: remote.name,
            slug: remote.slug,
            parentExternalId: remote.parentExternalId,
            serviceUrl: remote.serviceUrl,
            rssUrl: remote.rssUrl,
            status: 'pending',
            isGeneral: false,
            syncedAt: now,
          },
        });
        changes.added.push({
          id: '',
          externalId,
          name: remote.name,
          serviceUrl: remote.serviceUrl,
          rssUrl: remote.rssUrl,
        });
      }
    }

    const staleCandidates = await this.prisma.destinationCategory.findMany({
      where: {
        tenantId,
        platform,
        isGeneral: false,
        externalId: { notIn: [...seenExternalIds] },
        status: { not: 'stale' },
      },
    });

    await this.prisma.destinationCategory.updateMany({
      where: {
        tenantId,
        platform,
        isGeneral: false,
        externalId: { notIn: [...seenExternalIds] },
        status: { not: 'stale' },
      },
      data: { status: 'stale' },
    });

    for (const row of staleCandidates) {
      changes.removed.push({
        id: row.id,
        externalId: row.externalId,
        name: row.name,
        serviceUrl: normalizeCategoryUrl(row.serviceUrl),
        rssUrl: normalizeCategoryUrl(row.rssUrl),
      });
    }

    const categories = await this.list(tenantId);
    return {
      ok: true,
      synced: extractedCategories.length,
      categories,
      changes,
    };
  }

  async list(tenantId: string, status?: DestinationCategoryStatus) {
    const platform = this.resolvePlatform(await this.settings.getRaw(tenantId));
    await this.ensureGeneralCategory(tenantId, platform);
    return this.prisma.destinationCategory.findMany({
      where: {
        tenantId,
        platform,
        ...(status ? { status } : { status: { not: 'rejected' } }),
      },
      orderBy: [{ isGeneral: 'desc' }, { name: 'asc' }],
    });
  }

  async createManual(
    tenantId: string,
    data: { name: string; serviceUrl?: string; rssUrl?: string },
    userId?: string,
  ) {
    const name = String(data.name || '').trim();
    if (!name) throw new BadRequestException('نام سرویس الزامی است');

    const raw = await this.settings.getRaw(tenantId);
    const platform = this.resolvePlatform(raw);
    await this.ensureGeneralCategory(tenantId, platform);

    const slug = slugifyCategoryName(name) || 'service';
    const externalId = `manual-${slug}-${Date.now()}`;

    return this.prisma.destinationCategory.create({
      data: {
        tenantId,
        platform,
        externalId,
        name,
        slug,
        serviceUrl: String(data.serviceUrl || '').trim(),
        rssUrl: String(data.rssUrl || '').trim(),
        status: 'approved',
        isGeneral: false,
        approvedAt: new Date(),
        approvedByUserId: userId ?? null,
        syncedAt: new Date(),
      },
    });
  }

  async updateDetails(
    id: string,
    tenantId: string,
    data: { name?: string; serviceUrl?: string; rssUrl?: string },
  ) {
    const category = await this.prisma.destinationCategory.findFirst({ where: { id, tenantId } });
    if (!category) throw new NotFoundException('دسته‌بندی یافت نشد');
    if (category.isGeneral) throw new BadRequestException('دسته عمومی قابل ویرایش نیست');

    const name = data.name !== undefined ? String(data.name).trim() : category.name;
    if (!name) throw new BadRequestException('نام سرویس الزامی است');

    return this.prisma.destinationCategory.update({
      where: { id },
      data: {
        name,
        slug: slugifyCategoryName(name) || category.slug,
        ...(data.serviceUrl !== undefined ? { serviceUrl: String(data.serviceUrl).trim() } : {}),
        ...(data.rssUrl !== undefined ? { rssUrl: String(data.rssUrl).trim() } : {}),
      },
    });
  }

  async updateStatus(id: string, tenantId: string, status: 'approved' | 'rejected', userId?: string) {
    const category = await this.prisma.destinationCategory.findFirst({ where: { id, tenantId } });
    if (!category) throw new NotFoundException('دسته‌بندی یافت نشد');
    if (category.isGeneral) throw new BadRequestException('دسته عمومی قابل تغییر وضعیت نیست');

    if (status === 'rejected') {
      const platform = this.resolvePlatform(await this.settings.getRaw(tenantId));
      const general = await this.ensureGeneralCategory(tenantId, platform);
      await this.prisma.newsArticle.updateMany({
        where: { tenantId, destinationCategoryId: category.id },
        data: { destinationCategoryId: general.id, categorySource: 'general' },
      });
      await this.prisma.destinationCategory.delete({ where: { id } });
      return { id, status: 'rejected' as const, deleted: true };
    }

    return this.prisma.destinationCategory.update({
      where: { id },
      data: {
        status,
        approvedAt: new Date(),
        approvedByUserId: userId ?? null,
      },
    });
  }

  async bulkApprove(tenantId: string, ids: string[], userId?: string) {
    const now = new Date();
    const result = await this.prisma.destinationCategory.updateMany({
      where: {
        tenantId,
        id: { in: ids },
        isGeneral: false,
        status: 'pending',
      },
      data: {
        status: 'approved',
        approvedAt: now,
        approvedByUserId: userId ?? null,
      },
    });
    return { ok: true, approved: result.count };
  }

  async bulkDeleteStale(tenantId: string, userId?: string) {
    const platform = this.resolvePlatform(await this.settings.getRaw(tenantId));
    const staleRows = await this.prisma.destinationCategory.findMany({
      where: { tenantId, platform, status: 'stale', isGeneral: false },
      select: { id: true },
    });
    let deleted = 0;
    for (const row of staleRows) {
      await this.updateStatus(row.id, tenantId, 'rejected', userId);
      deleted++;
    }
    return { ok: true, deleted };
  }

  async getApprovedCategoriesForAi(tenantId: string): Promise<WordPressCategory[]> {
    const platform = this.resolvePlatform(await this.settings.getRaw(tenantId));
    const approved = await this.prisma.destinationCategory.findMany({
      where: {
        tenantId,
        platform,
        status: 'approved',
        isGeneral: false,
      },
      orderBy: { name: 'asc' },
    });
    return approved.map((category) => ({
      id: Number(category.externalId),
      name: category.name,
      slug: category.slug,
      parent: Number(category.parentExternalId) || 0,
    })).filter((category) => Number.isSafeInteger(category.id) && category.id > 0);
  }

  async categorizeArticle(tenantId: string, articleId: string) {
    const article = await this.prisma.newsArticle.findFirst({ where: { id: articleId, tenantId } });
    if (!article) throw new NotFoundException('خبر یافت نشد');
    if (article.categorySource === 'manual') return article;

    const platform = this.resolvePlatform(await this.settings.getRaw(tenantId));
    const general = await this.ensureGeneralCategory(tenantId, platform);
    const approved = await this.getApprovedCategoriesForAi(tenantId);

    let destinationCategoryId = general.id;
    let categorySource = 'general';

    if (approved.length) {
      try {
        const settings = await this.settings.getRaw(tenantId);
        const categoryId = await this.gapGpt.chooseWordPressCategory(settings, {
          sourceName: article.sourceName,
          title: article.titleFa || article.originalTitle,
          summary: article.summaryFa || article.originalSummary || article.originalTitle,
          categories: approved,
        });
        const matched = await this.prisma.destinationCategory.findFirst({
          where: {
            tenantId,
            platform,
            externalId: String(categoryId),
            status: 'approved',
          },
        });
        if (matched) {
          destinationCategoryId = matched.id;
          categorySource = 'ai';
        }
      } catch (error) {
        this.logger.warn(`Article categorization failed for ${articleId}: ${error instanceof Error ? error.message : 'unknown error'}`);
      }
    }

    return this.prisma.newsArticle.update({
      where: { id: articleId },
      data: { destinationCategoryId, categorySource },
      include: {
        destinationCategory: { select: { id: true, name: true, isGeneral: true } },
      },
    });
  }

  async categorizeArticlesByCanonicalUrls(tenantId: string, canonicalUrls: string[]) {
    if (!canonicalUrls.length) return;
    const articles = await this.prisma.newsArticle.findMany({
      where: {
        tenantId,
        canonicalUrl: { in: canonicalUrls },
        destinationCategoryId: null,
      },
      select: { id: true },
    });
    for (const article of articles) {
      await this.categorizeArticle(tenantId, article.id).catch((error) => {
        this.logger.warn(`Batch categorization failed for ${article.id}: ${error instanceof Error ? error.message : 'unknown error'}`);
      });
    }
  }

  async assignManualCategory(tenantId: string, articleId: string, destinationCategoryId: string | null, _userId?: string) {
    const article = await this.prisma.newsArticle.findFirst({ where: { id: articleId, tenantId } });
    if (!article) throw new NotFoundException('خبر یافت نشد');

    const platform = this.resolvePlatform(await this.settings.getRaw(tenantId));
    const general = await this.ensureGeneralCategory(tenantId, platform);

    if (!destinationCategoryId) {
      return this.prisma.newsArticle.update({
        where: { id: articleId },
        data: { destinationCategoryId: general.id, categorySource: 'manual' },
        include: {
          destinationCategory: { select: { id: true, name: true, isGeneral: true } },
        },
      });
    }

    const category = await this.prisma.destinationCategory.findFirst({
      where: { id: destinationCategoryId, tenantId, status: 'approved' },
    });
    if (!category) throw new BadRequestException('دسته‌بندی مقصد معتبر یا تأیید‌شده نیست');

    return this.prisma.newsArticle.update({
      where: { id: articleId },
      data: { destinationCategoryId: category.id, categorySource: 'manual' },
      include: {
        destinationCategory: { select: { id: true, name: true, isGeneral: true } },
      },
    });
  }
}

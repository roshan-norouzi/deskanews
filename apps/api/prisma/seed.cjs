const path = require('node:path');
require('dotenv').config({ path: path.join(__dirname, '../../../.env') });
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');
const { DEFAULT_PLATFORM_FEEDS, PLATFORM_FEED_CATALOG_VERSION } = require('@deska/shared');

const prisma = new PrismaClient();

async function ensureDefaultPlatformFeedCatalog(tenantId) {
  const feedCount = await prisma.platformFeed.count();
  if (feedCount > 0) {
    console.log(`Platform feed catalog already has ${feedCount} feed(s); preserving server data.`);
    return;
  }

  for (const feed of DEFAULT_PLATFORM_FEEDS) {
    const createdFeed = await prisma.platformFeed.create({
      data: {
        name: feed.name,
        url: feed.url,
        sourceType: feed.sourceType,
        catalogGroup: feed.catalogGroup,
        sourceLanguage: feed.sourceLanguage,
        pollIntervalMinutes: feed.pollIntervalMinutes,
        enabled: true,
        lastError: '',
      },
    });
    if (tenantId) {
      await prisma.tenantPlatformFeed.upsert({
        where: { tenantId_platformFeedId: { tenantId, platformFeedId: createdFeed.id } },
        create: { tenantId, platformFeedId: createdFeed.id, enabled: false },
        update: {},
      });
    }
  }

  const config = await prisma.platformConfig.findUnique({ where: { id: 'default' } });
  const settings = {
    ...((config?.settings ?? {})),
    platformFeedCatalogVersion: PLATFORM_FEED_CATALOG_VERSION,
  };
  await prisma.platformConfig.upsert({
    where: { id: 'default' },
    create: { id: 'default', settings },
    update: { settings },
  });
}

async function main() {
  const email = process.env.SEED_ADMIN_EMAIL || 'admin@deska.local';
  const existingAdmin = await prisma.user.findUnique({ where: { email } });
  if (existingAdmin && existingAdmin.role !== 'super_admin') {
    throw new Error('SEED_ADMIN_EMAIL already belongs to a non-admin account');
  }
  let admin = existingAdmin;
  if (!admin) {
    const bootstrapPassword = process.env.SEED_ADMIN_PASSWORD
      || '';
    if (bootstrapPassword.length < 12) {
      throw new Error('A unique SEED_ADMIN_PASSWORD of at least 12 characters is required for initial provisioning');
    }
    const passwordHash = await bcrypt.hash(bootstrapPassword, 12);
    admin = await prisma.user.create({
      data: { email, passwordHash, name: process.env.SEED_ADMIN_NAME || 'مدیر سیستم', role: 'super_admin' },
    });
  }
  const tenant = await prisma.tenant.upsert({
    where: { slug: 'default' },
    create: { name: 'سازمان پیش‌فرض', slug: 'default', plan: 'enterprise', settings: { currency: 'IRR', timezone: 'Asia/Tehran', publishing: {} } },
    update: {},
  });
  await prisma.tenantMember.upsert({
    where: { tenantId_userId: { tenantId: tenant.id, userId: admin.id } },
    create: { tenantId: tenant.id, userId: admin.id, role: 'owner' },
    update: {},
  });
  await prisma.tenant.update({
    where: { id: tenant.id },
    data: { status: 'active', isActive: true, createdByUserId: admin.id, primaryOwnerUserId: admin.id },
  });

  await ensureDefaultPlatformFeedCatalog(tenant.id);

  console.log(`DESKA seed completed — platform feed catalog v${PLATFORM_FEED_CATALOG_VERSION} (${DEFAULT_PLATFORM_FEEDS.length} feeds)`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());

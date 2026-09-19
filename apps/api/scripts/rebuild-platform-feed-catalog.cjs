const path = require('node:path');
require('dotenv').config({ path: path.join(__dirname, '../../../.env') });
const { PrismaClient } = require('@prisma/client');
const { DEFAULT_PLATFORM_FEEDS, PLATFORM_FEED_CATALOG_VERSION } = require('@deska/shared');

const prisma = new PrismaClient();

async function main() {
  const tenants = await prisma.tenant.findMany({
    where: { isActive: true, status: 'active' },
    select: { id: true },
  });

  const deleted = await prisma.platformFeed.deleteMany({});
  console.log(`Deleted ${deleted.count} platform feed(s)`);

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

    if (tenants.length) {
      await prisma.tenantPlatformFeed.createMany({
        skipDuplicates: true,
        data: tenants.map((tenant) => ({
          tenantId: tenant.id,
          platformFeedId: createdFeed.id,
          enabled: false,
        })),
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

  console.log(`Rebuilt platform feed catalog v${PLATFORM_FEED_CATALOG_VERSION} (${DEFAULT_PLATFORM_FEEDS.length} feeds)`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());

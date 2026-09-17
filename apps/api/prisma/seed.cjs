const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

const prisma = new PrismaClient();

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

  const defaultPlatformFeeds = [
    { name: 'خبرگزاری فارس', url: 'https://www.farsnews.ir/rss', sourceType: 'rss' },
    { name: 'خبرگزاری مهر', url: 'https://www.mehrnews.com/rss', sourceType: 'rss' },
    { name: 'خبرگزاری ایسنا', url: 'https://www.isna.ir', sourceType: 'website' },
  ];
  for (const feed of defaultPlatformFeeds) {
    const createdFeed = await prisma.platformFeed.upsert({
      where: { url: feed.url },
      create: {
        name: feed.name,
        url: feed.url,
        sourceType: feed.sourceType,
        pollIntervalMinutes: 240,
        enabled: true,
      },
      update: { name: feed.name, sourceType: feed.sourceType },
    });
    await prisma.tenantPlatformFeed.upsert({
      where: { tenantId_platformFeedId: { tenantId: tenant.id, platformFeedId: createdFeed.id } },
      create: { tenantId: tenant.id, platformFeedId: createdFeed.id, enabled: false },
      update: {},
    });
  }

  console.log('DESKA seed completed');
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());

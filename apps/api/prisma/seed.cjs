const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');
const { MODULE_CATALOG } = require('@deska/shared');
const systemObservances = require('./system-observances.json');

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
    create: { name: 'سازمان پیش‌فرض', slug: 'default', plan: 'enterprise', settings: { currency: 'IRR', timezone: 'Asia/Tehran' } },
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
  for (const mod of MODULE_CATALOG) {
    await prisma.moduleDefinition.upsert({
      where: { id: mod.id },
      create: { id: mod.id, name: mod.name, domain: mod.domain, version: mod.version, dependencies: [...mod.dependencies], isCore: 'isCore' in mod ? mod.isCore : false },
      update: { name: mod.name, domain: mod.domain, dependencies: [...mod.dependencies], isCore: 'isCore' in mod ? mod.isCore : false },
    });
    await prisma.tenantModule.upsert({
      where: { tenantId_moduleId: { tenantId: tenant.id, moduleId: mod.id } },
      create: { tenantId: tenant.id, moduleId: mod.id, enabled: true },
      update: {},
    });
  }
  await prisma.department.upsert({ where: { id: 'hr-dept-default' }, create: { id: 'hr-dept-default', tenantId: tenant.id, name: 'منابع انسانی' }, update: { name: 'منابع انسانی' } });

  await prisma.systemCalendarObservance.updateMany({
    where: {
      sourceKey: {
        in: [
          '1405-lunar-10-01-eid-fitr-second',
          '1405-lunar-10-02-eid-fitr-second-holiday',
        ],
      },
      source: { not: 'manual-override' },
    },
    data: { isActive: false },
  });

  for (const observance of systemObservances) {
    const existing = await prisma.systemCalendarObservance.findUnique({
      where: { sourceKey: observance.sourceKey },
      select: { source: true },
    });
    if (existing?.source === 'manual-override') continue;

    await prisma.systemCalendarObservance.upsert({
      where: { sourceKey: observance.sourceKey },
      create: {
        sourceKey: observance.sourceKey,
        title: observance.title,
        description: observance.description ?? null,
        startAt: new Date(observance.startAt),
        endAt: new Date(observance.endAt),
        allDay: observance.allDay ?? true,
        recurrenceType: observance.recurrenceType ?? 'yearly',
        recurrenceRule: observance.recurrenceRule ?? undefined,
        recurrenceCal: observance.recurrenceCal ?? 'jalali',
        isHoliday: observance.isHoliday ?? false,
        isActive: true,
        source: observance.source ?? 'deska-system',
      },
      update: {
        title: observance.title,
        description: observance.description ?? null,
        startAt: new Date(observance.startAt),
        endAt: new Date(observance.endAt),
        allDay: observance.allDay ?? true,
        recurrenceType: observance.recurrenceType ?? 'yearly',
        recurrenceRule: observance.recurrenceRule ?? undefined,
        recurrenceCal: observance.recurrenceCal ?? 'jalali',
        isHoliday: observance.isHoliday ?? false,
        isActive: true,
        source: observance.source ?? 'deska-system',
      },
    });
  }
  console.log('DESKA seed completed');
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());

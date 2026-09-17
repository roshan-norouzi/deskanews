require('reflect-metadata');

const test = require('node:test');
const assert = require('node:assert/strict');
const { ForbiddenException, NotFoundException, UnauthorizedException } = require('@nestjs/common');
const { TenantGuard } = require('../dist/common/guards/tenant.guard');
const { TenantController } = require('../dist/platform/tenant/tenant.controller');
const { TenantService } = require('../dist/platform/tenant/tenant.service');
const { PlatformAdminService } = require('../dist/platform/admin/platform-admin.service');
const { PublishingSettingsService } = require('../dist/modules/smart-publishing/publishing-settings.service');
const { SocialStudioService } = require('../dist/modules/smart-publishing/social-studio.service');
const { AuthService } = require('../dist/platform/auth/auth.service');
const { JwtStrategy } = require('../dist/common/strategies/jwt.strategy');
const { NotificationService } = require('../dist/common/services/audit.service');
const { APP_PERMISSIONS, getDefaultPermissionsForTenantRole } = require('@deska/shared');

test('TenantGuard resolves permissions only inside the active tenant', async () => {
  const prisma = {
    tenantMember: {
      findUnique: async () => ({ role: 'member', tenant: { isActive: true } }),
    },
  };
  const config = { get: (_key, fallback) => fallback };
  const request = {
    headers: { 'x-tenant-id': 'tenant-a' },
    user: { id: 'user-a', role: 'user', permissions: ['*'] },
  };
  const context = { switchToHttp: () => ({ getRequest: () => request }) };

  const result = await new TenantGuard(prisma, config).canActivate(context);

  assert.equal(result, true);
  assert.deepEqual(request.user.permissions, getDefaultPermissionsForTenantRole('member'));
  assert.deepEqual(request.tenant, { tenantId: 'tenant-a', memberRole: 'member' });
});

test('TenantGuard rejects membership in an inactive tenant', async () => {
  const prisma = {
    tenantMember: {
      findUnique: async () => ({ role: 'member', tenant: { isActive: false } }),
    },
  };
  const config = { get: (_key, fallback) => fallback };
  const request = {
    headers: { 'x-tenant-id': 'tenant-a' },
    user: { id: 'user-a', role: 'user', permissions: [] },
  };
  const context = { switchToHttp: () => ({ getRequest: () => request }) };

  await assert.rejects(
    () => new TenantGuard(prisma, config).canActivate(context),
    ForbiddenException,
  );
});

test('TenantGuard does not allow a super-admin to invent a tenant id', async () => {
  const prisma = {
    tenant: { findUnique: async () => null },
  };
  const config = { get: (_key, fallback) => fallback };
  const request = {
    headers: { 'x-tenant-id': 'non-existent-tenant' },
    user: { id: 'admin-a', role: 'super_admin', permissions: ['*'] },
  };
  const context = { switchToHttp: () => ({ getRequest: () => request }) };

  await assert.rejects(
    () => new TenantGuard(prisma, config).canActivate(context),
    /سازمان یافت نشد/,
  );
  assert.equal(request.tenant, undefined);
});

test('tenant route id cannot differ from the active tenant header', () => {
  const service = { update: () => assert.fail('service must not be called') };
  const controller = new TenantController(service);

  assert.throws(
    () => controller.update('tenant-b', {}, { tenantId: 'tenant-a', memberRole: 'owner' }),
    ForbiddenException,
  );
});

test('platform-user search is restricted to tenant administrators', async () => {
  const prisma = {
    user: { findMany: () => assert.fail('unauthorized searches must not reach the database') },
  };
  const service = new TenantService(prisma);

  await assert.rejects(
    () => service.searchPlatformUsers('tenant-a', 'user@example.com', 'member'),
    ForbiddenException,
  );
});

test('an organization invitation can only be accepted by its target platform user', async () => {
  const invitation = {
    id: 'invitation-a',
    tenantId: 'tenant-a',
    invitedUserId: 'target-user',
    email: 'target@example.com',
    role: 'member',
    status: 'pending',
    accepted: false,
    revokedAt: null,
    expiresAt: new Date(Date.now() + 60_000),
    metadata: {},
    tenant: { id: 'tenant-a', name: 'Tenant A' },
  };
  const prisma = {
    tenantInvitation: { findUnique: async () => invitation },
    user: { findUnique: async () => ({ id: 'attacker-user', email: 'attacker@example.com' }) },
    tenantMember: {
      findUnique: () => assert.fail('authorization must happen before membership lookup'),
    },
  };
  const service = new TenantService(prisma);

  await assert.rejects(
    () => service.acceptMyInvitation('attacker-user', invitation.id),
    (error) => error instanceof ForbiddenException
      && error.message === 'این دعوت‌نامه برای حساب کاربری شما صادر نشده است',
  );
});

test('an organization invitation can only be rejected by its target platform user', async () => {
  let updateAttempted = false;
  const invitation = {
    id: 'invitation-a',
    invitedUserId: 'target-user',
    email: 'target@example.com',
    status: 'pending',
    expiresAt: new Date(Date.now() + 60_000),
  };
  const prisma = {
    user: { findUnique: async () => ({ id: 'attacker-user', email: 'attacker@example.com' }) },
    tenantInvitation: {
      findUnique: async () => invitation,
      updateMany: async () => { updateAttempted = true; return { count: 1 }; },
    },
  };
  const service = new TenantService(prisma);

  await assert.rejects(
    () => service.rejectMyInvitation('attacker-user', invitation.id),
    (error) => error instanceof ForbiddenException
      && error.message === 'این دعوت‌نامه برای حساب کاربری شما صادر نشده است',
  );
  assert.equal(updateAttempted, false);
});

test('a previously claimed organization invitation cannot create another membership', async () => {
  const invitation = {
    id: 'invitation-a',
    tenantId: 'tenant-a',
    invitedUserId: 'target-user',
    email: 'target@example.com',
    role: 'member',
    status: 'pending',
    accepted: false,
    revokedAt: null,
    expiresAt: new Date(Date.now() + 60_000),
    metadata: {},
    tenant: { id: 'tenant-a', name: 'Tenant A' },
  };
  const tx = {
    tenantMember: {
      findUnique: async () => null,
      create: () => assert.fail('membership must not be created after the invitation claim fails'),
    },
    tenantInvitation: { updateMany: async () => ({ count: 0 }) },
  };
  const prisma = {
    tenantInvitation: { findUnique: async () => invitation },
    user: { findUnique: async () => ({ id: 'target-user', email: invitation.email }) },
    $transaction: async (callback) => callback(tx),
  };
  const service = new TenantService(prisma);

  await assert.rejects(
    () => service.acceptMyInvitation('target-user', invitation.id),
    /این دعوت‌نامه دیگر قابل پذیرش نیست/,
  );
});

test('stored integration secrets are not reused for a caller-controlled host', () => {
  const service = new PublishingSettingsService({}, {});
  const current = {
    gapgpt_base_url: 'https://trusted-gap.example',
    gapgpt_api_key: 'stored-gap-secret',
    wp_site_url: 'https://trusted-wp.example',
    wp_app_password: 'stored-wp-secret',
  };

  const gapChanged = service.mergeForTest(current, {
    gapgpt_base_url: 'https://attacker.example',
  });
  const wpChanged = service.mergeForTest(current, {
    wp_site_url: 'https://attacker.example',
  });

  assert.equal(gapChanged.gapgpt_api_key, '');
  assert.equal(wpChanged.wp_app_password, '');
});

test('legacy GapGPT credentials remain usable when publishing JSON is empty but flat settings exist', async () => {
  const prisma = {
    tenant: {
      findUnique: async () => ({ settings: {
        gapgpt_base_url: 'https://legacy-gap.example',
        gapgpt_api_key: 'legacy-gap-secret',
        publishing: {},
      } }),
    },
  };
  const service = new PublishingSettingsService(prisma, {
    encrypt: (value) => value,
    decrypt: (value) => value,
  });

  const settings = await service.getRaw('tenant-a');

  assert.equal(settings.gapgpt_base_url, 'https://legacy-gap.example');
  assert.equal(settings.gapgpt_api_key, 'legacy-gap-secret');
});

test('a prepared newsroom article is converted directly into ready social content', async () => {
  const newsStatuses = [];
  const queuedJobs = [];
  let socialUpsert;
  const prisma = {
    newsArticle: {
      findFirst: async () => ({
        id: 'news-a',
        tenantId: 'tenant-a',
        feedId: 'feed-a',
        canonicalUrl: 'https://news.example/story',
        originalUrl: 'https://news.example/story',
        originalTitle: 'Original title',
        originalSummary: 'Original summary',
        originalContent: '',
        titleFa: 'تیتر فارسی خبر',
        summaryFa: 'خلاصه فارسی خبر',
        sourceName: 'رسانه نمونه',
        publishedAtSource: new Date('2026-09-01T08:00:00Z'),
        featuredImageUrl: 'https://news.example/image.jpg',
        status: 'ready',
        feed: { id: 'feed-a', name: 'رسانه نمونه' },
      }),
      updateMany: async ({ data }) => {
        newsStatuses.push(data.status);
        return { count: 1 };
      },
    },
    socialArticle: {
      findUnique: async () => null,
      findMany: async () => [{ id: 'social-a' }],
      upsert: async (query) => {
        socialUpsert = query;
        return { id: 'social-a', ...query.create };
      },
    },
  };
  const settings = { getRaw: async () => ({
    social_caption_template: '{title}\n\n{lead}\n\n{summary}\n\n{link}',
    social_auto_generate_image: 'false',
    social_auto_publish_telegram: 'true',
  }) };
  const gapGpt = {
    prepareNewsForSocial: async (_settings, input) => {
      assert.equal(input.title, 'تیتر فارسی خبر');
      assert.equal(input.text, 'خلاصه فارسی خبر');
      return { title: 'تیتر کوتاه', lead: 'اصل اتفاق در یک جمله.', summary: 'خلاصه مفید و کوتاه خبر.' };
    },
  };
  const sourceReader = {
    readArticleOrFallback: async () => ({
      canonicalUrl: 'https://news.example/story',
      shortUrl: 'https://news.example/s/1',
      text: 'Full source text',
      featuredImageUrl: 'https://news.example/image.jpg',
      authorImageUrl: '',
      author: 'نویسنده',
      category: 'جهان',
    }),
  };
  const service = new SocialStudioService(
    prisma,
    settings,
    gapGpt,
    sourceReader,
    { enqueue: async (job) => { queuedJobs.push(job); return { created: true, job: { id: 'publish-job-a' } }; } },
    { success: async () => ({}), failure: async () => ({}) },
    { record: async () => ({}) },
  );

  const result = await service.sendNewsToStudio('tenant-a', 'news-a');

  assert.equal(result.article.status, 'ready');
  assert.equal(socialUpsert.create.title, 'تیتر کوتاه');
  assert.equal(socialUpsert.create.captionText, 'تیتر کوتاه\n\nاصل اتفاق در یک جمله.\n\nخلاصه مفید و کوتاه خبر.\n\nhttps://news.example/s/1');
  assert.deepEqual(newsStatuses, ['social_processing', 'social_sent']);
  assert.equal(queuedJobs.length, 1);
  assert.equal(queuedJobs[0].type, 'social.publish');
  assert.deepEqual(queuedJobs[0].payload, { articleId: 'social-a', networks: ['telegram'] });
});

test('archived social articles are hidden from the default list', async () => {
  let listQuery;
  let archiveUpdate;
  const prisma = {
    socialArticle: {
      findMany: async (query) => {
        listQuery = query;
        return [];
      },
      findFirst: async () => ({ id: 'social-a', tenantId: 'tenant-a', status: 'ready' }),
      update: async (query) => {
        archiveUpdate = query;
        return { id: 'social-a', status: query.data.status };
      },
    },
  };
  const service = new SocialStudioService(
    prisma,
    {},
    {},
    {},
    {},
    { success: async () => ({}), failure: async () => ({}) },
    { record: async () => ({}) },
  );

  await service.articles('tenant-a');
  const archived = await service.archive('tenant-a', 'social-a');

  assert.deepEqual(listQuery.where, { tenantId: 'tenant-a', status: { not: 'archived' } });
  assert.deepEqual(archiveUpdate.where, { id: 'social-a' });
  assert.equal(archiveUpdate.data.status, 'archived');
  assert.equal(archived.status, 'archived');
});

test('saving a new integration host removes an omitted stored secret', async () => {
  let writtenSettings;
  const prisma = {
    tenant: {
      findUnique: async () => ({ settings: {
        publishing: {
          gapgpt_base_url: 'https://trusted-gap.example',
          gapgpt_api_key: 'encrypted-stored-secret',
        },
      } }),
      update: async ({ data }) => {
        writtenSettings = data.settings.publishing;
        return {};
      },
    },
  };
  const secrets = {
    encrypt: (value) => `encrypted:${value}`,
    decrypt: (value) => String(value).replace(/^encrypted:/, ''),
  };
  const service = new PublishingSettingsService(prisma, secrets);
  service.getRaw = async () => ({
    gapgpt_base_url: 'https://trusted-gap.example',
    gapgpt_api_key: 'stored-secret',
  });
  service.getPublic = async () => ({});

  await service.save('tenant-a', { gapgpt_base_url: 'https://new-gap.example' });

  assert.equal(writtenSettings.gapgpt_base_url, 'https://new-gap.example');
  assert.equal(Object.hasOwn(writtenSettings, 'gapgpt_api_key'), false);
});

test('the built-in manager role excludes platform-administration permissions', () => {
  const permissions = getDefaultPermissionsForTenantRole('manager');

  assert.equal(APP_PERMISSIONS.some((permission) => permission.key === 'roles.manage'), false);
  assert.equal(permissions.includes('users.manage'), false);
  assert.equal(permissions.includes('platform.admin'), false);
});

test('only a super admin can transfer organization ownership', async () => {
  const prisma = { $transaction: () => assert.fail('non-super-admin transfer must not reach the database') };
  const service = new PlatformAdminService(prisma);

  await assert.rejects(
    () => service.transferOwnership(
      { id: 'platform-admin', role: 'platform_admin' },
      'tenant-a',
      'target-user',
    ),
    (error) => error instanceof ForbiddenException
      && error.message === 'فقط مدیر کل سیستم می‌تواند مالکیت سازمان را منتقل کند',
  );
});

test('permanent platform deletion requires all three confirmations', async () => {
  const prisma = {
    user: {
      findUnique: async () => ({
        id: 'target-user',
        email: 'target@example.com',
        role: 'user',
        primaryOwnedTenants: [],
      }),
    },
    $transaction: () => assert.fail('deletion must not reach the database without all confirmations'),
  };
  const service = new PlatformAdminService(prisma);

  await assert.rejects(
    () => service.deleteUser(
      { id: 'super-admin', role: 'super_admin' },
      'target-user',
      { confirmIrreversible: true, confirmCascade: false, confirmationText: 'target@example.com' },
    ),
    /هر سه مرحله تأیید حذف باید تکمیل شوند/,
  );
});

test('refresh tokens are stored as SHA-256 hashes', async () => {
  let storedToken;
  const prisma = {
    refreshToken: {
      create: async ({ data }) => {
        storedToken = data.token;
        return data;
      },
    },
  };
  const jwtService = { sign: () => 'signed-access-token' };
  const config = {
    get: (key, fallback) => (
      key === 'JWT_ACCESS_EXPIRES' ? '15m'
        : key === 'JWT_REFRESH_EXPIRES' ? '7d'
          : fallback
    ),
  };
  const service = new AuthService(prisma, jwtService, config);

  const result = await service.issueTokens('user-a', 'user@example.com', 'user');

  assert.match(storedToken, /^[a-f0-9]{64}$/);
  assert.notEqual(storedToken, result.refreshToken);
  assert.equal(result.refreshToken.length, 36);
});

test('parallel failed logins increment atomically and lock the account', async () => {
  const state = { failedLoginAttempts: 0, lockedUntil: null };
  const user = {
    id: 'user-a',
    email: 'user@example.com',
    name: 'User',
    role: 'user',
    avatarUrl: null,
    passwordHash: await require('bcrypt').hash('correct-password', 4),
    isActive: true,
    status: 'active',
    failedLoginAttempts: 0,
    lockedUntil: null,
  };
  const transactionCalls = [];
  const tx = {
    user: {
      update: async (query) => {
        if (query.data.failedLoginAttempts?.increment === 1) {
          state.failedLoginAttempts += 1;
          return { failedLoginAttempts: state.failedLoginAttempts };
        }
        if (query.data.lockedUntil) {
          state.lockedUntil = query.data.lockedUntil;
          return { failedLoginAttempts: state.failedLoginAttempts };
        }
        assert.fail('unexpected user update inside failed-login transaction');
      },
    },
  };
  const prisma = {
    user: {
      findUnique: async () => ({ ...user, failedLoginAttempts: state.failedLoginAttempts }),
      update: () => assert.fail('failed attempts must not use a non-transactional update'),
    },
    $transaction: async (callback) => {
      transactionCalls.push(callback);
      return callback(tx);
    },
  };
  const service = new AuthService(prisma, {}, {});

  const attempts = await Promise.allSettled(
    Array.from({ length: 5 }, () => service.login({
      email: user.email,
      password: 'wrong-password',
    })),
  );

  assert.equal(attempts.every((attempt) => attempt.status === 'rejected'), true);
  assert.equal(transactionCalls.length, 5);
  assert.equal(state.failedLoginAttempts, 5);
  assert.equal(state.lockedUntil instanceof Date, true);
  assert.ok(state.lockedUntil.getTime() > Date.now());
});

test('a password-reset token can be consumed by only one concurrent request', async () => {
  const tokenState = { usedAt: null };
  let lookupCount = 0;
  let releaseLookups;
  const bothLookupsStarted = new Promise((resolve) => { releaseLookups = resolve; });
  const record = {
    id: 'reset-a',
    userId: 'user-a',
    usedAt: null,
    expiresAt: new Date(Date.now() + 60_000),
    user: { isActive: true },
  };
  const tx = {
    passwordResetToken: {
      updateMany: async ({ where, data }) => {
        assert.equal(where.id, record.id);
        assert.equal(where.usedAt, null);
        if (tokenState.usedAt !== null || record.expiresAt < where.expiresAt.gte) {
          return { count: 0 };
        }
        tokenState.usedAt = data.usedAt;
        return { count: 1 };
      },
    },
    user: {
      updateMany: async ({ where }) => {
        assert.deepEqual(where, { id: record.userId, isActive: true });
        return { count: 1 };
      },
    },
    refreshToken: { deleteMany: async () => ({ count: 0 }) },
  };
  const prisma = {
    passwordResetToken: {
      findUnique: async () => {
        lookupCount += 1;
        if (lookupCount === 2) releaseLookups();
        await bothLookupsStarted;
        return { ...record };
      },
    },
    $transaction: async (callback) => callback(tx),
  };
  const service = new AuthService(prisma, {}, {});
  const dto = {
    token: 'single-use-token',
    password: 'New-secure-password-123!',
    confirmPassword: 'New-secure-password-123!',
  };

  const results = await Promise.allSettled([
    service.resetPassword(dto),
    service.resetPassword(dto),
  ]);

  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  const rejected = results.find((result) => result.status === 'rejected');
  assert.ok(rejected);
  assert.equal(rejected.reason.message, 'توکن بازیابی نامعتبر یا منقضی شده است');
  assert.equal(tokenState.usedAt instanceof Date, true);
});

test('a refresh token can be rotated by only one concurrent request', async () => {
  let consumed = false;
  const created = [];
  const stored = {
    id: 'refresh-a',
    expiresAt: new Date(Date.now() + 60_000),
    user: {
      id: 'user-a',
      email: 'user@example.com',
      name: 'User',
      role: 'user',
      avatarUrl: null,
      isActive: true,
      status: 'active',
    },
  };
  const tx = {
    user: {
      findFirst: async () => ({ id: stored.user.id }),
    },
    refreshToken: {
      deleteMany: async () => {
        if (consumed) return { count: 0 };
        consumed = true;
        return { count: 1 };
      },
      create: async ({ data }) => {
        created.push(data);
        return data;
      },
    },
  };
  const prisma = {
    refreshToken: {
      findUnique: async () => stored,
    },
    $transaction: async (callback) => callback(tx),
  };
  let accessCounter = 0;
  const jwtService = { sign: () => `access-${++accessCounter}` };
  const config = { get: (key, fallback) => key === 'JWT_REFRESH_EXPIRES' ? '7d' : fallback };
  const service = new AuthService(prisma, jwtService, config);

  const results = await Promise.allSettled([
    service.refresh({ refreshToken: 'single-use-refresh' }),
    service.refresh({ refreshToken: 'single-use-refresh' }),
  ]);

  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  const rejected = results.find((result) => result.status === 'rejected');
  assert.ok(rejected?.reason instanceof UnauthorizedException);
  assert.equal(created.length, 1);
});

test('JWTs issued before a password change are rejected immediately', async () => {
  const changedAt = new Date('2026-08-30T00:00:10.500Z');
  const prisma = {
    user: {
      findUnique: async () => ({
        id: 'user-a',
        email: 'user@example.com',
        role: 'user',
        status: 'active',
        isActive: true,
        passwordChangedAt: changedAt,
      }),
    },
  };
  const strategy = new JwtStrategy({ get: () => 'a-secure-test-secret-that-is-long-enough' }, prisma);

  const stale = await strategy.validate({
    sub: 'user-a',
    email: 'user@example.com',
    role: 'user',
    iat: Math.floor(changedAt.getTime() / 1000) - 1,
  });
  const current = await strategy.validate({
    sub: 'user-a',
    email: 'user@example.com',
    role: 'user',
    iat: Math.floor(changedAt.getTime() / 1000),
  });

  assert.equal(stale, null);
  assert.equal(current.id, 'user-a');
});

test('logout-all invalidates existing access tokens as well as refresh tokens', async () => {
  const invalidatedAt = new Date('2026-08-30T00:01:10.500Z');
  const prisma = {
    user: {
      findUnique: async () => ({
        id: 'user-a',
        email: 'user@example.com',
        role: 'user',
        status: 'active',
        isActive: true,
        passwordChangedAt: null,
        sessionsInvalidatedAt: invalidatedAt,
      }),
    },
  };
  const strategy = new JwtStrategy({ get: () => 'a-secure-test-secret-that-is-long-enough' }, prisma);

  const result = await strategy.validate({
    sub: 'user-a',
    email: 'user@example.com',
    role: 'user',
    iat: Math.floor(invalidatedAt.getTime() / 1000) - 1,
  });

  assert.equal(result, null);
});

test('notifications are always listed and updated inside the active tenant', async () => {
  const calls = {};
  const prisma = {
    notification: {
      findMany: async (query) => {
        calls.list = query;
        return [];
      },
      updateMany: async (query) => {
        calls.update = query;
        return { count: 0 };
      },
    },
  };
  const service = new NotificationService(prisma);

  await service.list('tenant-a', 'user-a', true);
  await service.markRead('tenant-a', 'notification-b', 'user-a');

  assert.deepEqual(calls.list.where, { tenantId: 'tenant-a', userId: 'user-a', isRead: false });
  assert.deepEqual(calls.update.where, {
    id: 'notification-b',
    tenantId: 'tenant-a',
    userId: 'user-a',
  });
});

require('reflect-metadata');

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { AutomationJobService, retryDelayMs } = require('../dist/common/services/automation-job.service');
const { unifiedContentStage } = require('../dist/common/services/content-workflow.service');
const { sanitizeAuditValue, summarizeAuditBody } = require('../dist/common/interceptors/audit.interceptor');

test('automation retry delay grows exponentially and is safely capped', () => {
  assert.equal(retryDelayMs(-3), 15_000);
  assert.equal(retryDelayMs(1), 15_000);
  assert.equal(retryDelayMs(2), 30_000);
  assert.equal(retryDelayMs(6), 480_000);
  assert.equal(retryDelayMs(10), 1_800_000);
  assert.equal(retryDelayMs(99), 1_800_000);
});

test('newsroom and social statuses share one operational stage model', () => {
  assert.equal(unifiedContentStage('news-article', 'new'), 'inbox');
  assert.equal(unifiedContentStage('news-article', 'social_processing'), 'preparing');
  assert.equal(unifiedContentStage('news-article', 'social_sent'), 'routed');
  assert.equal(unifiedContentStage('news-article', 'publish_failed'), 'failed');
  assert.equal(unifiedContentStage('social-article', 'pending'), 'inbox');
  assert.equal(unifiedContentStage('social-article', 'telegram_published'), 'published');
  assert.equal(unifiedContentStage('social-article', 'archived'), 'archived');
});

test('automatic audit logging redacts credentials and bounds untrusted input', () => {
  const value = sanitizeAuditValue({
    username: 'editor',
    password: 'never-log-me',
    api_key: 'never-log-me-either',
    nested: { authorization: 'Bearer secret', title: 'safe' },
    longText: 'x'.repeat(700),
    oversizedArray: Array.from({ length: 40 }, (_, index) => index),
  });

  assert.equal(value.username, 'editor');
  assert.equal(value.password, '[REDACTED]');
  assert.equal(value.api_key, '[REDACTED]');
  assert.equal(value.nested.authorization, '[REDACTED]');
  assert.equal(value.nested.title, 'safe');
  assert.equal(value.longText.length, 501);
  assert.equal(value.oversizedArray.length, 30);

  const summary = summarizeAuditBody({
    status: 'active', role: 'manager', nationalId: '0012345678',
    bankCardNumber: '6037990000000000', address: 'private address', title: 'private title',
  });
  assert.deepEqual(summary.fields, ['status', 'role', 'nationalId', 'bankCardNumber', 'address', 'title']);
  assert.deepEqual(summary.safeValues, { status: 'active', role: 'manager' });
});

test('two workers cannot claim the same durable job', async () => {
  const row = {
    id: 'job-a', tenantId: 'tenant-a', type: 'news.prepare', status: 'queued',
    payload: { articleId: 'news-a' }, result: null, dedupeKey: 'news:news-a:prepare',
    priority: 10, attempts: 0, maxAttempts: 5, availableAt: new Date(0),
    startedAt: null, lockedAt: null, lockedBy: null, completedAt: null,
    lastError: '', createdAt: new Date(0), updatedAt: new Date(0),
  };
  const prisma = { automationJob: {
    findFirst: async () => row.status === 'queued' ? { id: row.id } : null,
    updateMany: async ({ where, data }) => {
      if (where.id !== row.id || row.status !== 'queued') return { count: 0 };
      row.status = data.status;
      row.lockedAt = data.lockedAt;
      row.lockedBy = data.lockedBy;
      row.startedAt = data.startedAt;
      row.attempts += 1;
      row.lastError = data.lastError;
      return { count: 1 };
    },
    findUnique: async () => ({ ...row }),
  } };
  const jobs = new AutomationJobService(prisma);

  const [workerA, workerB] = await Promise.all([jobs.claim('worker-a', 1), jobs.claim('worker-b', 1)]);

  assert.equal(workerA.length + workerB.length, 1);
  assert.equal(row.status, 'running');
  assert.equal(row.attempts, 1);
  assert.match(row.lockedBy, /^worker-[ab]:/);
});

test('failed jobs retry with backoff and end in the dead-letter state', async () => {
  const writes = [];
  const jobs = new AutomationJobService({ automationJob: {
    updateMany: async (query) => { writes.push(query); return { count: 1 }; },
  } });
  const base = {
    id: 'job-a', tenantId: 'tenant-a', type: 'news.prepare', status: 'running',
    payload: {}, result: null, dedupeKey: 'dedupe-a', priority: 0,
    availableAt: new Date(), startedAt: new Date(), lockedAt: new Date(), lockedBy: 'worker',
    completedAt: null, lastError: '', createdAt: new Date(), updatedAt: new Date(),
  };

  const retryStatus = await jobs.fail({ ...base, attempts: 1, maxAttempts: 3 }, new Error('temporary'));
  const deadStatus = await jobs.fail({ ...base, attempts: 3, maxAttempts: 3 }, new Error('permanent'));

  assert.equal(retryStatus, 'queued');
  assert.equal(writes[0].data.status, 'queued');
  assert.ok(writes[0].data.availableAt.getTime() > Date.now());
  assert.equal(deadStatus, 'dead');
  assert.equal(writes[1].data.status, 'dead');
  assert.ok(writes[1].data.completedAt instanceof Date);
});

test('automatic feed polling requeues a dead fetch job without creating duplicates', async () => {
  const dead = {
    id: 'feed-job', tenantId: 'tenant-a', type: 'news.feed.fetch', status: 'dead',
    payload: { feedId: 'feed-a' }, result: null, dedupeKey: 'feed:feed-a:fetch',
    priority: 20, attempts: 6, maxAttempts: 6, availableAt: new Date(), startedAt: new Date(),
    lockedAt: new Date(), lockedBy: 'worker', completedAt: new Date(), lastError: 'timeout',
    createdAt: new Date(), updatedAt: new Date(),
  };
  let current = dead;
  let resetQuery;
  const jobs = new AutomationJobService({ automationJob: {
    findFirst: async () => current,
    updateMany: async (query) => {
      resetQuery = query;
      if (query.where.status === 'dead' && current.status === 'dead') {
        current = { ...current, status: 'queued', attempts: 0, lockedBy: null, lastError: '' };
        return { count: 1 };
      }
      return { count: 0 };
    },
    findUnique: async () => current,
  } });

  const result = await jobs.enqueue({
    tenantId: 'tenant-a',
    type: 'news.feed.fetch',
    payload: { feedId: 'feed-a' },
    dedupeKey: 'feed:feed-a:fetch',
    retryDead: true,
  });

  assert.equal(result.created, true);
  assert.equal(result.job.status, 'queued');
  assert.deepEqual(resetQuery.where, { id: 'feed-job', status: 'dead' });
  assert.equal(result.job.attempts, 0);
});

test('retry all failed jobs is tenant scoped and atomically resets only dead jobs', async () => {
  let update;
  const jobs = new AutomationJobService({ automationJob: {
    updateMany: async (query) => { update = query; return { count: 7 }; },
  } });

  const result = await jobs.retryAllDead('tenant-a');

  assert.deepEqual(result, { retried: 7 });
  assert.deepEqual(update.where, { tenantId: 'tenant-a', status: 'dead' });
  assert.equal(update.data.status, 'queued');
  assert.equal(update.data.attempts, 0);
  assert.equal(update.data.lastError, '');
  assert.ok(update.data.availableAt instanceof Date);
  assert.equal(update.data.lockedBy, null);
  assert.equal(update.data.completedAt, null);
});

test('a worker that lost its lease cannot complete or requeue a newer claim', async () => {
  const current = { status: 'running', lockedBy: 'worker-b:new-lease' };
  const jobs = new AutomationJobService({ automationJob: {
    updateMany: async ({ where }) => ({
      count: where.status === current.status && where.lockedBy === current.lockedBy ? 1 : 0,
    }),
  } });
  const staleWorkerJob = {
    id: 'job-a', tenantId: 'tenant-a', type: 'news.publish', status: 'running',
    payload: {}, result: null, dedupeKey: 'news:a:publish', priority: 0,
    attempts: 1, maxAttempts: 5, availableAt: new Date(), startedAt: new Date(),
    lockedAt: new Date(), lockedBy: 'worker-a:old-lease', completedAt: null,
    lastError: '', createdAt: new Date(), updatedAt: new Date(),
  };

  assert.equal(await jobs.complete(staleWorkerJob, { ok: true }), false);
  assert.equal(await jobs.fail(staleWorkerJob, new Error('late failure')), 'lost');
});

test('production deployment keeps immutable images, verified backups and rollback checks', () => {
  const repositoryRoot = path.resolve(__dirname, '..', '..', '..');
  const workflow = fs.readFileSync(path.join(repositoryRoot, '.github', 'workflows', 'deploy.yml'), 'utf8');
  const server = fs.readFileSync(path.join(repositoryRoot, 'deploy', 'server-deploy.sh'), 'utf8');
  const publisher = fs.readFileSync(path.join(repositoryRoot, 'deploy', 'publish-local.ps1'), 'utf8');
  const dockerIgnore = fs.readFileSync(path.join(repositoryRoot, '.dockerignore'), 'utf8');
  const apiDockerfile = fs.readFileSync(path.join(repositoryRoot, 'apps', 'api', 'Dockerfile'), 'utf8');
  const webDockerfile = fs.readFileSync(path.join(repositoryRoot, 'apps', 'web', 'Dockerfile'), 'utf8');
  const knownHostsPreparation = fs.readFileSync(path.join(repositoryRoot, 'deploy', 'prepare-known-hosts.sh'), 'utf8');

  assert.match(workflow, /docker\/build-push-action@v6/);
  assert.match(workflow, /needs: prepare/);
  assert.match(workflow, /preflight-server:/);
  assert.match(workflow, /Verify server prerequisites/);
  assert.match(workflow, /needs: \[prepare, preflight-server\]/);
  assert.match(workflow, /continue-on-error: true/);
  assert.match(workflow, /if: steps\.image_build\.outcome == 'failure'/);
  assert.match(workflow, /ghcr\.io\/roshan-norouzi\/deska/);
  assert.match(workflow, /SERVER_SSH_KNOWN_HOSTS/);
  assert.doesNotMatch(workflow, /SERVER_SSH_KEY SERVER_SSH_KNOWN_HOSTS DEPLOY_PATH/);
  assert.doesNotMatch(workflow, /ssh-keyscan -T/);
  assert.match(workflow, /StrictHostKeyChecking=yes/);
  assert.match(workflow, /prepare-known-hosts\.sh/);
  assert.match(workflow, /Verify SSH pinning helper/);
  assert.doesNotMatch(workflow, /docker\s+save|image-bundle|\.tar\.gz.*image/iu);
  assert.match(server, /pg_dump[\s\S]*--format=custom/);
  assert.match(server, /pg_restore --list/);
  assert.match(server, /automatic rollback started/);
  assert.match(server, /\/api\/health\/ready/);
  assert.match(server, /grep -Fq .*version.*VERSION/);
  assert.match(publisher, /failedStepLogFiles/);
  assert.match(publisher, /\^DESKA_DEPLOY_\(STAGE\|ERROR\):/);
  assert.match(publisher, /function Push-BranchWithRetry/);
  assert.match(publisher, /Unable to push to GitHub after \$attemptCount attempts/);
  assert.match(publisher, /origin\/\$branch\.\.HEAD/);
  assert.match(publisher, /\$baselineRunIds/);
  assert.match(publisher, /\$discoveryCutoff = \$dispatchStarted\.AddMinutes\(-2\)/);
  assert.match(publisher, /Invoke-RestMethod[\s\S]*-TimeoutSec 30/);
  assert.doesNotMatch(publisher, /created_at\)\.ToUniversalTime\(\) -ge \$dispatchStarted/);
  assert.match(dockerIgnore, /\*\*\/\.next-dev/);
  assert.match(dockerIgnore, /\*\*\/test-results/);
  assert.match(apiDockerfile, /org\.opencontainers\.image\.source="https:\/\/github\.com\/roshan-norouzi\/deska"/);
  assert.match(webDockerfile, /org\.opencontainers\.image\.source="https:\/\/github\.com\/roshan-norouzi\/deska"/);
  assert.match(knownHostsPreparation, /automatic server host-key discovery is being used for backward compatibility/);
  assert.match(knownHostsPreparation, /could not obtain a valid SSH host key from SERVER_HOST and SERVER_PORT/);
  assert.match(knownHostsPreparation, /fingerprint did not match a host key served by the configured server/);
  assert.match(knownHostsPreparation, /MD5:/);
  assert.match(knownHostsPreparation, /port_number == 22/);
  assert.match(knownHostsPreparation, /ssh-keyscan -T 30/);
});

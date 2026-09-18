require('reflect-metadata');

const test = require('node:test');
const assert = require('node:assert/strict');

const s3Endpoint = process.env.S3_ENDPOINT?.trim();
const runS3 = process.env.RUN_S3_TESTS === 'true' || Boolean(s3Endpoint);

test('object storage S3 backend put/get/delete prefix', { skip: !runS3 }, async () => {
  const { ObjectStorageService } = require('../dist/common/services/object-storage.service');
  const previous = {
    STORAGE_TYPE: process.env.STORAGE_TYPE,
    S3_ENDPOINT: process.env.S3_ENDPOINT,
    S3_BUCKET: process.env.S3_BUCKET,
    S3_ACCESS_KEY: process.env.S3_ACCESS_KEY,
    S3_SECRET_KEY: process.env.S3_SECRET_KEY,
    S3_REGION: process.env.S3_REGION,
    S3_FORCE_PATH_STYLE: process.env.S3_FORCE_PATH_STYLE,
  };

  process.env.STORAGE_TYPE = 's3';
  process.env.S3_ENDPOINT = s3Endpoint || 'http://127.0.0.1:9000';
  process.env.S3_BUCKET = process.env.S3_BUCKET || 'deska-news';
  process.env.S3_ACCESS_KEY = process.env.S3_ACCESS_KEY || 'deska-minio';
  process.env.S3_SECRET_KEY = process.env.S3_SECRET_KEY || 'deska-minio-dev-password-2026';
  process.env.S3_REGION = process.env.S3_REGION || 'us-east-1';
  process.env.S3_FORCE_PATH_STYLE = process.env.S3_FORCE_PATH_STYLE || 'true';

  const storage = new ObjectStorageService({ get: (key, fallback) => process.env[key] ?? fallback });
  const tenantId = 'tenant-s3-test-123456';
  const key = storage.key('cover-images', 'integration.png', tenantId);
  await storage.put(key, Buffer.from('s3-integration'));
  const buffer = await storage.get(key);
  assert.equal(buffer.toString('utf8'), 's3-integration');
  await storage.delete(key);
  await storage.put(`${tenantId}/orphan.txt`, Buffer.from('orphan'));
  await storage.put(storage.key('fonts', 'orphan.woff2', tenantId), Buffer.from('font'));
  await storage.deleteTenantObjects(tenantId);

  Object.assign(process.env, previous);
});

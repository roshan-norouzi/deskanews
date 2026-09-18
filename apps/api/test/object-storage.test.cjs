require('reflect-metadata');

const test = require('node:test');
const assert = require('node:assert/strict');
const { storageObjectKey } = require('../dist/common/services/object-storage.types');

test('storage object keys stay tenant scoped and basename safe', () => {
  assert.equal(storageObjectKey('fonts', 'abc.woff2', 'tenant-a'), 'fonts/tenant-a/abc.woff2');
  assert.equal(storageObjectKey('social-publishing', '../escape.png'), 'social-publishing/escape.png');
});

test('object storage local backend writes and reads bytes', async () => {
  const { ObjectStorageService } = require('../dist/common/services/object-storage.service');
  const previousStoragePath = process.env.STORAGE_PATH;
  process.env.STORAGE_TYPE = 'local';
  process.env.STORAGE_PATH = require('node:os').tmpdir() + '/deska-object-storage-test';
  const storage = new ObjectStorageService({ get: (_key, fallback) => fallback });
  const key = storage.key('cover-images', 'sample.png', 'tenant-test-123456');
  await storage.put(key, Buffer.from('hello'));
  const buffer = await storage.get(key);
  assert.equal(buffer.toString('utf8'), 'hello');
  await storage.delete(key);
  process.env.STORAGE_PATH = previousStoragePath;
});

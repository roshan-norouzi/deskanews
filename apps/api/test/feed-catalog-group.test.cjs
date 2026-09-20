const test = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeFeedCatalogGroupForSource,
  resolveFeedCatalogGroup,
} = require('../../packages/shared/dist/feed-catalog-groups');

test('resolveFeedCatalogGroup keeps auto language sources in domestic media tab', () => {
  assert.equal(resolveFeedCatalogGroup('rss', undefined, 'auto'), 'media-domestic');
  assert.equal(resolveFeedCatalogGroup('website', undefined, 'auto'), 'media-domestic');
});

test('resolveFeedCatalogGroup uses stored catalog group for org feeds', () => {
  assert.equal(resolveFeedCatalogGroup('website', 'orgs-companies', 'auto'), 'orgs-companies');
});

test('normalizeFeedCatalogGroupForSource prefers requested group when compatible', () => {
  assert.equal(normalizeFeedCatalogGroupForSource('orgs-companies', 'website', 'fa'), 'orgs-companies');
  assert.equal(normalizeFeedCatalogGroupForSource('media-international', 'rss', 'en'), 'media-international');
});

test('normalizeFeedCatalogGroupForSource rejects incompatible group requests', () => {
  assert.equal(normalizeFeedCatalogGroupForSource('telegram', 'rss', 'fa'), 'media-domestic');
});

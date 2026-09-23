require('reflect-metadata');

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  DESTINATION_HEALTH_KEY,
  DESTINATION_HEALTH_NAME,
  isDestinationConfigured,
} = require('../dist/modules/smart-publishing/destination-health');

test('destination health is labeled سایت مقصد', () => {
  assert.equal(DESTINATION_HEALTH_KEY, 'destination');
  assert.equal(DESTINATION_HEALTH_NAME, 'سایت مقصد');
});

test('isDestinationConfigured follows the selected platform', () => {
  assert.equal(isDestinationConfigured({ wp_site_url: 'https://a.example', wp_username: 'u', wp_app_password: 'p' }), true);
  assert.equal(isDestinationConfigured({ destination_platform: 'iransamaneh', is_site_url: 'https://a.example', is_username: 'u', is_password: 'p' }), true);
  assert.equal(isDestinationConfigured({ destination_platform: 'nastooh', ns_site_url: 'https://a.example' }), false);
});

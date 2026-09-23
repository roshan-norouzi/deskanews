const test = require('node:test');
const assert = require('node:assert/strict');
const {
  ORGANIZATION_MENU_PERMISSIONS,
  permissionsForPicker,
  expandMemberPermissions,
} = require('@deska/shared');

const NAV_MEMBER_HREFS = [
  '/dashboard',
  '/publishing/feeds',
  '/publishing/news',
  '/publishing/social',
  '/publishing/media',
  '/publishing/settings',
  '/publishing/operations',
  '/settings',
];

test('organization menu permissions cover member navigation routes', () => {
  const hrefs = new Set(ORGANIZATION_MENU_PERMISSIONS.map((item) => item.href));
  for (const href of NAV_MEMBER_HREFS) {
    assert.ok(hrefs.has(href), `missing permission mapping for ${href}`);
  }
});

test('legacy publishing.view expands to granular publishing menu permissions except settings', () => {
  const picked = permissionsForPicker(['publishing.view']);
  assert.ok(picked.includes('publishing.feeds'));
  assert.ok(picked.includes('publishing.news'));
  assert.ok(!picked.includes('publishing.settings'));
  assert.ok(picked.includes('publishing.operations'));
});

test('publishing.settings is granted only when stored explicitly', () => {
  const without = expandMemberPermissions(['publishing.view']);
  assert.ok(!without.includes('publishing.settings'));
  const withSettings = expandMemberPermissions(['publishing.view', 'publishing.settings']);
  assert.ok(withSettings.includes('publishing.settings'));
});

test('expandMemberPermissions maps users.manage to settings.manage', () => {
  const expanded = expandMemberPermissions(['users.manage']);
  assert.ok(expanded.includes('settings.manage'));
});

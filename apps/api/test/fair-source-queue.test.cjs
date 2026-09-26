const test = require('node:test');
const assert = require('node:assert/strict');
const { pickRoundRobinByKey } = require('../dist/modules/smart-publishing/fair-source-queue');

test('round-robin pick spreads work across sources instead of taking the newest pile', () => {
  const items = [
    { id: 'a1', source: 'a' },
    { id: 'a2', source: 'a' },
    { id: 'a3', source: 'a' },
    { id: 'b1', source: 'b' },
    { id: 'c1', source: 'c' },
  ];
  const picked = pickRoundRobinByKey(items, 3, (item) => item.source);
  assert.deepEqual(picked.map((item) => item.id), ['a1', 'b1', 'c1']);
});

require('reflect-metadata');

const test = require('node:test');
const assert = require('node:assert/strict');
const { toWordPressHtml } = require('../dist/modules/smart-publishing/news-publish-html');
const {
  fallbackCoverTemplateFromSample,
  normalizeInferredCoverTemplate,
  resolveCoverCanvasSize,
} = require('../dist/modules/smart-publishing/cover-template-from-sample');

test('toWordPressHtml appends a source line with name and link', () => {
  const html = toWordPressHtml('متن کامل خبر', 'رسانه فناوری', 'https://source.example/story', 'news-a');
  assert.match(html, /متن کامل خبر/);
  assert.match(html, /<p>منبع: <a href="https:\/\/source\.example\/story"[^>]*>رسانه فناوری<\/a><\/p>/);
});

test('resolveCoverCanvasSize maps tall samples to story size', () => {
  assert.deepEqual(resolveCoverCanvasSize(1080, 1080), { width: 1080, height: 1080 });
  assert.deepEqual(resolveCoverCanvasSize(1080, 1920), { width: 1080, height: 1920 });
});

test('normalizeInferredCoverTemplate keeps title and featured-image layers', () => {
  const template = normalizeInferredCoverTemplate({
    backgroundColor: '#111827',
    layers: [
      { type: 'featured-image', name: 'عکس', x: 0, y: 0, width: 100, height: 70 },
      { type: 'text', binding: 'title', name: 'تیتر', x: 8, y: 74, width: 84, height: 18, color: '#ffffff' },
    ],
  }, { width: 1080, height: 1080 });
  assert.equal(template.layers.some((layer) => layer.type === 'featured-image'), true);
  assert.equal(template.layers.some((layer) => layer.binding === 'title'), true);
  assert.equal(template.backgroundColor, '#111827');
});

test('normalizeInferredCoverTemplate falls back when layers are empty', () => {
  const fallback = fallbackCoverTemplateFromSample();
  const template = normalizeInferredCoverTemplate({ layers: [] }, { width: 1080, height: 1080 });
  assert.equal(template.layers.length, fallback.layers.length);
});

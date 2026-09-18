require('reflect-metadata');

const test = require('node:test');
const assert = require('node:assert/strict');
const { SocialStudioService } = require('../dist/modules/smart-publishing/social-studio.service');

test('social featured-image updates stay tenant-scoped and clear a stale generated image', async () => {
  let findArgs;
  let updateArgs;
  const updatedArticle = { id: 'article-1', featuredImageUrl: '/publishing/settings/images/file/tenant-0001/image.png', generatedImageUrl: null };
  const prisma = {
    socialArticle: {
      findFirst: async (args) => { findArgs = args; return { id: 'article-1', featuredImageUrl: '/publishing/settings/images/file/tenant-0001/old.png' }; },
      update: async (args) => { updateArgs = args; return updatedArticle; },
    },
  };
  const service = new SocialStudioService(prisma, {}, {}, {}, {}, {}, {}, {});

  const result = await service.updateFeaturedImage('tenant-0001', 'article-1', updatedArticle.featuredImageUrl);

  assert.deepEqual(findArgs, { where: { id: 'article-1', tenantId: 'tenant-0001' }, select: { id: true, featuredImageUrl: true } });
  assert.deepEqual(updateArgs.data, {
    featuredImageUrl: updatedArticle.featuredImageUrl,
    generatedImageUrl: null,
    generatedImageTemplateId: null,
    lastError: '',
  });
  assert.deepEqual(result, {
    article: updatedArticle,
    previousFeaturedImageUrl: '/publishing/settings/images/file/tenant-0001/old.png',
  });
});

test('social featured-image cannot update an article from another tenant', async () => {
  let updateCalled = false;
  const prisma = {
    socialArticle: {
      findFirst: async () => null,
      update: async () => { updateCalled = true; },
    },
  };
  const service = new SocialStudioService(prisma, {}, {}, {}, {}, {}, {}, {});

  await assert.rejects(
    () => service.updateFeaturedImage('tenant-0001', 'article-from-another-tenant', null),
    /مطلب اجتماعی یافت نشد/,
  );
  assert.equal(updateCalled, false);
});

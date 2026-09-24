const test = require('node:test');
const assert = require('node:assert/strict');
const {
  cleanExtractedArticleText,
  isBoilerplateArticleLine,
} = require('../dist/modules/smart-publishing/article-body-cleanup');

test('cleanExtractedArticleText removes publisher UI and related teasers', () => {
  const noisy = [
    'به گزارش اشپیگل (آلمان)، افزودن به فهرست ذخیره',
    '',
    'گوش دادن به مقاله (۳ دقیقه) ۳ دقیقه',
    '',
    'گزینه‌های بیشتر برای اشتراک‌گذاری',
    '',
    'مربی اینگولشتات، ویتمن، در دیدار لیگ مقابل تیم فوتبال زاربروکن',
    '',
    'باشگاه اینگولشتات ۰۴ به همکاری خود با سابرینا ویتمن، سرمربی تیم، پایان داد. او در ماه مه ۲۰۲۴ به‌عنوان نخستین زن، هدایت یک تیم حرفه‌ای فوتبال مردان را بر عهده گرفت، اما پس از شروع ناامیدکننده فصل در لیگ دسته سوم، اکنون همکاری‌اش با باشگاه به پایان رسیده است.',
    '',
    'من موافقم که محتوای خارجی به من نمایش داده شود. در این صورت، داده‌های شخصی ممکن است به پلتفرم‌های شخص ثالث منتقل شود. اطلاعات بیشتر در سیاست حفظ حریم خصوصی ما.',
    '',
    'سابرینا ویتمن: او نخستین مربی زن در فوتبال حرفه‌ای مردان است',
    'نوشته پیتر آرنس، ۲ دقیقه',
    'افزودن به فهرست ذخیره',
    '۲ دقیقه',
  ].join('\n');

  const cleaned = cleanExtractedArticleText(noisy);
  assert.match(cleaned, /باشگاه اینگولشتات ۰۴/);
  assert.doesNotMatch(cleaned, /افزودن به فهرست/);
  assert.doesNotMatch(cleaned, /گوش دادن به مقاله/);
  assert.doesNotMatch(cleaned, /موافقم که محتوای خارجی/);
  assert.doesNotMatch(cleaned, /نوشته پیتر آرنس/);
  assert.doesNotMatch(cleaned, /مربی اینگولشتات، ویتمن، در دیدار/);
});

test('cleanExtractedArticleText keeps substantive body paragraphs', () => {
  const body = [
    'این پاراگراف اول خبر است و به اندازه کافی طولانی است تا به عنوان متن اصلی مقاله شناخته شود و نباید حذف گردد.',
    'پاراگراف دوم نیز جزئیات مهم خبر را توضیح می‌دهد و باید در خروجی نهایی باقی بماند.',
  ].join('\n\n');
  assert.equal(cleanExtractedArticleText(body), body);
});

test('isBoilerplateArticleLine detects common UI strings', () => {
  assert.equal(isBoilerplateArticleLine('افزودن به فهرست ذخیره'), true);
  assert.equal(isBoilerplateArticleLine('Listen to the article (3 minutes)'), true);
  assert.equal(isBoilerplateArticleLine('متن واقعی خبر که چند جمله دارد و حذف نمی‌شود.'), false);
});

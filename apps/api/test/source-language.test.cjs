const test = require('node:test');
const assert = require('node:assert/strict');
const {
  detectSourceLanguage,
  detectSourceLanguageFromItems,
  mergeSourceLanguageCatalog,
  normalizeSourceLanguage,
  shouldUsePersianRewrite,
  sourceLanguageLabel,
} = require('@deska/shared');

test('detectSourceLanguage recognizes Persian news copy', () => {
  assert.equal(
    detectSourceLanguage('رئیس سازمان اعلام کرد که این برنامه برای توسعه همکاری‌های منطقه‌ای اجرا می‌شود و خبر آن منتشر شد.'),
    'fa',
  );
});

test('detectSourceLanguage recognizes English, Arabic, French, German and Turkish copy', () => {
  assert.equal(
    detectSourceLanguage('The agency announced a new regional cooperation programme after the meeting with partners.'),
    'en',
  );
  assert.equal(
    detectSourceLanguage('أعلنت الوكالة عن برنامج جديد للتعاون الإقليمي بعد الاجتماع مع الشركاء في المنطقة.'),
    'ar',
  );
  assert.equal(
    detectSourceLanguage('Le gouvernement a annoncé un nouveau programme pour les partenaires dans la région.'),
    'fr',
  );
  assert.equal(
    detectSourceLanguage('Die Regierung hat ein neues Programm für die Zusammenarbeit nach dem Treffen vorgestellt.'),
    'de',
  );
  assert.equal(
    detectSourceLanguage('Hükümet bölgedeki işbirliği için yeni bir program açıkladı ve haber yayımlandı.'),
    'tr',
  );
});

test('detectSourceLanguageFromItems uses health-check titles after a passing probe', () => {
  assert.equal(
    detectSourceLanguageFromItems([
      { title: 'Israel and Hamas agree to a new ceasefire plan', summary: 'The deal was announced after talks in Egypt.' },
      { title: 'Markets rise after the central bank decision', summary: 'Investors said the move was expected.' },
      { title: 'Storms hit the southern coast overnight', summary: 'Rescue teams have started new operations.' },
    ]),
    'en',
  );
  assert.equal(detectSourceLanguageFromItems([{ title: 'خبر' }]), 'auto');
});

test('detectSourceLanguage recognizes languages outside the original catalog list', () => {
  assert.equal(
    detectSourceLanguage('Правительство объявило новую программу регионального сотрудничества после встречи с партнёрами.'),
    'ru',
  );
  assert.equal(
    detectSourceLanguage('El gobierno anunció un nuevo programa de cooperación regional después de la reunión con los socios.'),
    'es',
  );
  assert.equal(
    detectSourceLanguage('Il governo ha annunciato un nuovo programma di cooperazione regionale dopo l incontro con i partner.'),
    'it',
  );
  assert.equal(
    detectSourceLanguage('O governo anunciou um novo programa de cooperação regional depois da reunião com os parceiros.'),
    'pt',
  );
  assert.equal(
    detectSourceLanguage('정부는 파트너들과의 회의 이후 새로운 지역 협력 프로그램을 발표했다.'),
    'ko',
  );
  assert.equal(
    detectSourceLanguage('Уряд оголосив нову програму регіональної співпраці після зустрічі з партнерами в країні.'),
    'uk',
  );
  assert.equal(
    detectSourceLanguage('حکومت نے شراکت داروں کے ساتھ اجلاس کے بعد علاقائی تعاون کا نیا پروگرام جاری کیا ہے۔'),
    'ur',
  );
});

test('unknown ISO language codes are kept and added to system language knowledge', () => {
  assert.equal(normalizeSourceLanguage('ru'), 'ru');
  assert.equal(normalizeSourceLanguage('zz'), 'zz');
  assert.equal(normalizeSourceLanguage('not-a-language'), 'auto');
  assert.match(sourceLanguageLabel('ru'), /روسی/);
  const catalog = mergeSourceLanguageCatalog(['ru', 'zz']);
  assert.ok(catalog.includes('ru'));
  assert.ok(catalog.includes('zz'));
  assert.equal(catalog[0], 'auto');
  assert.equal(shouldUsePersianRewrite('ru', 'Правительство объявило новую программу регионального сотрудничества.'), false);
});

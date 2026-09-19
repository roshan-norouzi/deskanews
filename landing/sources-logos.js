(function () {
  'use strict';

  const SOURCES = [
    { name: 'خبرگزاری مهر', domain: 'mehrnews.com' },
    { name: 'خبرگزاری ایسنا', domain: 'isna.ir' },
    { name: 'خبرگزاری ایرنا', domain: 'irna.ir' },
    { name: 'خبرگزاری تسنیم', domain: 'tasnimnews.com' },
    { name: 'خبرگزاری فارس', domain: 'farsnews.ir' },
    { name: 'خبرگزاری ایلنا', domain: 'ilna.ir' },
    { name: 'خبرگزاری دانشجو', domain: 'snn.ir' },
    { name: 'باشگاه خبرنگاران جوان', domain: 'yjc.ir' },
    { name: 'انتخاب', domain: 'entekhab.ir' },
    { name: 'تابناک', domain: 'tabnak.ir' },
    { name: 'همشهری آنلاین', domain: 'hamshahrionline.ir' },
    { name: 'خبرآنلاین', domain: 'khabaronline.ir' },
    { name: 'دنیای اقتصاد', domain: 'donya-e-eqtesad.com' },
    { name: 'اقتصادنیوز', domain: 'eghtesadnews.com' },
    { name: 'تجارت‌نیوز', domain: 'tejaratnews.com' },
    { name: 'فرارو', domain: 'fararu.com' },
    { name: 'عصر ایران', domain: 'asriran.com' },
    { name: 'خبر ورزشی', domain: 'khabarvarzeshi.com' },
    { name: 'ورزش۳', domain: 'varzesh3.com' },
    { name: 'طرفداری', domain: 'tarafdari.com' },
    { name: 'فوتبال۳۶۰', domain: 'football360.ir' },
    { name: 'آی‌اسپورت', domain: 'isport.ir' },
    { name: 'متافوتبال', domain: 'metafutbol.com' },
    { name: 'دیجیاتو', domain: 'digiato.com' },
    { name: 'زومیت', domain: 'zoomit.ir' },
    { name: 'پیوست', domain: 'peivast.com' },
    { name: 'خبرگزاری پانا', domain: 'pana.ir' },
    { name: 'خبرگزاری شبستان', domain: 'shabestan.ir' },
    { name: 'خبرگزاری رضوی', domain: 'razavi.news' },
    { name: 'اکوایران', domain: 'ecoiran.com' },
    { name: 'BBC News', domain: 'bbc.co.uk' },
    { name: 'Reuters', domain: 'reuters.com' },
    { name: 'Associated Press', domain: 'apnews.com' },
    { name: 'The Guardian', domain: 'theguardian.com' },
    { name: 'CNN', domain: 'cnn.com' },
    { name: 'AFP', domain: 'afp.com' },
    { name: 'France 24', domain: 'france24.com' },
    { name: 'Tagesschau', domain: 'tagesschau.de' },
    { name: 'Der Spiegel', domain: 'spiegel.de' },
    { name: 'FAZ', domain: 'faz.net' },
    { name: 'Le Monde', domain: 'lemonde.fr' },
    { name: 'Le Figaro', domain: 'lefigaro.fr' },
    { name: 'EFE', domain: 'efe.com' },
    { name: 'ANSA', domain: 'ansa.it' },
    { name: 'الجزیره', domain: 'aljazeera.net' },
    { name: 'العربية', domain: 'alarabiya.net' },
    { name: 'واس — SPA', domain: 'spa.gov.sa' },
    { name: 'وام — WAM', domain: 'wam.ae' },
    { name: 'الأهرام', domain: 'ahram.org.eg' },
    { name: 'آنادولو — عربی', domain: 'aa.com.tr' },
    { name: 'Anadolu Ajansı', domain: 'aa.com.tr' },
    { name: 'TRT Haber', domain: 'trthaber.com' },
    { name: 'Hürriyet', domain: 'hurriyet.com.tr' },
    { name: 'TASS', domain: 'tass.com' },
    { name: 'RIA Novosti', domain: 'ria.ru' },
    { name: '新华社', domain: 'news.cn' },
    { name: '人民网', domain: 'people.com.cn' },
    { name: 'CGTN', domain: 'cgtn.com' },
    { name: 'NHK', domain: 'nhk.or.jp' },
    { name: 'PTI', domain: 'ptinews.com' },
    { name: 'Ynet', domain: 'ynet.co.il' },
    { name: 'Olympics.com', domain: 'olympics.com' },
    { name: 'وزارت ورزش و جوانان', domain: 'msy.gov.ir' },
    { name: 'کمیته ملی المپیک', domain: 'olympic.ir' },
    { name: 'کمیته ملی پارالمپیک', domain: 'paralympic.ir' },
    { name: 'فدراسیون فوتبال ایران', domain: 'ffiri.ir' },
    { name: 'سازمان لیگ فوتبال', domain: 'iranleague.ir' },
    { name: 'فدراسیون والیبال', domain: 'volleyball.ir' },
    { name: 'فدراسیون بسکتبال', domain: 'iranbasketball.org' },
    { name: 'فدراسیون کشتی', domain: 'iwf.ir' },
    { name: 'فدراسیون وزنه‌برداری', domain: 'iwrf.ir' },
    { name: 'فدراسیون تکواندو', domain: 'itifed.ir' },
    { name: 'وزارت علوم', domain: 'msrt.ir' },
    { name: 'وزارت آموزش و پرورش', domain: 'medu.ir' },
    { name: 'معاونت علمی ریاست‌جمهوری', domain: 'isti.ir' },
    { name: 'سازمان فناوری اطلاعات', domain: 'ito.gov.ir' },
    { name: 'سازمان بورس', domain: 'seo.ir' },
    { name: 'اتاق بازرگانی ایران', domain: 'iccima.ir' },
    { name: 'سازمان ملل', domain: 'un.org' },
    { name: 'UNESCO', domain: 'unesco.org' },
    { name: 'WHO', domain: 'who.int' },
    { name: 'IOC', domain: 'olympics.com' },
    { name: 'FIFA', domain: 'fifa.com' },
    { name: 'AFC', domain: 'the-afc.com' },
    { name: 'دیجی‌کالا مگ', domain: 'digikala.com' },
    { name: 'اسنپ بلاگ', domain: 'snapp.ir' },
    { name: 'همراه اول', domain: 'mci.ir' },
    { name: 'ایرانسل', domain: 'irancell.ir' },
    { name: 'آپارات', domain: 'aparat.com' },
    { name: 'کافه‌بازار بلاگ', domain: 'cafebazaar.ir' },
    { name: 'انجمن روابط عمومی ایران', domain: 'priran.ir' },
    { name: 'حوزه هنری', domain: 'hozehonari.ir' },
    { name: 'بنیاد ملی نخبگان', domain: 'bmn.ir' },
  ];

  function favicon(domain) {
    return 'https://www.google.com/s2/favicons?domain=' + encodeURIComponent(domain) + '&sz=128';
  }

  function fallbackLabel(name) {
    const latin = name.match(/[A-Za-z]/g);
    if (latin && latin.length >= 2) {
      return (latin[0] + latin[1]).toUpperCase();
    }
    return name.trim().slice(0, 2);
  }

  function shuffle(list) {
    const items = list.slice();
    for (let i = items.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = items[i];
      items[i] = items[j];
      items[j] = tmp;
    }
    return items;
  }

  function renderLogo(source) {
    const item = document.createElement('div');
    item.className = 'source-logo-item reveal';
    item.title = source.name;

    const iconWrap = document.createElement('div');
    iconWrap.className = 'source-logo-icon';

    const img = document.createElement('img');
    img.src = favicon(source.domain);
    img.alt = source.name;
    img.loading = 'lazy';
    img.width = 40;
    img.height = 40;

    img.onerror = function () {
      img.remove();
      const fallback = document.createElement('span');
      fallback.className = 'source-logo-fallback';
      fallback.textContent = fallbackLabel(source.name);
      iconWrap.appendChild(fallback);
    };

    iconWrap.appendChild(img);

    const label = document.createElement('span');
    label.className = 'source-logo-name';
    label.textContent = source.name;

    item.appendChild(iconWrap);
    item.appendChild(label);
    return item;
  }

  function render() {
    const container = document.getElementById('sourceLogosGrid');
    if (!container) return;

    const grid = document.createElement('div');
    grid.className = 'source-logo-grid';

    shuffle(SOURCES).forEach(function (source) {
      grid.appendChild(renderLogo(source));
    });

    container.appendChild(grid);

    const revealItems = grid.querySelectorAll('.reveal');

    if ('IntersectionObserver' in window) {
      const observer = new IntersectionObserver(
        function (entries) {
          entries.forEach(function (entry) {
            if (entry.isIntersecting) {
              entry.target.classList.add('visible');
              observer.unobserve(entry.target);
            }
          });
        },
        { threshold: 0.05, rootMargin: '0px 0px -20px 0px' }
      );
      revealItems.forEach(function (el, i) {
        el.style.transitionDelay = (i % 8) * 30 + 'ms';
        observer.observe(el);
      });
    } else {
      revealItems.forEach(function (el) {
        el.classList.add('visible');
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', render);
  } else {
    render();
  }
})();

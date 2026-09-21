(function () {
  'use strict';

  /** نمونه محدود از کاتالوگ — بدون نمایش همه منابع */
  const SAMPLE_SOURCES = [
    { name: 'خبرگزاری مهر', domain: 'mehrnews.com' },
    { name: 'خبرگزاری ایسنا', domain: 'isna.ir' },
    { name: 'خبرگزاری ایرنا', domain: 'irna.ir' },
    { name: 'ورزش۳', domain: 'varzesh3.com' },
    { name: 'زومیت', domain: 'zoomit.ir' },
    { name: 'BBC News', domain: 'bbc.co.uk' },
    { name: 'Reuters', domain: 'reuters.com' },
    { name: 'الجزیره', domain: 'aljazeera.net' },
    { name: 'Tagesschau', domain: 'tagesschau.de' },
    { name: 'Le Monde', domain: 'lemonde.fr' },
    { name: 'FIFA', domain: 'fifa.com' },
    { name: 'کمیته ملی المپیک', domain: 'olympic.ir' },
  ];

  function favicon(domain) {
    return 'https://www.google.com/s2/favicons?domain=' + encodeURIComponent(domain) + '&sz=128';
  }

  function fallbackLabel(name) {
    const latin = name.match(/[A-Za-z]/g);
    if (latin && latin.length >= 2) return (latin[0] + latin[1]).toUpperCase();
    return name.trim().slice(0, 2);
  }

  function renderChip(source) {
    const chip = document.createElement('div');
    chip.className = 'source-chip reveal';

    const icon = document.createElement('div');
    icon.className = 'source-chip-icon';

    const img = document.createElement('img');
    img.src = favicon(source.domain);
    img.alt = '';
    img.loading = 'lazy';
    img.width = 28;
    img.height = 28;
    img.onerror = function () {
      img.remove();
      const fb = document.createElement('span');
      fb.className = 'source-chip-fallback';
      fb.textContent = fallbackLabel(source.name);
      icon.appendChild(fb);
    };
    icon.appendChild(img);

    const label = document.createElement('span');
    label.className = 'source-chip-name';
    label.textContent = source.name;

    chip.appendChild(icon);
    chip.appendChild(label);
    return chip;
  }

  function render() {
    const track = document.getElementById('sourceChipsTrack');
    if (!track) return;

    SAMPLE_SOURCES.forEach(function (source) {
      track.appendChild(renderChip(source));
    });

    SAMPLE_SOURCES.forEach(function (source) {
      track.appendChild(renderChip(source));
    });

    if ('IntersectionObserver' in window) {
      const observer = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add('visible');
            observer.unobserve(entry.target);
          }
        });
      }, { threshold: 0.1 });
      track.querySelectorAll('.reveal').forEach(function (el) { observer.observe(el); });
    } else {
      track.querySelectorAll('.reveal').forEach(function (el) { el.classList.add('visible'); });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', render);
  } else {
    render();
  }
})();

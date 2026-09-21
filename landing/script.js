(function () {
  'use strict';

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var FA = '۰۱۲۳۴۵۶۷۸۹';
  function faNum(n) { return String(n).replace(/\d/g, function (d) { return FA[d]; }); }

  var header = document.getElementById('header');
  var navToggle = document.getElementById('navToggle');
  var mobileNav = document.getElementById('mobileNav');
  var themeToggle = document.getElementById('themeToggle');
  var demoBtn = document.getElementById('demoBtn');
  var demoDialog = document.getElementById('demoDialog');
  var demoClose = document.getElementById('demoClose');
  var form = document.getElementById('leadForm');
  var formError = document.getElementById('formError');
  var formOk = document.getElementById('formOk');
  var device = document.getElementById('heroDevice');

  function setTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    try { localStorage.setItem('deska-theme', theme); } catch (e) {}
  }

  var saved = null;
  try { saved = localStorage.getItem('deska-theme'); } catch (e) {}
  if (saved === 'dark' || saved === 'light') setTheme(saved);
  else if (window.matchMedia('(prefers-color-scheme: dark)').matches) setTheme('dark');
  else setTheme('light');

  if (themeToggle) {
    themeToggle.addEventListener('click', function () {
      var next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      setTheme(next);
    });
  }

  window.addEventListener('scroll', function () {
    if (header) header.classList.toggle('scrolled', window.scrollY > 8);
  }, { passive: true });

  if (navToggle && mobileNav) {
    navToggle.addEventListener('click', function () {
      var open = mobileNav.hasAttribute('hidden');
      if (open) mobileNav.removeAttribute('hidden');
      else mobileNav.setAttribute('hidden', '');
      navToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    mobileNav.querySelectorAll('a').forEach(function (link) {
      link.addEventListener('click', function () {
        mobileNav.setAttribute('hidden', '');
        navToggle.setAttribute('aria-expanded', 'false');
      });
    });
  }

  if (demoBtn && demoDialog) {
    demoBtn.addEventListener('click', function () {
      if (typeof demoDialog.showModal === 'function') demoDialog.showModal();
    });
  }
  if (demoClose && demoDialog) {
    demoClose.addEventListener('click', function () { demoDialog.close(); });
  }

  if (!reduced && device) {
    document.addEventListener('mousemove', function (e) {
      var r = device.getBoundingClientRect();
      var x = (e.clientX - (r.left + r.width / 2)) / r.width;
      var y = (e.clientY - (r.top + r.height / 2)) / r.height;
      device.style.transform = 'perspective(1200px) rotateX(' + (4 - y * 6) + 'deg) rotateY(' + (-6 + x * 8) + 'deg)';
    }, { passive: true });
  }

  var live = document.querySelector('.story.live .tag');
  var pills = document.querySelectorAll('.hero .pill');
  if (!reduced && live && pills.length) {
    var states = [
      { text: 'آماده بررسی', cls: 'tag ok', pill: 0 },
      { text: 'آماده‌سازی', cls: 'tag wait', pill: 1 },
      { text: 'منتشر شد', cls: 'tag ok', pill: 2 }
    ];
    var i = 0;
    setInterval(function () {
      i = (i + 1) % states.length;
      live.textContent = states[i].text;
      live.className = states[i].cls;
      pills.forEach(function (p, idx) { p.classList.toggle('on', idx === states[i].pill); });
    }, 2800);
  }

  var reveals = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -32px 0px' });
    reveals.forEach(function (el) { io.observe(el); });
  } else {
    reveals.forEach(function (el) { el.classList.add('visible'); });
  }

  var statNums = document.querySelectorAll('.stat-num[data-count]');
  if (statNums.length && 'IntersectionObserver' in window) {
    var statIo = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        var el = entry.target;
        var target = parseInt(el.getAttribute('data-count'), 10);
        if (reduced) {
          el.textContent = faNum(target);
          statIo.unobserve(el);
          return;
        }
        var start = performance.now();
        function tick(now) {
          var p = Math.min((now - start) / 1200, 1);
          var val = Math.round(target * (1 - Math.pow(1 - p, 3)));
          el.textContent = faNum(val);
          if (p < 1) requestAnimationFrame(tick);
          else statIo.unobserve(el);
        }
        requestAnimationFrame(tick);
      });
    }, { threshold: 0.4 });
    statNums.forEach(function (el) { statIo.observe(el); });
  }

  var flowIn = document.getElementById('flowIn');
  var flowOut = document.getElementById('flowOut');
  if (flowIn && flowOut && !reduced) {
    var rawItems = [
      'فید پراکنده',
      'کانال تلگرام',
      'لینک ناقص',
      'متن خام خارجی',
      'پیام بدون تیتر',
      'خبر تکراری'
    ];
    var cleanItems = [
      'کارت آماده سردبیر',
      'تیتر و لید منظم',
      'منتشر در سایت مقصد',
      'کپشن شبکه اجتماعی',
      'قالب تصویری فوتویر',
      'خبر تأیید‌شده'
    ];
    var pairIdx = 0;

    function spawnFlow() {
      var raw = document.createElement('div');
      raw.className = 'flow-item raw';
      raw.textContent = rawItems[pairIdx % rawItems.length];
      raw.style.top = (20 + (pairIdx % 4) * 36) + 'px';
      raw.style.animationDelay = '0s';
      flowIn.appendChild(raw);

      setTimeout(function () {
        var clean = document.createElement('div');
        clean.className = 'flow-item clean';
        clean.textContent = cleanItems[pairIdx % cleanItems.length];
        clean.style.top = (20 + (pairIdx % 4) * 36) + 'px';
        flowOut.appendChild(clean);
        setTimeout(function () { if (clean.parentNode) clean.parentNode.removeChild(clean); }, 3500);
      }, 2200);

      setTimeout(function () { if (raw.parentNode) raw.parentNode.removeChild(raw); }, 4500);
      pairIdx++;
    }

    spawnFlow();
    setInterval(spawnFlow, 1800);
  }

  if (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      formError.hidden = true;
      formOk.hidden = true;
      var name = form.elements.namedItem('name');
      var email = form.elements.namedItem('email');
      var org = form.elements.namedItem('org');
      var phone = form.elements.namedItem('phone');
      [name, email, org, phone].forEach(function (el) { if (el) el.classList.remove('invalid'); });

      if (!name.value.trim() || name.value.trim().length < 2) {
        name.classList.add('invalid');
        formError.textContent = 'نام را کامل وارد کنید.';
        formError.hidden = false;
        name.focus();
        return;
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value.trim())) {
        email.classList.add('invalid');
        formError.textContent = 'ایمیل سازمانی معتبر نیست.';
        formError.hidden = false;
        email.focus();
        return;
      }
      if (!org.value.trim()) {
        org.classList.add('invalid');
        formError.textContent = 'نام رسانه یا سازمان لازم است.';
        formError.hidden = false;
        org.focus();
        return;
      }
      if (phone.value.trim() && !/^[0-9+\-\s]{8,20}$/.test(phone.value.trim())) {
        phone.classList.add('invalid');
        formError.textContent = 'شماره تلفن را با ارقام وارد کنید.';
        formError.hidden = false;
        phone.focus();
        return;
      }
      formOk.hidden = false;
      form.reset();
    });
  }
})();

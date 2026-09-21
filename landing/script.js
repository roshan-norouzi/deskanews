(function () {
  'use strict';

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Nav
  const nav = document.getElementById('nav');
  window.addEventListener('scroll', function () {
    if (nav) nav.classList.toggle('scrolled', window.scrollY > 20);
  }, { passive: true });

  const navToggle = document.getElementById('navToggle');
  const navMobile = document.getElementById('navMobile');
  if (navToggle && navMobile) {
    navToggle.addEventListener('click', function () { navMobile.classList.toggle('open'); });
    navMobile.querySelectorAll('a').forEach(function (link) {
      link.addEventListener('click', function () { navMobile.classList.remove('open'); });
    });
  }

  // Smooth scroll
  document.querySelectorAll('a[href^="#"]').forEach(function (anchor) {
    anchor.addEventListener('click', function (e) {
      const target = document.querySelector(this.getAttribute('href'));
      if (target) {
        e.preventDefault();
        const offset = nav ? nav.offsetHeight + 16 : 0;
        window.scrollTo({ top: target.getBoundingClientRect().top + window.scrollY - offset, behavior: 'smooth' });
      }
    });
  });

  // Scroll reveal
  const revealSelector = '.reveal, .auto-card, .wf-step, .platform-card, .module-showcase';
  const revealElements = document.querySelectorAll(revealSelector);
  revealElements.forEach(function (el) { if (!el.classList.contains('reveal')) el.classList.add('reveal'); });

  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });
    revealElements.forEach(function (el) { observer.observe(el); });
  } else {
    revealElements.forEach(function (el) { el.classList.add('visible'); });
  }

  // Persian numerals helper
  const FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
  function toPersianNum(n) {
    return String(n).replace(/\d/g, function (d) { return FA_DIGITS[d]; });
  }

  // Hero stat counter
  const heroStats = document.getElementById('heroStats');
  if (heroStats && !reducedMotion) {
    const statValues = heroStats.querySelectorAll('[data-count]');
    const statsObserver = new IntersectionObserver(function (entries) {
      if (!entries[0].isIntersecting) return;
      statValues.forEach(function (el, i) {
        const target = parseInt(el.getAttribute('data-count'), 10);
        const suffix = el.getAttribute('data-suffix') || '';
        const duration = 1200;
        const delay = i * 120;
        setTimeout(function () {
          const start = performance.now();
          function tick(now) {
            const p = Math.min((now - start) / duration, 1);
            const eased = 1 - Math.pow(1 - p, 3);
            const val = Math.round(target * eased);
            el.textContent = toPersianNum(val) + (p >= 1 ? suffix : '');
            if (p < 1) requestAnimationFrame(tick);
          }
          requestAnimationFrame(tick);
        }, delay);
      });
      statsObserver.disconnect();
    }, { threshold: 0.5 });
    statsObserver.observe(heroStats);
  } else if (heroStats) {
    heroStats.querySelectorAll('[data-count]').forEach(function (el) {
      const suffix = el.getAttribute('data-suffix') || '';
      el.textContent = toPersianNum(el.getAttribute('data-count')) + suffix;
    });
  }

  // Hero parallax
  const heroMockup = document.getElementById('heroMockup');
  const heroVisualWrap = document.querySelector('.hero-visual-wrap');
  if (!reducedMotion && heroMockup) {
    let mx = 0;
    let my = 0;
    let rafId = null;
    function applyParallax() {
      heroMockup.style.transform = 'perspective(1200px) rotateX(' + (-my * 0.4) + 'deg) rotateY(' + (mx * 0.5) + 'deg) translateZ(0)';
      rafId = null;
    }
    document.addEventListener('mousemove', function (e) {
      const rect = heroMockup.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      mx = (e.clientX - cx) / (rect.width / 2);
      my = (e.clientY - cy) / (rect.height / 2);
      if (!rafId) rafId = requestAnimationFrame(applyParallax);
    }, { passive: true });
  }
  if (!reducedMotion && heroVisualWrap) {
    window.addEventListener('scroll', function () {
      const y = window.scrollY;
      heroVisualWrap.style.transform = 'translateY(' + (y * 0.04) + 'px)';
    }, { passive: true });
  }

  // Hero mockup live demo — simulates real newsroom workflow
  const heroMockupUrl = document.getElementById('heroMockupUrl');
  const heroMockupMain = document.getElementById('heroMockupMain');
  const heroPillReady = document.getElementById('heroPillReady');
  const heroPillProcess = document.getElementById('heroPillProcess');
  const heroPillPublished = document.getElementById('heroPillPublished');
  const heroBadge1 = document.getElementById('heroBadge1');
  const heroArticle1 = document.getElementById('heroArticle1');
  const heroArticle2 = document.getElementById('heroArticle2');
  const heroFloats = document.querySelectorAll('.hero-float');

  const HERO_SCENES = [
    { pill: 'ready', badge: 'آماده بررسی', badgeClass: 'green', processing: false, floatIdx: 3, showPublish: true },
    { pill: 'process', badge: 'در حال آماده‌سازی', badgeClass: 'blue', processing: true, floatIdx: 1, showPublish: false },
    { pill: 'ready', badge: 'آماده انتشار', badgeClass: 'green', processing: false, floatIdx: 0, showPublish: true },
    { pill: 'published', badge: 'منتشر شد', badgeClass: 'green', processing: false, floatIdx: 0, showPublish: false, hideArticle: true },
  ];

  if (heroMockupMain && !reducedMotion) {
    let sceneIdx = 0;
    const publishBtn = heroArticle1 ? heroArticle1.querySelector('.pm-btn-publish') : null;

    function setPill(active) {
      [heroPillReady, heroPillProcess, heroPillPublished].forEach(function (p) {
        if (p) p.classList.remove('active');
      });
      if (active === 'ready' && heroPillReady) heroPillReady.classList.add('active');
      if (active === 'process' && heroPillProcess) heroPillProcess.classList.add('active');
      if (active === 'published' && heroPillPublished) heroPillPublished.classList.add('active');
    }

    function applyHeroScene(scene) {
      setPill(scene.pill);
      if (heroBadge1) {
        heroBadge1.textContent = scene.badge;
        heroBadge1.className = 'pm-badge ' + scene.badgeClass;
      }
      if (heroArticle1) {
        heroArticle1.classList.toggle('is-processing', scene.processing);
        heroArticle1.style.display = scene.hideArticle ? 'none' : 'flex';
      }
      if (publishBtn) publishBtn.style.display = scene.showPublish ? '' : 'none';
      if (heroArticle2) heroArticle2.style.opacity = scene.pill === 'published' ? '0.5' : '1';
      heroFloats.forEach(function (f, i) {
        f.style.opacity = i === scene.floatIdx ? '1' : '0.5';
        f.style.transform = i === scene.floatIdx ? 'translateY(-4px) scale(1.04)' : '';
      });
    }

    applyHeroScene(HERO_SCENES[0]);
    setInterval(function () {
      sceneIdx = (sceneIdx + 1) % HERO_SCENES.length;
      applyHeroScene(HERO_SCENES[sceneIdx]);
    }, 3200);
  }

  // Sources catalog — world flags highlight cycle
  const sourcesFlagCycle = document.getElementById('sourcesFlagCycle');
  const sourcesFlagLabel = document.getElementById('sourcesFlagLabel');
  if (sourcesFlagCycle && !reducedMotion) {
    const flagItems = sourcesFlagCycle.querySelectorAll('.sources-flag-item');
    let flagIdx = 0;
    const FLAG_INTERVAL = 2200;

    function showSourceFlag(index) {
      flagItems.forEach(function (item, i) {
        item.classList.toggle('is-active', i === index);
      });
      const active = flagItems[index];
      if (active && sourcesFlagLabel) {
        sourcesFlagLabel.textContent = active.getAttribute('data-country') || '';
      }
    }

    showSourceFlag(0);
    setInterval(function () {
      flagIdx = (flagIdx + 1) % flagItems.length;
      showSourceFlag(flagIdx);
    }, FLAG_INTERVAL);
  }

  // Module showcase tabs
  const moduleShowcase = document.getElementById('moduleShowcase');
  if (moduleShowcase) {
    const tabs = moduleShowcase.querySelectorAll('.module-tab');
    const panels = moduleShowcase.querySelectorAll('.module-panel');
    const dots = moduleShowcase.querySelectorAll('.module-dot');
    let modIdx = 0;
    let modTimer = null;
    const MOD_INTERVAL = 6000;

    function restartModuleMock(panel) {
      const mock = panel.querySelector('.module-mock');
      if (!mock) return;
      mock.classList.remove('is-entering');
      void mock.offsetWidth;
      mock.classList.add('is-entering');
      mock.addEventListener('animationend', function () {
        mock.classList.remove('is-entering');
      }, { once: true });
    }

    function goModule(index) {
      if (!panels[index]) return;
      modIdx = index;
      tabs.forEach(function (t, i) { t.classList.toggle('active', i === index); });
      panels.forEach(function (p, i) { p.classList.toggle('active', i === index); });
      dots.forEach(function (d, i) { d.classList.toggle('active', i === index); });
      if (!reducedMotion) restartModuleMock(panels[index]);
    }

    function nextModule() { goModule((modIdx + 1) % panels.length); }

    tabs.forEach(function (tab, i) {
      tab.addEventListener('click', function () {
        goModule(i);
        resetModTimer();
      });
    });

    dots.forEach(function (dot, i) {
      dot.addEventListener('click', function () {
        goModule(i);
        resetModTimer();
      });
    });

    function resetModTimer() {
      if (modTimer) clearInterval(modTimer);
      if (!reducedMotion) modTimer = setInterval(nextModule, MOD_INTERVAL);
    }

    resetModTimer();
  }

  // Ops mock — realistic job queue progression
  const opsMock = document.getElementById('opsMock');
  if (opsMock && !reducedMotion) {
    const jobs = Array.from(opsMock.querySelectorAll('.ops-job'));
    const statEls = opsMock.querySelectorAll('.ops-stat strong');
    const JOB_CYCLE = [
      { run: 0, queue: 1, done: [2], stats: ['۲', '۱', '۴۷'] },
      { run: 1, queue: -1, done: [0, 2], stats: ['۱', '۱', '۴۸'] },
      { run: 2, queue: 3, done: [0, 1], stats: ['۱', '۱', '۴۹'] },
      { run: 3, queue: -1, done: [0, 1, 2], stats: ['۰', '۱', '۴۹'] },
    ];
    let cycleIdx = 0;

    function applyOpsState(state) {
      jobs.forEach(function (j, i) {
        j.classList.remove('ops-job--run', 'ops-job--done', 'ops-job--fail');
        if (i === state.run) j.classList.add('ops-job--run');
        else if (state.done.indexOf(i) !== -1) j.classList.add('ops-job--done');
        else if (i === 3) j.classList.add('ops-job--fail');
        const status = j.querySelector('.ops-status');
        if (!status) return;
        if (i === state.run) status.textContent = 'در حال اجرا';
        else if (state.done.indexOf(i) !== -1) status.textContent = 'تکمیل';
        else if (i === 3) status.textContent = 'متوقف — retry';
        else status.textContent = 'در صف';
      });
      if (statEls.length === 3 && state.stats) {
        statEls[0].textContent = state.stats[0];
        statEls[1].textContent = state.stats[1];
        statEls[2].textContent = state.stats[2];
      }
    }

    applyOpsState(JOB_CYCLE[0]);
    setInterval(function () {
      cycleIdx = (cycleIdx + 1) % JOB_CYCLE.length;
      applyOpsState(JOB_CYCLE[cycleIdx]);
    }, 2400);
  }

  // Conversion carousel
  const conversionDemo = document.getElementById('conversionDemo');
  if (conversionDemo) {
    const convTabs = conversionDemo.querySelectorAll('.conversion-tab');
    const convSlides = conversionDemo.querySelectorAll('.conversion-slide');
    const convDots = conversionDemo.querySelectorAll('.conversion-dot');
    let convIdx = 0;
    let convTimer = null;
    const CONV_INTERVAL = 5000;

    function restartSlideAnim(slide) {
      slide.querySelectorAll('.conv-animate-in').forEach(function (el) {
        el.style.animation = 'none';
        void el.offsetHeight;
        el.style.animation = '';
      });
    }

    function goConv(index) {
      if (!convSlides[index] || index === convIdx) return;
      convSlides[convIdx].classList.remove('active');
      convSlides[index].classList.add('active');
      restartSlideAnim(convSlides[index]);
      convIdx = index;
      convTabs.forEach(function (t, i) { t.classList.toggle('active', i === index); });
      convDots.forEach(function (d, i) { d.classList.toggle('active', i === index); });
    }

    function resetConvTimer() {
      if (convTimer) clearInterval(convTimer);
      if (!reducedMotion) convTimer = setInterval(function () { goConv((convIdx + 1) % convSlides.length); }, CONV_INTERVAL);
    }

    convTabs.forEach(function (tab, i) {
      tab.addEventListener('click', function () { goConv(i); resetConvTimer(); });
    });
    convDots.forEach(function (dot, i) {
      dot.addEventListener('click', function () { goConv(i); resetConvTimer(); });
    });
    resetConvTimer();
  }

  // Workflow timeline highlight
  const wfSteps = document.querySelectorAll('.wf-step');
  if (wfSteps.length && !reducedMotion) {
    let wfIdx = 0;
    const wfObserver = new IntersectionObserver(function (entries) {
      if (!entries[0].isIntersecting) return;
      setInterval(function () {
        wfSteps.forEach(function (s) { s.classList.remove('highlight'); });
        wfSteps[wfIdx].classList.add('highlight');
        wfIdx = (wfIdx + 1) % wfSteps.length;
      }, 2000);
      wfObserver.disconnect();
    }, { threshold: 0.3 });
    wfObserver.observe(document.getElementById('workflowTimeline') || wfSteps[0]);
  }

  // Integrations marquee duplicate
  const marqueeTrack = document.getElementById('marqueeTrack');
  if (marqueeTrack) {
    Array.from(marqueeTrack.children).forEach(function (item) {
      marqueeTrack.appendChild(item.cloneNode(true));
    });
  }

  // Stagger auto-cards on reveal
  const autoCards = document.querySelectorAll('.auto-card');
  autoCards.forEach(function (card, i) {
    card.style.transitionDelay = (i * 80) + 'ms';
  });
})();

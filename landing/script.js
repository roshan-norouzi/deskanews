(function () {
  'use strict';

  // Sticky nav shadow
  const nav = document.getElementById('nav');
  window.addEventListener('scroll', function () {
    if (nav) nav.classList.toggle('scrolled', window.scrollY > 20);
  }, { passive: true });

  // Mobile menu
  const navToggle = document.getElementById('navToggle');
  const navMobile = document.getElementById('navMobile');

  if (navToggle && navMobile) {
    navToggle.addEventListener('click', function () {
      navMobile.classList.toggle('open');
    });
    navMobile.querySelectorAll('a').forEach(function (link) {
      link.addEventListener('click', function () {
        navMobile.classList.remove('open');
      });
    });
  }

  // Scroll reveal
  const revealElements = document.querySelectorAll(
    '.feature-card, .workflow-step, .integration-card, .why-item, .multilingual-content, .conversion-demo, .ai-feature'
  );

  revealElements.forEach(function (el) {
    el.classList.add('reveal');
  });

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
      { threshold: 0.12, rootMargin: '0px 0px -40px 0px' }
    );
    revealElements.forEach(function (el) {
      observer.observe(el);
    });
  } else {
    revealElements.forEach(function (el) {
      el.classList.add('visible');
    });
  }

  // Smooth scroll
  document.querySelectorAll('a[href^="#"]').forEach(function (anchor) {
    anchor.addEventListener('click', function (e) {
      const target = document.querySelector(this.getAttribute('href'));
      if (target) {
        e.preventDefault();
        const offset = nav ? nav.offsetHeight + 16 : 0;
        const top = target.getBoundingClientRect().top + window.scrollY - offset;
        window.scrollTo({ top: top, behavior: 'smooth' });
      }
    });
  });

  // Hero parallax
  const heroMockup = document.getElementById('heroMockup');
  const heroVisualWrap = document.querySelector('.hero-visual-wrap');

  if (heroMockup && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    window.addEventListener('mousemove', function (e) {
      const rect = heroVisualWrap?.getBoundingClientRect();
      if (!rect) return;
      const x = (e.clientX - rect.left) / rect.width - 0.5;
      const y = (e.clientY - rect.top) / rect.height - 0.5;
      heroMockup.style.transform = 'perspective(1200px) rotateY(' + (x * 4) + 'deg) rotateX(' + (-y * 3) + 'deg)';
    }, { passive: true });

    window.addEventListener('mouseleave', function () {
      heroMockup.style.transform = '';
    });
  }

  // Scroll parallax for hero
  if (heroVisualWrap && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    window.addEventListener('scroll', function () {
      const scrollY = window.scrollY;
      if (scrollY < 800) {
        heroVisualWrap.style.transform = 'translateY(' + (scrollY * 0.08) + 'px)';
      }
    }, { passive: true });
  }

  // Animated counters on hero stats
  const statValues = document.querySelectorAll('.stat-value');
  const persianDigits = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];

  function toPersian(num) {
    return String(num).replace(/\d/g, function (d) {
      return persianDigits[parseInt(d, 10)];
    });
  }

  function animateCounter(el) {
    const text = el.textContent.trim();
    const match = text.match(/^(\d+)/);
    if (!match) return;
    const target = parseInt(match[1], 10);
    const suffix = text.slice(match[0].length);
    const duration = 1200;
    const start = performance.now();

    function tick(now) {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      el.textContent = toPersian(Math.round(target * eased)) + suffix;
      if (progress < 1) requestAnimationFrame(tick);
    }

    requestAnimationFrame(tick);
  }

  if ('IntersectionObserver' in window && statValues.length) {
    const counterObserver = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            animateCounter(entry.target);
            counterObserver.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.5 }
    );
    statValues.forEach(function (el) {
      counterObserver.observe(el);
    });
  }

  // Integrations marquee — one duplicate set for seamless -50% loop
  const marqueeTrack = document.getElementById('marqueeTrack');
  if (marqueeTrack) {
    const originals = Array.from(marqueeTrack.children);
    originals.forEach(function (item) {
      marqueeTrack.appendChild(item.cloneNode(true));
    });
  }

  // Conversion demo carousel
  const conversionDemo = document.getElementById('conversionDemo');
  if (conversionDemo) {
    const convTabs = conversionDemo.querySelectorAll('.conversion-tab');
    const convSlides = conversionDemo.querySelectorAll('.conversion-slide');
    const convDots = conversionDemo.querySelectorAll('.conversion-dot');
    const langChips = document.querySelectorAll('.lang-chip-interactive[data-slide]');
    const convTimerFill = document.getElementById('convTimerFill');
    let convIndex = 0;
    let convTimer = null;
    const CONV_INTERVAL = 5500;

    function restartTimerBar() {
      if (!convTimerFill) return;
      convTimerFill.classList.remove('running');
      void convTimerFill.offsetWidth;
      convTimerFill.classList.add('running');
    }

    function restartSlideAnimations(slide) {
      slide.querySelectorAll('.conv-animate-in').forEach(function (el) {
        el.style.animation = 'none';
        void el.offsetHeight;
        el.style.animation = '';
      });
    }

    function goToSlide(index) {
      if (index === convIndex || !convSlides[index]) return;
      const prev = convSlides[convIndex];
      const next = convSlides[index];

      prev.classList.add('exiting');
      prev.classList.remove('active');

      setTimeout(function () {
        prev.classList.remove('exiting');
      }, 450);

      next.classList.add('active');
      restartSlideAnimations(next);
      convIndex = index;

      convTabs.forEach(function (tab, i) {
        const active = i === index;
        tab.classList.toggle('active', active);
        tab.setAttribute('aria-selected', active ? 'true' : 'false');
      });

      convDots.forEach(function (dot, i) {
        dot.classList.toggle('active', i === index);
      });

      langChips.forEach(function (chip) {
        chip.classList.toggle('active', parseInt(chip.dataset.slide, 10) === index);
      });

      restartTimerBar();
    }

    function nextConvSlide() {
      goToSlide((convIndex + 1) % convSlides.length);
    }

    function resetConvTimer() {
      if (convTimer) clearInterval(convTimer);
      convTimer = setInterval(nextConvSlide, CONV_INTERVAL);
      restartTimerBar();
    }

    convTabs.forEach(function (tab) {
      tab.addEventListener('click', function () {
        goToSlide(parseInt(tab.dataset.slide, 10));
        resetConvTimer();
      });
    });

    convDots.forEach(function (dot, i) {
      dot.addEventListener('click', function () {
        goToSlide(i);
        resetConvTimer();
      });
    });

    langChips.forEach(function (chip) {
      chip.addEventListener('click', function () {
        goToSlide(parseInt(chip.dataset.slide, 10));
        resetConvTimer();
      });
    });

    resetConvTimer();
  }

  // Workflow steps stagger on scroll
  const workflowSteps = document.querySelectorAll('.workflow-step');
  if ('IntersectionObserver' in window) {
    const stepObserver = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry, i) {
          if (entry.isIntersecting) {
            setTimeout(function () {
              entry.target.style.opacity = '1';
              entry.target.style.transform = 'translateY(0)';
            }, i * 120);
            stepObserver.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.3 }
    );
    workflowSteps.forEach(function (step) {
      step.style.opacity = '0';
      step.style.transform = 'translateY(24px)';
      step.style.transition = 'opacity 0.5s ease, transform 0.5s ease';
      stepObserver.observe(step);
    });
  }
})();

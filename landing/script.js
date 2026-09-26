/* No framework, build step, CDN or external request is required. */
(() => {
  'use strict';

  const SOURCE_LOGO_VERSION = '20260926-2';

  // Login destination for CTA buttons (`data-app-link` in index.html).
  const APP_LOGIN_URL = 'https://app.deska.ir/login';
  document.querySelectorAll('[data-app-link]').forEach(link => { link.href = APP_LOGIN_URL; });
  document.querySelectorAll('svg.icon').forEach(icon => {
    icon.setAttribute('aria-hidden', 'true');
    icon.setAttribute('focusable', 'false');
  });

  const icon = name => `<svg class="icon" aria-hidden="true"><use href="#i-${name}"/></svg>`;
  const header = document.querySelector('.site-header');
  const menuToggle = document.querySelector('#menu-toggle');
  const navigation = document.querySelector('#main-nav');
  function closeMenu(returnFocus = false) {
    navigation.classList.remove('is-open');
    menuToggle.setAttribute('aria-expanded', 'false');
    menuToggle.setAttribute('aria-label', 'باز کردن فهرست');
    if (returnFocus) menuToggle.focus();
  }
  menuToggle.addEventListener('click', () => {
    const open = menuToggle.getAttribute('aria-expanded') !== 'true';
    menuToggle.setAttribute('aria-expanded', String(open));
    menuToggle.setAttribute('aria-label', open ? 'بستن فهرست' : 'باز کردن فهرست');
    navigation.classList.toggle('is-open', open);
  });
  navigation.querySelectorAll('a').forEach(link => link.addEventListener('click', () => closeMenu()));
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && menuToggle.getAttribute('aria-expanded') === 'true') closeMenu(true);
  });
  document.addEventListener('click', event => {
    if (!header.contains(event.target)) closeMenu();
  });
  matchMedia('(min-width: 651px)').addEventListener('change', () => closeMenu());
  function scrollToPageTop() {
    closeMenu();
    const instant = matchMedia('(prefers-reduced-motion: reduce)').matches || document.body.classList.contains('motion-paused');
    scrollTo({ top: 0, left: 0, behavior: instant ? 'auto' : 'smooth' });
    if (location.hash) history.replaceState(null, '', `${location.pathname}${location.search}`);
  }
  document.querySelectorAll('a[href="#top"]').forEach(link => {
    link.addEventListener('click', event => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      scrollToPageTop();
    });
  });
  let scrollQueued = false;
  addEventListener('scroll', () => {
    if (scrollQueued) return;
    scrollQueued = true;
    requestAnimationFrame(() => {
      header.classList.toggle('scrolled', scrollY > 12);
      scrollQueued = false;
    });
  }, { passive: true });
  header.classList.toggle('scrolled', scrollY > 12);

  // Interactive tour: all examples are editorial illustrations, never live data.
  const workflowPanel = document.querySelector('#workflow-panel');
  const initialSources = workflowPanel.innerHTML;
  const panelHeading = (overline, title, badge) => `<div class="workspace-top"><div><span class="workspace-overline">${overline}</span><h3>${title}</h3></div><span class="workspace-chip"><span class="status-dot"></span>${badge}</span></div>`;
  const workflow = {
    sources: initialSources,
    prepare: `${panelHeading('منبع به هر زبان · خروجی فارسی در میز خبر', 'خبر را فارسی آماده کنید و برای انتشار بفرستید', 'آماده‌سازی خبر')}
      <div class="editor-tools"><span>ترجمهٔ تیتر و خلاصه</span><span>ترجمهٔ متن کامل</span><span>بازنویسی فارسی</span></div>
      <div class="translation-ribbon"><span class="translation-ribbon-label">منبع به هر زبان</span><div class="language-chips"><span>انگلیسی</span><span>عربی</span><span>فرانسوی</span><span>ژاپنی</span><span>آلمانی</span><span>چینی</span><span>ترکی</span><span>و هر زبان دیگر</span></div><strong>${icon('arrow')} خروجی فارسی</strong></div>
      <div class="prepare-grid"><div class="source-language-stack"><div class="source-language-item"><span class="language-tag">EN</span><div><small>گاردین · بریتانیا</small><p>Toys are us: the adults swapping scrolling for Lego, remote control cars and sewing</p></div></div><div class="source-language-item"><span class="language-tag">DE</span><div><small>اشپیگل · آلمان</small><p>Wiesbaden: Bakterium entdeckt – Menschen sollen Leitungswasser abkochen</p></div></div><div class="source-language-item"><span class="language-tag">AR</span><div><small>النهار · لبنان</small><p>النفط يضغط على الدولار وسط توقعات برفع أسعار الفائدة</p></div></div><div class="source-language-item"><span class="language-tag">FR</span><div><small>فرانس ۲۴ · فرانسه</small><p>Supprimer les inégalités inacceptables, remède à la montée des populismes</p></div></div></div><div class="editor-pane processed"><div class="pane-label">${icon('spark')} خروجی فارسی دسکا</div><h4>بزرگسالان برای فاصله‌گرفتن از پیمایش مداوم، به سرگرمی‌های دستی روی می‌آورند</h4><p>تیتر و خلاصهٔ فارسی آماده است؛ در میز خبر بررسی می‌کنید و برای انتشار در سایت یا شبکهٔ اجتماعی می‌فرستید.</p><div class="prepared-output-list"><span>${icon('check')} تیتر ترجمه‌شده</span><span>${icon('check')} خلاصهٔ فارسی</span><span>${icon('check')} متن کامل برای بررسی</span></div></div></div>
      <div class="workspace-note">${icon('shield')} نمونه از خبرهای واقعی فید عمومی است؛ زبان منبع هرچه باشد خروجی فارسی در میز خبر آماده می‌شود و برای خبر فارسی می‌توانید بازنویسی هم بزنید.</div>`,
    studio: `${panelHeading('از میز خبر یا منبع اختصاصی', 'کپشن و تصویر را برای شبکهٔ اجتماعی آماده کنید', 'استودیوی اجتماعی')}
      <div class="studio-preview"><div class="demo-cover"><small>دسکا / نمونهٔ کاور</small><strong>هوش مصنوعی<br>در تحریریه</strong><small>فناوری · رسانه · نوآوری</small></div><div class="studio-caption"><div class="pane-label">${icon('image')} کاور و کپشن نمونه</div><h4>فصل تازهٔ روزنامه‌نگاری دیجیتال</h4><p>با قالب کپشن و تصویر میز خبر، خروجی را با ظاهر رسانهٔ خود آماده می‌کنید.</p><div class="caption-tags">#رسانه &nbsp; #هوش_مصنوعی</div><div class="editor-tools"><span>قالب تصویری میز خبر</span><span>قالب کپشن</span><span>آماده‌سازی خودکار</span></div></div></div>
      <div class="workspace-note">${icon('layers')} قالب را یک‌بار تنظیم می‌کنید؛ بعد می‌توانید آماده‌سازی و انتشار را خودکار کنید.</div>`,
    publish: `${panelHeading('انتشار از میز خبر', 'مقصد موردنظرتان را انتخاب کنید', 'انتشار')}
      <div class="publish-list"><div class="publish-destination"><b class="platform-letter wordpress">W</b> سایت وردپرسی <small>${icon('check')} مقصد نمونه</small></div><div class="publish-destination">${icon('send')} کانال تلگرام <small>${icon('check')} مقصد نمونه</small></div><div class="publish-destination">${icon('instagram')} اینستاگرام <small>${icon('check')} مقصد نمونه</small></div><div class="publish-destination"><b class="platform-letter">in</b> صفحهٔ لینکدین <small>${icon('check')} مقصد نمونه</small></div></div>
      <div class="publish-banner">${icon('shield')} پس از اتصال مقصد، می‌توانید خودتان منتشر کنید یا انتشار را خودکار کنید.</div>
      <div class="workspace-note">${icon('globe')} وردپرس، ایران‌سامانه، نستوه و شبکه‌های اجتماعی پس از تنظیم دسترسی در میز خبر در دسترس‌اند.</div>`
  };

  function renderSourceRows(data) {
    const iconClasses = ['', ' orange', ' blue', '', ' blue'];
    return data.rows.map((row, index) => {
      const path = `assets/source-logos/${encodeURIComponent(row[4])}?v=${SOURCE_LOGO_VERSION}`;
      return `<article class="news-row"><span class="news-source-icon${iconClasses[index] || ''}"><img src="${path}" alt="" loading="lazy" decoding="async" onerror="this.remove();this.nextElementSibling.hidden=false"><span hidden>${row[5]}</span></span><div><small><b class="news-source-name">${row[0]}</b> · ${row[1]} · ${row[2]}</small><h4>${row[3]}</h4><p>تیتر و خلاصهٔ فارسی در میز خبر آمادهٔ بررسی است</p></div><span class="row-badge">${row[1]}</span></article>`;
    }).join('');
  }
  function renderWorkflowSources(data) {
    return `${panelHeading(data.overline, data.title, data.badge)}<div class="mock-search">${icon('search')} جست‌وجو در خبرها، منابع و موضوعات <span>⌘ K</span></div><div class="news-table"><div class="table-header"><span>${data.table}</span><span>${data.sourceLabel}</span></div>${renderSourceRows(data)}</div><div class="workspace-note">${icon('sliders')} ${data.note}</div>`;
  }
  function renderWorkflowPrepare(data) {
    const sourceItems = data.sources.map(source => `<div class="source-language-item"><span class="language-tag">${source[0]}</span><div><small>${source[1]}</small><p>${source[2]}</p></div></div>`).join('');
    const tools = data.tools.map(item => `<span>${item}</span>`).join('');
    const languages = data.languages.map(item => `<span>${item}</span>`).join('');
    const checklist = data.checklist.map(item => `<span>${icon('check')} ${item}</span>`).join('');
    return `${panelHeading(data.overline, data.title, data.badge)}<div class="editor-tools">${tools}</div><div class="translation-ribbon"><span class="translation-ribbon-label">${data.ribbon}</span><div class="language-chips">${languages}</div><strong>${icon('arrow')} ${data.output}</strong></div><div class="prepare-grid"><div class="source-language-stack">${sourceItems}</div><div class="editor-pane processed"><div class="pane-label">${icon('spark')} خروجی فارسی دسکا</div><h4>${data.outputTitle}</h4><p>${data.outputText}</p><div class="prepared-output-list">${checklist}</div></div></div><div class="workspace-note">${icon('shield')} ${data.note}</div>`;
  }
  function renderWorkflowStudio(data) {
    const tools = data.tools.map(item => `<span>${item}</span>`).join('');
    const panelTitle = data.panelTitle || data.title;
    const captionTitle = data.captionTitle || data.title;
    return `${panelHeading(data.overline, panelTitle, data.badge)}<div class="studio-preview"><div class="demo-cover"><small>${data.coverLabel}</small><strong>${data.coverTitle}</strong><small>${data.coverMeta}</small></div><div class="studio-caption"><div class="pane-label">${icon('image')} ${data.paneLabel}</div><h4>${captionTitle}</h4><p>${data.text}</p><div class="caption-tags">${data.tags}</div><div class="editor-tools">${tools}</div></div></div><div class="workspace-note">${icon('layers')} ${data.note}</div>`;
  }
  function renderWorkflowPublish(data) {
    const destinations = data.destinations.map((item, index) => {
      const lead = index === 0 ? '<b class="platform-letter wordpress">W</b>' : index === 1 ? icon('send') : index === 2 ? icon('instagram') : '<b class="platform-letter">in</b>';
      return `<div class="publish-destination">${lead} ${item} <small>${icon('check')} مقصد نمونه</small></div>`;
    }).join('');
    return `${panelHeading(data.overline, data.title, data.badge)}<div class="publish-list">${destinations}</div><div class="publish-banner">${icon('shield')} پس از اتصال مقصد، می‌توانید خودتان منتشر کنید یا انتشار را خودکار کنید.</div><div class="workspace-note">${icon('globe')} ${data.note}</div>`;
  }
  const audiencePanel = document.querySelector('#audience-panel');
  const initialMedia = audiencePanel.innerHTML;
  const storyArt = (kind, masthead, headline, stamp) => `<div class="editorial-art ${kind}-art" aria-hidden="true"><div class="paper paper-back"></div><div class="paper paper-front"><div class="paper-masthead">${masthead}<span>نمونهٔ محتوای خبری</span></div><div class="paper-rule"></div><b>${headline}</b><div class="paper-columns"><i></i><i></i><i></i></div></div><div class="editorial-stamp">${icon('check')} ${stamp}</div></div>`;
  const audiences = {
    media: initialMedia,
    reporter: `<span class="panel-index">۰۲ / خبرنگاران و آژانس‌ها</span>${storyArt('reporter', 'یادداشت خبرنگار', 'منابع حوزهٔ شما<br>در یک میز خبر', 'یک‌جا')}<h3>منابع حوزهٔ خودتان را یک‌جا دنبال کنید<p>از فهرست آماده انتخاب می‌کنید یا منبع اختصاصی اضافه می‌کنید؛ تیتر و خلاصهٔ فارسی را در میز خبر می‌بینید و خبر منتخب را برای انتشار آماده می‌کنید.</p><ul class="check-list"><li>پایش منابع حوزهٔ تخصصی شما</li><li>ترجمه و خلاصهٔ فارسی</li><li>آماده‌سازی برای سایت و شبکهٔ اجتماعی</li></ul>`,
    pr: `<span class="panel-index">۰۳ / روابط عمومی و ارتباطات</span>${storyArt('pr', 'اخبار میز خبر', 'کاور و کپشن<br>با قالب برند شما', 'هماهنگ با برند')}<h3>خبرهای مرتبط با برند را جدا کنید و منتشر کنید<p>منابع مرتبط با صنعت یا برندتان را فعال می‌کنید، با کلمات کلیدی خبرهای موردنظرتان را جدا می‌کنید و با قالب کپشن و تصویر برای سایت و شبکهٔ اجتماعی آماده می‌کنید.</p><ul class="check-list"><li>فیلتر بر اساس نام برند و موضوع</li><li>کاور و کپشن قابل‌ویرایش</li><li>دسترسی اعضا در تنظیمات میز خبر</li></ul>`
  };

  function setupTabs(selector, panel, content, key, onChange) {
    const tabs = [...document.querySelectorAll(`${selector} [role="tab"]`)];
    function activate(tab, focus = false) {
      tabs.forEach(item => {
        const selected = item === tab;
        item.setAttribute('aria-selected', String(selected));
        item.tabIndex = selected ? 0 : -1;
      });
      panel.innerHTML = content[tab.dataset[key]];
      panel.setAttribute('aria-labelledby', tab.id);
      panel.classList.remove('panel-enter');
      // Restart the short transition only for an intentional user action.
      void panel.offsetWidth;
      panel.classList.add('panel-enter');
      if (focus) tab.focus();
      if (onChange) onChange(tab.dataset[key]);
    }
    tabs.forEach((tab, index) => {
      tab.addEventListener('click', () => activate(tab));
      tab.addEventListener('keydown', event => {
        const vertical = tab.parentElement.getAttribute('aria-orientation') === 'vertical';
        let next;
        if (event.key === 'Home') next = 0;
        else if (event.key === 'End') next = tabs.length - 1;
        else if (event.key === (vertical ? 'ArrowDown' : 'ArrowLeft')) next = (index + 1) % tabs.length;
        else if (event.key === (vertical ? 'ArrowUp' : 'ArrowRight')) next = (index + tabs.length - 1) % tabs.length;
        if (next !== undefined) { event.preventDefault(); activate(tabs[next], true); }
      });
    });
  }
  const highlightSidebar = selected => document.querySelectorAll('[data-sidebar]').forEach(item => item.classList.toggle('active', item.dataset.sidebar === selected));
  setupTabs('.workflow-tabs', workflowPanel, workflow, 'step', highlightSidebar);
  setupTabs('.audience-tabs', audiencePanel, audiences, 'audience');
  highlightSidebar('sources');

  // The catalog is a local snapshot of the supplied default feeds. Only a rotating sample is rendered.
  let sourceMotionPaused = false;
  let sourceRotationTimer = 0;
  const sourceGrid = document.querySelector('#source-grid');
  const escapeHtml = value => String(value).replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
  const sourceInitial = value => Array.from(String(value || '').replace(/[()،؛:]/g, '').trim())[0] || 'د';
  function logoCandidates(source) {
    const domain = String(source.domain || '').replace(/^www\./i, '');
    const candidates = [
      `assets/source-logos/${encodeURIComponent(source.slug)}.png?v=${SOURCE_LOGO_VERSION}`,
    ];
    if (domain) {
      candidates.push(
        `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64`,
        `https://icons.duckduckgo.com/ip3/${encodeURIComponent(domain)}.ico`,
      );
    }
    const logoUrl = String(source.logoUrl || '').trim();
    if (logoUrl.startsWith('http') && !logoUrl.includes('duckduckgo.com/ip3/')) {
      candidates.push(logoUrl);
    }
    return candidates;
  }
  function mountSourceLogo(shell, source) {
    const image = shell.querySelector('img');
    const fallback = shell.querySelector('.source-logo-fallback');
    if (!image || !fallback) return;
    const candidates = logoCandidates(source);
    let index = 0;
    const showFallback = () => {
      image.remove();
      fallback.hidden = false;
    };
    const tryNext = () => {
      if (index >= candidates.length) {
        showFallback();
        return;
      }
      image.src = candidates[index];
      index += 1;
    };
    image.addEventListener('load', () => {
      if (image.naturalWidth > 0) fallback.hidden = true;
      else tryNext();
    });
    image.addEventListener('error', tryNext);
    fallback.hidden = false;
    tryNext();
  }
  function renderSourceSample(catalog) {
    if (!sourceGrid || !catalog.length || sourceMotionPaused) return;
    const sample = [...catalog].sort(() => Math.random() - .5).slice(0, 30);
    sourceGrid.innerHTML = sample.map(source => {
      const name = escapeHtml(source.name);
      const fallback = escapeHtml(sourceInitial(source.name));
      return `<article class="source-logo-card" title="${name}"><span class="source-logo-shell"><img src="" alt="" loading="lazy" decoding="async"><span class="source-logo-fallback">${fallback}</span></span><span>${name}</span></article>`;
    }).join('');
    sourceGrid.querySelectorAll('.source-logo-card').forEach((card, cardIndex) => {
      mountSourceLogo(card.querySelector('.source-logo-shell'), sample[cardIndex]);
    });
  }
  if (sourceGrid) {
    const inlineCatalog = Array.isArray(window.DESKA_SOURCE_CATALOG) ? window.DESKA_SOURCE_CATALOG : null;
    const catalogRequest = inlineCatalog ? Promise.resolve(inlineCatalog) : fetch('assets/source-catalog.json', { cache: 'force-cache' }).then(response => {
      if (!response.ok) throw new Error('Source catalog unavailable');
      return response.json();
    });
    catalogRequest.then(catalog => {
      if (!Array.isArray(catalog) || !catalog.length) return;
      renderSourceSample(catalog);
      sourceRotationTimer = window.setInterval(() => renderSourceSample(catalog), 7000);
    }).catch(() => { /* Static fallback cards remain visible on file:// or offline previews. */ });
  }

  // Motion preferences are respected both at page load and when changed live.
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const motionToggle = document.querySelector('#motion-toggle');
  let manualPause = false;
  try { manualPause = localStorage.getItem('deska-landing-motion') === 'paused'; } catch { /* file:// and private browsing can restrict storage */ }
  let paused = reducedMotion.matches || manualPause;
  let updateGlobe = () => {};
  function syncMotion() {
    paused = reducedMotion.matches || manualPause;
    sourceMotionPaused = paused;
    document.body.classList.toggle('motion-paused', paused);
    motionToggle.setAttribute('aria-pressed', String(paused));
    motionToggle.disabled = reducedMotion.matches;
    motionToggle.querySelector('.motion-label').textContent = reducedMotion.matches ? 'حرکت‌ها خاموش · مطابق تنظیم دستگاه' : paused ? 'فعال‌کردن حرکت‌ها' : 'توقف حرکت‌ها';
    motionToggle.querySelector('.motion-symbol').textContent = paused ? '▷' : 'Ⅱ';
    updateGlobe();
  }
  motionToggle.addEventListener('click', () => {
    manualPause = !manualPause;
    try { localStorage.setItem('deska-landing-motion', manualPause ? 'paused' : 'playing'); } catch { /* preference still applies for this visit */ }
    syncMotion();
  });
  reducedMotion.addEventListener('change', syncMotion);
  syncMotion();

  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(entries => entries.forEach(entry => {
      if (entry.isIntersecting) { entry.target.classList.add('visible'); observer.unobserve(entry.target); }
    }), { threshold: 0.08 });
    document.querySelectorAll('.reveal').forEach(element => observer.observe(element));
    document.documentElement.classList.add('motion-ready');
  }

  // A small, dependency-free 3D particle renderer. It sleeps offscreen and caps at 30fps.
  const canvas = document.querySelector('#news-globe');
  const context = canvas.getContext('2d');
  if (context) {
    const scene = canvas.parentElement;
    const points = [];
    const count = 1450;
    const goldenAngle = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < count; i++) {
      const y = 1 - (i / (count - 1)) * 2;
      const radius = Math.sqrt(1 - y * y);
      const angle = goldenAngle * i;
      points.push({ x: Math.cos(angle) * radius, y, z: Math.sin(angle) * radius, strong: Math.sin(angle * 3 + y * 8) + Math.cos(angle * 2 - y * 5) > .2 });
    }
    let width = 0, height = 0, angle = .6, lastFrame = 0, frame = 0;
    let visible = true, pointerX = 0, targetX = 0;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    function draw() {
      context.clearRect(0, 0, width, height);
      const radius = Math.min(width * .37, height * .34);
      const cx = width * .51, cy = height * .48;
      const cos = Math.cos(angle + pointerX), sin = Math.sin(angle + pointerX);
      const glow = context.createRadialGradient(cx - radius * .25, cy - radius * .3, 0, cx, cy, radius * 1.14);
      glow.addColorStop(0, '#e5edf980');
      glow.addColorStop(.65, '#8ca3c926');
      glow.addColorStop(1, '#859cc100');
      context.fillStyle = glow;
      context.beginPath(); context.arc(cx, cy, radius * 1.14, 0, Math.PI * 2); context.fill();
      // Latitude rings give the particle cloud a precise spherical silhouette.
      context.strokeStyle = '#566c9023'; context.lineWidth = .65;
      for (let latitude = -2; latitude <= 2; latitude++) {
        const y = latitude * .30;
        const r = Math.sqrt(1 - y * y) * radius;
        context.beginPath(); context.ellipse(cx, cy + y * radius, r, r * .14, -.13, 0, Math.PI * 2); context.stroke();
      }
      for (const point of points) {
        const x = point.x * cos - point.z * sin;
        const z = point.x * sin + point.z * cos;
        const perspective = 2.8 / (2.8 - z * .3);
        const px = cx + (x * .98 + point.y * .14) * radius * perspective;
        const py = cy + (point.y * .97 - x * .12) * radius * perspective;
        const alpha = (.14 + (z + 1) * .24) * (point.strong ? 1 : .43);
        context.fillStyle = `rgba(51,99,185,${alpha})`;
        context.beginPath(); context.arc(px, py, (point.strong ? 1.15 : .7) * perspective, 0, Math.PI * 2); context.fill();
      }
      context.strokeStyle = '#6b81a435'; context.lineWidth = .75;
      context.beginPath(); context.arc(cx, cy, radius * 1.03, 0, Math.PI * 2); context.stroke();
    }
    function tick(time) {
      if (paused || !visible || document.hidden) { frame = 0; return; }
      if (time - lastFrame >= 32) {
        angle += Math.min((time - lastFrame) || 32, 64) * .000075;
        pointerX += (targetX - pointerX) * .05;
        lastFrame = time;
        draw();
      }
      frame = requestAnimationFrame(tick);
    }
    updateGlobe = () => {
      if (paused || !visible || document.hidden) {
        if (frame) cancelAnimationFrame(frame);
        frame = 0;
        draw();
      } else if (!frame) { lastFrame = performance.now(); frame = requestAnimationFrame(tick); }
    };
    function resize() {
      width = scene.clientWidth; height = scene.clientHeight;
      canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      draw();
    }
    if ('ResizeObserver' in window) new ResizeObserver(resize).observe(scene);
    else addEventListener('resize', resize);
    if ('IntersectionObserver' in window) new IntersectionObserver(entries => {
      visible = entries[0].isIntersecting;
      updateGlobe();
    }).observe(scene);
    document.addEventListener('visibilitychange', updateGlobe);
    if (matchMedia('(pointer:fine)').matches) {
      scene.addEventListener('pointermove', event => {
        if (paused) return;
        const bounds = scene.getBoundingClientRect();
        targetX = ((event.clientX - bounds.left) / bounds.width - .5) * .45;
      }, { passive: true });
      scene.addEventListener('pointerleave', () => { targetX = 0; });
    }
    resize(); updateGlobe();
  }
  try { document.querySelector('#year').textContent = new Intl.DateTimeFormat('fa-IR', { year: 'numeric' }).format(new Date()); } catch { /* static year remains a sensible fallback */ }
})();

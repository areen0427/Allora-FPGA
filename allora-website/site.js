// Website interactions shared by every workspace and feature tour.
(() => {
  const root = document.documentElement;
  const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const themeSwitch = document.getElementById('themeSwitch');
  const themeLabel = document.getElementById('themeLabel');
  const themeImages = [...document.querySelectorAll('img[data-ice-src][data-black-src]')];

  function syncTheme() {
    const black = root.dataset.theme === 'black-ice';
    if (themeLabel) themeLabel.textContent = black ? 'Black Ice' : 'Ice';
    if (themeSwitch) {
      themeSwitch.setAttribute('aria-pressed', String(black));
      themeSwitch.setAttribute('aria-label', `Switch to ${black ? 'Ice' : 'Black Ice'}`);
    }
    themeImages.forEach(img => {
      img.src = black ? img.dataset.blackSrc : img.dataset.iceSrc;
    });
    // Hide the whole button, rather than leaving an empty focusable screenshot.
    document.querySelectorAll('.image-preview-trigger').forEach(trigger => {
      const shot = trigger.querySelector('img');
      const isIce = shot?.classList.contains('theme-shot-ice');
      const isBlack = shot?.classList.contains('theme-shot-black-ice');
      const hidden = (isIce && black) || (isBlack && !black);
      trigger.hidden = Boolean(hidden);
      trigger.tabIndex = hidden || trigger.closest('[aria-hidden="true"]') ? -1 : 0;
    });
  }

  themeSwitch?.addEventListener('click', () => {
    root.dataset.theme = root.dataset.theme === 'black-ice' ? 'ice' : 'black-ice';
    try { localStorage.setItem('allora-site-theme', root.dataset.theme); } catch (_) {}
    syncTheme();
  });

  document.querySelectorAll('[data-feature-tabs]').forEach(group => {
    const tabs = [...group.querySelectorAll('[role="tab"]')].filter(tab => {
      const panel = document.getElementById(tab.getAttribute('aria-controls'));
      return tab.closest('[data-feature-tabs]') === group && panel && group.contains(panel);
    });
    if (!tabs.length) return;
    const select = (active, focus = false, scroll = true) => {
      tabs.forEach(tab => {
        const selected = tab === active;
        tab.setAttribute('aria-selected', String(selected));
        tab.tabIndex = selected ? 0 : -1;
        document.getElementById(tab.getAttribute('aria-controls')).hidden = !selected;
      });
      if (focus) active.focus({ preventScroll: true });
      if (scroll) active.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'nearest', inline: 'nearest' });
    };
    tabs.forEach(tab => {
      tab.addEventListener('click', () => select(tab));
      tab.addEventListener('keydown', event => {
        const offset = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
        if (!offset && event.key !== 'Home' && event.key !== 'End') return;
        event.preventDefault();
        const index = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (tabs.indexOf(tab) + offset + tabs.length) % tabs.length;
        select(tabs[index], true);
      });
    });
    select(tabs.find(tab => tab.getAttribute('aria-selected') === 'true') || tabs[0], false, false);
  });

  const imagePreview = document.getElementById('imagePreview');
  if (imagePreview && typeof imagePreview.showModal === 'function') {
    const previewImage = imagePreview.querySelector('.image-preview-image');
    const previewCaption = imagePreview.querySelector('.image-preview-caption');
    const closeButton = imagePreview.querySelector('.preview-close');
    let previewTrigger = null;
    let previewCloseTimer = null;
    let previewOpenFrame = null;
    let previousPageOverflow = null;
    const closeImagePreview = () => {
      if (!imagePreview.open) return;
      cancelAnimationFrame(previewOpenFrame);
      imagePreview.classList.remove('is-open');
      clearTimeout(previewCloseTimer);
      previewCloseTimer = setTimeout(() => imagePreview.close(), prefersReducedMotion() ? 0 : 240);
    };
    imagePreview.addEventListener('close', () => {
      clearTimeout(previewCloseTimer);
      cancelAnimationFrame(previewOpenFrame);
      imagePreview.classList.remove('is-open');
      previewImage.removeAttribute('src');
      if (previousPageOverflow) {
        root.style.overflow = previousPageOverflow.root;
        document.body.style.overflow = previousPageOverflow.body;
        previousPageOverflow = null;
      }
      if (previewTrigger?.isConnected && !previewTrigger.hidden) previewTrigger.focus({ preventScroll: true });
    });
    document.querySelectorAll('.build-visual img, .feature-visual img, .app-capture img, .hero-product img').forEach(shot => {
      if (shot.closest('button, a')) return;
      const trigger = document.createElement('button');
      trigger.type = 'button';
      trigger.className = 'image-preview-trigger';
      trigger.setAttribute('aria-label', `View ${shot.alt || 'app screenshot'} larger`);
      trigger.setAttribute('aria-haspopup', 'dialog');
      trigger.setAttribute('aria-controls', imagePreview.id);
      trigger.addEventListener('click', () => {
        clearTimeout(previewCloseTimer);
        previewTrigger = trigger;
        previewImage.src = shot.dataset.fullSrc || shot.getAttribute('src');
        previewImage.alt = shot.alt;
        if (previewCaption) previewCaption.textContent = shot.closest('figure')?.querySelector('figcaption')?.textContent.trim() || '';
        previousPageOverflow = { root: root.style.overflow, body: document.body.style.overflow };
        root.style.overflow = 'hidden';
        document.body.style.overflow = 'hidden';
        imagePreview.showModal();
        previewOpenFrame = requestAnimationFrame(() => {
          previewOpenFrame = requestAnimationFrame(() => imagePreview.classList.add('is-open'));
        });
        (closeButton || imagePreview).focus({ preventScroll: true });
      });
      shot.parentNode.insertBefore(trigger, shot);
      trigger.appendChild(shot);
    });
    closeButton?.addEventListener('click', closeImagePreview);
    imagePreview.addEventListener('click', event => {
      if (event.target === imagePreview) closeImagePreview();
    });
    imagePreview.addEventListener('cancel', event => {
      event.preventDefault();
      closeImagePreview();
    });
  }

  document.querySelectorAll('.build-carousel').forEach(carousel => {
    const viewport = carousel.querySelector('.build-carousel-viewport');
    const track = carousel.querySelector('.build-carousel-track');
    if (!viewport || !track) return;
    const slides = [...track.querySelectorAll(':scope > figure')];
    if (!slides.length) return;
    const label = slide => slide.getAttribute('aria-label') || slide.querySelector('figcaption')?.textContent.trim() || 'Image';
    let current = 0;
    let previous;
    let next;
    let position;
    if (slides.length > 1) {
      const arrow = (direction, path) => {
        const control = document.createElement('button');
        control.type = 'button';
        control.className = `build-carousel-arrow build-carousel-${direction}`;
        control.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${path}" /></svg>`;
        viewport.appendChild(control);
        return control;
      };
      previous = arrow('prev', 'm15 18-6-6 6-6');
      next = arrow('next', 'm9 18 6-6-6-6');
      position = document.createElement('span');
      position.className = 'build-carousel-position sr-only';
      position.setAttribute('aria-live', 'polite');
      carousel.appendChild(position);
    }
    const showSlide = index => {
      current = Math.max(0, Math.min(index, slides.length - 1));
      track.style.setProperty('--carousel-offset', `${-100 * current}%`);
      slides.forEach((slide, slideIndex) => {
        const active = slideIndex === current;
        slide.setAttribute('aria-hidden', String(!active));
        slide.inert = !active;
        slide.querySelectorAll('.image-preview-trigger').forEach(trigger => {
          trigger.tabIndex = active && !trigger.hidden ? 0 : -1;
        });
      });
      if (previous && next && position) {
        previous.disabled = current === 0;
        next.disabled = current === slides.length - 1;
        previous.setAttribute('aria-label', `Previous image: ${label(slides[current - 1] || slides[0])}`);
        next.setAttribute('aria-label', `Next image: ${label(slides[current + 1] || slides[slides.length - 1])}`);
        position.textContent = `${current + 1} / ${slides.length} · ${label(slides[current])}`;
      }
    };
    previous?.addEventListener('click', () => showSlide(current - 1));
    next?.addEventListener('click', () => showSlide(current + 1));
    showSlide(0);
  });
  syncTheme();

  const nav = document.getElementById('navLinks');
  const menuToggle = document.getElementById('menuToggle');
  if (nav && menuToggle) {
    const setMenu = open => {
      nav.classList.toggle('is-open', open);
      menuToggle.setAttribute('aria-expanded', String(open));
      menuToggle.setAttribute('aria-label', open ? 'Close navigation' : 'Open navigation');
    };
    menuToggle.addEventListener('click', () => setMenu(menuToggle.getAttribute('aria-expanded') !== 'true'));
    nav.addEventListener('click', event => {
      const link = event.target.closest('a');
      if (!link || menuToggle.getAttribute('aria-expanded') !== 'true') return;
      setMenu(false);
      // Keep keyboard focus on the section reached from the collapsed menu.
      const href = link.getAttribute('href');
      const destination = href?.startsWith('#') ? document.getElementById(href.slice(1)) : null;
      if (destination) {
        const previousTabindex = destination.getAttribute('tabindex');
        destination.tabIndex = -1;
        destination.focus({ preventScroll: true });
        destination.addEventListener('blur', () => {
          if (previousTabindex === null) destination.removeAttribute('tabindex');
          else destination.setAttribute('tabindex', previousTabindex);
        }, { once: true });
      }
    });
    document.addEventListener('click', event => {
      if (!event.target.closest('.nav')) setMenu(false);
    });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && menuToggle.getAttribute('aria-expanded') === 'true') {
        setMenu(false);
        menuToggle.focus();
      }
    });
    const desktopQuery = window.matchMedia('(min-width: 1081px)');
    const closeOnDesktop = event => { if (event.matches) setMenu(false); };
    if (desktopQuery.addEventListener) desktopQuery.addEventListener('change', closeOnDesktop);
    else desktopQuery.addListener(closeOnDesktop);
    setMenu(false);
  }

  const reveals = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window && !prefersReducedMotion()) {
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      });
    }, { threshold: 0.12 });
    reveals.forEach(node => observer.observe(node));
  } else {
    reveals.forEach(node => node.classList.add('is-visible'));
  }

  const full = window.ALLORA_BOARDS_FULL || [];
  const pins = window.ALLORA_BOARDS_PINS || [];
  const boards = [...full, ...pins];
  const setText = (id, value) => {
    const node = document.getElementById(id);
    if (node) node.textContent = value;
  };
  setText('fullCount', full.length);
  setText('workflowCount', full.length);
  setText('pinCount', window.ALLORA_PINS_TOTAL || pins.length);
  const escapeHtml = value => String(value).replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
  const boardA = document.getElementById('boardA');
  const boardB = document.getElementById('boardB');
  const compareTable = document.getElementById('compareTable');
  if (boardA && boardB && compareTable) {
    const options = full.map(board => `<option value="${escapeHtml(board.name)}">${escapeHtml(board.name)}</option>`).join('');
    boardA.innerHTML = options;
    boardB.innerHTML = options;
    boardA.selectedIndex = Math.max(0, full.findIndex(board => /iCEBreaker/i.test(board.name)));
    boardB.selectedIndex = Math.min(full.length - 1, Math.max(1, full.findIndex(board => /ULX3S/i.test(board.name))));
    const fields = [['FPGA', 'fpga'], ['Family', 'family'], ['Logic', 'luts'], ['Memory', 'mem'], ['Clock', 'clock'], ['Mapped pins', 'pins'], ['Best for', 'best']];
    const renderComparison = () => {
      const a = full.find(board => board.name === boardA.value) || full[0];
      const b = full.find(board => board.name === boardB.value) || full[1] || full[0];
      if (!a || !b) return;
      compareTable.innerHTML = `<div class="compare-row compare-row-head" role="row"><span role="columnheader">Specification</span><strong role="columnheader">${escapeHtml(a.name)}</strong><strong role="columnheader">${escapeHtml(b.name)}</strong></div>${fields.map(([label, key]) => `<div class="compare-row" role="row"><span role="rowheader">${label}</span><b role="cell">${escapeHtml(a[key] ?? '—') || '—'}</b><b role="cell">${escapeHtml(b[key] ?? '—') || '—'}</b></div>`).join('')}`;
    };
    boardA.addEventListener('change', renderComparison);
    boardB.addEventListener('change', renderComparison);
    renderComparison();
  }

  const search = document.getElementById('boardSearch');
  const catalog = document.getElementById('catalogList');
  const more = document.getElementById('catalogMore');
  if (search && catalog && more) {
    let catalogLimit = 24;
    const renderCatalog = () => {
      const query = search.value.trim().toLowerCase();
      const results = boards.filter(board => [board.name, board.family, board.fpga].join(' ').toLowerCase().includes(query));
      const visible = results.slice(0, catalogLimit);
      catalog.innerHTML = visible.map(board => `<article><i class="dot ${board.support === 'full' ? 'dot-full' : 'dot-pins'}"></i><div><strong>${escapeHtml(board.name)}</strong><span>${escapeHtml(board.family || 'FPGA')} · ${escapeHtml(board.fpga || 'device')}</span></div><em>${board.support === 'full' ? 'Open build' : 'Pin mapping'}</em></article>`).join('');
      const empty = document.getElementById('catalogEmpty');
      if (empty) empty.hidden = results.length > 0;
      setText('catalogStatus', `Showing ${visible.length} of ${results.length} catalog entries`);
      more.hidden = visible.length >= results.length;
    };
    search.addEventListener('input', () => { catalogLimit = 24; renderCatalog(); });
    more.addEventListener('click', () => { catalogLimit += 24; renderCatalog(); });
    renderCatalog();
  }
})();

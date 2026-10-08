// Small additions to the original website's theme, build tour, and image viewer.
(() => {
  document.querySelectorAll('[data-feature-tabs]').forEach(group => {
    const tabs = [...group.querySelectorAll('[role="tab"]')];
    const select = (active, focus = false) => {
      tabs.forEach(tab => {
        const selected = tab === active;
        tab.setAttribute('aria-selected', String(selected));
        tab.tabIndex = selected ? 0 : -1;
        document.getElementById(tab.getAttribute('aria-controls')).hidden = !selected;
      });
      if (focus) active.focus();
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
  });
  const nav = document.getElementById('navLinks');
  const toggle = document.getElementById('menuToggle');
  const setMenu = open => {
    nav.classList.toggle('is-open', open);
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Close navigation' : 'Open navigation');
  };
  toggle.addEventListener('click', () => setMenu(toggle.getAttribute('aria-expanded') !== 'true'));
  nav.addEventListener('click', event => { if (event.target.closest('a')) setMenu(false); });
  document.addEventListener('click', event => { if (!event.target.closest('.nav')) setMenu(false); });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && toggle.getAttribute('aria-expanded') === 'true') {
      setMenu(false);
      toggle.focus();
    }
  });
  matchMedia('(min-width: 1081px)').addEventListener('change', event => { if (event.matches) setMenu(false); });
})();

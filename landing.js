'use strict';
// Navigation and metadata only: no account, AI or app-preference side effects.
(() => {
  const button = document.querySelector('.site-menu-toggle');
  const nav = document.getElementById('site-nav');
  const mobile = matchMedia('(max-width: 900px)');
  function close() { nav.hidden = mobile.matches; button.setAttribute('aria-expanded', 'false'); }
  close();
  mobile.addEventListener('change', close);
  button.addEventListener('click', () => { const open = nav.hidden; nav.hidden = !open; button.setAttribute('aria-expanded', String(open)); });
  nav.addEventListener('click', e => { if (mobile.matches && e.target.closest('a')) close(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && mobile.matches && !nav.hidden) { close(); button.focus(); } });
  const description = document.querySelector('meta[name="description"]');
  const originalDescription = description.content;
  const originalTitle = document.querySelector('title').dataset.siteTitle;
  function metadata() { const t = window.AjouraI18n?.t || (s => s); description.content = t(originalDescription); document.title = t(originalTitle); }
  document.addEventListener('ajoura-lang', metadata);
  metadata();
})();

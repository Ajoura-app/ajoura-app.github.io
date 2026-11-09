'use strict';
// Presentation only. Timing, routing and the session guard remain owned by app.js.
(() => {
  const t=s=>window.AjouraI18n?window.AjouraI18n.t(s):s;
  const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const quiet=()=>matchMedia('(prefers-reduced-motion: reduce)').matches||!window.AjouraAvatar.motion();
  const mark='<svg viewBox="0 0 32 32" fill="none" aria-hidden="true"><path d="M5 25 14 7q2-4 4 0l9 18q1 2-2 2h-8" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  window.AjouraLaunch=Object.freeze({duration:()=>quiet()?200:1400,
    html:label=>`<div class="ai-intro${quiet()?' ai-intro-still':''}" role="status" aria-label="${esc(t('Ajoura – henkilökohtainen autosihteerisi'))}"><div class="ai-intro-light" aria-hidden="true"></div><div class="ai-intro-content"><div class="ai-intro-logo" aria-label="Ajoura">${mark}<span translate="no">Ajoura</span></div><p class="ai-intro-name" translate="no" data-avatar-name>${window.AjouraAvatar.name()}</p><h1>${esc(t('Henkilökohtainen autosihteerisi'))}</h1><div class="ai-intro-portrait">${window.AjouraAvatar.avatar()}</div><span class="ai-intro-caption">${esc(t('Kirjaa. Seuraa. Ennakoi.'))}</span><span class="ai-intro-dots" aria-hidden="true"><i></i><i></i><i></i></span>${label?`<small>${esc(t(label))}</small>`:''}</div></div>`});
})();

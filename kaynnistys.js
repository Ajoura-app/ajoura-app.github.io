'use strict';
// Visual launch only; existing routing and session guard remain in app.js.
(() => {
  const t=s=>window.AjouraI18n?window.AjouraI18n.t(s):s;
  const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const quiet=()=>matchMedia('(prefers-reduced-motion: reduce)').matches||!window.AjouraAvatar.motion();
  window.AjouraLaunch=Object.freeze({duration:()=>quiet()?200:1400,
    html:label=>`<div class="ai-intro${quiet()?' ai-intro-still':''}" role="status" aria-label="${esc(t('Ajoura – henkilökohtainen autosihteerisi'))}"><div class="ai-intro-light" aria-hidden="true"></div><div class="ai-intro-content"><img class="ai-intro-logo" src="logo.svg" alt="AJOURA" width="640" height="198">${window.AjouraAvatar.avatar()}<p class="ai-intro-name" translate="no">${window.AjouraAvatar.name()}</p><h1>${esc(t('Henkilökohtainen autosihteerisi'))}</h1><span class="ai-intro-caption">${esc(t('Kirjaa. Seuraa. Ennakoi.'))}</span>${label?`<small>${esc(t(label))}</small>`:''}</div></div>`});
})();

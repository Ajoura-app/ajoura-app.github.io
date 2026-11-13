'use strict';
// The application still supplies the original guest, login and returning-user controls.
(() => {
  const t=s=>window.AjouraI18n?window.AjouraI18n.t(s):s;
  const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const paths=['<path d="M3 7h4l2-3h6l2 3h4v13H3z"/><circle cx="12" cy="13" r="4"/>','<rect x="9" y="3" width="6" height="12" rx="3"/><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8"/>','<path d="M5 20v-6M12 20V9M19 20V4"/>'];
  const features=[['Kuvaa kuitti','Täytä tankkaus kuitin tai mittarin kuvasta.'],['Kirjoita tai sanele','Kirjaa tankkaus tekstinä tai puheella tuetussa selaimessa.'],['Seuraa ajoneuvoasi','Kulut, huoltohistoria ja muistutukset samassa paikassa.']];
  function entry(content){
    const template=document.createElement('template');template.innerHTML=content;
    const choices=template.content.querySelector('.welcome-choices');
    const primary=choices?.outerHTML||'';choices?.remove();
    return {primary,rest:template.innerHTML};
  }
  window.AjouraWelcome=Object.freeze({render:({prefs,content})=>{const {primary,rest}=entry(content);return `<div class="welcome ai-welcome">${prefs}<header class="ai-welcome-heading"><h1>${esc(t('Tervetuloa Ajouraan'))}</h1><p>${esc(t('Henkilökohtainen autosihteerisi'))}</p></header><section class="ai-welcome-hero">${window.AjouraAvatar.avatar()}<div class="ai-welcome-copy"><p class="ai-welcome-name" translate="no" data-avatar-name>${window.AjouraAvatar.name()}</p><span class="mini-label">${esc(t('AUTOSIHTEERI'))}</span><p>${esc(t('Autan sinua pitämään ajoneuvosi tiedot ajan tasalla.'))}</p></div></section><ul class="ai-welcome-capabilities">${features.map(([title,description],i)=>`<li><span class="welcome-feature-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${paths[i]}</svg></span><div><h2>${esc(t(title))}</h2><p>${esc(t(description))}</p></div></li>`).join('')}</ul>${primary}<details class="ai-welcome-personal"><summary>${esc(t('Valitse avustajasi'))}</summary>${window.AjouraAvatar.settings()}<p>${esc(t('Voit vaihtaa hahmoa ja ulkoasua myöhemmin asetuksista.'))}</p></details>${rest}<section class="ai-welcome-tools"><p>${esc(t('Tekoäly edellyttää kirjautumista, käytettävissä olevaa käyttöoikeutta ja omaa valintaasi. Tarkistat tiedot ennen tallennusta.'))}</p><button type="button" class="app-button secondary" data-tutorial>${esc(t('Katso lyhyt opastus'))}</button></section></div>`;}});
})();

'use strict';
// Presentation only: selected vehicle stays in memory. All writes use the existing app forms.
(() => {
  let selected = '', ids = [], start = null;
  const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const t = s => window.AjouraI18n ? window.AjouraI18n.t(s) : s;
  function choose(id) {
    if (!ids.includes(id)) return;
    selected = id;
    window.AjouraApp.refresh();
  }
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-secretary-car]');
    if (b) { choose(b.dataset.secretaryCar); document.querySelector(`[data-secretary-car="${selected}"]`)?.focus({preventScroll:true}); }
  });
  document.addEventListener('touchstart', e => {
    start = e.target.closest('.secretary-vehicle') && !e.target.closest('button,a,input') && e.touches.length === 1
      ? {x:e.touches[0].clientX,y:e.touches[0].clientY} : null;
  }, {passive:true});
  document.addEventListener('touchend', e => {
    if (!start) return;
    const dx=e.changedTouches[0].clientX-start.x,dy=e.changedTouches[0].clientY-start.y; start=null;
    if (Math.abs(dx)>60 && Math.abs(dx)>Math.abs(dy)*1.5) {
      const i=ids.indexOf(selected), next=i+(dx<0?1:-1);
      if (ids[next]) choose(ids[next]);
    }
  }, {passive:true});
  window.AjouraSecretary = {
    render({cars, card, due, ai, speech, unit}) {
      ids=cars.map(c=>c.id);
      if (!ids.includes(selected)) selected=ids[0];
      const c=cars.find(c=>c.id===selected), d=due(c);
      const action=(label,mode)=>`<button type="button" data-quickfuel="${esc(c.id)}" data-secretary-mode="${mode}">${esc(t(label))}</button>`;
      const tasks=[];
      if (!c.events?.length) tasks.push(['Kirjaa viimeisin huolto','Huoltohistoria auttaa seuraamaan oman huoltovälin toteutumista.',`#add/${c.id}`]);
      else if (d && ['late','soon'].includes(d.tone)) tasks.push(['Tarkista huoltoväli','Muistutus perustuu tallennettuihin merkintöihin ja omaan huoltoväliisi.',`#vehicle/${c.id}`]);
      if (!c.fuels?.length) tasks.push(['Kirjaa ensimmäinen tankkaus tai lataus','Kulutuksen seuranta alkaa omista kirjauksistasi.',null]);
      tasks.push(['Tarkastele ajoneuvon historiaa','Näet tallennetut huollot ja merkinnät päiväkirjassa.',`#vehicle/${c.id}`]);
      return `<section class="secretary-home" aria-label="${esc(t('Autosihteeri'))}">
        <div class="secretary-selector" role="group" aria-label="${esc(t('Valitse ajoneuvo'))}">${cars.map(x=>`<button type="button" data-secretary-car="${esc(x.id)}" aria-pressed="${x.id===c.id}">${esc(x.nick||x.name)}</button>`).join('')}</div>
        <div class="secretary-vehicle">${card(c)}${cars.length>1?`<p class="secretary-swipe">${esc(t('Vaihda ajoneuvoa pyyhkäisemällä'))}</p>`:''}</div>
        <section class="secretary-card"><div class="secretary-intro">${window.AjouraAvatar.avatar()}<div><span class="mini-label">${esc(t('AUTOSIHTEERI'))}</span><h3 translate="no" data-avatar-name>${window.AjouraAvatar.name()}</h3><p>${esc(t(ai?'Autan tankkauksen kirjaamisessa. Tarkistat tiedot ennen tallennusta.':'Pidetään ajoneuvosi tiedot ajan tasalla. Voit kirjata tiedot käsin.'))}</p></div></div>
        <p class="secretary-context">${esc(c.nick||c.name)} · ${esc(c.plate)}</p>
        ${window.AjouraAvatar.feedback()}<div class="secretary-actions">${ai?`${speech?action('Puhu tankkauksesta','speech'):''}${action('Kuvaa kuitti tai mittari','photo')}${action('Kirjoita tankkauksen tiedot','text')}`:''}${action('Lisää käsin','manual')}</div></section>
        <section class="secretary-tasks"><h3>${esc(t('Tämän ajoneuvon tehtävät'))}</h3>${tasks.slice(0,3).map(([title,body,href])=>`<article class="secretary-task"><h4>${esc(t(title))}</h4><p>${esc(t(body))}</p>${href?`<a href="${href}">${esc(t('Avaa'))} →</a>`:action('Lisää käsin','manual')}</article>`).join('')}</section>
        <div class="secretary-summary"><span>${esc(t('Tallennetut merkinnät'))}<strong>${c.events?.length||0}</strong></span><span>${esc(t('Mittarilukema'))}<strong>${esc(c.km)} ${esc(unit(c))}</strong></span><a href="#fuel/${esc(c.id)}">${esc(t('Tankkaus'))} →</a><a href="#reports">${esc(t('Raportit'))} →</a></div>
      </section>`;
    }
  };
})();

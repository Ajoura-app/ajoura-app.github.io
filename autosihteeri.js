'use strict';
// Presentation only: selected vehicle stays in memory. All writes use the existing app forms.
(() => {
  let selected = '', ids = [], start = null;
  const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const t = s => window.AjouraI18n ? window.AjouraI18n.t(s) : s;
  function renderVehiclePicker(c,cars) {
    if(cars.length<2)return '';
    return `<details class="secretary-picker"><summary data-secretary-picker><span>${esc(t('Valitse ajoneuvo'))}</span><span class="secretary-position">${cars.indexOf(c)+1} / ${cars.length}</span></summary>
      <div class="secretary-selector" role="group" aria-label="${esc(t('Valitse ajoneuvo'))}">${cars.map(x=>`<button type="button" data-secretary-car="${esc(x.id)}" aria-pressed="${x.id===c.id}">${esc(x.nick||x.name)}</button>`).join('')}</div>
      <a class="secretary-order text-link" href="#car-order">${esc(t('Järjestä ajoneuvot'))}</a></details>`;
  }
  function renderVehicleHero(c,view) {
    // Only markup from app.js renderers is inserted as HTML; vehicle text is escaped here.
    return `<article class="garage-row secretary-hero" data-car="${esc(c.id)}">
      <div class="secretary-hero-media">${view.image}</div>
      <a class="row-info secretary-hero-meta" href="#vehicle/${esc(c.id)}"><span class="row-name"><strong>${esc(view.name)}</strong></span><small class="row-meta"><span>${esc(view.plate)}</span> · <span class="nw">${esc(view.meter)}</span></small></a>
      <details class="secretary-vehicle-details"><summary><span class="sr-only">${esc(t('Ajoneuvon tiedot'))}: </span><span class="secretary-service-line"><span class="secretary-status-label status-${esc(view.tone)}">${esc(t(view.statusLabel))}</span><span class="secretary-status-value">${view.estimated?`<span>${esc(t('Arvio'))}</span>: `:''}${esc(t(view.statusValue))}</span></span><span class="secretary-chevron" aria-hidden="true">⌄</span></summary>
        <div class="secretary-vehicle-detail">${view.cost?`<p class="row-cost fuel-cost-row"><span>${esc(t('Kulut'))}</span> <span>${esc(view.year)}</span> <b>${esc(view.cost)} €</b></p>`:''}<a class="row-wide" href="#vehicle/${esc(c.id)}">${view.status}</a>${view.actions}</div>
      </details></article>`;
  }
  const actionPaths={
    speech:'<rect x="9" y="3" width="6" height="12" rx="3"/><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8"/>',
    photo:'<path d="M3 7h4l2-3h6l2 3h4v13H3z"/><circle cx="12" cy="13" r="4"/>',
    text:'<path d="m15 4 5 5M4 20l5-1L21 7l-5-5L4 14z"/>',
    manual:'<path d="M6 3h9l4 4v14H6zM14 3v5h5M9 12h7M9 16h7"/>',
    service:'<path d="M14 6a6 6 0 0 0-7 7l-5 5 4 4 5-5a6 6 0 0 0 7-7l-4 4-4-4z"/>'
  };
  const actionIcon=mode=>`<svg class="secretary-action-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${actionPaths[mode]}</svg>`;
  function renderAssistant(c,{available,quotaBlocked,speech,tasks,moreOpen,local}) {
    const action=(label,mode,aria=label,icon=false)=>`<button type="button" data-quickfuel="${esc(c.id)}" data-secretary-mode="${mode}" aria-label="${esc(t(aria))}">${icon?actionIcon(mode):''}<span>${esc(t(label))}</span></button>`;
    const service=primary=>`<a href="#add/${esc(c.id)}" data-secretary-service aria-label="${esc(t('Kirjaa huolto käsin'))}">${primary?actionIcon('service'):''}<span>${esc(t(primary?'Lisää huolto':'Kirjaa huolto käsin'))}</span></a>`;
    const message=quotaBlocked?'Tämän kuun tunnistukset on käytetty. Kirjaa tiedot käsin.':tasks[0]?.title||(available?'Autan tankkauksen kirjaamisessa.':'Voit kirjata tiedot käsin.');
    const primary=available?`${speech?action('Puhu','speech','Puhu tankkauksesta',true):action('Kirjoita','text','Kirjoita tankkauksen tiedot',true)}${action('Kuvaa kuitti','photo','Kuvaa kuitti tai mittari',true)}`:`${action('Lisää käsin','manual','Lisää käsin',true)}${service(true)}`;
    return `<section class="secretary-card"><div class="secretary-intro">${window.AjouraAvatar.avatar()}<div class="secretary-copy"><span class="mini-label">${esc(t('AUTOSIHTEERI'))}</span><h3 translate="no" data-avatar-name>${window.AjouraAvatar.name()}</h3>
      <p class="secretary-context">${esc(c.nick||c.name)} · ${esc(c.plate)}</p><p class="secretary-message">${esc(t(message))}</p>${available?`<p class="secretary-note">${esc(t('Tarkistat tiedot ennen tallennusta.'))}</p>`:''}</div></div>
      ${window.AjouraAvatar.feedback()}<div class="secretary-actions">${primary}</div>
      <details class="secretary-more"${moreOpen?' open':''}><summary>${esc(t('Lisää vaihtoehtoja'))}</summary><div class="secretary-support">${available?`${speech?action('Kirjoita tankkauksen tiedot','text'):''}${action('Lisää käsin','manual')}${service(false)}`:''}<button type="button" data-tutorial>${esc(t('Näytä kirjausohje'))}</button></div>${local}</details>
    </section>`;
  }
  function choose(id) {
    if (!ids.includes(id)) return;
    selected = id;
    window.AjouraApp.refresh();
  }
  document.addEventListener('click', e => {
    const decision=e.target.closest('[data-task-later],[data-task-dismiss],[data-task-reset]');
    if(decision){
      if(decision.dataset.taskReset)window.AjouraTasks.reset(decision.dataset.taskReset);
      else window.AjouraTasks.decide(decision.dataset.taskLater||decision.dataset.taskDismiss,decision.dataset.taskLater?'later':'dismiss');
      window.AjouraApp.refresh();document.querySelector('.secretary-tasks h3')?.focus({preventScroll:true});return;
    }
    const b = e.target.closest('[data-secretary-car]');
    if (b) { choose(b.dataset.secretaryCar); document.querySelector('[data-secretary-picker]')?.focus({preventScroll:true}); }
  });
  document.addEventListener('keydown',e=>{
    if(e.key!=='Escape')return;
    const panel=e.target.closest?.('.secretary-picker,.secretary-more');
    if(panel?.open){e.preventDefault();panel.open=false;panel.querySelector('summary').focus({preventScroll:true});}
  });
  document.addEventListener('touchstart', e => {
    start = e.target.closest('.secretary-vehicle') && !e.target.closest('button,a,input,select,textarea,summary') && e.touches.length === 1
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
  document.addEventListener('touchcancel',()=>{start=null;},{passive:true});
  window.AjouraSecretary = {
    render({cars, card, vehicle, dates, insights, today, ai, speech, unit}) {
      ids=cars.map(c=>c.id);
      if (!ids.includes(selected)) selected=ids[0];
      const c=cars.find(c=>c.id===selected);
      const tasks=window.AjouraTasks.observe(c,dates(c),today,insights(c));
      const coverage=window.AjouraTasks.coverage(c);
      const access=window.AjouraAccess?.check('ai.receipt');
      const moreOpen=!!document.querySelector('.secretary-more')?.open;
      const local=window.AjouraAssistant?.card(c)||'';
      return `<section class="secretary-home" aria-label="${esc(t('Autosihteeri'))}">
        ${renderVehiclePicker(c,cars)}
        <div class="secretary-vehicle">${vehicle?renderVehicleHero(c,vehicle(c)):card(c)}${cars.length>1?`<p class="secretary-swipe">${esc(t('Vaihda ajoneuvoa pyyhkäisemällä'))}</p>`:''}</div>
        ${renderAssistant(c,{available:!!(ai&&access?.ok),quotaBlocked:!!(ai&&access?.reason==='quota'),speech,tasks,moreOpen,local})}
        <section class="secretary-tasks"><h3 tabindex="-1">${esc(t('Tämän ajoneuvon tehtävät'))}</h3>${tasks.map(x=>`<article class="secretary-task" data-task-key="${esc(x.key)}"><h4>${esc(t(x.title))}</h4><p>${esc(t(x.kind==='consumption'?'Vertailussa ovat viimeisin ja kolme aiempaa hyväksyttyä tankkausväliä. Ajotapa ja olosuhteet voivat selittää muutoksen.':x.kind==='fuel'?'Täydennä puuttuva tieto tankkauskirjassa.':x.kind==='Katsastus'?'Katsastusarvio perustuu tallennettuun katsastukseen.':'Muistutus perustuu tallennettuihin merkintöihin ja omaan huoltoväliisi.'))}</p>${x.kind==='Katsastus'?`<p><span>${esc(t('Arvio'))}</span>: ${esc(x.inspectionEstimate)}</p><p>${esc(t('Virallinen määräpäivä ei ole tiedossa.'))}</p>`:''}${x.comparison?`<p><span>${esc(t('Vertailukulutus'))}</span>: ${x.comparison.baseline.toFixed(1)} → ${x.comparison.current.toFixed(1)} ${esc(x.comparison.unit)}/100 km</p>`:''}${x.forecast?`<p><span>${esc(t('Ajomäärään perustuva huoltorajan arvio'))}</span>: ${esc(x.forecast.from)} – ${esc(x.forecast.to)}</p><p>${esc(t('Arvio perustuu viimeisen 180 päivän kirjauksiin ja ajon jatkumiseen samalla tasolla. Tarkista myös huollon päiväraja.'))}</p>`:''}<a href="${esc(x.href)}">${esc(t('Avaa'))} →</a><div class="task-controls"><button type="button" data-task-later="${esc(x.key)}">${esc(t('Myöhemmin'))}</button><button type="button" data-task-dismiss="${esc(x.key)}">${esc(t('Ohita'))}</button></div></article>`).join('')}${!tasks.length?`<p>${esc(t('Ei avoimia tehtäviä näiden tietojen perusteella.'))}</p>`:''}<p class="task-help">${esc(t('Myöhemmin piilottaa tehtävän vuorokaudeksi. Ohitukset koskevat vain tätä laitetta.'))}</p><button type="button" class="task-reset" data-task-reset="${esc(c.id)}">${esc(t('Näytä siirretyt ja ohitetut tehtävät'))}</button>${coverage.total?`<p class="task-coverage">${coverage.complete}/${coverage.total} ${esc(t('viime tankkauksesta sisältää mittarilukeman'))}</p>`:''}</section>
        <div class="secretary-summary"><span>${esc(t('Tallennetut merkinnät'))}<strong>${c.events?.length||0}</strong></span><span>${esc(t('Mittarilukema'))}<strong>${esc(c.km)} ${esc(unit(c))}</strong></span><a href="#fuel/${esc(c.id)}">${esc(t('Tankkaus'))} →</a><a href="#reports">${esc(t('Raportit'))} →</a></div>
      </section>`;
    }
  };
})();

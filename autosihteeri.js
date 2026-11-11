'use strict';
// Presentation only: selected vehicle stays in memory. All writes use the existing app forms.
(() => {
  let selected = '', ids = [], start = null;
  const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const isCinematic = () => ['garage','copilot','nordic','journey'].includes(document.documentElement.dataset.theme);
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
    const message=quotaBlocked?'Tämän kuun tunnistukset on käytetty. Kirjaa tiedot käsin.':tasks[0]?.title||(available?'Hei! Mitä kirjataan tänään?':'Hei! Kirjataan ajoneuvosi tiedot.');
    const primary=`${action('Lisää käsin','manual','Lisää käsin',true)}${service(true)}`;
    const mic=`<button type="button" class="secretary-mic" data-home-mic="${esc(c.id)}" ${available&&speech?`data-quickfuel="${esc(c.id)}" data-secretary-mode="speech"`:""} aria-label="${esc(t('Kirjaa puhumalla'))}">${actionIcon('speech')}<span>Kirjaa<br>puhumalla</span></button>`;
    return `<section class="secretary-card"><div class="secretary-intro">${window.AjouraAvatar.avatar()}<div class="secretary-copy"><span class="mini-label">${esc(t('AUTOSIHTEERI'))}</span><h3 translate="no" data-avatar-name>${window.AjouraAvatar.name()}</h3>
      <p class="secretary-context">${esc(c.nick||c.name)} · ${esc(c.plate)}</p><p class="secretary-message">${esc(t(message))}</p>${available?`<p class="secretary-note">${esc(t('Tarkistat tiedot ennen tallennusta.'))}</p>`:''}</div>${mic}</div>
      ${window.AjouraAvatar.feedback()}<div class="secretary-actions">${primary}</div>
      <details class="secretary-more"${moreOpen?' open':''}><summary>${esc(t('Lisää vaihtoehtoja'))}</summary><div class="secretary-support">${available?`${action('Kirjoita tankkauksen tiedot','text')}${action('Kuvaa kuitti','photo')}`:''}<button type="button" data-tutorial>${esc(t('Näytä kirjausohje'))}</button></div>${local}</details>
    </section>`;
  }
  function renderTaskDetails(x) {
    const reason=x.kind==='consumption'?'Vertailussa ovat viimeisin ja kolme aiempaa hyväksyttyä tankkausväliä. Ajotapa ja olosuhteet voivat selittää muutoksen.':x.kind==='fuel'?'Täydennä puuttuva tieto tankkauskirjassa.':x.kind==='Katsastus'?'Katsastusarvio perustuu tallennettuun katsastukseen.':'Muistutus perustuu tallennettuihin merkintöihin ja omaan huoltoväliisi.';
    return `<p>${esc(t(reason))}</p>${x.kind==='Katsastus'?`<p><span>${esc(t('Arvio'))}</span>: ${esc(x.inspectionEstimate)}</p><p>${esc(t('Virallinen määräpäivä ei ole tiedossa.'))}</p>`:''}${x.comparison?`<p><span>${esc(t('Vertailukulutus'))}</span>: ${x.comparison.baseline.toFixed(1)} → ${x.comparison.current.toFixed(1)} ${esc(x.comparison.unit)}/100 km</p>`:''}${x.forecast?`<p><span>${esc(t('Ajomäärään perustuva huoltorajan arvio'))}</span>: ${esc(x.forecast.from)} – ${esc(x.forecast.to)}</p><p>${esc(t('Arvio perustuu viimeisen 180 päivän kirjauksiin ja ajon jatkumiseen samalla tasolla. Tarkista myös huollon päiväraja.'))}</p>`:''}`;
  }
  function renderTask(x,primary=false) {
    const reason=x.comparison?`<span>${esc(t('Vertailukulutus'))}</span>: ${x.comparison.baseline.toFixed(1)} → ${x.comparison.current.toFixed(1)} ${esc(x.comparison.unit)}/100 km`:esc(t(x.kind==='Katsastus'?'Virallinen määräpäivä ei ole tiedossa.':x.kind==='fuel'?'Täydennä puuttuva tieto tankkauskirjassa.':'Muistutus perustuu omaan huoltoväliisi.'));
    const icon=x.kind==='Huolto'?'service':'manual';
    if(isCinematic())return `<article class="secretary-task${primary?' secretary-primary':''}" data-task-key="${esc(x.key)}"><details class="task-details cinematic-task"><summary${primary?' data-task-focus':''}><span class="task-icon" aria-hidden="true">${actionIcon(icon)}</span><h4>${esc(t(x.title))}</h4><span class="task-reason">${reason}</span><span class="cinematic-inspect">${esc(t('Lisätiedot'))}</span></summary><div class="task-detail-body">${renderTaskDetails(x)}<a href="${esc(x.href)}">${esc(t('Avaa'))} →</a><div class="task-controls"><button type="button" data-task-later="${esc(x.key)}">${esc(t('Myöhemmin'))}</button><button type="button" data-task-dismiss="${esc(x.key)}">${esc(t('Ohita'))}</button></div></div></details></article>`;

    return `<article class="secretary-task${primary?' secretary-primary':''}" data-task-key="${esc(x.key)}"><div class="task-heading"><span class="task-icon" aria-hidden="true">${actionIcon(icon)}</span><div><h4${primary?' tabindex="-1" data-task-focus':''}>${esc(t(x.title))}</h4><p class="task-reason">${reason}</p></div></div>
      <div class="task-footer"><a href="${esc(x.href)}">${esc(t('Avaa'))} →<span class="sr-only"> ${esc(t(x.title))}</span></a><details class="task-details"><summary>${esc(t('Lisätiedot'))}</summary><div class="task-detail-body">${renderTaskDetails(x)}<div class="task-controls"><button type="button" data-task-later="${esc(x.key)}">${esc(t('Myöhemmin'))}</button><button type="button" data-task-dismiss="${esc(x.key)}">${esc(t('Ohita'))}</button></div></div></details></div></article>`;
  }
  function renderTasks(c,tasks,coverage,open) {
    const cinematic=isCinematic(), featured=cinematic?2:1;
    return `<section class="secretary-tasks" aria-labelledby="secretary-tasks-title"><h3 id="secretary-tasks-title" class="${cinematic?'':'sr-only'}">${esc(t(cinematic?'Huomiot':'Tämän ajoneuvon tehtävät'))}</h3>${tasks.length?tasks.slice(0,featured).map((x,i)=>renderTask(x,i===0)).join(''):`<p class="task-empty" tabindex="-1" data-task-focus>${esc(t('Ei avoimia tehtäviä näiden tietojen perusteella.'))}</p>`}
      <details class="secretary-all-tasks" data-task-car="${esc(c.id)}"${open?' open':''}><summary><span>${esc(t(tasks.length?'Näytä kaikki tehtävät':'Tehtävien valinnat'))}</span>${tasks.length?`<span class="task-count">${tasks.length}</span>`:''}</summary><div class="secretary-task-list">${tasks.slice(featured).map(x=>renderTask(x)).join('')}</div><p class="task-help">${esc(t('Myöhemmin piilottaa tehtävän vuorokaudeksi. Ohitukset koskevat vain tätä laitetta.'))}</p><button type="button" class="task-reset" data-task-reset="${esc(c.id)}">${esc(t('Näytä siirretyt ja ohitetut tehtävät'))}</button>${coverage.total?`<p class="task-coverage">${coverage.complete}/${coverage.total} ${esc(t('viime tankkauksesta sisältää mittarilukeman'))}</p>`:''}</details></section>`;
  }
  function choose(id) {
    if (!ids.includes(id)) return;
    selected = id;
    window.AjouraApp.refresh();
  }
  document.addEventListener('click', e => {
    const mic=e.target.closest('[data-home-mic]');if(mic){const available=window.AjouraAccess?.check('ai.receipt').ok;const supported=!!(window.SpeechRecognition||window.webkitSpeechRecognition);if(available&&supported){return;}else{window.AjouraApp.notify(available?'Puheentunnistus ei ole käytettävissä tässä selaimessa. Käytä näppäimistön sanelua tai kirjaa käsin.':'Puhekirjaus tarvitsee kirjautumisen ja käytössä olevan tekoälyavustajan. Voit kirjata tiedot käsin.');window.AjouraApp.refresh();}return;}
    const decision=e.target.closest('[data-task-later],[data-task-dismiss],[data-task-reset]');
    if(decision){
      if(decision.dataset.taskReset)window.AjouraTasks.reset(decision.dataset.taskReset);
      else window.AjouraTasks.decide(decision.dataset.taskLater||decision.dataset.taskDismiss,decision.dataset.taskLater?'later':'dismiss');
      window.AjouraApp.refresh();document.querySelector('[data-task-focus]')?.focus({preventScroll:true});return;
    }
    const b = e.target.closest('[data-secretary-car]');
    if (b) { choose(b.dataset.secretaryCar); document.querySelector('[data-secretary-picker]')?.focus({preventScroll:true}); }
  });
  document.addEventListener('keydown',e=>{
    if(e.key!=='Escape')return;
    const panel=e.target.closest?.('.secretary-picker[open],.secretary-more[open],.task-details[open],.secretary-all-tasks[open]');
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
      const previousTasks=document.querySelector('.secretary-all-tasks');
      const tasksOpen=previousTasks?.dataset.taskCar===c.id&&previousTasks.open;
      const local=window.AjouraAssistant?.card(c)||'';
      return `<section class="secretary-home${isCinematic()?' secretary-cinematic':''}" aria-label="${esc(t('Autosihteeri'))}">
        ${isCinematic()?`<header class="cinematic-brand"><svg width="32" height="32" viewBox="0 0 32 32" fill="none" aria-hidden="true"><path d="M5 25 14 7q2-4 4 0l9 18q1 2-2 2h-8" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg><span class="cinematic-brand-name">Ajoura</span><span class="cinematic-options-space" aria-hidden="true"></span><a href="#newcar" aria-label="${esc(t('Lisää ajoneuvo'))}">+</a><a href="#settings" aria-label="${esc(t('Asetukset'))}"><svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 22v-3a8 8 0 0 1 16 0v3z"/></svg></a></header>`:''}${isCinematic()?'':renderVehiclePicker(c,cars)}
        <div class="secretary-vehicle">${isCinematic()?renderVehiclePicker(c,cars):''}${vehicle?renderVehicleHero(c,vehicle(c)):card(c)}${cars.length>1?`<p class="secretary-swipe">${esc(t('Vaihda ajoneuvoa pyyhkäisemällä'))}</p>`:''}</div>
        ${renderAssistant(c,{available:!!(ai&&access?.ok),quotaBlocked:!!(ai&&access?.reason==='quota'),speech,tasks,moreOpen,local})}
        ${renderTasks(c,tasks,coverage,tasksOpen)}
      </section>`;
    }
  };
})();

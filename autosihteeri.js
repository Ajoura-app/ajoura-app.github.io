'use strict';
// Presentation only: selected vehicle stays in memory. All writes use the existing app forms.
(() => {
  let selected = '', ids = [], voiceNotice = '';
  const expandedVehicles=new Set();
  const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const isCinematic = () => ['garage','copilot','nordic','journey'].includes(document.documentElement.dataset.theme);
  const t = s => window.AjouraI18n ? window.AjouraI18n.t(s) : s;
  function renderVehicleHero(c,view) {
    // Only markup from app.js renderers is inserted as HTML; vehicle text is escaped here.
    return `<article class="garage-row secretary-hero" data-car="${esc(c.id)}">
      <button type="button" class="secretary-hero-media vehicle-toggle" data-vehicle-toggle="${esc(c.id)}" aria-expanded="${expandedVehicles.has(c.id)}" aria-controls="vehicle-panels-${esc(c.id)}" aria-label="${esc(view.name)}">${view.image}<span class="vehicle-toggle-indicator" aria-hidden="true"><i></i><i></i><i></i></span></button>
      <a class="row-info secretary-hero-meta" href="#vehicle/${esc(c.id)}"><span class="row-name"><strong>${esc(view.name)}</strong></span><small class="row-meta"><span>${esc(view.plate)}</span> <span class="nw">${esc(view.meter)}</span></small></a>
      ${renderRing(c,view)}
    </article>`;
  }
  // 2.10: service gauge on the photo. The arc is the share of the service interval left (same value as the
  // original status bar); an overdue service or a missing history shows no percentage, only the status.
  function renderRing(c,view) {
    const r=view.ring,tone=esc(view.tone),pct=r&&view.tone!=='late'?r.pct:null,len=2*Math.PI*42,arc=r?(view.tone==='late'?1:r.left):0;
    const mark=view.tone==='ok'?'check':view.tone==='none'?'calendar':'alert';
    const spoken=t(view.statusLabel)+(pct!==null?`, ${pct} % ${t('huoltovälistä jäljellä')}`:'');
    return `<a class="vehicle-glance home-service-ring status-${tone}" href="#vehicle/${esc(c.id)}" aria-label="${esc(spoken)}"><svg class="ring-arc" viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="42"/><circle class="ring-value" cx="50" cy="50" r="42" stroke-dasharray="${(arc*len).toFixed(1)} ${len.toFixed(1)}"/></svg><span class="ring-text" aria-hidden="true">${pct!==null?`<b>${pct} %</b>`:''}<span>${esc(t(view.statusLabel))}</span></span><span class="ring-mark ring-mark-${mark}" aria-hidden="true">${actionIcon(mark)}</span></a>`;
  }
  function renderService(c,view,tasks,coverage) {
    const previous=[...document.querySelectorAll('.home-service')].find(el=>el.dataset.car===c.id);
    const opened=previous?.querySelector('.secretary-vehicle-details')?.open;
    const tasksOpen=!!previous?.querySelector('.secretary-all-tasks')?.open;
    return `<section class="home-service home-summary" data-car="${esc(c.id)}" aria-label="Huoltotilanne">
      <a class="row-wide home-service-original" href="#vehicle/${esc(c.id)}">${view.status}</a>
      <details class="secretary-vehicle-details"${opened?' open':''}><summary aria-label="Huollon lisätiedot"><span class="sr-only">Huollon lisätiedot</span><span class="secretary-chevron" aria-hidden="true">⌄</span></summary><div class="secretary-vehicle-detail"><a href="#vehicle/${esc(c.id)}">Avaa huoltohistoria →</a>${renderTasks(c,tasks,coverage,tasksOpen)}</div></details></section>`;
  }

  // 2.10: the year's costs stay visible on the card; the tint follows the service status like the gauge.
  function renderExpenses(c,view){
    return `<section class="home-expenses home-summary status-${esc(view.tone)}" aria-label="${esc(t('Kulut'))} ${esc(view.year)}"><span class="cost-coins" aria-hidden="true">${actionIcon('coins')}</span><p class="cost-total"><span>${esc(t('Kulut'))} ${esc(view.year)}</span><b>${esc(view.expenses.total)}</b></p><dl class="cost-split"><div><dt><a href="#fuel/${esc(c.id)}" aria-label="${esc(t('Tankkaukset ja lataukset'))}">${actionIcon('fuel')}</a></dt><dd>${esc(view.expenses.fuel)}</dd></div><div><dt><a href="#vehicle/${esc(c.id)}" aria-label="${esc(t('Huollot'))}">${actionIcon('service')}</a></dt><dd>${esc(view.expenses.service)}</dd></div></dl><a class="cost-report" href="#reports" data-home-costs="${esc(c.id)}" aria-label="${esc(t('Avaa tämän ajoneuvon kuluraportti'))}">${actionIcon('chart')}${actionIcon('chevron')}</a></section>`;
  }
  function renderCostNotice(tasks){const fuel=tasks.find(x=>x.kind==='fuel'||x.kind==='consumption');
    return fuel?`<a class="home-cost-notice" href="${esc(fuel.href)}">${esc(t(fuel.title))}</a>`:'';
  }
  const actionPaths={
    fuel:'<path d="M4 21V4h9v17M4 9h9M13 7h3l4 4v7a2 2 0 0 1-4 0v-5M3 21h11"/>',
    note:'<path d="M5 3h10l4 4v14H5zM14 3v5h5M8 12h8M8 16h6"/>',
    speech:'<rect x="9" y="3" width="6" height="12" rx="3"/><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8"/>',
    photo:'<path d="M3 7h4l2-3h6l2 3h4v13H3z"/><circle cx="12" cy="13" r="4"/>',
    text:'<path d="m15 4 5 5M4 20l5-1L21 7l-5-5L4 14z"/>',
    manual:'<path d="M6 3h9l4 4v14H6zM14 3v5h5M9 12h7M9 16h7"/>',
    service:'<path d="M14 6a6 6 0 0 0-7 7l-5 5 4 4 5-5a6 6 0 0 0 7-7l-4 4-4-4z"/>',
    coins:'<ellipse cx="9" cy="6" rx="6" ry="2.5"/><path d="M3 6v4c0 1.4 2.7 2.5 6 2.5s6-1.1 6-2.5V6M3 10v4c0 1.4 2.7 2.5 6 2.5 1 0 2-.1 2.8-.3M15 10.5c-.8.3-1.8.5-2.9.5"/><ellipse cx="15" cy="14" rx="6" ry="2.5"/><path d="M9 14v4c0 1.4 2.7 2.5 6 2.5s6-1.1 6-2.5v-4"/>',
    chart:'<path d="M6 20v-6M12 20V9M18 20V4"/>',
    chevron:'<path d="m9 6 6 6-6 6"/>',
    check:'<path d="m7 12.5 3.2 3.2L17 9"/>',
    alert:'<path d="M12 7v6M12 17h.01"/>',
    calendar:'<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M8 3v4M16 3v4"/>'
  };
  const actionIcon=mode=>`<svg class="secretary-action-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${actionPaths[mode]}</svg>`;
  function renderAssistant(c,{available,quotaBlocked,speech,tasks,moreOpen,local,view,actionsOnly=false,hideActions=false}) {
    const action=(label,mode)=>`<button type="button" data-quickfuel="${esc(c.id)}" data-secretary-mode="${mode}" aria-label="${esc(t(label))}"><span>${esc(t(label))}</span></button>`;
    const message=quotaBlocked?'Tämän kuun tunnistukset on käytetty. Kirjaa tiedot käsin.':tasks[0]?.title||(view.tone==='ok'?'Hei! Autosi huolto on kunnossa. Mitä kirjataan?':'Hei! Mitä kirjataan tänään?');
    const fuelLabel=c.fuel==='Sähkö'?'Lataus':'Tankkaus';
    const shortcut=(mode,label)=>`${actionIcon(mode)}<span class="home-action-label">${esc(t(label))}</span>`;
    const primary=`<button type="button" data-quickfuel="${esc(c.id)}" data-secretary-mode="manual" aria-label="${esc(t(fuelLabel+' +, kirjaa käsin'))}">${shortcut('fuel',fuelLabel)}</button><a href="#add/${esc(c.id)}" data-secretary-service aria-label="${esc(t('Huolto +, kirjaa huolto käsin'))}">${shortcut('service','Huolto')}</a><a href="#notes/${esc(c.id)}" data-secretary-note aria-label="${esc(t('Muistiinpano +'))}">${shortcut('note','Muistiinpanot')}</a>`;
    if(actionsOnly)return `<div class="secretary-actions">${primary}</div>`;
    return `<section class="secretary-card">${hideActions?'':`<div class="secretary-actions">${primary}</div>`}<div class="secretary-intro"><div class="secretary-copy"><span class="mini-label">${esc(t('AUTOSIHTEERI'))}</span><h3 translate="no" data-avatar-name>${window.AjouraAvatar.name()}</h3>
      <p class="secretary-context">${esc(c.nick||c.name)} · ${esc(c.plate)}</p><p class="secretary-message">${esc(t(message))}</p>${available?`<p class="secretary-note">${esc(t('Tarkistat tiedot ennen tallennusta.'))}</p>`:''}</div></div>
      ${window.AjouraAvatar.feedback()}
      <details class="secretary-more"${moreOpen?' open':''}><summary>${esc(t('Lisää vaihtoehtoja'))}</summary><div class="secretary-support">${available?`${action('Kirjoita tankkauksen tiedot','text')}${action('Kuvaa kuitti','photo')}`:''}<button type="button" data-tutorial>${esc(t('Näytä kirjausohje'))}</button></div>${local}</details>
    </section>`;
  }
  function widget(c) {
    if(!c)return '';
    const available=window.AjouraAccess?.check('ai.receipt')?.ok;
    const speech=!!(window.SpeechRecognition||window.webkitSpeechRecognition);
    const mic=`<button type="button" class="secretary-mic" data-home-mic="${esc(c.id)}" ${available&&speech?`data-quickfuel="${esc(c.id)}" data-secretary-mode="speech"`:""} aria-label="${esc(t('Kirjaa puhumalla'))}" aria-describedby="assistant-move-help">${window.AjouraAvatar.avatar()}<span class="home-mic-badge">${actionIcon('speech')}</span></button>`;
    return `<div class="assistant-widget" data-assistant-widget>${mic}<span class="sr-only" id="assistant-move-help">Siirrä vetämällä tai nuolinäppäimillä. Home palauttaa sijainnin.</span><p class="home-voice-feedback" role="status"${voiceNotice?'':' hidden'}>${esc(voiceNotice)}</p></div>`;
  }
  // Device-only normalized position. The dock keeps the widget in the same layer as navigation.
  const widgetKey='ajoura-assistant-position';
  let widgetPosition=null, widgetDrag=null, widgetObserver=null, widgetFrame=0, suppressWidgetClick=false;
  try{const p=JSON.parse(localStorage.getItem(widgetKey));if(p&&Number.isFinite(p.x)&&Number.isFinite(p.y))widgetPosition={x:Math.max(0,Math.min(1,p.x)),y:Math.max(0,Math.min(1,p.y))};}catch(e){}
  function widgetBounds() {
    const el=document.querySelector('[data-assistant-widget]'),screen=document.getElementById('app-screen'),dock=el?.parentElement;
    if(!el||!screen||!dock)return null;
    const r=screen.getBoundingClientRect(),d=dock.getBoundingClientRect(),v=window.visualViewport;
    const scale=d.width/dock.offsetWidth||1,w=el.offsetWidth*scale,h=el.offsetHeight*scale;
    const left=Math.max(r.left,v?.offsetLeft||0)+8*scale;
    const top=Math.max(r.top,v?.offsetTop||0)+8*scale;
    const right=Math.max(left,Math.min(r.right,(v?.offsetLeft||0)+(v?.width||innerWidth))-8*scale-w);
    const bottom=Math.max(top,Math.min(d.top-8*scale,(v?.offsetTop||0)+(v?.height||innerHeight)-8*scale)-h);
    return {el,d,scale,w,h,left,top,right,bottom};
  }
  function positionWidget() {
    const b=widgetBounds();if(!b)return;
    const p=widgetPosition||{x:1,y:1};
    const x=b.left+p.x*(b.right-b.left),y=b.top+p.y*(b.bottom-b.top);
    b.el.style.left=(x-b.d.left)/b.scale+'px';b.el.style.top=(y-b.d.top)/b.scale+'px';
    const feedback=b.el.querySelector('.home-voice-feedback');
    if(feedback&&!feedback.hidden){
      const width=Math.min(260,(b.right-b.left+b.w)/b.scale);
      feedback.style.width=width+'px';
      const fx=Math.max(b.left,Math.min(x,b.right+b.w-width*b.scale));
      feedback.style.left=(fx-x)/b.scale+'px';
      const above=y-b.top>=feedback.offsetHeight*b.scale+8*b.scale;
      feedback.style.top=above?'auto':'calc(100% + 8px)';feedback.style.bottom=above?'calc(100% + 8px)':'auto';
    }
  }
  function queueWidgetPosition(){if(!widgetFrame)widgetFrame=requestAnimationFrame(()=>{widgetFrame=0;positionWidget();});}
  function mountWidget() {
    widgetDrag=null;widgetObserver?.disconnect();
    const el=document.querySelector('[data-assistant-widget]');if(!el)return;
    widgetObserver=new ResizeObserver(queueWidgetPosition);
    widgetObserver.observe(document.getElementById('app-screen'));widgetObserver.observe(el.parentElement);
    positionWidget();queueWidgetPosition();
  }
  function saveWidgetPosition(){try{localStorage.setItem(widgetKey,JSON.stringify(widgetPosition));}catch(e){}}
  function moveWidget(x,y,b=widgetBounds()){
    if(!b)return;
    widgetPosition={x:b.right===b.left?0:Math.max(0,Math.min(1,(x-b.left)/(b.right-b.left))),y:b.bottom===b.top?0:Math.max(0,Math.min(1,(y-b.top)/(b.bottom-b.top)))};
    positionWidget();
  }
  document.addEventListener('pointerdown',e=>{
    const button=e.target.closest('[data-assistant-widget] [data-home-mic]');
    if(!button||!e.isPrimary||e.button!==0)return;
    suppressWidgetClick=false;
    const b=widgetBounds(),r=b.el.getBoundingClientRect();
    widgetDrag={id:e.pointerId,button,x:e.clientX,y:e.clientY,left:r.left,top:r.top,moved:false};
    button.setPointerCapture(e.pointerId);
  });
  document.addEventListener('pointermove',e=>{
    const d=widgetDrag;if(!d||d.id!==e.pointerId)return;
    if(!d.moved&&Math.hypot(e.clientX-d.x,e.clientY-d.y)<8)return;
    d.moved=true;suppressWidgetClick=true;
    d.button.closest('[data-assistant-widget]').classList.add('is-dragging');
    moveWidget(d.left+e.clientX-d.x,d.top+e.clientY-d.y);e.preventDefault();
  },{passive:false});
  function finishWidgetDrag(e){
    const d=widgetDrag;if(!d||d.id!==e.pointerId)return;
    widgetDrag=null;d.button.closest('[data-assistant-widget]')?.classList.remove('is-dragging');
    if(d.moved)saveWidgetPosition();
    if(d.button.hasPointerCapture(e.pointerId))d.button.releasePointerCapture(e.pointerId);
  }
  document.addEventListener('pointerup',finishWidgetDrag);
  document.addEventListener('pointercancel',finishWidgetDrag);
  document.addEventListener('lostpointercapture',finishWidgetDrag);
  // Capture before app.js opens the existing speech sheet on a click.
  document.addEventListener('click',e=>{
    if(e.detail!==0&&e.target.closest('[data-assistant-widget]')&&suppressWidgetClick){e.preventDefault();e.stopImmediatePropagation();suppressWidgetClick=false;}
  },true);
  document.addEventListener('keydown',e=>{
    if(!e.target.matches('[data-assistant-widget] [data-home-mic]'))return;
    if(e.key==='Home'){e.preventDefault();widgetPosition=null;try{localStorage.removeItem(widgetKey);}catch(err){}positionWidget();return;}
    const delta={ArrowLeft:[-16,0],ArrowRight:[16,0],ArrowUp:[0,-16],ArrowDown:[0,16]}[e.key];
    if(delta){e.preventDefault();const b=widgetBounds(),r=b.el.getBoundingClientRect();moveWidget(r.left+delta[0]*b.scale,r.top+delta[1]*b.scale,b);saveWidgetPosition();}
  });
  window.addEventListener('resize',queueWidgetPosition);
  window.visualViewport?.addEventListener('resize',queueWidgetPosition);
  window.visualViewport?.addEventListener('scroll',queueWidgetPosition);
  document.addEventListener('scroll',e=>{if(e.target.id==='app-screen')queueWidgetPosition();},true);

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
    return `<section class="secretary-tasks" aria-labelledby="secretary-tasks-${esc(c.id)}"><h3 id="secretary-tasks-${esc(c.id)}" class="${cinematic?'':'sr-only'}">${esc(t(cinematic?'Huomiot':'Tämän ajoneuvon tehtävät'))}</h3>${tasks.length?tasks.slice(0,featured).map((x,i)=>renderTask(x,i===0)).join(''):`<p class="task-empty" tabindex="-1" data-task-focus>${esc(t('Ei avoimia tehtäviä näiden tietojen perusteella.'))}</p>`}
      <details class="secretary-all-tasks" data-task-car="${esc(c.id)}"${open?' open':''}><summary><span>${esc(t(tasks.length?'Näytä kaikki tehtävät':'Tehtävien valinnat'))}</span>${tasks.length?`<span class="task-count">${tasks.length}</span>`:''}</summary><div class="secretary-task-list">${tasks.slice(featured).map(x=>renderTask(x)).join('')}</div><p class="task-help">${esc(t('Myöhemmin piilottaa tehtävän vuorokaudeksi. Ohitukset koskevat vain tätä laitetta.'))}</p><button type="button" class="task-reset" data-task-reset="${esc(c.id)}">${esc(t('Näytä siirretyt ja ohitetut tehtävät'))}</button>${coverage.total?`<p class="task-coverage">${coverage.complete}/${coverage.total} ${esc(t('viime tankkauksesta sisältää mittarilukeman'))}</p>`:''}</details></section>`;
  }
  document.addEventListener('click', e => {
    const mic=e.target.closest('[data-home-mic]');if(mic){const access=window.AjouraAccess?.check('ai.receipt'),available=access?.ok,supported=!!(window.SpeechRecognition||window.webkitSpeechRecognition),feedback=document.querySelector('.home-voice-feedback');
      if(available&&supported){voiceNotice='';if(feedback){feedback.textContent='';feedback.hidden=true;}return;}
      voiceNotice=available?'Puheentunnistus ei ole käytettävissä tässä selaimessa. Käytä näppäimistön sanelua tai kirjaa käsin.':access?.reason==='quota'?'Tämän kuun tunnistukset on käytetty. Kirjaa tiedot käsin.':'Puhekirjaus tarvitsee kirjautumisen ja käytössä olevan tekoälyavustajan. Voit kirjata tiedot käsin.';
      if(feedback){feedback.textContent=voiceNotice;feedback.hidden=false;positionWidget();}return;}
    const decision=e.target.closest('[data-task-later],[data-task-dismiss],[data-task-reset]');
    if(decision){
      const car=decision.closest('.vehicle-home-card')?.dataset.car;
      if(decision.dataset.taskReset)window.AjouraTasks.reset(decision.dataset.taskReset);
      else window.AjouraTasks.decide(decision.dataset.taskLater||decision.dataset.taskDismiss,decision.dataset.taskLater?'later':'dismiss');
      window.AjouraApp.refresh();
      const card=[...document.querySelectorAll('.vehicle-home-card')].find(el=>el.dataset.car===car);
      card?.querySelector('[data-task-focus]')?.focus({preventScroll:true});return;
    }
  });
  document.addEventListener('keydown',e=>{
    if(e.key!=='Escape')return;
    const panel=e.target.closest?.('.secretary-picker[open],.secretary-more[open],.task-details[open],.secretary-all-tasks[open]');
    if(panel?.open){e.preventDefault();panel.open=false;panel.querySelector('summary').focus({preventScroll:true});}
  });
  document.addEventListener('click',e=>{
    const card=e.target.closest('.vehicle-home-card'),changed=card&&selected!==card.dataset.car;
    if(card)selected=card.dataset.car;
    const button=e.target.closest('[data-vehicle-toggle]');
    if(!button){if(changed)window.AjouraApp.refreshNavigation();return;}
    const id=button.dataset.vehicleToggle;
    if(expandedVehicles.has(id))expandedVehicles.delete(id);else expandedVehicles.add(id);
    window.AjouraApp.refresh();
    [...document.querySelectorAll('[data-vehicle-toggle]')].find(b=>b.dataset.vehicleToggle===id)?.focus({preventScroll:true});
  },true);
  window.AjouraSecretary = {
    widget, mountWidget,
    selected:()=>selected,
    render({cars, card, vehicle, dates, insights, today, ai, speech, unit}) {
      ids=cars.map(c=>c.id);
      if (!ids.includes(selected)) selected=ids[0];
      const access=window.AjouraAccess?.check('ai.receipt');
      const cards=cars.map(c=>{
        const tasks=window.AjouraTasks.observe(c,dates(c),today,insights(c));
        const coverage=window.AjouraTasks.coverage(c),view=vehicle(c);
        const old=[...document.querySelectorAll('.vehicle-home-card')].find(el=>el.dataset.car===c.id);
        const options={available:!!(ai&&access?.ok),quotaBlocked:!!(ai&&access?.reason==='quota'),speech,tasks,moreOpen:!!old?.querySelector('.secretary-more')?.open,local:window.AjouraAssistant?.card(c)||'',view};
        return `<article class="vehicle-home-card status-${esc(view.tone)}" data-car="${esc(c.id)}">
          <div class="secretary-vehicle">${renderVehicleHero(c,view)}</div>
          ${renderAssistant(c,{...options,actionsOnly:true})}
          ${renderExpenses(c,view)}
          ${tasks.some(x=>x.kind==='Katsastus')?`<a class="home-inspection-alert" href="#vehicle/${esc(c.id)}">${actionIcon('calendar')}<span>${esc(t('Katsastuksen määräpäivä tarkistettava.'))}</span></a>`:''}
          <div class="vehicle-panels" id="vehicle-panels-${esc(c.id)}"${expandedVehicles.has(c.id)?'':' hidden'}>
            ${renderService(c,view,tasks,coverage)}${renderCostNotice(tasks)}${renderAssistant(c,{...options,hideActions:true})}
          </div></article>`;
      }).join('');
      return `<section class="secretary-home${isCinematic()?' secretary-cinematic':''} secretary-refined" aria-label="${esc(t('Autosihteeri'))}">
        <header class="cinematic-brand"><svg width="32" height="32" viewBox="0 0 32 32" fill="none" aria-hidden="true"><path d="M5 25 14 7q2-4 4 0l9 18q1 2-2 2h-8" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg><span class="cinematic-brand-name">Ajoura</span><a href="#newcar" aria-label="${esc(t('Lisää ajoneuvo'))}">+</a><a href="#me/tili" aria-label="Profiili ja tili"><svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 22v-3a8 8 0 0 1 16 0v3z"/></svg></a></header>
        ${cards}
        <a class="home-order text-link" href="#car-order">${esc(t('Järjestä ajoneuvot'))}</a>
      </section>`;
    }
  };
})();

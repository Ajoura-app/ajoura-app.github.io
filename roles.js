'use strict';
// AJOURA user types: car owner (asiakas, the default app), car workshop (huolto) and the AJOURA team
// (tiimi = Hannes and Niklas). Front-end only like the rest of the app: everything lives on this device.
// The team's feature switches come from features.json (published to everyone) plus changes made on
// this device in the team view. The team PIN only stops accidental opening; it is not real security.
(() => {
  const get = k => { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } };
  const set = (k, v) => { try { v === '' ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (e) {} };
  const tl = s => (window.AjouraI18n ? window.AjouraI18n.t(s) : s); // text outside the DOM (share sheet, SMS)
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = v => Number(v).toLocaleString('fi-FI', { maximumFractionDigits: 2 });
  const fdate = v => new Intl.DateTimeFormat('fi-FI').format(new Date(v + 'T12:00:00'));
  const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const svg = p => `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
  const ic = {
    wrench: '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L4 17l3 3 5.3-5.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.4-.6-.6-2.4z"/>',
    car: '<path d="M4 16v-4l2-5h12l2 5v4z"/><path d="M4 16v2.5M20 16v2.5M7 13h1.5M15.5 13H17"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M5.6 18.4l1.8-1.8M16.6 7.4l1.8-1.8"/>',
    user: '<circle cx="12" cy="8.5" r="3.5"/><path d="M5 20c1-4 4-6 7-6s6 2 7 6"/>',
    team: '<circle cx="9" cy="9" r="3"/><circle cx="16.5" cy="10" r="2.5"/><path d="M3.5 19c.8-3.4 3-5 5.5-5s4.7 1.6 5.5 5M14.5 14.6c2.6-.4 4.8 1 5.5 4.4"/>',
    lock: '<rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/>',
    send: '<path d="M4 12 20 4l-4 16-4-6.5z"/><path d="m12 13.5 8-9.5"/>',
    bell: '<path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 20.5h4"/>'
  };

  // ---- Feature switches -------------------------------------------------------------------------
  // [key, group, name, what it does, CSS selectors hidden when off]
  const FEATURES = [
    ['shop', 'yleinen', 'Autohuollon näkymä', 'Autohuolto yläkulman näkymävalikossa ja korjaamon työkalut.', ''],
    ['notice', 'yleinen', 'Tiedote käyttäjille', 'Alla kirjoittamasi tiedote näkyy kotinäkymän yläosassa.', ''],
    ['plate', 'asiakas', 'Rekisterihaku (demo)', 'Auton lisäys rekisteritunnuksella.', '[data-method="plate"]'],
    ['kinds', 'asiakas', 'Muut ajoneuvolajit', 'Moottoripyörät, mopot, mönkijät, kelkat, veneet ja muut laitteet ajoneuvon lisäyksessä.', ''],
    ['fuel', 'asiakas', 'Tankkauskirja', 'Tankkaukset, kulutus ja ajon hinta.', 'a[href^="#fuel/"],.fuel-cost,[data-quickfuel]'],
    ['report', 'asiakas', 'Huoltoraportti', 'Tulostettava historia esim. myyntiä varten.', 'a[href^="#report/"],.tab-bar a[href="#reports"]'],
    ['owner', 'asiakas', 'Omistajanvaihdos', 'Auton siirto uudelle omistajalle.', 'a[href^="#owner/"]'],
    ['tips', 'asiakas', 'Huoltovinkit', 'Merkki- ja mallikohtaiset huoltovinkit ajoneuvon sivulla.', '.tips-card'],
    ['calendar', 'asiakas', 'Kalenterimuistutukset', 'Huolto ja katsastus puhelimen kalenteriin.', '[data-ics]'],
    ['tyres', 'asiakas', 'Rengaskausimuistutus', 'Muistutus renkaiden vaihdosta syksyllä ja keväällä.', '.tyre-card,.tyre-chip'],
    ['import', 'asiakas', 'Merkinnät korjaamolta', 'Korjaamon lähettämän huoltomerkinnän tuonti.', '.r-import-box'],
    ['share', 'asiakas', 'Jakolinkit', 'Sovelluksen ja huoltohistorian jakaminen linkkinä.', '[data-sale],.me-data:has([data-share-app]),.menu-row[data-share-app]'],
    ['help', 'asiakas', 'Ohjeet', 'Usein kysytyt kysymykset ja haku Valikossa.', '.menu-row[href="#help"]'],
    ['tutorial', 'asiakas', 'Opastus', 'Ensimmäisen käynnistyksen opas ja sen uusinta.', '[data-tutorial]'],
    ['feedback', 'asiakas', 'Palaute', 'Palautelomake Valikossa ja ohjeissa.', '.menu-row[href="#feedback"],.me-data:has(#feedback-form),.help-contact #feedback-form'],
    ['video', 'asiakas', 'Esittelyvideo', 'Video tervetulonäkymässä.', '.welcome-video'],
    ['sample', 'asiakas', 'Esimerkkiauto', 'Valmis esimerkkiauto tyhjässä tallissa.', '[data-sample]'],
    ['theme', 'asiakas', 'Tumma teema', 'Vaalean ja tumman ulkoasun valinta.', '.seg:has([data-pref="Teema"])'],
    ['shopStats', 'huolto', 'Myyntiluvut', 'Kuukauden luovutetut työt ja myynti etusivulla.', ''],
    ['shopPrint', 'huolto', 'Työtilauksen tulostus', 'Työtilaus ja kuitti A4-tulosteena tai PDF:nä.', ''],
    ['shopHandoff', 'huolto', 'Luovutus asiakkaan AJOURAan', 'Valmis työ huoltomerkinnäksi asiakkaan sovellukseen.', ''],
    ['shopSamples', 'huolto', 'Esimerkkityöt', 'Valmiit esimerkkityöt tyhjään työjonoon.', '']
  ];
  const GROUPS = { yleinen: 'Yleiset', asiakas: 'Asiakkaat', huolto: 'Autohuollot' };
  const defaults = { features: Object.fromEntries(FEATURES.map(f => [f[0], true])), notice: '' };
  let published = { features: { ...defaults.features }, notice: '', updated: '', feedbackUrl: '' };
  // Feedback goes only to the team's own Google Apps Script web app (Hannes chose this 13.10.2026).
  const okUrl = u => typeof u === 'string' && /^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(u) ? u : '';
  const localKey = 'ajoura-features-local';
  const readLocal = () => { try { const v = JSON.parse(get(localKey)); return v && typeof v === 'object' ? { features: v.features || {}, notice: typeof v.notice === 'string' ? v.notice : undefined } : { features: {} }; } catch (e) { return { features: {} }; } };
  let local = readLocal();
  const saveLocal = () => { const empty = !Object.keys(local.features).length && local.notice === undefined; set(localKey, empty ? '' : JSON.stringify(local)); };
  const on = k => (k in local.features ? local.features[k] : published.features[k] !== false);
  const noticeText = () => (local.notice !== undefined ? local.notice : published.notice || '');

  const style = document.createElement('style');
  function applyFeatures() {
    const off = FEATURES.filter(f => f[4] && !on(f[0]));
    style.textContent = off.map(f => f[4].split(',').map(s => `html.r-cust ${s}`).join(',') + '{display:none!important}').join('\n') +
      (on('report') ? '' : '\nhtml.r-cust .tab-bar.four{grid-template-columns:repeat(3,1fr)}');
    if (!on('theme') && document.documentElement.classList.contains('dark')) document.documentElement.classList.remove('dark');
  }
  document.documentElement.classList.add('r-cust');
  (document.head || document.documentElement).appendChild(style);
  applyFeatures();
  fetch('features.json', { cache: 'no-cache' }).then(r => r.ok ? r.json() : null).then(data => {
    if (!data || typeof data.features !== 'object') return;
    const sig = () => JSON.stringify([published.features, published.notice, published.feedbackUrl, local]), before = sig();
    published = { features: { ...defaults.features, ...Object.fromEntries(Object.entries(data.features).filter(([k, v]) => k in defaults.features && typeof v === 'boolean')) }, notice: typeof data.notice === 'string' ? data.notice.slice(0, 240) : '', updated: typeof data.updated === 'string' ? data.updated : '', feedbackUrl: okUrl(data.feedbackUrl) };
    // Drop device changes that now match what is published.
    for (const k of Object.keys(local.features)) if (local.features[k] === published.features[k]) delete local.features[k];
    if (local.notice === published.notice) local.notice = undefined;
    saveLocal(); applyFeatures();
    if (before !== sig() && window.AjouraApp) window.AjouraApp.refresh();
  }).catch(() => {});

  // ---- Roles --------------------------------------------------------------------------------------
  const roleKey = 'ajoura-role', teamKey = 'ajoura-team';
  const teamOk = () => get(teamKey) === '1';
  const role = () => { const r = get(roleKey); return r === 'tiimi' ? (teamOk() ? 'tiimi' : 'asiakas') : r === 'huolto' && on('shop') ? 'huolto' : 'asiakas'; };
  const setRole = r => set(roleKey, r === 'asiakas' ? '' : r);
  const PIN_HASH = 'ffc1b2c37952cbecda2049510d6a6cf57c49c5a7011775e32173f99586490f52';
  async function checkPin(pin) {
    if (!window.crypto || !crypto.subtle) return false;
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('ajoura-tiimi:' + pin));
    return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('') === PIN_HASH;
  }

  const shopViews = ['shop', 'shopnew', 'shopjob', 'shopedit', 'shopcars', 'shopcar', 'shopset'];
  const ownViews = [...shopViews, 'admin', 'tuo'];
  const custOnly = { fuel: 'fuel', report: 'report', reports: 'report', owner: 'owner', help: 'help', feedback: 'feedback' };
  function redirect(view, id) {
    const r = role();
    if (shopViews.includes(view)) {
      if (!on('shop') && r !== 'tiimi') return window.AjouraApp && window.AjouraApp.cars().length ? 'home' : 'welcome';
      if (r === 'asiakas') setRole('huolto');
      return '';
    }
    if (ownViews.includes(view) || view === 'launcher' || view === 'welcome') return '';
    if (r === 'huolto') return 'shop';
    if (custOnly[view] && !on(custOnly[view])) return id ? 'vehicle/' + id : 'home';
    return '';
  }

  // ---- Workshop data ------------------------------------------------------------------------------
  const shopKey = 'ajoura-shop-v1';
  const STATUS = [['vastaanotettu', 'Vastaanotettu'], ['tyossa', 'Työn alla'], ['valmis', 'Valmis noudettavaksi'], ['luovutettu', 'Luovutettu']];
  const statusName = s => (STATUS.find(x => x[0] === s) || STATUS[0])[1];
  const JOB_TYPES = ['Huolto', 'Määräaikaishuolto', 'Vuosihuolto', 'Moottoriöljyn vaihto', 'Jarruhuolto', 'Ilmansuodattimen vaihto', 'Renkaiden vaihto', 'Akun vaihto', 'Polttimon vaihto', 'Korjaus', 'Osan vaihto', 'Pesu ja vahaus', 'Muu tapahtuma'];
  const CHECKS = ['Moottoriöljy', 'Öljynsuodatin', 'Ilmansuodatin', 'Raitisilmasuodatin', 'Polttoainesuodatin', 'Sytytystulpat', 'Jarruneste', 'Jäähdytysneste', 'Vaihteistoöljy', 'Jakohihna / -ketju', 'Apulaitehihna', 'Jarrupalat', 'Jarrulevyt', 'Akku tarkistettu', 'Valot tarkistettu', 'Pyyhkijät', 'Rengaspaineet', 'Huoltovälinäyttö nollattu'];
  const validJob = j => j && /^[\w-]{1,40}$/.test(j.id) && typeof j.plate === 'string' && typeof j.car === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(j.date) && STATUS.some(s => s[0] === j.status) && Array.isArray(j.parts) && Array.isArray(j.items) && (j.km == null || Number.isSafeInteger(j.km)) && (j.phone == null || typeof j.phone === 'string');
  function loadShop() {
    try { const d = JSON.parse(get(shopKey)); if (d && Array.isArray(d.jobs) && d.jobs.every(validJob) && Number.isSafeInteger(d.seq) && d.profile) return d; } catch (e) {}
    return { profile: { name: '', phone: '', address: '', ytunnus: '', rate: '' }, jobs: [], seq: 0 };
  }
  let shop = loadShop(), shopNote = '', handoff = null;
  const saveShop = () => { try { localStorage.setItem(shopKey, JSON.stringify(shop)); return true; } catch (e) { return false; } };
  const partsSum = j => j.parts.reduce((s, p) => s + (Number(p.price) || 0), 0);
  const labor = j => (Number(j.hours) || 0) * (Number(j.rate) || 0);
  const total = j => Math.round((partsSum(j) + labor(j) + (Number(j.other) || 0)) * 100) / 100;
  const samples = () => {
    const d = (n) => { const t = new Date(); t.setDate(t.getDate() - n); return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`; };
    return [
      { plate: 'LMN-456', car: 'Volkswagen Golf', year: '2015', customer: 'Matti Esimerkki', phone: '040 123 4567', km: 151200, date: d(0), type: 'Vuosihuolto', items: ['Moottoriöljy', 'Öljynsuodatin', 'Ilmansuodatin', 'Valot tarkistettu'], parts: [{ name: 'Moottoriöljy 5W-30', qty: '4,5 l', price: '62' }, { name: 'Öljynsuodatin', qty: '1', price: '18' }], hours: '1.5', rate: '78', other: '', note: 'Asiakas toivoo myös rengaspaineiden tarkistuksen. Kuvitteellinen esimerkkityö.', status: 'tyossa' },
      { plate: 'FIN-202', car: 'Škoda Octavia Combi', year: '2019', customer: 'Liisa Malli', phone: '050 765 4321', km: 98340, date: d(1), type: 'Jarruhuolto', items: ['Jarrupalat', 'Jarrulevyt', 'Jarruneste'], parts: [{ name: 'Jarrulevyt etu', qty: '2', price: '118' }, { name: 'Jarrupalat etu', qty: '1 sarja', price: '56' }], hours: '2', rate: '78', other: '12', note: 'Kuvitteellinen esimerkkityö.', status: 'valmis' },
      { plate: 'MKV-310', car: 'Toyota RAV4', year: '2022', customer: 'Pekka Testi', phone: '044 222 3333', km: 41200, date: d(0), type: 'Renkaiden vaihto', items: ['Rengaspaineet'], parts: [], hours: '0.5', rate: '78', other: '', note: 'Talvirenkaat alle, kesärenkaat hotelliin. Kuvitteellinen esimerkkityö.', status: 'vastaanotettu' }
    ];
  };
  const shopNav = view => `<nav class="tab-bar three" aria-label="Autohuollon valikko"><a href="#shop"${['shop', 'shopjob', 'shopnew', 'shopedit'].includes(view) ? ' aria-current="page"' : ''}>${svg(ic.wrench)}<span>Työt</span></a><a href="#shopcars"${['shopcars', 'shopcar'].includes(view) ? ' aria-current="page"' : ''}>${svg(ic.car)}<span>Asiakasautot</span></a><a href="#shopset"${view === 'shopset' ? ' aria-current="page"' : ''}>${svg(ic.gear)}<span>Korjaamo</span></a></nav>`;
  // View switcher in the top corner: Asiakas, Omistajat (PIN) and Autohuolto.
  const viewMenu = cur => `<details class="r-view-menu"><summary aria-label="Vaihda näkymää">${svg(cur === 'omistajat' ? ic.lock : cur === 'huolto' ? ic.wrench : ic.user)}<span>${cur === 'omistajat' ? 'Omistajat' : cur === 'huolto' ? 'Autohuolto' : 'Asiakas'}</span><b aria-hidden="true">▾</b></summary><div class="r-view-list" role="menu"><button type="button" role="menuitem" data-r-role="asiakas"${cur === 'asiakas' ? ' aria-current="true"' : ''}>${svg(ic.user)}<span><strong>Asiakas</strong><small>Oman auton huoltokirja</small></span></button><a role="menuitem" href="#admin"${cur === 'omistajat' ? ' aria-current="true"' : ''}>${svg(ic.lock)}<span><strong>Omistajat</strong><small>Hannes ja Niklas</small></span></a>${on('shop') || role() === 'tiimi' ? `<button type="button" role="menuitem" data-r-role="huolto"${cur === 'huolto' ? ' aria-current="true"' : ''}>${svg(ic.wrench)}<span><strong>Autohuolto</strong><small>Asiakasautot ja työt</small></span></button>` : ''}</div></details>`;
  // The view is chosen on the start page only; every view has a way back there. Nothing is logged out or lost.
  const startBtn = `<a class="r-start" href="#welcome" aria-label="Aloitussivulle">${svg('<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/>')}<span>Aloitussivu</span></a>`;
  const top = label => `<div class="app-top"><img class="app-brand" src="logo.svg" width="640" height="198" alt="AJOURA"><span class="r-top-right">${startBtn}<span class="demo-label">${label}</span></span></div>`;
  const noticeHtml = () => on('notice') && noticeText() ? `<div class="r-notice" role="note">${svg(ic.bell)}<p>${esc(noticeText())}</p></div>` : '';
  const jobRow = j => `<li><a class="event-row" href="#shopjob/${j.id}"><span class="event-symbol r-st-${j.status}" aria-hidden="true">${svg(ic.wrench)}</span><span><strong>${esc(j.plate)} · ${esc(j.type)}</strong><small>${esc(j.car)}${j.customer ? ' · ' + esc(j.customer) : ''} · ${fdate(j.date)}</small></span><span class="r-pill r-st-${j.status}">${esc(statusName(j.status).split(' ')[0])}</span></a></li>`;

  function shopHome() {
    const p = shop.profile, open = shop.jobs.filter(j => j.status === 'vastaanotettu' || j.status === 'tyossa'), ready = shop.jobs.filter(j => j.status === 'valmis');
    const month = today().slice(0, 7), handed = shop.jobs.filter(j => j.status === 'luovutettu' && (j.doneDate || j.date).startsWith(month));
    const sales = handed.reduce((s, j) => s + total(j), 0);
    const group = (st, title) => { const list = shop.jobs.filter(j => j.status === st).sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id)); return list.length ? `<div class="history-heading"><h3>${title}</h3><span class="r-count">${list.length}</span></div><ul class="event-list">${(st === 'luovutettu' ? list.slice(0, 6) : list).map(jobRow).join('')}</ul>` : ''; };
    return `${top('AUTOHUOLTO')}${noticeHtml()}<p class="app-greeting">${p.name ? esc(p.name) : 'Autohuolto'}</p><h2 class="app-heading">Työjono</h2>${shopNote ? `<p class="success-note" role="status">${esc(shopNote)}</p>` : ''}
      ${p.name ? '' : '<a class="reminder-card" href="#shopset"><span class="event-symbol" aria-hidden="true">' + svg(ic.gear) + '</span><div><span class="mini-label">ALOITA TÄSTÄ</span><strong>Lisää korjaamon tiedot</strong><small>Nimi ja yhteystiedot näkyvät työtilauksessa ja asiakkaalle lähtevässä merkinnässä.</small></div></a>'}
      <div class="app-stats ${on('shopStats') ? 'r-four' : 'three'}"><div><strong>${open.length}</strong><span>Jonossa</span></div><div><strong>${ready.length}</strong><span>Noudettavana</span></div><div><strong>${handed.length}</strong><span>Luovutettu kk</span></div>${on('shopStats') ? `<div><strong>${num(Math.round(sales))} €</strong><span>Myynti kk</span></div>` : ''}</div>
      <a class="app-button" href="#shopnew">＋ Uusi työ</a>
      ${shop.jobs.length ? group('tyossa', 'Työn alla') + group('vastaanotettu', 'Vastaanotettu') + group('valmis', 'Valmis noudettavaksi') + group('luovutettu', 'Luovutetut') : `<div class="r-empty"><p>Työjono on tyhjä. Kirjaa ensimmäinen asiakasauto painamalla Uusi työ.</p>${on('shopSamples') ? '<button class="app-button secondary" type="button" data-r-samples>Lisää kolme esimerkkityötä</button>' : ''}</div>`}
      <p class="app-fineprint">Korjaamon tiedot tallentuvat vain tähän laitteeseen. Asiakas saa työn omaan AJOURAansa luovutuslinkillä.</p>`;
  }

  function jobForm(j) {
    const v = j || { plate: '', car: '', year: '', customer: '', phone: '', km: null, date: today(), type: 'Huolto', items: [], parts: [], hours: '', rate: shop.profile.rate || '', other: '', note: '', status: 'vastaanotettu' };
    const parts = v.parts.length ? v.parts : [{ name: '', qty: '', price: '' }, { name: '', qty: '', price: '' }];
    const partRow = x => `<div class="part-row"><input name="partName" maxlength="60" placeholder="Osa, merkki tai tuotenumero" value="${esc(x.name)}" aria-label="Osa"><input name="partQty" maxlength="12" placeholder="esim. 4 l" value="${esc(x.qty)}" aria-label="Määrä"><input name="partPrice" type="number" min="0" step="0.01" inputmode="decimal" placeholder="€" value="${esc(x.price)}" aria-label="Hinta euroina"></div>`;
    return `<a class="app-back" href="${j ? '#shopjob/' + j.id : '#shop'}">← ${j ? 'Työ' : 'Työjono'}</a><h2 class="app-heading">${j ? 'Muokkaa työtä' : 'Uusi työ'}</h2>
      <form class="app-form" id="r-job-form" data-job="${j ? j.id : ''}" novalidate>
      <p class="form-title">Auto ja asiakas</p>
      <div class="form-row"><label>Rekisteritunnus<input name="plate" required maxlength="7" autocapitalize="characters" placeholder="ABC-123" value="${esc(v.plate)}"></label><label>Vuosimalli <small>· valinnainen</small><input name="year" type="number" min="1900" max="${new Date().getFullYear() + 1}" inputmode="numeric" value="${esc(v.year)}"></label></div>
      <label>Merkki ja malli<input name="car" required maxlength="60" placeholder="esim. Volvo V60" value="${esc(v.car)}"></label>
      <div class="form-row"><label>Asiakas<input name="customer" maxlength="60" autocomplete="off" placeholder="Nimi" value="${esc(v.customer)}"></label><label>Puhelin<input name="phone" type="tel" maxlength="20" autocomplete="off" placeholder="040…" value="${esc(v.phone)}"></label></div>
      <p class="form-title">Työ</p>
      <div class="form-row"><label>Päivä<input name="date" type="date" required value="${esc(v.date)}"></label><label>Mittarilukema<input name="km" type="number" min="0" max="2000000" inputmode="numeric" placeholder="km" value="${v.km === null || v.km === undefined ? '' : esc(v.km)}"></label></div>
      <div class="form-row"><label>Työn tyyppi<select name="type">${JOB_TYPES.map(t => `<option${t === v.type ? ' selected' : ''}>${t}</option>`).join('')}</select></label><label>Tila<select name="status">${STATUS.map(([k, n]) => `<option value="${k}"${k === v.status ? ' selected' : ''}>${n}</option>`).join('')}</select></label></div>
      <details class="check-set"${v.items.length ? ' open' : ''}><summary>Tehdyt toimenpiteet <small>· ${v.items.length ? v.items.length + ' valittu' : 'valitse'}</small></summary><div class="check-grid">${CHECKS.map(i => `<label class="check-item"><input type="checkbox" name="items" value="${i}"${v.items.includes(i) ? ' checked' : ''}><span>${i}</span></label>`).join('')}</div></details>
      <details class="check-set parts-set" open><summary>Varaosat ja työ</summary><div class="part-head"><span>Varaosa</span><span>Määrä</span><span>€</span></div><div class="part-rows">${parts.map(partRow).join('')}</div><button class="app-back" type="button" data-add-part>＋ Lisää rivi</button>
      <div class="form-row"><label>Työtunnit<input name="hours" type="number" min="0" max="200" step="0.25" inputmode="decimal" placeholder="0" value="${esc(v.hours)}"></label><label>Tuntihinta (€)<input name="rate" type="number" min="0" max="1000" step="0.5" inputmode="decimal" placeholder="0" value="${esc(v.rate)}"></label></div>
      <label>Muut kulut (€) <small>· esim. jätemaksu</small><input name="other" type="number" min="0" step="0.01" inputmode="decimal" placeholder="0" value="${esc(v.other)}"></label><p class="field-help" id="r-total">Yhteensä ${num(total(v))} € (sis. alv)</p></details>
      <label>Muistiinpano asiakkaalle<textarea name="note" maxlength="600" rows="3" placeholder="Mitä tehtiin, mitä kannattaa seurata…">${esc(v.note)}</textarea></label>
      <p class="error-note" id="r-error" role="alert"></p><button class="app-button" type="submit">${j ? 'Tallenna muutokset' : 'Tallenna työ'}</button></form>
      ${j ? `<button class="app-button secondary danger" type="button" data-r-delete="${j.id}">Poista työ</button>` : ''}`;
  }

  function jobView(j) {
    const p = shop.profile, next = { vastaanotettu: ['tyossa', 'Aloita työ'], tyossa: ['valmis', 'Merkitse valmiiksi'] }[j.status];
    const lines = [...j.parts.filter(x => x.name || x.price).map(x => [x.name || 'Varaosa', x.qty, Number(x.price) || 0]), ...(labor(j) ? [['Työ ' + num(j.hours) + ' h × ' + num(j.rate) + ' €', '', labor(j)]] : []), ...(Number(j.other) ? [['Muut kulut', '', Number(j.other)]] : [])];
    const sheet = `<div id="report" class="r-sheet"><header class="report-head"><img src="logo.svg" alt="AJOURA" width="640" height="198"><div><strong>Työtilaus ${esc(j.id.replace(/\D/g, ''))}</strong><span>${esc(p.name || 'Autohuolto')}</span><span>${fdate(j.date)}</span></div></header>
      <h2 class="app-heading">${esc(j.plate)}</h2><p class="app-subtitle">${esc(j.car)}${j.year ? ' · vm. ' + esc(j.year) : ''}${j.km !== null && j.km !== undefined ? ' · ' + num(j.km) + ' km' : ''}</p>
      <p class="r-status-line"><span class="r-pill r-st-${j.status}">${statusName(j.status)}</span>${j.handed ? ' Luovutettu ' + fdate((t => `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`)(new Date(j.handed))) : ''}</p>
      <dl class="detail-list"><div><dt>TYÖ</dt><dd>${esc(j.type)}</dd></div>${j.customer || j.phone ? `<div><dt>ASIAKAS</dt><dd>${esc(j.customer)}${j.phone ? ` · <a href="tel:${esc(j.phone.replace(/[^\d+]/g, ''))}">${esc(j.phone)}</a>` : ''}</dd></div>` : ''}
      ${j.items.length ? `<div><dt>TEHDYT TOIMENPITEET</dt><dd><ul class="done-list">${j.items.map(i => `<li>${esc(i)}</li>`).join('')}</ul></dd></div>` : ''}${j.note ? `<div><dt>MUISTIINPANO</dt><dd>${esc(j.note)}</dd></div>` : ''}</dl>
      ${lines.length ? `<table class="report-table r-lines"><thead><tr><th>Rivi</th><th>Määrä</th><th>€</th></tr></thead><tbody>${lines.map(l => `<tr><td>${esc(l[0])}</td><td>${esc(l[1])}</td><td>${num(l[2])}</td></tr>`).join('')}</tbody><tfoot><tr><td colspan="2"><strong>Yhteensä (sis. alv)</strong></td><td><strong>${num(total(j))}</strong></td></tr></tfoot></table>` : ''}
      <footer class="report-foot"><div><strong>${esc(p.name || 'Autohuolto')}</strong>${p.ytunnus ? `<span>Y-tunnus ${esc(p.ytunnus)}</span>` : ''}</div><div>${p.address ? `<span>${esc(p.address)}</span>` : ''}${p.phone ? `<span>${esc(p.phone)}</span>` : ''}</div><div><span>Tehty AJOURAlla</span></div></footer></div>`;
    const share = handoff && handoff.id === j.id ? `<div class="r-handoff" role="status"><p><strong>Luovutuslinkki on valmis.</strong> Lähetä se asiakkaalle esim. tekstiviestillä tai WhatsAppilla. Asiakas avaa linkin ja työ lisätään hänen AJOURAnsa huoltohistoriaan.</p><textarea readonly rows="3" aria-label="Luovutuslinkki" data-r-select>${esc(handoff.url)}</textarea><button class="app-button secondary" type="button" data-r-copy>Kopioi linkki</button>${j.phone ? `<a class="app-button secondary" href="sms:${esc(j.phone.replace(/[^\d+]/g, ''))}${/iPhone|iPad/.test(navigator.userAgent) ? '&' : '?'}body=${encodeURIComponent(tl('Autosi ' + j.plate + ' huoltotiedot AJOURAan: ' + handoff.url))}">Lähetä tekstiviestinä</a>` : ''}</div>` : '';
    return `<a class="app-back no-print" href="#shop">← Työjono</a>${shopNote ? `<p class="success-note no-print" role="status">${esc(shopNote)}</p>` : ''}${sheet}
      <div class="r-actions no-print">${next ? `<button class="app-button" type="button" data-r-status="${j.id}" data-to="${next[0]}">${next[1]}</button>` : ''}
      ${j.status === 'valmis' || j.status === 'luovutettu' ? (on('shopHandoff') ? `<button class="app-button${j.status === 'valmis' ? '' : ' secondary'}" type="button" data-r-handoff="${j.id}">${svg(ic.send)} ${j.status === 'valmis' ? 'Luovuta asiakkaalle' : 'Lähetä luovutuslinkki uudelleen'}</button>` : (j.status === 'valmis' ? `<button class="app-button" type="button" data-r-status="${j.id}" data-to="luovutettu">Merkitse luovutetuksi</button>` : '')) : ''}
      ${share}<a class="app-button secondary" href="#shopedit/${j.id}">Muokkaa työtä</a>${on('shopPrint') ? '<button class="app-button secondary" type="button" data-print>Tulosta työtilaus / PDF</button>' : ''}<a class="app-button secondary" href="#shopnew/${encodeURIComponent(j.plate)}">＋ Uusi työ tälle autolle</a></div>`;
  }

  const carsOf = () => { const m = new Map(); for (const j of [...shop.jobs].sort((a, b) => b.date.localeCompare(a.date))) { if (!m.has(j.plate)) m.set(j.plate, { plate: j.plate, car: j.car, customer: j.customer, phone: j.phone, last: j.date, jobs: [] }); m.get(j.plate).jobs.push(j); } return [...m.values()]; };
  function shopCars() {
    const list = carsOf();
    return `${top('AUTOHUOLTO')}<h2 class="app-heading">Asiakasautot</h2><p class="app-subtitle">Kaikki autot, joille on kirjattu työ.</p>${list.length ? `<label class="r-search"><span class="sr-only">Hae</span><input type="search" placeholder="Hae tunnuksella, mallilla tai nimellä" data-r-search></label><ul class="event-list" id="r-car-list">${list.map(c => `<li data-q="${esc((c.plate + ' ' + c.car + ' ' + c.customer).toLowerCase())}"><a class="event-row" href="#shopcar/${encodeURIComponent(c.plate)}"><span class="event-symbol" aria-hidden="true">${svg(ic.car)}</span><span><strong>${esc(c.plate)} · ${esc(c.car)}</strong><small>${c.customer ? esc(c.customer) + ' · ' : ''}${c.jobs.length} ${c.jobs.length === 1 ? 'käynti' : 'käyntiä'} · viimeksi ${fdate(c.last)}</small></span><span class="chevron" aria-hidden="true">›</span></a></li>`).join('')}</ul>` : '<div class="r-empty"><p>Ei vielä asiakasautoja. Ne kertyvät tähän töiden mukana.</p></div>'}`;
  }
  function shopCar(plate) {
    const c = carsOf().find(x => x.plate === plate);
    if (!c) return shopCars();
    const sum = c.jobs.reduce((s, j) => s + total(j), 0);
    return `<a class="app-back" href="#shopcars">← Asiakasautot</a><h2 class="app-heading">${esc(c.plate)}</h2><p class="app-subtitle">${esc(c.car)}${c.customer ? ' · ' + esc(c.customer) : ''}${c.phone ? ` · <a href="tel:${esc(c.phone.replace(/[^\d+]/g, ''))}">${esc(c.phone)}</a>` : ''}</p><div class="app-stats"><div><strong>${c.jobs.length}</strong><span>Käyntiä</span></div><div><strong>${num(Math.round(sum))} €</strong><span>Yhteensä</span></div></div><a class="app-button" href="#shopnew/${encodeURIComponent(c.plate)}">＋ Uusi työ tälle autolle</a><div class="history-heading"><h3>Käynnit</h3></div><ul class="event-list">${c.jobs.map(jobRow).join('')}</ul>`;
  }
  function shopSet() {
    const p = shop.profile;
    return `${top('AUTOHUOLTO')}<h2 class="app-heading">Korjaamo</h2>${shopNote ? `<p class="success-note" role="status">${esc(shopNote)}</p>` : ''}<form class="app-form" id="r-shop-form" novalidate><label>Korjaamon nimi<input name="name" maxlength="60" placeholder="esim. Autohuolto Esimerkki Oy" value="${esc(p.name)}"></label><div class="form-row"><label>Puhelin<input name="phone" type="tel" maxlength="20" value="${esc(p.phone)}"></label><label>Y-tunnus <small>· valinnainen</small><input name="ytunnus" maxlength="9" placeholder="1234567-8" value="${esc(p.ytunnus)}"></label></div><label>Osoite<input name="address" maxlength="80" value="${esc(p.address)}"></label><label>Oletustuntihinta (€) <small>· täyttyy uusiin töihin</small><input name="rate" type="number" min="0" max="1000" step="0.5" inputmode="decimal" value="${esc(p.rate)}"></label><button class="app-button" type="submit">Tallenna tiedot</button></form>
      <div class="me-data"><h3>Varmuuskopio</h3><p>Tallenna työt ja asiakasautot tiedostoon tai palauta ne toiselle laitteelle.</p><div class="backup-actions"><button class="app-button" type="button" data-r-backup>Tallenna varmuuskopio</button><label class="app-button secondary">Palauta varmuuskopio<input type="file" accept="application/json,.json" class="sr-only" data-r-restore></label></div></div>
      <div class="me-data"><h3>Käyttäjätyyppi</h3><p>Tämä laite on autohuollon tilassa. Vaihda asiakkaan näkymään, jos käytät AJOURAa omalle autollesi.</p><button class="app-button secondary" type="button" data-r-role="asiakas">Vaihda asiakkaan näkymään</button></div>
      <div class="me-data"><h3>Tietosi</h3><p>Asiakkaiden nimet ja puhelinnumerot ovat henkilötietoja. Ne pysyvät tässä laitteessa, eikä niitä lähetetä minnekään. Luovutuslinkkiin ei tule asiakkaan nimeä eikä puhelinnumeroa.</p><button class="app-button secondary danger" type="button" data-r-wipe>Poista korjaamon kaikki tiedot</button></div><p class="app-fineprint">Autohuollon näkymä on testiversio. Oikea monen käyttäjän järjestelmä vaatii tilit ja palvelimen.</p>`;
  }

  // ---- Workshop → customer handoff -----------------------------------------------------------------
  // Unique per job, so hand-over refs never collide between workshops or after a wipe.
  const uid = () => (crypto.randomUUID ? crypto.randomUUID().replace(/-/g, '') : Date.now().toString(36) + Math.random().toString(36).slice(2)).slice(0, 20);
  const b64 = s => btoa(String.fromCharCode(...new TextEncoder().encode(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const unb64 = s => new TextDecoder().decode(Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0)));
  function payloadOf(j) {
    const p = shop.profile, parts = j.parts.filter(x => x.name || x.price).map(x => ({ name: x.name, qty: x.qty, price: x.price ? String(x.price) : '' }));
    return { v: 1, ref: j.uid ? 'shop-' + j.uid : 'shop-' + (b64(p.name || 'huolto').slice(0, 12)) + '-' + j.id, shop: { name: p.name, phone: p.phone, address: p.address, ytunnus: p.ytunnus }, plate: j.plate, car: j.car, year: j.year, event: { type: j.type, date: j.date, km: j.km === undefined ? null : j.km, cost: String(total(j) || ''), labor: labor(j) ? String(Math.round(labor(j) * 100) / 100) : '', other: j.other ? String(j.other) : '', parts, items: j.items.filter(i => CHECKS.includes(i)), note: j.note } };
  }
  const appUrl = () => location.href.split('#')[0].split('?')[0].replace(/\/(index\.html)?$/, '/app.html');
  function parsePayload(code) {
    try {
      const d = JSON.parse(unb64(code));
      const e = d && d.event;
      if (d && typeof d.plate === 'string') { const p = d.plate.toUpperCase().replace(/[\s-]/g, ''), m = /^([A-ZÅÄÖ]{1,3})(\d{1,3})$/.exec(p); if (m) d.plate = m[1] + '-' + m[2]; }
      if (!d || d.v !== 1 || typeof d.plate !== 'string' || !/^[A-ZÅÄÖ]{1,3}-\d{1,3}$/.test(d.plate) || !e || !JOB_TYPES.includes(e.type) || !/^\d{4}-\d{2}-\d{2}$/.test(e.date) || isNaN(new Date(e.date + 'T12:00:00'))) return null;
      const str = (v, n) => typeof v === 'string' ? v.slice(0, n) : '';
      const money = v => typeof v === 'string' && v !== '' && Number.isFinite(Number(v)) && Number(v) >= 0 ? v : '';
      return { ref: str(d.ref, 80), shop: { name: str(d.shop && d.shop.name, 60), phone: str(d.shop && d.shop.phone, 20), address: str(d.shop && d.shop.address, 80) }, plate: d.plate, car: str(d.car, 60), year: /^\d{4}$/.test(String(d.year || '')) ? Number(d.year) : null,
        event: { type: e.type, date: e.date, km: Number.isSafeInteger(e.km) && e.km >= 0 ? e.km : null, cost: money(e.cost), labor: money(e.labor), other: money(e.other), parts: Array.isArray(e.parts) ? e.parts.slice(0, 30).map(x => ({ name: str(x && x.name, 60), qty: str(x && x.qty, 12), price: money(x && x.price) })) : [], items: Array.isArray(e.items) ? e.items.filter(i => CHECKS.includes(i)) : [], note: str(e.note, 600) } };
    } catch (err) { return null; }
  }
  const inKey = 'ajoura-huolto-in';
  // A handoff link opens app.html?huolto=CODE; keep the code for the session and show the import view.
  (() => { const m = /[?&]huolto=([\w-]+)/.exec(location.search); if (!m) return; try { sessionStorage.setItem(inKey, m[1]); } catch (e) {} const rest = location.search.replace(/[?&]huolto=[\w-]+/, '').replace(/^&/, '?'); history.replaceState(null, '', location.pathname + rest + '#tuo'); })();
  let importNote = '';
  function importView() {
    let code = ''; try { code = sessionStorage.getItem(inKey) || ''; } catch (e) {}
    const d = code && parsePayload(code), A = window.AjouraApp;
    if (!d || !A) return `${top('TESTIVERSIO')}<h2 class="app-heading">Huoltomerkintä</h2><p class="info-note">${importNote || 'Linkistä ei löytynyt huoltomerkintää. Pyydä korjaamoa lähettämään linkki uudelleen.'}</p><a class="app-button" href="#home">Kotinäkymään</a>`;
    if (!on('import')) return `${top('TESTIVERSIO')}<h2 class="app-heading">Huoltomerkintä</h2><p class="info-note">Korjaamon merkintöjen tuonti ei ole juuri nyt käytössä.</p><a class="app-button" href="#home">Kotinäkymään</a>`;
    const mine = A.cars().find(c => !c.sample && (!c.kind || c.kind === 'car') && c.plate === d.plate), dup = mine && mine.events.some(e => e.ref && e.ref === d.ref), e = d.event;
    return `${top('TESTIVERSIO')}<p class="app-greeting">${d.shop.name ? esc(d.shop.name) : 'Korjaamo'} lähetti</p><h2 class="app-heading">Huoltomerkintä autollesi</h2>
      <div class="r-import-card"><div class="r-import-head"><span class="plate-badge" aria-hidden="true"><b>FIN</b>${esc(d.plate)}</span><span>${esc(d.car)}${d.year ? ' · vm. ' + d.year : ''}</span></div>
      <dl class="detail-list"><div><dt>TYÖ</dt><dd>${esc(e.type)} · ${fdate(e.date)}${e.km !== null ? ' · ' + num(e.km) + ' km' : ''}</dd></div>${e.items.length ? `<div><dt>TEHDYT TOIMENPITEET</dt><dd><ul class="done-list">${e.items.map(i => `<li>${esc(i)}</li>`).join('')}</ul></dd></div>` : ''}${e.parts.length ? `<div><dt>VARAOSAT</dt><dd><ul class="done-list">${e.parts.map(x => `<li>${esc(x.name)}${x.qty ? ' · ' + esc(x.qty) : ''}${x.price ? ' · ' + num(x.price) + ' €' : ''}</li>`).join('')}</ul></dd></div>` : ''}${e.cost ? `<div><dt>HINTA</dt><dd>${num(e.cost)} €</dd></div>` : ''}${e.note ? `<div><dt>KORJAAMON MUISTIINPANO</dt><dd>${esc(e.note)}</dd></div>` : ''}<div><dt>KORJAAMO</dt><dd>${esc(d.shop.name || '–')}${d.shop.phone ? ' · ' + esc(d.shop.phone) : ''}${d.shop.address ? '<br>' + esc(d.shop.address) : ''}</dd></div></dl></div>
      ${dup ? `<p class="success-note">✓ Tämä merkintä on jo autosi historiassa.</p><a class="app-button" href="#vehicle/${mine.id}">Avaa ${esc(mine.nick || mine.name)}</a>` : `<p class="app-subtitle">${mine ? `Merkintä lisätään autosi <strong>${esc(mine.nick || mine.name)}</strong> huoltohistoriaan.` : `Autoa ${esc(d.plate)} ei ole vielä tallissasi. Se lisätään uutena autona, ja voit tarkentaa mallin ja ulkonäön myöhemmin.`}</p><button class="app-button" type="button" data-r-import>Lisää huoltohistoriaan</button><a class="app-button secondary" href="#home">Ei nyt</a>`}
      ${document.documentElement.classList.contains('standalone') ? '' : '<p class="app-fineprint">Käytätkö kotivalikkoon asennettua AJOURAa? Kopioi korjaamon linkki ja liitä se sovelluksessa kohtaan Valikko → Varmuuskopio ja tiedot → Merkintä korjaamolta.</p>'}`;
  }

  // ---- Feedback: sent to the team's Google Sheet (palaute-apps-script.gs) when features.json names it.
  // A copy also stays on this device, so the team view shows feedback given on the same phone.
  const fbLocalKey = 'ajoura-feedback-local', fbKeyKey = 'ajoura-feedback-key';
  const localFeedback = () => { try { const v = JSON.parse(get(fbLocalKey)); return Array.isArray(v) ? v : []; } catch (e) { return []; } };
  async function sendFeedback(msg, meta) {
    set(fbLocalKey, JSON.stringify([{ at: new Date().toISOString(), msg, meta, role: role() }, ...localFeedback()].slice(0, 50)));
    if (!published.feedbackUrl) return false;
    try { await fetch(published.feedbackUrl, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ msg, meta, role: role() }) }); return true; } catch (e) { return false; }
  }
  let fb = { state: '', rows: [] };
  async function loadFeedback() {
    const key = get(fbKeyKey); if (!published.feedbackUrl || !key) return;
    fb = { state: 'loading', rows: fb.rows }; if (location.hash === '#admin') rerender();
    try { const r = await fetch(published.feedbackUrl + '?key=' + encodeURIComponent(key)); const d = await r.json(); fb = d && d.ok && Array.isArray(d.rows) ? { state: 'ok', rows: d.rows.slice(0, 300) } : { state: 'badkey', rows: [] }; }
    catch (e) { fb = { state: 'error', rows: fb.rows }; }
    if (location.hash === '#admin') rerender();
  }
  const fbItem = r => { const t = new Date(r.at); return `<li class="r-fb"><p>${esc(r.msg)}</p><small>${isNaN(t) ? '' : t.toLocaleString('fi-FI', { day: 'numeric', month: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }) + ' · '}${r.role === 'huolto' ? 'autohuolto' : r.role === 'tiimi' ? 'omistaja' : 'asiakas'}${r.meta ? ' · ' + esc(r.meta) : ''}</small></li>`; };
  function feedbackBox() {
    const url = published.feedbackUrl, key = get(fbKeyKey), mine = localFeedback();
    let body;
    if (!url) body = '<p class="info-note">Palautteiden keräys odottaa vielä Google-taulukon kytkentää. Sen jälkeen kaikkien käyttäjien palautteet näkyvät tässä.</p>';
    else if (!key || fb.state === 'badkey') body = `${fb.state === 'badkey' ? '<p class="error-note" role="alert">Lukuavain ei kelpaa.</p>' : ''}<form class="app-form" id="r-fbkey-form" novalidate><label>Lukuavain <small>· syötetään kerran tälle laitteelle</small><input name="key" autocomplete="off" required></label><button class="app-button secondary" type="submit">Näytä palautteet</button></form>`;
    else body = `<div class="r-fb-head"><span>${fb.state === 'loading' ? 'Haetaan…' : fb.state === 'error' ? 'Haku epäonnistui. Tarkista verkkoyhteys.' : fb.rows.length + ' palautetta'}</span><button class="app-back" type="button" data-r-fbload>↻ Päivitä</button></div>${fb.rows.length ? `<ul class="r-fbs">${fb.rows.map(fbItem).join('')}</ul>` : fb.state === 'ok' ? '<p class="r-help">Ei vielä palautteita.</p>' : ''}`;
    return `<div class="me-data" id="r-feedback"><h3>Palautteet</h3>${body}${mine.length && (!url || !key) ? `<p class="mini-label">TÄLLÄ LAITTEELLA ANNETUT</p><ul class="r-fbs">${mine.map(fbItem).join('')}</ul>` : ''}</div>`;
  }

  // ---- Team view -----------------------------------------------------------------------------------
  let adminNote = '', pinError = '', exportText = '';
  function admin() {
    if (!teamOk()) return `${top('OMISTAJAT')}<div class="r-lock"><span class="r-lock-icon" aria-hidden="true">${svg(ic.lock)}</span><h2 class="app-heading">Omistajien näkymä</h2><p class="app-subtitle">Tämä näkymä on Hannekselle ja Niklakselle. Syötä PIN-koodi.</p><form class="app-form" id="r-pin-form" novalidate><label>PIN-koodi<input name="pin" type="password" inputmode="numeric" autocomplete="off" maxlength="12" required></label><p class="error-note" role="alert">${esc(pinError)}</p><button class="app-button" type="submit">Avaa</button></form><a class="app-button secondary" href="#welcome">← Takaisin</a><p class="app-fineprint">Lukko estää näkymän avaamisen vahingossa. Se ei ole oikea tietoturva: julkisella sivulla kuka tahansa taitava voi ohittaa sen. Oikea suojaus tulee käyttäjätilien myötä.</p></div>`;
    const changed = Object.keys(local.features).length + (local.notice !== undefined ? 1 : 0);
    const A = window.AjouraApp, cars = A ? A.cars().filter(c => !c.sample) : [], events = cars.reduce((s, c) => s + c.events.length, 0);
    const rows = g => FEATURES.filter(f => f[1] === g).map(([k, , name, help]) => { const mod = k in local.features; return `<label class="r-feat"><span><strong>${name}${mod ? ' <small class="r-mod">muutettu</small>' : ''}</strong><small>${help}</small></span><input type="checkbox" role="switch" data-r-feat="${k}"${on(k) ? ' checked' : ''}></label>`; }).join('');
    return `${top('OMISTAJAT')}<p class="app-greeting">Hei Hannes ja Niklas.</p><h2 class="app-heading">Omistajien näkymä</h2>${adminNote ? `<p class="success-note" role="status">${esc(adminNote)}</p>` : ''}
      <p class="mini-label">KATSO SOVELLUSTA</p><div class="r-views"><a href="#home">${svg(ic.user)}<strong>Asiakas</strong><small>Asiakkaan sovellus</small></a><a href="#shop">${svg(ic.wrench)}<strong>Autohuolto</strong><small>Korjaamon työkalut</small></a><a href="#welcome">${svg(ic.car)}<strong>Aloitus</strong><small>Ensimmäinen näkymä</small></a></div>
      <p class="r-help">Omistajina näette kaikki näkymät. Yläkulman Omistajat-merkistä pääsette aina takaisin tänne.</p>
      ${feedbackBox()}
      <div class="me-data"><h3>Ominaisuudet</h3><p>Kytke ominaisuuksia päälle ja pois. Muutos näkyy heti tällä laitteella, joten voit kokeilla sitä.</p>${changed ? `<p class="info-note"><strong>${changed} ${changed === 1 ? 'muutos' : 'muutosta'} vain tällä laitteella.</strong> Kun haluat muutoksen kaikille, paina Julkaise kaikille ja lähetä teksti Claudelle AJOURA-projektiin.</p>` : ''}
      ${Object.keys(GROUPS).map(g => `<p class="mini-label">${GROUPS[g].toUpperCase()}</p><div class="r-feats">${rows(g)}</div>`).join('')}
      <p class="mini-label">TIEDOTE KÄYTTÄJILLE</p><form class="app-form" id="r-notice-form"><label><span class="sr-only">Tiedote</span><textarea name="notice" maxlength="240" rows="2" placeholder="esim. Uusi versio: nyt voit lisätä useamman kuvan.">${esc(noticeText())}</textarea></label><button class="app-button secondary" type="submit">Tallenna tiedote</button></form>
      <div class="backup-actions"><button class="app-button" type="button" data-r-publish>Julkaise kaikille</button><button class="app-button secondary" type="button" data-r-revert${changed ? '' : ' disabled'}>Peru muutokset</button></div>
      ${exportText ? `<div class="r-handoff"><p><strong>Kopioitu leikepöydälle.</strong> Liitä tämä viestiin Claudelle AJOURA-projektissa ja pyydä julkaisemaan. Muutos tulee kaikille parissa minuutissa.</p><textarea readonly rows="6" data-r-select aria-label="Julkaistavat asetukset">${esc(exportText)}</textarea></div>` : ''}</div>
      <div class="me-data"><h3>Tilanne</h3><dl class="detail-list r-facts"><div><dt>VERSIO</dt><dd>${esc(A ? A.version : '')}</dd></div><div><dt>JULKAISTUT ASETUKSET</dt><dd>${published.updated ? fdate(published.updated) : 'oletukset'}</dd></div><div><dt>TÄLLÄ LAITTEELLA</dt><dd>${cars.length} autoa, ${events} merkintää, ${shop.jobs.length} korjaamon työtä</dd></div></dl>
      <p class="r-help">Käyttäjämääriä, palautteita tai muiden laitteiden tietoja ei näy vielä, koska AJOURA ei lähetä mitään palvelimelle. Ne tulevat käyttäjätilien ja pilven myötä.</p></div>
      <div class="me-data"><h3>Mitä vain te näette</h3><ul class="done-list"><li>Tämä omistajien näkymä, palautteet ja ominaisuuskytkimet</li><li>Tiedotteen kirjoitus kaikille käyttäjille</li><li>Kaikki kolme näkymää: asiakas, autohuolto ja aloitus</li><li>Laitteen tilanne ja versio</li></ul></div>
      <div class="me-data"><h3>Lukitse</h3><p>Lukitse, kun annat puhelimen jollekulle muulle. Seuraavalla kerralla tarvitaan PIN-koodi.</p><button class="app-button secondary danger" type="button" data-r-lock>Lukitse omistajien näkymä</button></div>`;
  }

  const guides = {
    shop: ['A / 03', 'Korjaamon työjono.', 'Autohuolto näkee asiakasautot ja työt yhdellä silmäyksellä: jonossa, työn alla ja noudettavana.'],
    shopnew: ['B / 03', 'Uusi työ.', 'Kirjaa auto, asiakas, toimenpiteet, varaosat ja työtunnit. Hinta lasketaan automaattisesti.'],
    shopedit: ['B / 03', 'Muokkaa työtä.', 'Päivitä toimenpiteet, osat ja tila työn edetessä.'],
    shopjob: ['C / 03', 'Luovuta asiakkaalle.', 'Valmis työ lähtee linkkinä asiakkaalle ja lisätään suoraan hänen AJOURAnsa huoltohistoriaan.'],
    shopcars: ['A / 03', 'Asiakasautot.', 'Jokainen auto, jolle on tehty työ, ja sen käynnit.'],
    shopcar: ['A / 03', 'Auton käynnit.', 'Auton kaikki käynnit korjaamolla ja niiden hinnat.'],
    shopset: ['A / 03', 'Korjaamon tiedot.', 'Nimi, yhteystiedot ja tuntihinta näkyvät työtilauksessa.'],
    admin: ['OMISTAJAT', 'Hanneksen ja Niklaksen näkymä.', 'Kytke ominaisuuksia päälle ja pois, kirjoita tiedote ja katso sovellusta kaikkien käyttäjätyyppien silmin.'],
    tuo: ['05 / 06', 'Merkintä korjaamolta.', 'Korjaamon lähettämä huolto lisätään autosi historiaan yhdellä napautuksella.']
  };
  const titles = { shop: 'Työjono', shopnew: 'Uusi työ', shopedit: 'Muokkaa työtä', shopjob: 'Työ', shopcars: 'Asiakasautot', shopcar: 'Asiakasauto', shopset: 'Korjaamo', admin: 'Omistajat', tuo: 'Huoltomerkintä' };
  function paint(screen, view, id) {
    const j = shop.jobs.find(x => x.id === id);
    let html;
    if (view === 'admin') { html = admin(); if (teamOk() && fb.state === '' && published.feedbackUrl && get(fbKeyKey)) setTimeout(loadFeedback, 0); }
    else if (view === 'tuo') html = importView();
    else if (view === 'shopnew') { const prev = id && carsOf().find(c => c.plate === decodeURIComponent(id)); html = jobForm(null); if (prev) html = html.replace(/(name="plate"[^>]*value=")"/, `$1${esc(prev.plate)}"`).replace(/(name="car"[^>]*value=")"/, `$1${esc(prev.car)}"`).replace(/(name="customer"[^>]*value=")"/, `$1${esc(prev.customer)}"`).replace(/(name="phone"[^>]*value=")"/, `$1${esc(prev.phone)}"`); }
    else if ((view === 'shopjob' || view === 'shopedit') && !j) { history.replaceState(null, '', '#shop'); view = 'shop'; html = shopHome(); }
    else if (view === 'shopjob') html = jobView(j);
    else if (view === 'shopedit') html = jobForm(j);
    else if (view === 'shopcars') html = shopCars();
    else if (view === 'shopcar') html = shopCar(decodeURIComponent(id));
    else if (view === 'shopset') html = shopSet();
    else html = shopHome();
    const tabs = shopViews.includes(view) && !['shopnew', 'shopedit'].includes(view) ? shopNav(view) : '';
    document.documentElement.classList.toggle('r-cust', !shopViews.includes(view));
    screen.innerHTML = '<div class="screen-content">' + html + '</div>' + tabs;
    screen.scrollTop = 0;
    const g = guides[view] || guides.shop, el = k => document.getElementById(k);
    if (el('guide-number')) { el('guide-number').textContent = g[0]; el('guide-title').textContent = g[1]; el('guide-copy').textContent = g[2]; document.querySelectorAll('[data-step]').forEach(s => s.classList.remove('active')); }
    document.title = 'AJOURA App — ' + (titles[view] || 'AJOURA');
    shopNote = ''; adminNote = ''; importNote = '';
    if (view !== 'shopjob') handoff = null;
    if (view !== 'admin') exportText = '';
  }

  // After app.js draws one of its own screens: role choice on the welcome screen, team chip, notice, import box.
  function after(view) {
    document.documentElement.classList.add('r-cust');
    const screen = document.getElementById('app-screen'); if (!screen) return;
    const t = screen.querySelector('.app-top');
    if (t && !t.querySelector('.r-view-menu,.r-start')) { const label = t.querySelector('.demo-label'), html = view === 'welcome' ? viewMenu(role() === 'huolto' ? 'huolto' : role() === 'tiimi' ? 'omistajat' : 'asiakas') : startBtn; if (label) label.outerHTML = `<span class="r-top-right">${html}${label.outerHTML}</span>`; else t.insertAdjacentHTML('beforeend', html); }
    if (view === 'home' && noticeHtml() && t && !screen.querySelector('.r-notice')) t.insertAdjacentHTML('afterend', noticeHtml());
    // Valikko → Varmuuskopio ja tiedot (#me): workshop entry under the backup card. Valikko → Asetukset: view choice.
    if (view === 'me' && !screen.querySelector('.r-import-box')) {
      const anchor = [...screen.querySelectorAll('.me-data')].find(x => x.querySelector('[data-backup]'));
      const box = `<div class="me-data r-import-box"><h3>Merkintä korjaamolta</h3><p>Sait korjaamolta huoltomerkinnän linkkinä? Liitä linkki tähän, niin työ lisätään autosi historiaan.</p><form class="app-form" id="r-paste-form" novalidate><label><span class="sr-only">Korjaamon linkki</span><input name="link" placeholder="https://…?huolto=…" autocomplete="off"></label><p class="error-note" role="alert"></p><button class="app-button secondary" type="submit">Avaa merkintä</button></form></div>`;
      if (anchor) anchor.insertAdjacentHTML('afterend', box); else screen.querySelector('.screen-content')?.insertAdjacentHTML('beforeend', box);
    }
    if (view === 'settings' && !screen.querySelector('.r-role-box')) screen.querySelector('.screen-content')?.insertAdjacentHTML('beforeend', `<div class="me-data r-role-box"><h3>Näkymä</h3><p>Asiakkaan, omistajien ja autohuollon näkymä valitaan aloitussivulta. Autosi ja merkintäsi pysyvät tallessa.</p><a class="app-button secondary" href="#welcome">Aloitussivulle</a></div>`);
  }

  // ---- Events --------------------------------------------------------------------------------------
  const rerender = (keep = true) => { const s = document.getElementById('app-screen'), y = s ? s.scrollTop : 0; if (window.AjouraApp) window.AjouraApp.refresh(); if (keep && s) s.scrollTop = y; };
  const go = h => { if (location.hash === '#' + h) rerender(false); else location.hash = h; };
  function readJob(form) {
    const f = new FormData(form), s = k => String(f.get(k) || '').trim();
    const names = f.getAll('partName'), qtys = f.getAll('partQty'), prices = f.getAll('partPrice');
    const parts = names.map((n, i) => ({ name: String(n).trim().slice(0, 60), qty: String(qtys[i] || '').trim().slice(0, 12), price: String(prices[i] || '').trim() })).filter(p => p.name || p.price);
    const km = s('km');
    return { plate: s('plate').toUpperCase(), car: s('car').slice(0, 60), year: s('year'), customer: s('customer').slice(0, 60), phone: s('phone').slice(0, 20), km: km === '' ? null : Number(km), date: s('date'), type: JOB_TYPES.includes(s('type')) ? s('type') : 'Huolto', status: STATUS.some(x => x[0] === s('status')) ? s('status') : 'vastaanotettu', items: f.getAll('items').map(String).filter(i => CHECKS.includes(i)), parts, hours: s('hours'), rate: s('rate'), other: s('other'), note: s('note').slice(0, 600) };
  }
  document.addEventListener('submit', async ev => {
    const form = ev.target; if (!form.id || !form.id.startsWith('r-')) return;
    ev.preventDefault();
    const err = form.querySelector('.error-note');
    if (form.id === 'r-pin-form') {
      const ok = await checkPin(String(new FormData(form).get('pin') || '').trim());
      if (!ok) { pinError = 'Väärä PIN-koodi.'; rerender(); return; }
      pinError = ''; set(teamKey, '1'); setRole('tiimi'); adminNote = 'Omistajien näkymä avattu tällä laitteella.'; rerender(false);
    } else if (form.id === 'r-job-form') {
      const v = readJob(form), money = x => x === '' || (Number.isFinite(Number(x)) && Number(x) >= 0);
      const bad = !/^[A-ZÅÄÖ]{1,3}-\d{1,3}$/.test(v.plate) ? 'Tarkista rekisteritunnus (esim. ABC-123).' : !v.car ? 'Kirjoita auton merkki ja malli.' : !/^\d{4}-\d{2}-\d{2}$/.test(v.date) ? 'Valitse päivä.' : (v.km !== null && (!Number.isSafeInteger(v.km) || v.km < 0 || v.km > 2000000)) ? 'Tarkista mittarilukema.' : (v.year && !/^\d{4}$/.test(v.year)) ? 'Tarkista vuosimalli.' : ![v.hours, v.rate, v.other, ...v.parts.map(p => p.price)].every(money) ? 'Tarkista hinnat ja tunnit.' : '';
      if (bad) { form.querySelector('#r-error').textContent = bad; return; }
      const id = form.dataset.job; let j = id && shop.jobs.find(x => x.id === id);
      if (j) Object.assign(j, v); else { j = { id: 'job' + (++shop.seq), uid: uid(), created: Date.now(), ...v }; shop.jobs.push(j); }
      if (j.status === 'luovutettu') { if (!j.doneDate) j.doneDate = today(); j.handed = j.handed || Date.now(); }
      saveShop(); shopNote = id ? '✓ Muutokset tallennettu.' : '✓ Työ lisätty jonoon.'; go('shopjob/' + j.id);
    } else if (form.id === 'r-shop-form') {
      const f = new FormData(form), s = k => String(f.get(k) || '').trim();
      shop.profile = { name: s('name').slice(0, 60), phone: s('phone').slice(0, 20), address: s('address').slice(0, 80), ytunnus: s('ytunnus').slice(0, 9), rate: Number.isFinite(Number(s('rate'))) && Number(s('rate')) >= 0 ? s('rate') : '' };
      saveShop(); shopNote = '✓ Korjaamon tiedot tallennettu.'; rerender();
    } else if (form.id === 'r-notice-form') {
      const text = String(new FormData(form).get('notice') || '').trim().slice(0, 240);
      local.notice = text === (published.notice || '') ? undefined : text; saveLocal(); adminNote = text ? '✓ Tiedote tallennettu tälle laitteelle.' : '✓ Tiedote poistettu tältä laitteelta.'; rerender();
    } else if (form.id === 'r-fbkey-form') {
      set(fbKeyKey, String(new FormData(form).get('key') || '').trim().slice(0, 60)); fb = { state: '', rows: [] }; loadFeedback();
    } else if (form.id === 'r-paste-form') {
      const m = /[?&]huolto=([\w-]+)/.exec(String(new FormData(form).get('link') || ''));
      if (!m || !parsePayload(m[1])) { err.textContent = 'Linkistä ei löytynyt huoltomerkintää. Kopioi koko linkki korjaamon viestistä.'; return; }
      try { sessionStorage.setItem(inKey, m[1]); } catch (e) {} go('tuo');
    }
  });
  // Enter in a workshop form moves to the next field instead of saving a half-filled job.
  document.addEventListener('keydown', ev => { if (ev.key !== 'Enter' || !ev.target.matches || !ev.target.matches('#r-job-form input:not([type=checkbox]),#r-shop-form input:not([type=checkbox])')) return; ev.preventDefault(); const f = [...ev.target.form.querySelectorAll('input:not([type=hidden]):not([disabled]),select:not([disabled]),textarea')].filter(x => x.offsetParent), n = f[f.indexOf(ev.target) + 1]; if (n) n.focus(); else ev.target.blur(); });
  document.addEventListener('keydown', ev => { if (ev.key !== 'Escape') return; const m = document.querySelector('.r-view-menu[open]'); if (m) { m.open = false; m.querySelector('summary').focus(); } });
  document.addEventListener('click', async ev => {
    const t = ev.target; if (!t.closest || !t.closest('#app-screen')) return;
    // Starting as a car owner from the start page leaves the workshop view.
    if (t.closest('[data-start]') && role() === 'huolto') setRole('asiakas');
    const r = t.closest('[data-r-role]');
    if (r) {
      const want = r.dataset.rRole;
      if (want === 'huolto') { if (role() !== 'tiimi') setRole('huolto'); go('shop'); }
      else if (want === 'asiakas') { if (role() !== 'tiimi') setRole('asiakas'); const m = r.closest('details'); if (m) m.open = false; const h = location.hash.slice(1).split('/')[0]; if (!(shopViews.includes(h) || h === 'admin' || h === 'welcome')) return; if (h === 'welcome' && !(window.AjouraApp && window.AjouraApp.cars().length)) { window.AjouraApp && window.AjouraApp.refresh(); return; } go(window.AjouraApp && window.AjouraApp.cars().length ? 'home' : 'welcome'); }
      return;
    }
    if (t.closest('[data-r-samples]')) { for (const s of samples()) shop.jobs.push({ id: 'job' + (++shop.seq), uid: uid(), created: Date.now(), ...s }); saveShop(); shopNote = '✓ Kolme kuvitteellista esimerkkityötä lisätty.'; rerender(false); return; }
    const st = t.closest('[data-r-status]');
    if (st) { const j = shop.jobs.find(x => x.id === st.dataset.rStatus); if (j) { j.status = st.dataset.to; if (j.status === 'luovutettu') { j.doneDate = today(); j.handed = j.handed || Date.now(); } saveShop(); shopNote = '✓ Tila: ' + statusName(j.status) + '.'; rerender(); } return; }
    const ho = t.closest('[data-r-handoff]');
    if (ho) {
      const j = shop.jobs.find(x => x.id === ho.dataset.rHandoff); if (!j) return;
      const url = appUrl() + '?huolto=' + b64(JSON.stringify(payloadOf(j)));
      if (j.status !== 'luovutettu') { j.status = 'luovutettu'; j.doneDate = today(); j.handed = Date.now(); saveShop(); }
      handoff = { id: j.id, url };
      if (navigator.share) { navigator.share({ title: tl('AJOURA – huoltomerkintä'), text: tl(`Autosi ${j.plate} huoltotiedot AJOURAan` + (shop.profile.name ? ` (${shop.profile.name}):` : ':')), url }).catch(() => {}); }
      const keep = handoff; rerender(); handoff = keep; return;
    }
    if (t.closest('[data-r-copy]')) { const ta = document.querySelector('[data-r-select]'); if (ta) { ta.select(); navigator.clipboard?.writeText(ta.value).then(() => { t.closest('[data-r-copy]').textContent = '✓ Kopioitu'; }).catch(() => document.execCommand && document.execCommand('copy')); } return; }
    const del = t.closest('[data-r-delete]');
    if (del) { if (!confirm('Poistetaanko työ?')) return; shop.jobs = shop.jobs.filter(x => x.id !== del.dataset.rDelete); saveShop(); shopNote = '✓ Työ poistettu.'; go('shop'); return; }
    if (t.closest('[data-r-wipe]')) { if (!confirm('Poistetaanko korjaamon kaikki työt ja tiedot tästä laitteesta?')) return; set(shopKey, ''); shop = loadShop(); shopNote = '✓ Korjaamon tiedot poistettu.'; go('shop'); return; }
    if (t.closest('[data-r-backup]')) { const blob = new Blob([JSON.stringify({ app: 'AJOURA', kind: 'autohuolto', version: 1, saved: new Date().toISOString(), shop })], { type: 'application/json' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'ajoura-autohuolto-' + today() + '.json'; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000); return; }
    if (t.closest('[data-r-import]')) {
      let code = ''; try { code = sessionStorage.getItem(inKey) || ''; } catch (e) {}
      const d = parsePayload(code), A = window.AjouraApp; if (!d || !A) return;
      const res = A.importService(d);
      if (!res) { importNote = 'Merkintää ei voitu lisätä. Tarkista, että autossa on tilaa uusille merkinnöille.'; rerender(); return; }
      try { sessionStorage.removeItem(inKey); } catch (e) {}
      if (role() === 'huolto') setRole('asiakas');
      A.notify('✓ Korjaamon huoltomerkintä lisätty historiaan.'); go('vehicle/' + res.car); return;
    }
    if (t.closest('[data-r-fbload]')) { loadFeedback(); return; }
    if (t.closest('[data-r-lock]')) { set(teamKey, ''); setRole('asiakas'); go(window.AjouraApp && window.AjouraApp.cars().length ? 'home' : 'welcome'); return; }
    if (t.closest('[data-r-revert]')) { local = { features: {} }; saveLocal(); applyFeatures(); adminNote = '✓ Laitteen muutokset peruttu. Käytössä julkaistut asetukset.'; rerender(); return; }
    if (t.closest('[data-r-publish]')) {
      const cfg = { updated: today(), ...(published.feedbackUrl ? { feedbackUrl: published.feedbackUrl } : {}), features: Object.fromEntries(FEATURES.map(f => [f[0], on(f[0])])), notice: noticeText() };
      const off = FEATURES.filter(f => !on(f[0])).map(f => f[2]);
      exportText = `Julkaise AJOURAn asetukset kaikille (features.json):\nPois päältä: ${off.length ? off.join(', ') : 'ei mitään'}\nTiedote: ${cfg.notice || '(ei tiedotetta)'}\n\n${JSON.stringify(cfg, null, 1)}`;
      try { await navigator.clipboard.writeText(exportText); } catch (e) {}
      rerender(); return;
    }
  });
  document.addEventListener('change', ev => {
    const t = ev.target;
    const f = t.closest && t.closest('[data-r-feat]');
    if (f) { const k = f.dataset.rFeat; if (f.checked === (published.features[k] !== false)) delete local.features[k]; else local.features[k] = f.checked; saveLocal(); applyFeatures(); rerender(); return; }
    if (t.matches && t.matches('[data-r-restore]')) {
      const file = t.files && t.files[0]; t.value = ''; if (!file) return;
      file.text().then(txt => { const d = JSON.parse(txt); if (!d || d.app !== 'AJOURA' || d.kind !== 'autohuolto' || !d.shop || !Array.isArray(d.shop.jobs) || !d.shop.jobs.every(validJob)) throw 0;
        const have = new Set(shop.jobs.map(j => j.id)); let added = 0; for (const j of d.shop.jobs) { const m = /(\d+)$/.exec(j.id); if (m) shop.seq = Math.max(shop.seq, Number(m[1])); }
        for (const j of d.shop.jobs) { const i = shop.jobs.findIndex(x => x.id === j.id), mine = shop.jobs[i];
          // Same number from another device but a different job: keep both instead of overwriting.
          if (mine && ((mine.uid && j.uid) ? mine.uid === j.uid : mine.created === j.created)) shop.jobs[i] = j; else { shop.jobs.push(mine ? { ...j, id: 'job' + (++shop.seq) } : j); added++; } }
        if (!shop.profile.name && d.shop.profile) shop.profile = { ...shop.profile, ...d.shop.profile }; saveShop(); shopNote = `✓ Varmuuskopio palautettu: ${added} uutta työtä.`; rerender(); })
        .catch(() => { shopNote = 'Tiedostoa ei voitu lukea. Valitse AJOURAn autohuollon varmuuskopio.'; rerender(); });
    }
  });
  document.addEventListener('input', ev => {
    const t = ev.target;
    if (t.matches && t.matches('[data-r-search]')) { const q = t.value.trim().toLowerCase(); document.querySelectorAll('#r-car-list li').forEach(li => { li.hidden = !!q && !li.dataset.q.includes(q); }); return; }
    const form = t.closest && t.closest('#r-job-form');
    if (form) { const out = form.querySelector('#r-total'); if (out) out.textContent = 'Yhteensä ' + num(total(readJob(form))) + ' € (sis. alv)'; }
  });
  document.addEventListener('click', ev => { document.querySelectorAll('.r-view-menu[open]').forEach(m => { if (!m.contains(ev.target) || ev.target.closest('a,button')) m.open = false; }); }, true);
  document.addEventListener('focusin', ev => { if (ev.target.matches && ev.target.matches('[data-r-select]')) ev.target.select(); });

  window.AjouraRoles = { sendFeedback, feedbackOnline: () => !!published.feedbackUrl, owns: v => ownViews.includes(v), redirect, paint, after, role, feature: on, features: FEATURES };
})();

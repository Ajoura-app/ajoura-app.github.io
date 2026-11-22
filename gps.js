'use strict';
// AJOURA GPS (2.32, GPS-suunnitelman vaiheet 2d–2f): auton sijainti ja reitit Kartalla sekä Ajopäiväkirja.
// Vain lukeminen: tiedot haetaan gps-traccar-funktiosta (Supabase), joka tarkistaa kirjautumisen ja omistajuuden
// jokaisessa pyynnössä. Selaimeen ei koskaan tule Traccar-tunnusta. Mitään ei tallenneta pilveen eikä laitteelle:
// vastaukset pidetään vain muistissa (sivun ollessa auki), ja laitteelle jää vain valittu GPS-laite (näkymäasetus).
// Ajojen luokittelu (työ/yksityinen), muistiinpanot ja vienti tulevat vaiheessa 3 (pysyvä ajopäiväkirja, kysy ensin).
// Ajat näytetään Suomen ajassa (Europe/Helsinki); GPS-matka ei ole matkamittarin lukema.
(() => {
  const TZ = 'Europe/Helsinki';
  const LAITE_KEY = 'ajoura-gps-laite', KORTTI_KEY = 'ajoura-gps-kortti';
  const POSITION_MS = 60 * 1000, TRIPS_MS = 5 * 60 * 1000, TIMEOUT_MS = 15000;
  const KUNNAT_URL = 'kartta-data/kunnat.json';
  const get = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const set = (k, v) => { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { /* yksityinen tila */ } };
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const svg = p => `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
  const ICON = {
    auto: '<path d="M5 16V11l2-5h10l2 5v5"/><path d="M3 16h18v3H3z"/><circle cx="7.5" cy="16" r="1.5"/><circle cx="16.5" cy="16" r="1.5"/>',
    reitti: '<circle cx="6" cy="19" r="2"/><circle cx="18" cy="5" r="2"/><path d="M8 19h7a3 3 0 0 0 0-6H9a3 3 0 0 1 0-6h7"/>',
    kirja: '<path d="M12 6.5C10.4 5.3 8 4.8 4 5v13c4 0 6.4.5 8 1.6 1.6-1.1 4-1.6 8-1.6V5c-4-.2-6.4.3-8 1.5z"/><path d="M12 6.5v13"/>',
    keskita: '<circle cx="12" cy="12" r="3.2"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>',
    ala: '<path d="m6 9 6 6 6-6"/>', yla: '<path d="m6 15 6-6 6 6"/>',
    vasen: '<path d="m15 6-6 6 6 6"/>', oikea: '<path d="m9 6 6 6-6 6"/>'
  };

  // ---- Ajat Suomen ajassa ----
  const osat = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
  function paikallinen(ms) { // {y, m, d, h, min} Helsingin aikaa
    const o = {}; for (const p of osat.formatToParts(new Date(ms))) o[p.type] = p.value;
    return { y: +o.year, m: +o.month, d: +o.day, h: +o.hour, min: +o.minute, s: +o.second };
  }
  // Helsingin paikallisen päivän alku UTC-hetkenä (huomioi kesäajan).
  function keskiyo(y, m, d) {
    let t = Date.UTC(y, m - 1, d);
    for (let i = 0; i < 2; i++) { const p = paikallinen(t); t -= Date.UTC(p.y, p.m - 1, p.d, p.h, p.min, p.s) - Date.UTC(y, m - 1, d); }
    return t;
  }
  const pvm = ms => { const p = paikallinen(ms); return `${p.d}.${p.m}.${p.y}`; };
  const klo = ms => { const p = paikallinen(ms); return `${p.h}.${String(p.min).padStart(2, '0')}`; };
  const km = m => m === null || m === undefined ? '–' : m < 10000 ? `${(m / 1000).toFixed(1).replace('.', ',')} km` : `${Math.round(m / 1000).toLocaleString('fi-FI')} km`;
  const kmTasan = m => m === null || m === undefined ? '–' : `${Math.round(m / 1000).toLocaleString('fi-FI')} km`;
  const kesto = s => { if (!Number.isFinite(s)) return '–'; const h = Math.floor(s / 3600), min = Math.round((s % 3600) / 60); return h ? `${h} h ${String(min).padStart(2, '0')} min` : `${Math.max(1, min)} min`; };
  const sitten = s => s < 90 ? 'juuri nyt' : s < 3600 ? `${Math.round(s / 60)} min sitten` : s < 86400 ? `${Math.round(s / 3600)} h sitten` : `${Math.round(s / 86400)} vrk sitten`;

  // ---- Palvelin ----
  class GpsVirhe extends Error { constructor(status, code) { super(code || String(status)); this.status = status; this.code = code || ''; } }
  async function api(action, params = {}) {
    const S = window.AjouraSync;
    if (!S || !S.enabled || !S.account || !S.account()) throw new GpsVirhe(401, 'kirjaudu');
    const token = await S.accessToken();
    if (!token) throw new GpsVirhe(401, 'kirjaudu');
    const q = new URLSearchParams({ action, ...params });
    const ctl = window.AbortController ? new AbortController() : null, t = ctl && setTimeout(() => ctl.abort(), TIMEOUT_MS);
    let res;
    try {
      res = await fetch(`${S.base}/functions/v1/gps-traccar?${q}`, { headers: { apikey: S.apiKey, Authorization: 'Bearer ' + token }, cache: 'no-store', signal: ctl ? ctl.signal : undefined });
    } catch (e) { throw new GpsVirhe(0, 'verkko'); } finally { clearTimeout(t); }
    let body = null; try { body = await res.json(); } catch (e) { /* ei JSONia */ }
    if (!res.ok || !body || body.ok !== true) throw new GpsVirhe(res.status, body && body.error);
    return body;
  }
  const virheteksti = e => !e ? '' : e.code === 'ei_laitteita' ? 'Tiliin ei ole liitetty GPS-laitetta.' : e.status === 0 ? 'GPS-tietoja ei saatu: ei verkkoyhteyttä.' : e.status === 401 || e.status === 403 ? 'GPS-tiedot eivät ole käytettävissä tällä tilillä.'
    : e.code === 'traccar_auth' ? 'GPS-palvelun tunnus ei kelpaa. Tarkista Traccar-tunnus Supabasessa.' : e.code === 'traccar_timeout' ? 'GPS-palvelu ei vastannut ajoissa. Yritä hetken päästä uudelleen.'
    : e.status === 429 ? 'Liian monta hakua. Yritä hetken päästä uudelleen.' : 'GPS-tietoja ei saatu juuri nyt.';

  // Vain muistissa pidettävät vastaukset.
  const muisti = new Map();
  function muistista(avain, ika, hae) {
    const m = muisti.get(avain);
    if (m && (m.p || Date.now() - m.at < ika)) return m.p || Promise.resolve(m.v);
    const p = hae().then(v => { muisti.set(avain, { at: Date.now(), v }); return v; }, e => { muisti.delete(avain); throw e; });
    muisti.set(avain, { at: 0, p });
    return p;
  }
  const laitteet = () => muistista('laitteet', 10 * 60 * 1000, () => api('devices').then(b => (b.devices || []).filter(d => Number.isSafeInteger(d.id))));
  async function laite() {
    const l = await laitteet();
    if (!l.length) throw new GpsVirhe(404, 'ei_laitteita');
    const v = Number(get(LAITE_KEY));
    return l.find(d => d.id === v) || l[0];
  }
  const sijainti = id => muistista('pos:' + id, POSITION_MS - 5000, () => api('position', { device: String(id) }).then(b => b.position));
  const isoUtc = ms => new Date(Math.floor(ms / 1000) * 1000).toISOString().replace('.000Z', 'Z');
  function ajot(id, from, to) {
    const nyt = Date.now(); to = Math.min(to, nyt);
    if (to <= from) return Promise.resolve([]);
    return muistista(`trips:${id}:${from}:${to > nyt - 60000 ? 'nyt' : to}`, TRIPS_MS, () => api('trips', { device: String(id), from: isoUtc(from), to: isoUtc(to) })
      .then(b => (b.trips || []).filter(t => t && Date.parse(t.start) && Date.parse(t.end)).map(t => ({ ...t, s: Date.parse(t.start), e: Date.parse(t.end) }))));
  }
  const reitti = (id, t) => muistista(`route:${id}:${t.s}:${t.e}`, 60 * 60 * 1000, () => api('route', { device: String(id), from: isoUtc(t.s - 60000), to: isoUtc(Math.min(t.e + 60000, Date.now())) }));
  const pysahdykset = (id, from, to) => muistista(`stops:${id}:${from}`, TRIPS_MS, () => api('stops', { device: String(id), from: isoUtc(from), to: isoUtc(Math.min(to, Date.now())) }).then(b => b.stops || []));

  // ---- Paikannimet: a) kunta Tilastokeskuksen kuntarajoista (laitteessa), b) Traccarin osoite, c) "Ajo klo 11.52" ----
  let kunnat = null, kunnatTila = 'idle';
  function lataaKunnat() {
    if (kunnatTila !== 'idle') return Promise.resolve();
    kunnatTila = 'loading';
    return fetch(KUNNAT_URL, { cache: 'no-cache' }).then(r => r.ok ? r.json() : null).then(d => {
      kunnat = d && d.meta && d.meta.versio === 1 && Array.isArray(d.kunnat) ? d.kunnat.filter(k => Array.isArray(k) && typeof k[0] === 'string' && Array.isArray(k[1]) && Array.isArray(k[2])) : [];
      kunnatTila = 'ok';
    }).catch(() => { kunnat = []; kunnatTila = 'ok'; });
  }
  function sisalla(lon, lat, rengas) { // rengas: [lon, lat, lon, lat, ...]
    let in_ = false;
    for (let i = 0, j = rengas.length - 2; i < rengas.length; j = i, i += 2) {
      const xi = rengas[i], yi = rengas[i + 1], xj = rengas[j], yj = rengas[j + 1];
      if ((yi > lat) !== (yj > lat) && lon < (xj - xi) * (lat - yi) / (yj - yi) + xi) in_ = !in_;
    }
    return in_;
  }
  function kunta(piste) {
    if (!piste || !kunnat) return '';
    const [lat, lon] = piste;
    for (const [nimi, bb, polyt] of kunnat) {
      if (lon < bb[0] || lat < bb[1] || lon > bb[2] || lat > bb[3]) continue;
      if (polyt.some(p => Array.isArray(p) && p.length && sisalla(lon, lat, p[0]) && !p.slice(1).some(r => sisalla(lon, lat, r)))) return nimi;
    }
    return '';
  }
  const lyhytOsoite = a => typeof a === 'string' && a ? a.split(',')[0].trim() : '';
  const paikka = (piste, osoite) => kunta(piste) || lyhytOsoite(osoite);
  function otsikko(t) {
    const a = paikka(t.startPoint, t.startAddress), b = paikka(t.endPoint, t.endAddress);
    return a && b ? `${a} → ${b}` : `Ajo klo ${klo(t.s)}`;
  }

  // ---- Kartta: auton sijainti, tunnusluvut, viimeisin ajo ja reitti ----
  const REITTI = 'ajoura-gps-reitti';
  let k = null; // { map, ML, box, run, marker, timer, laite, pos, ajotKk, viimeisin, reittiAjo, virhe }
  function liita(map, ML, box) {
    irrota();
    k = { map, ML, box, run: {}, marker: null, timer: 0, laite: null, pos: null, ajotKk: null, viimeisin: null, reittiAjo: null, virhe: null, lataa: true };
    lataaKunnat().then(() => k && piirra());
    paivita();
    k.timer = setInterval(() => { if (document.visibilityState === 'visible') paivita(); }, POSITION_MS);
    map.on('style.load', reittiKartalle);
  }
  // Sama kartta, uusi näkymäelementti (sovelluksen uudelleenpiirto): kortti piirretään uuteen elementtiin.
  function siirra(box) { if (!k) return; k.box = box; piirra(); }
  function irrota() {
    if (!k) return;
    clearInterval(k.timer);
    if (k.marker) try { k.marker.remove(); } catch (e) { /* kartta jo poistettu */ }
    k = null;
  }
  async function paivita() {
    const my = k; if (!my) return;
    try {
      my.laite = await laite();
      const nyt = Date.now(), p = paikallinen(nyt), kk = keskiyo(p.y, p.m, 1);
      const [pos, lista] = await Promise.all([sijainti(my.laite.id), ajot(my.laite.id, kk, nyt)]);
      if (k !== my) return;
      my.pos = pos; my.ajotKk = lista; my.viimeisin = lista[0] || null; my.virhe = null;
      // Viimeisin ajo voi olla edelliseltä kuulta: haetaan edellinen kuukausi vain tarvittaessa.
      if (!my.viimeisin) { const e = ajot(my.laite.id, Math.max(kk - 31 * 86400000, nyt - 31 * 86400000), kk); my.viimeisin = (await e)[0] || null; }
    } catch (e) { if (k !== my) return; my.virhe = e; }
    if (k !== my) return;
    my.lataa = false;
    autoKartalle(); piirra();
  }
  function autoKartalle() {
    if (!k || !k.pos || !k.pos.point) { if (k && k.marker) { k.marker.remove(); k.marker = null; } return; }
    const [lat, lon] = k.pos.point;
    if (!k.marker) {
      const el = document.createElement('div');
      el.className = 'kartta-auto'; el.setAttribute('aria-hidden', 'true');
      el.innerHTML = svg(ICON.auto);
      k.marker = new k.ML.Marker({ element: el });
    }
    k.marker.getElement().classList.toggle('vanha', !k.pos.fresh);
    k.marker.setLngLat([lon, lat]).addTo(k.map);
  }
  function tila() {
    if (!k || k.lataa) return { luokka: 'haetaan', teksti: 'Haetaan GPS-tietoja…' };
    if (k.virhe) return { luokka: 'virhe', teksti: virheteksti(k.virhe) };
    if (!k.pos) return { luokka: 'ei', teksti: 'Ei sijaintitietoa' };
    if (k.pos.fresh) return { luokka: 'ok', teksti: 'Yhdistetty' };
    return { luokka: 'vanha', teksti: `Viimeisin sijainti ${sitten(k.pos.ageSeconds)}` };
  }
  function piirra() {
    if (!k || !k.box.isConnected) return;
    const auki = get(KORTTI_KEY) !== 'kiinni', st = tila(), nyt = Date.now(), tanaan = keskiyo(...Object.values(paikallinen(nyt)).slice(0, 3));
    const summa = l => l ? l.reduce((a, t) => a + (t.distanceM || 0), 0) : null;
    const tama = k.ajotKk ? k.ajotKk.filter(t => t.s >= tanaan) : null;
    const v = k.viimeisin, nimi = k.laite && k.laite.name ? esc(k.laite.name) : 'GPS';
    const pos = k.pos;
    const otsake = `<div class="gps-otsake"><span class="gps-tila gps-tila-${st.luokka}" aria-hidden="true"></span><span class="gps-tila-teksti" role="status">${esc(st.teksti)}</span><span class="gps-laite">${nimi}</span>
      ${pos && pos.point ? `<button type="button" class="gps-nappi" data-gps-keskita aria-label="Näytä auto kartalla">${svg(ICON.keskita)}</button>` : ''}
      <button type="button" class="gps-nappi" data-gps-kortti aria-expanded="${auki}" aria-label="${auki ? 'Pienennä GPS-tiedot' : 'Näytä GPS-tiedot'}">${svg(auki ? ICON.ala : ICON.yla)}</button></div>`;
    let runko = '';
    if (k.reittiAjo) {
      const t = k.reittiAjo;
      runko = `<p class="gps-pieni">${svg(ICON.reitti)} ${t === k.viimeisin ? 'Viimeisin ajo' : pvm(t.s)}</p><h3 class="gps-ajo-otsikko">${esc(otsikko(t))}</h3>
        <dl class="gps-luvut kolme"><div><dt>Matka</dt><dd>${km(t.distanceM)}</dd></div><div><dt>Kesto</dt><dd>${kesto(t.durationS)}</dd></div><div><dt>Keskinopeus</dt><dd>${t.avgSpeedKmh === null ? '–' : t.avgSpeedKmh + ' km/h'}</dd></div></dl>
        <p class="gps-merkit"><span class="gps-merkki">Luokittelematon</span><span class="gps-merkki">Tunnistettu automaattisesti (Traccar)</span></p>
        <div class="gps-toiminnot"><a class="app-button" href="#ajot/${esc(ajoId(k.laite.id, t))}">${svg(ICON.kirja)} Ajon tiedot</a><button type="button" class="app-button secondary" data-gps-reitti-pois>Sulje reitti</button></div>`;
    } else if (auki && !k.lataa && !k.virhe) {
      runko = `<dl class="gps-luvut"><div><dt>Viimeisin päivitys</dt><dd>${pos ? klo(Date.parse(pos.fixTime)) : '–'}</dd></div><div><dt>Nopeus</dt><dd>${pos && pos.fresh && pos.speedKmh !== null ? pos.speedKmh + ' km/h' : '–'}</dd></div>
        <div><dt>Tänään</dt><dd>${km(summa(tama))}</dd></div><div><dt>Kuukausi</dt><dd>${kmTasan(summa(k.ajotKk))}</dd></div></dl>
        ${v ? `<div class="gps-viimeisin"><p class="gps-pieni">${svg(ICON.reitti)} Viimeisin ajo · ${pvm(v.s)}</p><h3 class="gps-ajo-otsikko">${esc(otsikko(v))}</h3><p class="gps-pieni">${km(v.distanceM)} · ${kesto(v.durationS)}</p>
          <div class="gps-toiminnot"><a class="app-button" href="#ajot">${svg(ICON.kirja)} Avaa ajopäiväkirja</a><button type="button" class="app-button secondary" data-gps-reitti>${svg(ICON.reitti)} Näytä reitti</button></div></div>`
          : '<p class="gps-pieni gps-tyhja">Ei ajoja viimeisen kuukauden aikana.</p><div class="gps-toiminnot"><a class="app-button secondary" href="#ajot">Avaa ajopäiväkirja</a></div>'}`;
    } else if (auki && k.virhe) {
      runko = '<div class="gps-toiminnot"><button type="button" class="app-button secondary" data-gps-uudelleen>Yritä uudelleen</button></div>';
    }
    k.box.innerHTML = otsake + runko;
    k.box.hidden = false;
    k.box.dispatchEvent(new CustomEvent('gps-koko', { bubbles: true }));
  }
  function ajoId(laiteId, t) { return `${laiteId}-${Math.floor(t.s / 1000)}-${Math.floor(t.e / 1000)}`; }
  async function naytaReitti(t) {
    const my = k; if (!my || !my.laite) return;
    my.reittiAjo = t; piirra();
    try {
      const r = await reitti(my.laite.id, t);
      if (k !== my || my.reittiAjo !== t) return;
      my.reittiData = r; reittiKartalle(); sovita(my.map, r.points);
    } catch (e) { if (k === my) { my.reittiAjo = null; my.virhe = e; piirra(); } }
  }
  function reittiKartalle() {
    if (!k || !k.map.isStyleLoaded()) return;
    piirraReitti(k.map, k.reittiAjo && k.reittiData ? k.reittiData.points : null);
  }
  // Reittiviiva sekä lähtö- ja saapumispiste (vihreä ja sininen) kartalle; null poistaa.
  function piirraReitti(map, pisteet) {
    for (const id of [REITTI + '-pisteet', REITTI + '-reuna', REITTI]) if (map.getLayer(id)) map.removeLayer(id);
    for (const id of [REITTI, REITTI + '-pisteet']) if (map.getSource(id)) map.removeSource(id);
    if (!pisteet || pisteet.length < 2) return;
    const coords = pisteet.map(p => [p[1], p[0]]);
    map.addSource(REITTI, { type: 'geojson', data: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: coords } } });
    map.addSource(REITTI + '-pisteet', { type: 'geojson', data: { type: 'FeatureCollection', features: [
      { type: 'Feature', properties: { r: 'lahto' }, geometry: { type: 'Point', coordinates: coords[0] } },
      { type: 'Feature', properties: { r: 'maali' }, geometry: { type: 'Point', coordinates: coords[coords.length - 1] } }] } });
    map.addLayer({ id: REITTI + '-reuna', type: 'line', source: REITTI, layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#ffffff', 'line-width': 7, 'line-opacity': .85 } });
    map.addLayer({ id: REITTI, type: 'line', source: REITTI, layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#1769f4', 'line-width': 4 } });
    map.addLayer({ id: REITTI + '-pisteet', type: 'circle', source: REITTI + '-pisteet', paint: { 'circle-radius': 7, 'circle-color': ['match', ['get', 'r'], 'lahto', '#2b8a3e', '#1769f4'], 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 2.5 } });
  }
  function sovita(map, pisteet) {
    if (!pisteet || !pisteet.length) return;
    let a = [180, 90, -180, -90];
    for (const [lat, lon] of pisteet) a = [Math.min(a[0], lon), Math.min(a[1], lat), Math.max(a[2], lon), Math.max(a[3], lat)];
    const el = map.getContainer(), ala = parseFloat(getComputedStyle(el.closest('.kartta') || el).getPropertyValue('--kartta-saatimet')) || 40;
    map.fitBounds([[a[0], a[1]], [a[2], a[3]]], { padding: { top: 130, bottom: ala + 20, left: 30, right: 70 }, maxZoom: 15, duration: matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 600 });
  }

  // ---- Ajopäiväkirja ja ajon tiedot (2.32) ----
  const KK = ['tammikuu', 'helmikuu', 'maaliskuu', 'huhtikuu', 'toukokuu', 'kesäkuu', 'heinäkuu', 'elokuu', 'syyskuu', 'lokakuu', 'marraskuu', 'joulukuu'];
  const VKP = ['ma', 'ti', 'ke', 'to', 'pe', 'la', 'su'];
  let pk = { jakso: 'kk', ank: null, valinta: null }; // jakso: pv | vk | kk; ankkuri: {y, m, d}
  const isoDay = (y, m, d) => new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = su
  function jaksoRaja(j, a) {
    if (j === 'pv') return { from: keskiyo(a.y, a.m, a.d), to: keskiyo(a.y, a.m, a.d + 1), paivat: 1 };
    if (j === 'vk') { const ma = a.d - ((isoDay(a.y, a.m, a.d) + 6) % 7); return { from: keskiyo(a.y, a.m, ma), to: keskiyo(a.y, a.m, ma + 7), paivat: 7, alku: ma }; }
    const n = new Date(Date.UTC(a.y, a.m, 0)).getUTCDate();
    return { from: keskiyo(a.y, a.m, 1), to: keskiyo(a.y, a.m + 1, 1), paivat: n, alku: 1 };
  }
  function siirra(j, a, suunta) {
    const t = new Date(Date.UTC(a.y, a.m - 1 + (j === 'kk' ? suunta : 0), j === 'kk' ? 1 : a.d + (j === 'vk' ? 7 : 1) * suunta));
    return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() };
  }
  function jaksoNimi(j, a, r) {
    if (j === 'kk') return `${KK[a.m - 1][0].toUpperCase() + KK[a.m - 1].slice(1)} ${a.y}`;
    if (j === 'pv') return `${VKP[(isoDay(a.y, a.m, a.d) + 6) % 7]} ${a.d}.${a.m}.${a.y}`;
    const b = paikallinen(r.to - 1); const c = paikallinen(r.from);
    return `Viikko ${c.d}.${c.m}.–${b.d}.${b.m}.${b.y}`;
  }
  const tanaanA = () => { const p = paikallinen(Date.now()); return { y: p.y, m: p.m, d: p.d }; };
  // Valittu päivä ei voi olla tulevaisuudessa (esim. viikkoja selatessa tai jaksoa vaihdettaessa).
  const rajaa = a => keskiyo(a.y, a.m, a.d) > Date.now() ? tanaanA() : a;

  // Pylväskaavio päivittäisistä kilometreistä (SVG). Sama tieto taulukkona alla (ruudunlukija ja tarkat luvut).
  function kaavio(r, lista) {
    if (r.paivat === 1) return '';
    const paivat = [];
    for (let i = 0; i < r.paivat; i++) {
      const p = paikallinen(r.from + i * 86400000 + 3 * 3600000), a = keskiyo(p.y, p.m, p.d), b = keskiyo(p.y, p.m, p.d + 1);
      paivat.push({ p, m: lista.filter(t => t.s >= a && t.s < b).reduce((s, t) => s + (t.distanceM || 0), 0), tuleva: a > Date.now() });
    }
    const max = Math.max(1000, ...paivat.map(x => x.m)), askel = max <= 20000 ? 5000 : max <= 80000 ? 20000 : max <= 200000 ? 50000 : 100000, yla = Math.ceil(max / askel) * askel;
    const W = 320, H = 140, T = 16, L = 34, B = 18, lev = (W - L) / paivat.length;
    const viivat = []; for (let v = 0; v <= yla; v += askel) { const y = (H - B) - (H - B - T) * v / yla; viivat.push(`<line x1="${L}" x2="${W}" y1="${y}" y2="${y}" class="gps-kaavio-viiva"/><text x="${L - 4}" y="${y + 3}" text-anchor="end" class="gps-kaavio-teksti">${v / 1000}</text>`); }
    const palkit = paivat.map((x, i) => { const h = (H - B - T) * x.m / yla, nayta = r.paivat === 7 || i === 0 || (x.p.d % 5 === 0 && x.p.d < 30); return `${x.m ? `<rect x="${L + i * lev + lev * .18}" y="${H - B - h}" width="${lev * .64}" height="${h}" rx="1.5" class="gps-kaavio-palkki"/>` : ''}${nayta ? `<text x="${L + i * lev + lev / 2}" y="${H - 4}" text-anchor="middle" class="gps-kaavio-teksti">${r.paivat === 7 ? VKP[i] : x.p.d + '.'}</text>` : ''}`; }).join('');
    const taulukko = `<details class="gps-taulukko"><summary>Näytä taulukkona</summary><table><thead><tr><th scope="col">Päivä</th><th scope="col">Matka</th></tr></thead><tbody>${paivat.filter(x => !x.tuleva).map(x => `<tr><td>${x.p.d}.${x.p.m}.</td><td>${km(x.m)}</td></tr>`).join('')}</tbody></table></details>`;
    return `<figure class="gps-kaavio"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Ajetut kilometrit päivittäin"><text x="2" y="8" class="gps-kaavio-teksti">km</text>${viivat.join('')}${palkit}</svg></figure>${taulukko}`;
  }
  function ajoRivi(laiteId, t) {
    return `<li><a class="gps-ajo" href="#ajot/${esc(ajoId(laiteId, t))}"><span class="gps-ajo-teksti"><small>${pvm(t.s)} · ${klo(t.s)}–${klo(t.e)}</small><strong>${esc(otsikko(t))}</strong><small>${km(t.distanceM)} · ${kesto(t.durationS)} · Luokittelematon</small></span><span class="gps-nuoli" aria-hidden="true">${svg(ICON.oikea)}</span></a></li>`;
  }
  let pkAjo = 0;
  function paivakirja(el) {
    const ajo = ++pkAjo;
    if (!pk.ank) pk.ank = tanaanA();
    const r = jaksoRaja(pk.jakso, pk.ank), eiSeuraavaa = r.to > Date.now();
    const valinnat = [['pv', 'Päivä'], ['vk', 'Viikko'], ['kk', 'Kuukausi']].map(([j, n]) => `<button type="button" role="tab" aria-selected="${pk.jakso === j}" data-gps-jakso="${j}">${n}</button>`).join('');
    el.innerHTML = `<div class="gps-jaksot" role="tablist" aria-label="Jakso">${valinnat}</div>
      <section class="gps-kooste"><div class="gps-kooste-yla"><h3>${esc(jaksoNimi(pk.jakso, pk.ank, r))}</h3><span class="gps-selaa"><button type="button" class="gps-nappi" data-gps-siirra="-1" aria-label="Edellinen jakso">${svg(ICON.vasen)}</button><button type="button" class="gps-nappi" data-gps-siirra="1" aria-label="Seuraava jakso"${eiSeuraavaa ? ' disabled' : ''}>${svg(ICON.oikea)}</button></span></div>
      <div class="gps-lataus" role="status">Haetaan ajoja…</div></section><ol class="gps-ajot"></ol>`;
    lataaKunnat().then(() => laite()).then(d => ajot(d.id, r.from, r.to).then(lista => ({ d, lista }))).then(({ d, lista }) => {
      if (ajo !== pkAjo || !el.isConnected) return;
      const yht = lista.reduce((s, t) => s + (t.distanceM || 0), 0), aika = lista.reduce((s, t) => s + (t.durationS || 0), 0);
      el.querySelector('.gps-lataus').outerHTML = `<dl class="gps-luvut kolme"><div><dt>Ajot yhteensä</dt><dd>${pk.jakso === 'kk' ? kmTasan(yht) : km(yht)}</dd></div><div><dt>Ajoja</dt><dd>${lista.length}</dd></div><div><dt>Ajoaika</dt><dd>${kesto(aika)}</dd></div></dl>
        <p class="gps-pieni">Kaikki ajot ovat luokittelemattomia. Työ- ja yksityisajojen luokittelu tulee myöhemmin. GPS-matka ei ole matkamittarin lukema.</p>${kaavio(r, lista)}`;
      el.querySelector('.gps-ajot').outerHTML = lista.length ? `<ol class="gps-ajot">${lista.map(t => ajoRivi(d.id, t)).join('')}</ol>` : '<p class="gps-tyhja-jakso">Ei ajoja tällä jaksolla.</p>';
      if (pk.jakso === 'pv' && lista.length) el.insertAdjacentHTML('beforeend', '<button type="button" class="app-button secondary gps-pysahdykset-nappi" data-gps-pysahdykset>Näytä pysähdykset</button><div class="gps-pysahdykset"></div>');
    }).catch(e => {
      if (ajo !== pkAjo || !el.isConnected) return;
      if (e && (e.status === 401 || e.status === 403)) window.AjouraKartta && window.AjouraKartta.checkGps();
      const l = el.querySelector('.gps-lataus'); if (l) l.outerHTML = `<p class="gps-virhe" role="alert">${esc(virheteksti(e))}</p><button type="button" class="app-button secondary" data-gps-pk-uudelleen>Yritä uudelleen</button>`;
    });
  }
  async function naytaPysahdykset(el) {
    const box = el.querySelector('.gps-pysahdykset'), nappi = el.querySelector('[data-gps-pysahdykset]');
    if (!box) return;
    nappi.disabled = true; box.innerHTML = '<p class="gps-lataus" role="status">Haetaan pysähdyksiä…</p>';
    try {
      const d = await laite(), r = jaksoRaja('pv', pk.ank), l = await pysahdykset(d.id, r.from, r.to);
      box.innerHTML = l.length ? `<h3>Pysähdykset</h3><ol class="gps-pysahdys-lista">${l.map(s => { const a = Date.parse(s.start), b = Date.parse(s.end); return `<li><strong>${klo(a)}–${klo(b)}</strong> ${esc(paikka(s.point, s.address) || 'Pysähdys')} <small>${kesto(s.durationS)}</small></li>`; }).join('')}</ol>` : '<p class="gps-pieni">Ei pysähdyksiä.</p>';
      nappi.remove();
    } catch (e) { box.innerHTML = `<p class="gps-virhe" role="alert">${esc(virheteksti(e))}</p>`; nappi.disabled = false; }
  }

  // Ajon tiedot: #ajot/<laite>-<alku>-<loppu> (sekunteina). Ajo haetaan uudelleen palvelimelta, joten linkki toimii myös
  // uudelleenlatauksen jälkeen, eikä mitään tarvitse tallentaa laitteelle.
  let tMap = null;
  function tiedot(el, id, ML) {
    irrotaTiedot();
    const m = /^(\d{1,10})-(\d{9,11})-(\d{9,11})$/.exec(id || '');
    if (!m) { el.innerHTML = '<p class="gps-virhe" role="alert">Ajoa ei löytynyt.</p>'; return; }
    const laiteId = Number(m[1]), s = Number(m[2]) * 1000, e = Number(m[3]) * 1000, my = {};
    tMap = my;
    el.innerHTML = '<div class="gps-tiedot-kartta"></div><p class="gps-lataus" role="status">Haetaan ajon tietoja…</p>';
    Promise.all([lataaKunnat(), laitteet()]).then(([, l]) => {
      if (!l.some(d => d.id === laiteId)) throw new GpsVirhe(404, 'device');
      return ajot(laiteId, s - 60000, e + 60000);
    }).then(lista => {
      if (tMap !== my || !el.isConnected) return;
      const t = lista.find(x => Math.abs(x.s - s) < 1000 && Math.abs(x.e - e) < 1000);
      if (!t) { el.querySelector('.gps-lataus').outerHTML = '<p class="gps-virhe" role="alert">Ajoa ei löytynyt. Se on voinut poistua GPS-palvelun historiasta.</p>'; return; }
      const h1 = el.closest('.screen-content').querySelector('.gps-tiedot-otsikko'); if (h1) h1.textContent = otsikko(t);
      const rivi = (n, v) => v ? `<div><dt>${n}</dt><dd>${v}</dd></div>` : '';
      const lahto = [klo(t.s), esc(paikka(t.startPoint, t.startAddress))].filter(Boolean).join(' '), maali = [klo(t.e), esc(paikka(t.endPoint, t.endAddress))].filter(Boolean).join(' ');
      el.querySelector('.gps-lataus').outerHTML = `<dl class="gps-tiedot">${rivi('Päivämäärä', pvm(t.s))}${rivi('Lähtö', lahto)}${t.startAddress ? rivi('Lähtöosoite', esc(t.startAddress)) : ''}${rivi('Saapuminen', maali)}${t.endAddress ? rivi('Saapumisosoite', esc(t.endAddress)) : ''}
        ${rivi('Matka', km(t.distanceM))}${rivi('Kesto', kesto(t.durationS))}${t.avgSpeedKmh !== null ? rivi('Keskinopeus', t.avgSpeedKmh + ' km/h') : ''}${t.maxSpeedKmh !== null ? rivi('Suurin nopeus', t.maxSpeedKmh + ' km/h') : ''}
        ${rivi('Ajotyyppi', 'Luokittelematon')}${rivi('Tietolähde', 'Traccar GPS')}</dl>
        <p class="gps-pieni">GPS-matka ei ole matkamittarin lukema. Ajon luokittelu, muistiinpano ja vienti raportteihin tulevat myöhemmin.</p>`;
      const box = el.querySelector('.gps-tiedot-kartta');
      reitti(laiteId, t).then(r => {
        if (tMap !== my || !box.isConnected || !window.WebGL2RenderingContext || !r.points || r.points.length < 2) { if (box.isConnected && (!r.points || r.points.length < 2)) box.remove(); return; }
        return ML().then(L => {
          if (tMap !== my || !box.isConnected) return;
          my.map = new L.Map({ container: box, style: window.AjouraKartta.style(), interactive: true, attributionControl: false, dragRotate: false, touchPitch: false, maxPitch: 0, fadeDuration: 0, center: [r.points[0][1], r.points[0][0]], zoom: 9 });
          my.map.addControl(new L.AttributionControl({ compact: true }), 'bottom-left');
          my.map.on('load', () => { if (tMap === my) { piirraReitti(my.map, r.points); sovita(my.map, r.points); } });
        });
      }).catch(() => { if (box.isConnected) box.remove(); });
    }).catch(err => {
      if (tMap !== my || !el.isConnected) return;
      const l = el.querySelector('.gps-lataus'); if (l) l.outerHTML = `<p class="gps-virhe" role="alert">${esc(err && err.status === 404 ? 'Ajoa ei löytynyt.' : virheteksti(err))}</p>`;
    });
  }
  function irrotaTiedot() { if (tMap && tMap.map) try { tMap.map.remove(); } catch (e) { /* jo poistettu */ } tMap = null; }

  document.addEventListener('click', e => {
    const t = e.target; if (!t.closest) return;
    if (t.closest('[data-gps-kortti]')) { set(KORTTI_KEY, get(KORTTI_KEY) === 'kiinni' ? null : 'kiinni'); piirra(); return; }
    if (t.closest('[data-gps-keskita]') && k && k.pos && k.pos.point) { k.map.easeTo({ center: [k.pos.point[1], k.pos.point[0]], zoom: Math.max(k.map.getZoom(), 13), duration: 500 }); return; }
    if (t.closest('[data-gps-reitti]') && k && k.viimeisin) { naytaReitti(k.viimeisin); return; }
    if (t.closest('[data-gps-reitti-pois]') && k) { k.reittiAjo = null; k.reittiData = null; reittiKartalle(); piirra(); return; }
    if (t.closest('[data-gps-uudelleen]') && k) { muisti.clear(); k.lataa = true; k.virhe = null; piirra(); paivita(); return; }
    const pkEl = t.closest('.gps-paivakirja');
    if (!pkEl) return;
    const j = t.closest('[data-gps-jakso]'); if (j) { pk.jakso = j.dataset.gpsJakso; pk.ank = rajaa(pk.ank || tanaanA()); paivakirja(pkEl); return; }
    const sr = t.closest('[data-gps-siirra]'); if (sr && !sr.disabled) { pk.ank = rajaa(siirra(pk.jakso, pk.ank, Number(sr.dataset.gpsSiirra))); paivakirja(pkEl); return; }
    if (t.closest('[data-gps-pysahdykset]')) { naytaPysahdykset(pkEl); return; }
    if (t.closest('[data-gps-pk-uudelleen]')) { muisti.clear(); paivakirja(pkEl); }
  });
  window.addEventListener('hashchange', () => { if (!/^#ajot\/./.test(location.hash)) irrotaTiedot(); });
  // Uloskirjautuminen tai tilin vaihto: muistissa olevat GPS-tiedot pois.
  document.addEventListener('ajoura-session', () => muisti.clear());

  window.AjouraGps = { liita, siirra, irrota, paivakirja, tiedot, irrotaTiedot, _testi: { keskiyo, paikallinen, kunta, otsikko, km, kesto, jaksoRaja } };
})();

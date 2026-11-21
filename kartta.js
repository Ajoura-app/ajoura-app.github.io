'use strict';
// AJOURA Kartta (2.25, GPS-suunnitelman vaihe 2a): Kartta-välilehti kaikille ja Ajopäiväkirja-välilehti niille,
// joille palvelin vahvistaa GPS-oikeuden. Moduuli ottaa näkymät #kartta ja #ajot omakseen samalla owns/paint-mallilla
// kuin roles.js ja sync.js; app.js antaa sille yläosan ja alavalikon (AjouraApp.ui).
//
// Kartta: MapLibre GL JS 6.18.0 (vendor/, BSD-3-Clause) ladataan vasta, kun Kartta avataan. Peruskartta on
// OpenFreeMap (ilmainen, ei avainta; © OpenMapTiles, © OpenStreetMap-tekijät), vaalea tai tumma sovelluksen tilan
// mukaan. Karttapalvelu näkee laitteen IP-osoitteen ja katsotun alueen kuten mikä tahansa verkkokartta. Tämä moduuli
// ei lähetä käyttäjän tietoja minnekään eikä tallenna niitä; laitteeseen jää vain kartan viimeisin näkymä.
//
// GPS-oikeus: vain kirjautuneelle kysytään palvelimelta gps-traccar ?action=devices (200 = oikeus, 401/403 = ei).
// Vastauksen sisältöä ei käytetä eikä tallenneta tässä versiossa. Laitteeseen tallennettu merkintä vain näyttää
// välilehden heti seuraavalla avauksella; se ei anna oikeutta mihinkään, koska palvelin tarkistaa käyttäjän ja
// omistajuuden jokaisessa pyynnössä.
(() => {
  // Varalla 5.24.1 (UMD-skripti), jos ES-moduuli ei toimi iPhonen kotivalikon sovelluksessa (vendor/…/README.md).
  const LIB = 'vendor/maplibre-gl-6.18.0/';
  const STYLES = { light: 'https://tiles.openfreemap.org/styles/liberty', dark: 'https://tiles.openfreemap.org/styles/dark' };
  // Satelliittitaso: Esri World Imagery (Niklas 17.11. ja 20.11.2026). Julkinen selainavain (kuten Supabasen
  // publishable-avain sync.js:ssä; Niklas hyväksyi poikkeuksen "ei avaimia repoon" -sääntöön 17.11.2026): oikeutena vain
  // taustakarttatyylit, rajaus osoitteeseen https://ajoura-app.github.io, vanhenee 20.11.2027, käytön mukainen laskutus
  // pois päältä (kiintiön täyttyessä Esri keskeyttää palvelun eikä laskuta; silloin kartta palaa peruskarttaan).
  // Huom (testattu 20.11.2026): kuvapalvelu ibasemaps-api ei tarkista osoiterajausta, joten avaimen voi käyttää muualla;
  // suojana on vain laskutuksen esto. Satelliitti on oletuksena pois: Esri saa IP-osoitteen ja katsotun alueen vain,
  // kun käyttäjä valitsee sen. Osoite, tiilikoko ja lähdemerkintä Esrin arcgis/imagery-tyylistä (Basemap Styles v2).
  const ESRI_KEY = 'AAPTa4iIZcx07cs0eWTsMzflaMg..rwE_CLXDP75SXYruFZesMgEsdQ1dgx3A5Ltg6FhGNHgVyzbdS_xDJ5mVepltAYz9-OUi9-jfukiHdnJCu96jZhYPG0ylbIXVA_tTQZovtCiGY_xzDtW1gU0s7_BLCmPC1ARhObgMwoDuZUA_uvmP50KQ5GWEB4H5fKnjiUvDi6GTezALoIibMQ13apkPvzhJeHNpiB1mvTPxXJVFM-1Nnp7udQNT4zo2QobJPA5QQthnru8.AT1_9SpNYgKs';
  const SAT = 'satelliitti', SAT_LAYER = 'ajoura-satelliitti';
  const SAT_TILES = 'https://ibasemaps-api.arcgis.com/arcgis/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}?token=';
  const SAT_ATTRIBUTION = 'Powered by <a href="https://www.esri.com/" target="_blank" rel="noopener">Esri</a> | Source: Esri, Vantor, GeoEye, Earthstar Geographics, CNES/Airbus DS, USDA, USGS, AeroGRID, IGN, and the GIS User Community';
  const SAT_LIMIT = 12000; // ms: jos yhtään satelliittitiiltä ei saada tässä ajassa, palataan peruskarttaan
  // Karttatasot; tasopainike näkyy, kun tasoja on enemmän kuin yksi.
  const LAYERS = [{ id: 'peruskartta', name: 'Peruskartta' }, ...(ESRI_KEY ? [{ id: SAT, name: 'Satelliitti' }] : [])];
  const VIEW_KEY = 'ajoura-kartta-nakyma', GPS_KEY = 'ajoura-gps-valilehti', LAYER_KEY = 'ajoura-kartta-taso';
  const START = { center: [25.7, 64.9], zoom: 3.9 }; // koko Suomi
  const LOAD_LIMIT = 20000; // ms; tämän jälkeen "Karttaa ei voitu ladata" eikä loputonta latausta
  const CHECK_GAP = 10 * 60 * 1000; // GPS-oikeus tarkistetaan enintään kymmenen minuutin välein
  const LOCALE = {
    'Map.Title': 'Kartta', 'AttributionControl.ToggleAttribution': 'Näytä tai piilota kartan lähteet',
    'ScaleControl.Meters': 'm', 'ScaleControl.Kilometers': 'km', 'NavigationControl.ZoomIn': 'Lähennä', 'NavigationControl.ZoomOut': 'Loitonna'
  };
  const REASONS = {
    webgl: 'Selain tai laite ei tue karttaa (WebGL2 puuttuu tai on pois päältä).',
    lib: 'Karttaohjelman lataus epäonnistui.',
    tiles: 'Karttapalvelu ei vastannut.',
    timeout: 'Kartan lataus kesti liian kauan.'
  };

  const get = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const set = (k, v) => { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { /* yksityinen tila */ } };
  const App = () => window.AjouraApp;
  const dark = () => document.documentElement.classList.contains('dark');
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const svg = p => `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;

  let lib = null, map = null, mapEl = null, mapTheme = '', run = 0, timer = 0;
  let state = 'idle', reason = '';
  let satErrors = 0, satOk = false, satTimer = 0, noteTimer = 0;
  let ML = null, me = null, locating = false, locMove = false;
  // MapLibre-moduuli, oman sijainnin merkki ja haku käynnissä; lähdemerkintä ja mittakaava (addCorner).
  let corner = [];
  // 2.31: paikat (huoltoasemat, korjaamot, latauspisteet); valittu luokka, lista auki, valittu kohde.
  let paikat = null, paikatTila = 'idle', luokka = '', listaAuki = false, kohde = null;
  // sync.js (ladataan ennen tätä) lukee istunnon heti, joten uloskirjautuneelle välilehti ei välähdä näkyviin.
  const signedIn = () => { const S = window.AjouraSync; return !!(S && S.enabled && S.account && S.account()); };
  let gps = get(GPS_KEY) === '1' && signedIn(), checkedAt = 0, checking = null;

  // ---- Kirjasto ja kartta ----
  function load() {
    if (lib) return lib;
    const base = new URL(LIB, document.baseURI).href;
    const css = new Promise((resolve, reject) => {
      if (document.querySelector('link[data-maplibre]')) return resolve();
      const l = document.createElement('link');
      l.rel = 'stylesheet'; l.href = base + 'maplibre-gl.css'; l.dataset.maplibre = '';
      l.onload = () => resolve(); l.onerror = () => { l.remove(); reject(new Error('css')); };
      document.head.appendChild(l);
    });
    lib = Promise.all([import(base + 'maplibre-gl.mjs'), css]).then(([m]) => m);
    lib.catch(() => { lib = null; });
    return lib;
  }
  function savedView() {
    try {
      const v = JSON.parse(get(VIEW_KEY) || 'null');
      if (v && Number.isFinite(v.lng) && Number.isFinite(v.lat) && Number.isFinite(v.zoom) && Math.abs(v.lat) <= 85 && Math.abs(v.lng) <= 180 && v.zoom >= 1 && v.zoom <= 20) return { center: [v.lng, v.lat], zoom: v.zoom };
    } catch (e) { /* vanha tai rikkinäinen arvo: aloitetaan Suomesta */ }
    return START;
  }
  function saveView() {
    if (!map) return;
    const c = map.getCenter(), r = x => Math.round(x * 1e4) / 1e4;
    set(VIEW_KEY, JSON.stringify({ lng: r(c.lng), lat: r(c.lat), zoom: Math.round(map.getZoom() * 100) / 100 }));
  }
  function drop() {
    run++; clearTimeout(timer); clearTimeout(satTimer);
    if (map) { try { map.remove(); } catch (e) { /* jo poistettu */ } }
    map = null; mapEl = null; mapTheme = ''; me = null; corner = []; kohde = null; listaAuki = false;
    if (state !== 'offline' && state !== 'error') state = 'idle';
  }
  function start() {
    drop();
    const el = document.querySelector('.kartta-map');
    if (!el) return;
    if (navigator.onLine === false) return show('offline');
    if (!window.WebGL2RenderingContext) return show('error', 'webgl');
    show('loading');
    const id = run, theme = dark() ? 'dark' : 'light';
    timer = setTimeout(() => { if (id === run && state === 'loading') { drop(); show('error', 'timeout'); } }, LOAD_LIMIT);
    load().then(m => {
      if (id !== run || !el.isConnected) return;
      const v = savedView();
      try {
        map = new m.Map({
          container: el, style: STYLES[theme], center: v.center, zoom: v.zoom, minZoom: 2, maxZoom: 19,
          attributionControl: false, dragRotate: false, pitchWithRotate: false, touchPitch: false, maxPitch: 0,
          locale: LOCALE, fadeDuration: 0
        });
      } catch (e) { map = null; clearTimeout(timer); return show('error', 'webgl'); }
      mapEl = el; mapTheme = theme; ML = m; me = null;
      map.touchZoomRotate.disableRotation();
      map.keyboard.disableRotation();
      addCorner();
      map.once('load', () => { if (id !== run) return; clearTimeout(timer); show('ready'); loadPaikat(); });
      map.on('style.load', () => { applyLayer(); applyPaikat(); }); // myös tumman ja vaalean tyylin vaihdon jälkeen
      map.on('click', e => clickPaikka(e));
      map.on('data', e => { if (e && e.sourceId === SAT_LAYER && e.tile) satOk = true; });
      // Ennen latausta tyylin tai kirjaston virhe on pysyvä; yksittäinen puuttuva karttatiili (sourceId) ei ole.
      map.on('error', e => {
        if (e && e.sourceId === SAT_LAYER) { satFailed(e); return; }
        if (id === run && state === 'loading' && !(e && (e.sourceId || e.tile))) { drop(); show('error', 'tiles'); }
      });
      // Oman sijainnin keskitystä ei tallenneta kartan viimeisimmäksi näkymäksi; käyttäjän omat siirrot tallennetaan.
      map.on('moveend', () => { if (listaAuki && !kohde && !me) renderLista(); if (locMove) { locMove = false; return; } saveView(); });
    }, () => { if (id !== run) return; clearTimeout(timer); show('error', 'lib'); });
  }
  // Tila näkyy kartan päällä: lataus, ei verkkoa tai virhe. Kartta ja sen painikkeet näkyvät vain valmiina.
  function show(next, why) {
    state = next; reason = why || '';
    const box = document.querySelector('.kartta');
    if (!box) return;
    box.dataset.tila = state;
    const s = box.querySelector('.kartta-tila');
    if (!s) return;
    const retry = '<button class="app-button secondary" type="button" data-kartta-uudelleen>Yritä uudelleen</button>';
    s.innerHTML = state === 'loading' ? '<p class="kartta-tila-otsikko">Ladataan karttaa…</p>'
      : state === 'offline' ? `<p class="kartta-tila-otsikko">Ei verkkoyhteyttä</p><p>Kartta tarvitsee verkkoyhteyden. Muu AJOURA toimii ilman verkkoa.</p>${retry}`
      : state === 'error' ? `<p class="kartta-tila-otsikko">Karttaa ei voitu ladata</p><p>${esc(REASONS[reason] || REASONS.tiles)}</p>${retry}`
      : '';
    s.hidden = state === 'ready';
  }

  // Lähdemerkintä ja mittakaava vasempaan alakulmaan (samassa järjestyksessä myös uudelleen luotaessa).
  function addCorner() {
    corner.forEach(c => { try { map.removeControl(c); } catch (e) { /* jo poistettu */ } });
    corner = [new ML.AttributionControl({ compact: true }), new ML.ScaleControl({ unit: 'metric', maxWidth: 88 })];
    corner.forEach(c => map.addControl(c, 'bottom-left'));
  }

  // ---- Karttatasot ----
  // Satelliittikuva piirretään peruskartan päälle mutta sen nimien ja symbolien alle.
  function applyLayer() {
    if (!map || !map.getStyle()) return;
    const want = layer() === SAT, has = !!map.getLayer(SAT_LAYER);
    if (want && !has) {
      if (!map.getSource(SAT_LAYER)) map.addSource(SAT_LAYER, { type: 'raster', tiles: [SAT_TILES + encodeURIComponent(ESRI_KEY)], tileSize: 256, maxzoom: 19, attribution: SAT_ATTRIBUTION });
      // Kaikkien alueiden ja viivojen (myös tumman tyylin rakennukset ja tiet) päälle, nimien ja symbolien alle.
      const layers = map.getStyle().layers || [];
      let last = -1; layers.forEach((l, i) => { if (l.type !== 'symbol' && l.id !== SAT_LAYER) last = i; });
      const above = layers[last + 1];
      map.addLayer({ id: SAT_LAYER, type: 'raster', source: SAT_LAYER }, above ? above.id : undefined);
      satErrors = 0; satOk = false; clearTimeout(satTimer);
      const id = run;
      satTimer = setTimeout(() => { if (id === run && !satOk && layer() === SAT) satFailed(null, true); }, SAT_LIMIT);
    } else if (!want && has) {
      map.removeLayer(SAT_LAYER);
      if (map.getSource(SAT_LAYER)) map.removeSource(SAT_LAYER);
      addCorner(); // MapLibre ei poista poistetun lähteen merkintää itse
      clearTimeout(satTimer);
    }
    document.querySelectorAll('[data-kartta-taso]').forEach(b => b.setAttribute('aria-checked', String(b.dataset.karttaTaso === layer())));
  }
  // Satelliittitiilet eivät lataudu (avain vanhentunut tai estetty, kiintiö täynnä, ei verkkoa): automaattisesti
  // peruskarttaan ja lyhyt ilmoitus. Valinta palautuu peruskartaksi myös seuraavalla avauksella.
  function satFailed(e, timeout) {
    if (layer() !== SAT) return;
    const status = e && e.error && e.error.status;
    satErrors++;
    if (!timeout && !satOk && ![401, 403, 429, 498, 499].includes(status) && satErrors < 3) return;
    if (!timeout && satOk && ![401, 403, 429, 498, 499].includes(status) && satErrors < 6) return;
    set(LAYER_KEY, null);
    applyLayer();
    note('Satelliittikuva ei latautunut. Näytetään peruskartta.');
  }
  function note(text) {
    const box = document.querySelector('.kartta');
    if (!box) return;
    let n = box.querySelector('.kartta-ilmoitus');
    if (!n) { n = document.createElement('p'); n.className = 'kartta-ilmoitus'; n.setAttribute('role', 'status'); box.appendChild(n); }
    n.textContent = text; n.hidden = false;
    clearTimeout(noteTimer); noteTimer = setTimeout(() => { n.hidden = true; }, 6000);
  }

  // Kartan alareunan painikkeet ja lähdemerkintä alavalikon yläpuolelle (alavalikon korkeus vaihtelee leveyden mukaan).
  function fitBottom() {
    const box = document.querySelector('.kartta-full .kartta'), nav = document.querySelector('#app-screen > .tab-dock .tab-bar'), sc = document.getElementById('app-screen');
    if (!box || !nav || !sc) return;
    const bottom = sc.getBoundingClientRect().bottom, gap = Math.max(0, bottom - nav.getBoundingClientRect().top);
    box.style.setProperty('--kartta-ala', Math.round(gap + 8) + 'px');
    // Avoin paikkalista nostaa zoomauksen ja lähdemerkinnän listan yläpuolelle.
    const l = box.querySelector('.kartta-lista:not([hidden])');
    box.style.setProperty('--kartta-saatimet', Math.round((l ? bottom - l.getBoundingClientRect().top : gap) + 8) + 'px');
  }
  window.addEventListener('resize', fitBottom);

  // ---- Lähimmät huoltoasemat, korjaamot ja latauspisteet (2.31) ----
  // Aineisto on AJOURAn omalla sivustolla (kartta-data/paikat.json, OpenStreetMap, ODbL; tyokalut/karttapaikat.py ja
  // kuukausittainen GitHub Actions -päivitys). Se ladataan vasta Kartassa. Etäisyydet lasketaan laitteessa omasta
  // sijainnista (jos käyttäjä on pyytänyt sen) tai kartan keskeltä; mitään sijaintia ei lähetetä. Navigoi avaa
  // puhelimen karttasovelluksen, jolle välitetään vain valitun paikan sijainti.
  const LUOKAT = {
    h: { yksi: 'Huoltoasema', monikko: 'Huoltoasemat', lahimmat: 'Lähimmät huoltoasemat', vari: '#e8590c' },
    k: { yksi: 'Korjaamo', monikko: 'Korjaamot', lahimmat: 'Lähimmät korjaamot', vari: '#7048e8' },
    l: { yksi: 'Latauspiste', monikko: 'Latauspisteet', lahimmat: 'Lähimmät latauspisteet', vari: '#2b8a3e' }
  };
  const PAIKAT_URL = 'kartta-data/paikat.json', PAIKAT_LAYER = 'ajoura-paikat', LUOKKA_KEY = 'ajoura-kartta-paikat', LISTA = 10;
  let listaRivit = [];
  const str = x => typeof x === 'string' ? x : '';
  function loadPaikat() {
    if (paikatTila === 'ok') { renderPaikat(); applyPaikat(); return; }
    if (paikatTila === 'loading' || paikatTila === 'tyhja') return;
    paikatTila = 'loading';
    fetch(PAIKAT_URL, { cache: 'no-cache' }).then(r => r.ok ? r.json() : Promise.reject(new Error(String(r.status)))).then(d => {
      if (!d || !d.meta || d.meta.versio !== 1 || !Array.isArray(d.paikat)) throw new Error('muoto');
      paikat = d.paikat.filter(r => Array.isArray(r) && LUOKAT[r[0]] && Number.isFinite(r[1]) && Number.isFinite(r[2]) && Math.abs(r[1]) <= 90 && Math.abs(r[2]) <= 180)
        .map(r => ({ c: r[0], lat: r[1], lon: r[2], nimi: str(r[3]), ketju: str(r[4]), osoite: str(r[5]), aukiolo: str(r[6]), puhelin: str(r[7]), www: /^https?:\/\//.test(str(r[8])) ? str(r[8]) : '' }));
      paikatTila = paikat.length ? 'ok' : 'tyhja'; // tyhjä aineisto (ei vielä haettu): ei siruja
      const v = get(LUOKKA_KEY); if (LUOKAT[v]) luokka = v;
      renderPaikat(); applyPaikat();
    }).catch(() => { paikatTila = 'virhe'; paikat = null; renderPaikat(); });
  }
  // Siruista valitaan luokka (yksi kerrallaan); valittu luokka näkyy kartalla ja avaa lähimpien listan.
  function valitseLuokka(c) {
    luokka = luokka === c ? '' : c;
    set(LUOKKA_KEY, luokka || null);
    listaAuki = !!luokka; kohde = null;
    applyPaikat(); renderPaikat();
  }
  function renderPaikat() {
    const sirut = document.querySelector('.kartta-sirut');
    if (!sirut) return;
    sirut.hidden = paikatTila !== 'ok';
    sirut.querySelectorAll('[data-paikka-luokka]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.paikkaLuokka === luokka)));
    renderLista();
  }
  function applyPaikat() {
    if (!map || !map.getStyle() || !map.isStyleLoaded()) return;
    if (map.getLayer(PAIKAT_LAYER)) map.removeLayer(PAIKAT_LAYER);
    if (map.getSource(PAIKAT_LAYER)) map.removeSource(PAIKAT_LAYER);
    if (!luokka || !paikat) return;
    const features = paikat.map((p, i) => ({ p, i })).filter(x => x.p.c === luokka)
      .map(x => ({ type: 'Feature', id: x.i, properties: { i: x.i }, geometry: { type: 'Point', coordinates: [x.p.lon, x.p.lat] } }));
    map.addSource(PAIKAT_LAYER, { type: 'geojson', data: { type: 'FeatureCollection', features }, attribution: '<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">© OpenStreetMap-tekijät</a>' });
    map.addLayer({ id: PAIKAT_LAYER, type: 'circle', source: PAIKAT_LAYER, paint: {
      'circle-color': LUOKAT[luokka].vari, 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 1.5,
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 5, 3, 10, 6, 14, 8] } });
  }
  function clickPaikka(e) {
    if (!map || !map.getLayer(PAIKAT_LAYER)) return;
    const p = e.point, f = map.queryRenderedFeatures([[p.x - 14, p.y - 14], [p.x + 14, p.y + 14]], { layers: [PAIKAT_LAYER] });
    if (!f.length) return;
    const lahin = f.map(x => paikat[x.properties.i]).filter(Boolean)
      .sort((a, b) => { const pa = map.project([a.lon, a.lat]), pb = map.project([b.lon, b.lat]); return Math.hypot(pa.x - p.x, pa.y - p.y) - Math.hypot(pb.x - p.x, pb.y - p.y); })[0];
    if (lahin) { listaAuki = true; avaaKohde(lahin, false); }
  }
  function lahto() {
    if (me) { const l = me.getLngLat(); return { lat: l.lat, lon: l.lng, oma: true }; }
    if (map) { const c = map.getCenter(); return { lat: c.lat, lon: c.lng, oma: false }; }
    return null;
  }
  // Linnuntie-etäisyys (haversine), metreinä.
  function matka(a, b) {
    const R = 6371000, r = x => x * Math.PI / 180, dLat = r(b.lat - a.lat), dLon = r(b.lon - a.lon);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
  }
  const muotoile = m => m < 1000 ? `${Math.max(10, Math.round(m / 10) * 10)} m` : m < 10000 ? `${(m / 1000).toFixed(1).replace('.', ',')} km` : `${Math.round(m / 1000)} km`;
  // OpenStreetMapin aukiolomerkintä suomeksi (yleisimmät lyhenteet); muu teksti jää sellaisenaan.
  const PAIVAT = { Mo: 'ma', Tu: 'ti', We: 'ke', Th: 'to', Fr: 'pe', Sa: 'la', Su: 'su', PH: 'pyhät' };
  const aukiolo = s => s === '24/7' ? 'Aina auki' : s.replace(/\b(Mo|Tu|We|Th|Fr|Sa|Su|PH)\b/g, d => PAIVAT[d]).replace(/\b(off|closed)\b/g, 'suljettu').replace(/;\s*/g, '; ');
  const nimi = p => p.nimi || p.ketju || LUOKAT[p.c].yksi;
  const ios = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const navigoi = p => ios() ? `https://maps.apple.com/?daddr=${p.lat},${p.lon}&dirflg=d` : `https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lon}&travelmode=driving`;
  function renderLista() {
    const box = document.querySelector('.kartta-lista');
    if (!box) return;
    if (!listaAuki || !luokka || !paikat) { box.hidden = true; box.innerHTML = ''; fitBottom(); return; }
    const o = lahto(), L = LUOKAT[luokka];
    const sulje = `<button type="button" class="kartta-lista-sulje" data-paikat-sulje aria-label="Sulje lista">${svg('<path d="M6 6l12 12M18 6 6 18"/>')}</button>`;
    if (kohde) {
      const p = kohde, d = o ? matka(o, p) : null;
      box.innerHTML = `<div class="kartta-lista-yla"><button type="button" class="kartta-lista-takaisin" data-paikat-takaisin>← ${esc(L.lahimmat)}</button>${sulje}</div>
        <h3 class="kartta-kohde-nimi">${esc(nimi(p))}</h3>
        <p class="kartta-kohde-tiedot">${esc([p.nimi && p.ketju ? p.ketju : '', LUOKAT[p.c].yksi].filter(Boolean).join(' · '))}${d !== null ? ` · <span>${esc(muotoile(d))} linnuntietä</span>` : ''}</p>
        ${p.osoite ? `<p class="kartta-kohde-rivi">${esc(p.osoite)}</p>` : ''}
        ${p.aukiolo ? `<p class="kartta-kohde-rivi"><span class="kartta-kohde-otsake">Aukiolo</span> ${esc(aukiolo(p.aukiolo))}</p>` : ''}
        <div class="kartta-kohde-toiminnot"><a class="app-button" href="${esc(navigoi(p))}" target="_blank" rel="noopener" data-navigoi>Navigoi</a>${p.puhelin ? `<a class="app-button secondary" href="tel:${esc(p.puhelin.replace(/[^\d+]/g, ''))}">Soita</a>` : ''}${p.www ? `<a class="app-button secondary" href="${esc(p.www)}" target="_blank" rel="noopener">Verkkosivu</a>` : ''}</div>
        <p class="kartta-lista-lahde">Tiedot: © OpenStreetMap-tekijät. Navigoi avaa puhelimen karttasovelluksen.</p>`;
    } else {
      listaRivit = o ? paikat.filter(p => p.c === luokka).map(p => ({ p, d: matka(o, p) })).sort((a, b) => a.d - b.d).slice(0, LISTA).map(x => x.p) : [];
      box.innerHTML = `<div class="kartta-lista-yla"><h3>${esc(L.lahimmat)}</h3>${sulje}</div>
        <p class="kartta-lista-lahto">Linnuntie ${o && o.oma ? 'sijainnistasi' : 'kartan keskeltä'}</p>
        ${listaRivit.length ? `<ol class="kartta-lista-rivit">${listaRivit.map((p, i) => `<li><button type="button" data-paikka="${i}"><span class="kartta-siru-piste luokka-${p.c}" aria-hidden="true"></span><span class="kartta-rivi-teksti"><strong>${esc(nimi(p))}</strong>${p.osoite || (p.nimi && p.ketju) ? `<small>${esc(p.osoite || p.ketju)}</small>` : ''}</span><span class="kartta-rivi-matka">${esc(muotoile(matka(o, p)))}</span></button></li>`).join('')}</ol>` : '<p class="kartta-lista-lahto">Ei kohteita.</p>'}`;
    }
    box.hidden = false;
    fitBottom();
  }
  function avaaKohde(p, lenna = true) {
    if (!p) return;
    kohde = p; renderLista();
    if (lenna && map) { locMove = true; map.easeTo({ center: [p.lon, p.lat], zoom: Math.max(map.getZoom(), 14), duration: matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 600 }); }
    document.querySelector('.kartta-lista .kartta-kohde-nimi')?.setAttribute('tabindex', '-1');
    document.querySelector('.kartta-lista .kartta-kohde-nimi')?.focus({ preventScroll: true });
  }

  // ---- Oma sijainti (2.27) ----
  // Vain painettaessa: selain kysyy luvan, ja sijaintia käytetään vain tässä laitteessa kartan keskittämiseen ja
  // merkkiin. Sitä ei lähetetä AJOURAlle eikä tallenneta; merkki katoaa, kun Kartta suljetaan. Karttapalvelu saa
  // karttakuvien pyynnöistä tiedon katsotusta alueesta kuten muutenkin (tietosuojaseloste, kohta Kartta).
  function locate(btn) {
    if (locating || !map || !navigator.geolocation) return;
    locating = true; btn.setAttribute('aria-busy', 'true'); btn.classList.add('haetaan');
    const id = run, done = () => { locating = false; btn.removeAttribute('aria-busy'); btn.classList.remove('haetaan'); };
    navigator.geolocation.getCurrentPosition(pos => {
      done();
      if (id !== run || !map) return;
      const c = [pos.coords.longitude, pos.coords.latitude];
      if (!c.every(Number.isFinite)) return note('Sijaintia ei saatu. Yritä uudelleen.');
      if (!me) { const dot = document.createElement('div'); dot.className = 'kartta-oma'; dot.setAttribute('aria-hidden', 'true'); me = new ML.Marker({ element: dot }); }
      me.setLngLat(c).addTo(map);
      if (listaAuki && !kohde) renderLista();
      const still = matchMedia('(prefers-reduced-motion: reduce)').matches, to = { center: c, zoom: Math.max(map.getZoom(), 14) };
      locMove = true;
      if (still) map.jumpTo(to); else map.easeTo({ ...to, duration: 800 });
      const say = document.getElementById('demo-announcement'); if (say) say.textContent = 'Kartta keskitettiin sijaintiisi.';
    }, err => {
      done();
      if (id !== run) return;
      note(err && err.code === 1 ? 'Sijaintilupa on estetty. Voit sallia sen selaimen tai puhelimen asetuksista.' : 'Sijaintia ei saatu. Yritä uudelleen.');
    }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 });
  }

  // ---- Näkymät ----
  const layerButton = () => LAYERS.length > 1 ? `<div class="kartta-tasot"><button class="kartta-nappi" type="button" data-kartta-tasot aria-haspopup="menu" aria-expanded="false" aria-controls="kartta-tasovalikko" aria-label="Karttataso">${svg('<path d="m12 3 9 5-9 5-9-5 9-5z"/><path d="m3 13 9 5 9-5"/>')}</button><div class="kartta-tasovalikko" id="kartta-tasovalikko" role="menu" hidden>${LAYERS.map(l => `<button type="button" role="menuitemradio" aria-checked="${l.id === layer() ? 'true' : 'false'}" data-kartta-taso="${esc(l.id)}">${esc(l.name)}</button>`).join('')}</div></div>` : '';
  const layer = () => { const v = get(LAYER_KEY); return LAYERS.some(l => l.id === v) ? v : LAYERS[0].id; };
  const locateButton = () => navigator.geolocation ? `<button class="kartta-nappi" type="button" data-kartta-sijainti aria-label="Näytä oma sijainti">${svg('<circle cx="12" cy="12" r="3.2"/><circle cx="12" cy="12" r="7.5"/><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22"/>')}</button>` : '';
  function mapView() {
    // 2.30 (Niklas): kartta koko näkymälle; ⋯-valikko, yläkulman painikkeet ja alavalikko kelluvat kartan päällä.
    return `<div class="kartta-yla"><h2 class="sr-only">Kartta</h2>${App().ui.topMenu}</div>
      <section class="kartta" data-tila="${esc(state)}" aria-label="Kartta">
        <div class="kartta-map"></div>
        <div class="kartta-ylanapit">${layerButton()}${locateButton()}</div>
        <div class="kartta-sirut" role="group" aria-label="Näytä kartalla" hidden>${Object.entries(LUOKAT).map(([k, l]) => `<button type="button" class="kartta-siru" data-paikka-luokka="${k}" aria-pressed="false"><span class="kartta-siru-piste luokka-${k}" aria-hidden="true"></span>${esc(l.monikko)}</button>`).join('')}</div>
        <div class="kartta-lista" role="region" aria-label="Lähimmät paikat" hidden></div>
        <div class="kartta-zoom" role="group" aria-label="Kartan zoomaus"><button class="kartta-nappi" type="button" data-kartta-zoom="in" aria-label="Lähennä">${svg('<path d="M12 5v14M5 12h14"/>')}</button><button class="kartta-nappi" type="button" data-kartta-zoom="out" aria-label="Loitonna">${svg('<path d="M5 12h14"/>')}</button></div>
        <div class="kartta-tila" role="status" aria-live="polite"></div>
      </section>`;
  }
  function diaryView() {
    return `<div class="rp-head fv-head"><div class="rp-titles"><h2 class="app-heading ajot-otsikko">Ajopäiväkirja</h2></div>${App().ui.topMenu}</div>
      <div class="kartta-tyhja"><span class="kartta-tyhja-ikoni" aria-hidden="true">${svg('<path d="M12 6.5C10.4 5.3 8 4.8 4 5v13c4 0 6.4.5 8 1.6 1.6-1.1 4-1.6 8-1.6V5c-4-.2-6.4.3-8 1.5z"/><path d="M12 6.5v13"/>')}</span><h3>GPS-yhteys on vahvistettu tilillesi</h3><p>Ajot, reitit ja kuukausikooste tulevat tähän seuraavissa versioissa. Tämä versio ei vielä hae eikä näytä ajotietoja.</p><a class="app-button secondary" href="#kartta">Avaa kartta</a></div>`;
  }
  function paint(screen, view) {
    if (view === 'ajot' && !gps) { history.replaceState(null, '', '#kartta'); view = 'kartta'; }
    const keep = view === 'kartta' && map && mapEl && mapEl.isConnected ? mapEl : null;
    if (view !== 'kartta') drop();
    if (keep) keep.remove();
    screen.innerHTML = '<div class="screen-content kartta-screen' + (view === 'kartta' ? ' kartta-full' : '') + '">' + App().ui.top() + (view === 'ajot' ? diaryView() : mapView()) + '</div>' + App().ui.nav(view);
    screen.scrollTop = 0;
    document.title = 'AJOURA App — ' + (view === 'ajot' ? 'Ajopäiväkirja' : 'Kartta');
    if (window.AjouraSecretary) window.AjouraSecretary.mountWidget();
    if (view === 'kartta') {
      fitBottom();
      if (keep) {
        screen.querySelector('.kartta-map').replaceWith(keep);
        show(state, reason);
        const theme = dark() ? 'dark' : 'light';
        if (theme !== mapTheme) { mapTheme = theme; map.setStyle(STYLES[theme]); }
        map.resize();
        renderPaikat();
      } else start();
    }
    checkGps(false);
  }

  // ---- GPS-oikeus (palvelin päättää) ----
  function setGps(on) {
    if (!on && get(GPS_KEY)) set(GPS_KEY, null); // uloskirjautuneen vanha merkintä pois
    if (on === gps) return;
    gps = on; set(GPS_KEY, on ? '1' : null);
    const A = App(); if (!A) return;
    if (!on && /^#ajot(\/|$)/.test(location.hash)) { history.replaceState(null, '', '#kartta'); A.refresh(); }
    else A.refreshNavigation();
  }
  function checkGps(force) {
    const S = window.AjouraSync;
    if (!signedIn()) { setGps(false); return Promise.resolve(gps); }
    if (checking) return checking;
    if (!force && Date.now() - checkedAt < CHECK_GAP) return Promise.resolve(gps);
    checkedAt = Date.now();
    const ctl = window.AbortController ? new AbortController() : null, t = ctl && setTimeout(() => ctl.abort(), 10000);
    checking = Promise.resolve(S.accessToken()).then(token => {
      if (!token) { setGps(false); return; }
      return fetch(S.base + '/functions/v1/gps-traccar?action=devices', { headers: { apikey: S.apiKey, Authorization: 'Bearer ' + token }, cache: 'no-store', signal: ctl ? ctl.signal : undefined })
        .then(res => {
          if (res.body && res.body.cancel) res.body.cancel().catch(() => {});
          if (res.status === 200) setGps(true);
          else if (res.status === 401 || res.status === 403) setGps(false);
          // Muut vastaukset (palvelin- tai Traccar-virhe): välilehti pysyy ennallaan, tarkistetaan myöhemmin uudelleen.
          else checkedAt = 0;
        });
    }).catch(() => { checkedAt = 0; }).then(() => { clearTimeout(t); checking = null; return gps; });
    return checking;
  }

  // ---- Tapahtumat ----
  document.addEventListener('click', e => {
    const t = e.target;
    if (!t.closest) return;
    const z = t.closest('[data-kartta-zoom]');
    if (z) { if (map) z.dataset.karttaZoom === 'in' ? map.zoomIn() : map.zoomOut(); return; }
    if (t.closest('[data-kartta-uudelleen]')) { start(); return; }
    const lk = t.closest('[data-paikka-luokka]');
    if (lk) { valitseLuokka(lk.dataset.paikkaLuokka); return; }
    const pk = t.closest('[data-paikka]');
    if (pk) { avaaKohde(listaRivit[Number(pk.dataset.paikka)]); return; }
    if (t.closest('[data-paikat-sulje]')) { listaAuki = false; kohde = null; renderLista(); return; }
    if (t.closest('[data-paikat-takaisin]')) { kohde = null; renderLista(); return; }
    const me_ = t.closest('[data-kartta-sijainti]');
    if (me_) { locate(me_); return; }
    const b = t.closest('[data-kartta-tasot]'), menu = document.getElementById('kartta-tasovalikko');
    if (b && menu) { menu.hidden = !menu.hidden; b.setAttribute('aria-expanded', String(!menu.hidden)); return; }
    const l = t.closest('[data-kartta-taso]');
    if (l) {
      set(LAYER_KEY, l.dataset.karttaTaso === LAYERS[0].id ? null : l.dataset.karttaTaso);
      if (menu) menu.hidden = true;
      const btn = document.querySelector('[data-kartta-tasot]'); if (btn) { btn.setAttribute('aria-expanded', 'false'); btn.focus(); }
      applyLayer(); return;
    }
    if (menu && !menu.hidden && !t.closest('.kartta-tasot')) { menu.hidden = true; document.querySelector('[data-kartta-tasot]')?.setAttribute('aria-expanded', 'false'); }
  });
  document.addEventListener('keydown', e => {
    const menu = document.getElementById('kartta-tasovalikko');
    if (e.key === 'Escape' && menu && !menu.hidden) { menu.hidden = true; const btn = document.querySelector('[data-kartta-tasot]'); if (btn) { btn.setAttribute('aria-expanded', 'false'); btn.focus(); } }
  });
  window.addEventListener('hashchange', () => { if (!/^#kartta(\/|$)/.test(location.hash)) drop(); checkGps(false); });
  window.addEventListener('online', () => { if (state === 'offline' && document.querySelector('.kartta-map')) start(); });
  window.addEventListener('offline', () => { if (state === 'loading') { drop(); show('offline'); } });
  // Sisään- tai uloskirjautuminen (sync.js): tarkistetaan heti uudelleen.
  document.addEventListener('ajoura-session', () => { checkedAt = 0; checkGps(true); });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') checkGps(false); });
  // Istunto palautuu sync.js:ssä vasta sivun latauksen jälkeen, joten ensimmäinen tarkistus odottaa hetken.
  window.addEventListener('load', () => setTimeout(() => checkGps(false), 1500));

  window.AjouraKartta = { owns: v => v === 'kartta' || v === 'ajot', paint, gps: () => gps, checkGps: () => checkGps(true), state: () => state, layer, paikat: () => paikatTila };
})();

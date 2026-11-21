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
  let corner = []; // lähdemerkintä ja mittakaava (addCorner) // MapLibre-moduuli, oman sijainnin merkki ja haku käynnissä
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
    map = null; mapEl = null; mapTheme = ''; me = null; corner = [];
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
      map.once('load', () => { if (id !== run) return; clearTimeout(timer); show('ready'); });
      map.on('style.load', applyLayer); // myös tumman ja vaalean tyylin vaihdon jälkeen
      map.on('data', e => { if (e && e.sourceId === SAT_LAYER && e.tile) satOk = true; });
      // Ennen latausta tyylin tai kirjaston virhe on pysyvä; yksittäinen puuttuva karttatiili (sourceId) ei ole.
      map.on('error', e => {
        if (e && e.sourceId === SAT_LAYER) { satFailed(e); return; }
        if (id === run && state === 'loading' && !(e && (e.sourceId || e.tile))) { drop(); show('error', 'tiles'); }
      });
      // Oman sijainnin keskitystä ei tallenneta kartan viimeisimmäksi näkymäksi; käyttäjän omat siirrot tallennetaan.
      map.on('moveend', () => { if (locMove) { locMove = false; return; } saveView(); });
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
    const gap = Math.max(0, sc.getBoundingClientRect().bottom - nav.getBoundingClientRect().top);
    box.style.setProperty('--kartta-ala', Math.round(gap + 8) + 'px');
  }
  window.addEventListener('resize', fitBottom);

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

  window.AjouraKartta = { owns: v => v === 'kartta' || v === 'ajot', paint, gps: () => gps, checkGps: () => checkGps(true), state: () => state, layer };
})();

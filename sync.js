'use strict';
// AJOURA account and sync: sign in with an e-mail code and the garage follows you between the phone app
// and the website. Data lives in the owners' Supabase project (EU region); each user can only read and
// write their own row (row level security, see supabase/). Photos and receipts stay on the device for now.
// Until BASE and KEY are filled in, nothing here talks to the network and the app works as before.
(() => {
  const BASE = 'https://qcziihilblykccfrvqui.supabase.co';
  const KEY = 'sb_publishable_DhMJLU_Uv2XkXewz4ybw_Q_BwQ5gIR9'; // publishable (anon) key: public by design, row level security does the protecting
  const enabled = !!(BASE && KEY);

  const get = k => { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } };
  const set = (k, v) => { try { v === '' ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (e) {} };
  const getJson = k => { try { return JSON.parse(get(k) || 'null'); } catch (e) { return null; } };
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const sessionKey = 'ajoura-session', baseKey = 'ajoura-sync-base', syncedKey = 'ajoura-synced-at';

  // ---- Session --------------------------------------------------------------------------------------
  let session = getJson(sessionKey);
  if (!session || !session.refresh_token || !session.user) session = null;
  const saveSession = s => { session = s; set(sessionKey, s ? JSON.stringify(s) : ''); };
  const fromAuth = d => ({ access_token: d.access_token, refresh_token: d.refresh_token, expires_at: Date.now() + (d.expires_in || 3600) * 1000, user: { id: d.user.id, email: d.user.email } });

  async function call(path, opts = {}, auth = true) {
    const headers = { apikey: KEY, 'Content-Type': 'application/json', ...(opts.headers || {}) };
    if (auth && session) headers.Authorization = 'Bearer ' + session.access_token;
    const r = await fetch(BASE + path, { ...opts, headers });
    const text = await r.text();
    let body = null; try { body = text ? JSON.parse(text) : null; } catch (e) {}
    if (!r.ok) { const err = new Error((body && (body.msg || body.message || body.error_description || body.error)) || 'HTTP ' + r.status); err.status = r.status; err.code = body && (body.error_code || body.code); throw err; }
    return body;
  }
  async function token() {
    if (!session) throw new Error('no session');
    if (session.expires_at - Date.now() > 60000) return;
    try { saveSession(fromAuth(await call('/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: JSON.stringify({ refresh_token: session.refresh_token }) }, false))); }
    catch (e) { if (e.status === 400 || e.status === 401 || e.status === 403) { signedOut('Kirjautuminen vanhentui. Kirjaudu uudelleen.'); } throw e; }
  }
  // The e-mail carries a sign-in link (Supabase's standard template) or a code (custom template). The link opens
  // this page in the browser; the installed iPhone app has its own storage, so there the link is pasted instead.
  const appUrl = () => location.origin + location.pathname;
  const sendCode = email => call('/auth/v1/otp?redirect_to=' + encodeURIComponent(appUrl()), { method: 'POST', body: JSON.stringify({ email, create_user: true }) }, false);
  const linkToken = text => { try { const u = new window.URL(text.trim()); const t = u.searchParams.get('token') || u.searchParams.get('token_hash'); return t ? { token_hash: t, type: u.searchParams.get('type') || 'magiclink' } : null; } catch (e) { return null; } };
  const verify = async (email, input) => { const l = linkToken(input); saveSession(fromAuth(await call('/auth/v1/verify', { method: 'POST', body: JSON.stringify(l || { type: 'email', email, token: input.replace(/\s/g, '') }) }, false))); };
  // Back from the link in the browser: #access_token=…&refresh_token=… (or #error=… when the link was old).
  const back = new URLSearchParams(location.hash.slice(1));
  const fromLink = back.get('access_token') && back.get('refresh_token') ? { access_token: back.get('access_token'), refresh_token: back.get('refresh_token'), expires_in: Number(back.get('expires_in')) || 3600 } : null;
  if (fromLink || back.get('error_code') || back.get('error_description')) history.replaceState(null, '', location.pathname + location.search + (fromLink ? '#home' : '#login'));
  let linkFlash = !fromLink && (back.get('error_code') || back.get('error_description')) ? 'Linkki on vanhentunut tai jo käytetty. Pyydä uusi.' : '';

  // ---- Merge ----------------------------------------------------------------------------------------
  // Three-way merge against the copy both sides agreed on last time (base): a change on either side wins
  // over the unchanged side, an item missing on one side was deleted there, new items come from both.
  // When both sides changed the same item, this device wins.
  // Key order does not matter: {a,b} and {b,a} are the same entry.
  const canon = v => Array.isArray(v) ? '[' + v.map(canon).join(',') + ']' : v && typeof v === 'object' ? '{' + Object.keys(v).filter(k => v[k] !== undefined).sort().map(k => JSON.stringify(k) + ':' + canon(v[k])).join(',') + '}' : JSON.stringify(v ?? null);
  const same = (a, b) => canon(a) === canon(b);
  const strip = c => ({ ...c, photo: undefined, gallery: undefined, events: c.events.map(e => ({ ...e, photos: undefined, receipts: undefined })) });
  const clean = state => JSON.parse(JSON.stringify({ cars: state.cars.filter(c => !c.sample).map(strip), sequence: state.sequence, profile: state.profile }));
  const LISTS = ['events', 'fuels', 'memos'];
  function mergeList(base, local, remote, deep) {
    const B = new Map((base || []).map(x => [x.id, x])), L = new Map((local || []).map(x => [x.id, x])), R = new Map((remote || []).map(x => [x.id, x]));
    const ids = [...L.keys(), ...[...R.keys()].filter(id => !L.has(id))], out = [];
    for (const id of ids) {
      const b = B.get(id), l = L.get(id), r = R.get(id);
      if (l && r) out.push(deep ? deep(b, l, r) : b && same(l, b) ? r : l);
      else if (l) { if (!b || !same(l, b)) out.push(l); }
      else if (!b || !same(r, b)) out.push(r);
    }
    return out;
  }
  function mergeCar(b, l, r) {
    const out = {};
    for (const k of new Set([...Object.keys(l), ...Object.keys(r)])) {
      if (LISTS.includes(k)) continue;
      const v = b && same(l[k], b[k]) ? r[k] : l[k];
      if (v !== undefined) out[k] = v;
    }
    out.events = mergeList(b && b.events, l.events, r.events);
    for (const k of ['fuels', 'memos']) { const v = mergeList(b && b[k], l[k], r[k]); if (v.length || l[k] || r[k]) out[k] = v; }
    return out;
  }
  function merge(base, local, remote) {
    const profile = base ? (same(local.profile, base.profile) ? remote.profile : local.profile) : (local.profile.name ? local.profile : remote.profile);
    return { cars: mergeList(base && base.cars, local.cars, remote.cars, mergeCar), sequence: Math.max(local.sequence, remote.sequence), profile };
  }
  // Put this device's photos and receipts back on the merged cars and keep its example car.
  function withImages(merged, full) {
    const cars = merged.cars.map(c => {
      const mine = full.cars.find(x => x.id === c.id); if (!mine) return c;
      const out = { ...c, events: c.events.map(e => { const me = mine.events.find(x => x.id === e.id); return me ? { ...e, ...(me.photos ? { photos: me.photos } : {}), ...(me.receipts ? { receipts: me.receipts } : {}) } : e; }) };
      if (mine.photo) out.photo = mine.photo; if (mine.gallery) out.gallery = mine.gallery;
      return out;
    });
    return { ...merged, cars: [...full.cars.filter(c => c.sample), ...cars] };
  }

  // First sync on a device: older ids were plain counters (new-car1, new5), so two devices can have used the same id
  // for different things. Give this device's item a new id when the account already has something else under it.
  const tag = () => '-' + Math.random().toString(36).slice(2, 6).padEnd(4, '0');
  function separate(full, remote) {
    const key = c => (c.kind || 'car') + ':' + String(c.plate || '').toUpperCase();
    const cars = full.cars.map(c => {
      if (c.sample) return c;
      // The same vehicle typed in on two devices before signing in becomes one vehicle.
      const twin = c.plate && remote.cars.find(x => x.plate && key(x) === key(c) && !full.cars.some(y => y.id === x.id && y !== c));
      if (twin && twin.id !== c.id) c = { ...c, id: twin.id };
      const r = remote.cars.find(x => x.id === c.id); if (!r) return c;
      if ((r.plate || r.name) !== (c.plate || c.name)) return { ...c, id: c.id.slice(0, 30) + tag() };
      const out = { ...c };
      for (const k of LISTS) if (Array.isArray(c[k]) && Array.isArray(r[k])) out[k] = c[k].map(x => { const y = r[k].find(z => z.id === x.id); return y && !same(k === 'events' ? strip({ events: [x] }).events[0] : x, y) ? { ...x, id: x.id.slice(0, 30) + tag() } : x; });
      return out;
    });
    return { ...full, cars };
  }

  // ---- Sync -----------------------------------------------------------------------------------------
  let state = 'idle', lastError = '', timer = 0, running = null, again = false;
  const App = () => window.AjouraApp;
  // Someone is filling in a form: an entry, vehicle or fill-up form is open, or the cursor is in a field.
  const formViews = ['add', 'edit', 'newcar', 'caredit', 'owner'];
  const busyForm = () => { const v = (location.hash.slice(1).split('/')[0]) || ''; const a = document.activeElement; return formViews.includes(v) || !!document.querySelector('.sheet-layer') || !!(a && a.closest && a.closest('#app-screen') && a.matches('input,textarea,select')); };
  async function syncOnce() {
    await token();
    const uid = session.user.id;
    const rows = await call('/rest/v1/garages?select=data,rev&user_id=eq.' + uid);
    const row = rows && rows[0];
    const stored = getJson(baseKey), base = stored && stored.user === uid ? stored.data : null;
    let full = App().state();
    const remote = row ? row.data : { cars: [], sequence: 0, profile: full.profile };
    if (!base && row) full = separate(full, remote);
    const local = clean(full);
    const merged = merge(base, local, remote);
    if (!same(merged, local)) {
      if (busyForm()) return 'later'; // never redraw a form someone is filling in; retry on the next screen
      if (!App().apply(withImages(merged, full))) throw new Error('invalid data');
    }
    if (!row) await call('/rest/v1/garages', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ user_id: uid, data: merged, rev: 1 }) });
    else if (!same(merged, row.data)) {
      const done = await call('/rest/v1/garages?user_id=eq.' + uid + '&rev=eq.' + row.rev, { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ data: merged, rev: row.rev + 1, updated_at: new Date().toISOString() }) });
      if (!done || !done.length) return 'conflict'; // another device saved in between: merge again
    }
    set(baseKey, JSON.stringify({ user: uid, data: merged }));
    set(syncedKey, String(Date.now()));
    return 'ok';
  }
  async function sync() {
    if (!enabled || !session || !session.user.id || !App() || !App().state) return;
    if (running) { again = true; return running; }
    state = 'syncing'; paintStatus();
    running = (async () => {
      try {
        let r = 'conflict';
        for (let i = 0; i < 3 && r === 'conflict'; i++) r = await syncOnce();
        state = r === 'later' ? 'waiting' : r === 'ok' ? 'ok' : 'error'; lastError = r === 'conflict' ? 'Toinen laite tallensi samaan aikaan. Yritetään uudelleen.' : '';
      } catch (e) {
        state = session ? 'error' : 'idle';
        lastError = !navigator.onLine || e instanceof TypeError ? 'Ei verkkoyhteyttä. Merkinnät ovat tallessa tässä laitteessa ja siirtyvät, kun yhteys palaa.' : 'Synkronointi ei onnistunut juuri nyt. Yritetään pian uudelleen.';
      }
      running = null; paintStatus();
      if (again) { again = false; schedule(500); }
    })();
    return running;
  }
  const schedule = (ms = 1500) => { if (!enabled || !session) return; clearTimeout(timer); timer = setTimeout(sync, ms); };
  function signedOut(note) { saveSession(null); set(baseKey, ''); set(syncedKey, ''); state = 'idle'; flash = note || ''; }
  async function signOut() {
    if (!confirm('Kirjaudutaanko ulos? Autosi ja merkintäsi jäävät myös tähän laitteeseen.')) return;
    const s = session; signedOut('Kirjauduit ulos. Tiedot ovat yhä tällä laitteella.');
    if (s) fetch(BASE + '/auth/v1/logout', { method: 'POST', headers: { apikey: KEY, Authorization: 'Bearer ' + s.access_token } }).catch(() => {});
    rerender();
  }

  // ---- Screens --------------------------------------------------------------------------------------
  let step = { email: '', sent: false }, flash = linkFlash;
  const top = '<div class="app-top"><img class="app-brand" src="logo.svg" width="640" height="198" alt="AJOURA"><span class="demo-label">TESTIVERSIO</span></div>';
  const ago = () => { const t = Number(get(syncedKey)); if (!t) return ''; const m = Math.round((Date.now() - t) / 60000); return m < 1 ? 'juuri nyt' : m < 60 ? m + ' min sitten' : new Intl.DateTimeFormat('fi-FI', { day: 'numeric', month: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(t)); };
  const statusText = () => state === 'syncing' ? 'Synkronoidaan…' : state === 'waiting' ? 'Odottaa, kunnes lomake on tallennettu.' : state === 'error' ? lastError : ago() ? 'Synkronoitu ' + ago() + '.' : 'Ei vielä synkronoitu.';
  function loginView() {
    const back = `<a class="app-back" href="${App() && App().cars().some(c => !c.sample) ? '#me' : '#welcome'}">← Takaisin</a>`;
    if (session) return `${top}${back}<h2 class="app-heading">Olet kirjautunut</h2><p class="success-note" role="status">Olet kirjautunut tilillä <strong translate="no">${esc(session.user.email)}</strong></p><p>Autosi ja merkintäsi siirtyvät nyt puhelimen ja verkkosivun välillä.</p><a class="app-button" href="#home">Omaan talliin <span aria-hidden="true">→</span></a>`;
    const intro = '<p>Kirjaudu sähköpostilla, niin samat autot ja merkinnät näkyvät puhelimessa ja verkkosivulla. Salasanaa ei tarvita: lähetämme kertakäyttöisen koodin.</p>';
    if (!step.sent) return `${top}${back}<h2 class="app-heading">Kirjaudu sisään</h2>${intro}<form class="app-form" id="sync-email-form" novalidate><label>Sähköposti<input name="email" type="email" required maxlength="120" autocomplete="email" inputmode="email" enterkeyhint="send" placeholder="nimi@esimerkki.fi" value="${esc(step.email)}"></label><p class="error-note" id="sync-error" role="alert">${esc(flash)}</p><button class="app-button" type="submit">Lähetä koodi</button></form><p class="app-fineprint">Jos sinulla on jo autoja tässä laitteessa, ne siirtyvät tilillesi kirjautuessa.<br>Kuvat ja kuitit pysyvät toistaiseksi tässä laitteessa.</p>`;
    return `${top}${back}<h2 class="app-heading">Avaa sähköposti</h2><p>Lähetimme viestin osoitteeseen <strong translate="no">${esc(step.email)}</strong></p><p>Jos viestissä on kirjautumislinkki, avaa se tällä laitteella. Puhelimeen asennetussa sovelluksessa kopioi linkki (paina linkkiä pitkään → Kopioi) ja liitä se alle.</p><p>Katso myös roskapostikansio.</p><form class="app-form" id="sync-code-form" novalidate><label>Koodi tai linkki<input name="code" required maxlength="2000" autocomplete="one-time-code" enterkeyhint="done" autocapitalize="off" spellcheck="false" placeholder="123456 tai https://…"></label><p class="error-note" id="sync-error" role="alert">${esc(flash)}</p><button class="app-button" type="submit">Kirjaudu</button></form><button class="app-back" type="button" data-sync-restart>← Vaihda sähköposti</button>`;
  }
  function paint(screen) {
    screen.innerHTML = '<div class="screen-content">' + loginView() + '</div>';
    screen.scrollTop = 0; document.title = 'AJOURA App — Kirjaudu sisään'; // flash stays until the next try or leaving the screen
    const f = screen.querySelector('form input'); if (f) setTimeout(() => f.focus({ preventScroll: true }), 50);
    if (window.AjouraI18n && window.AjouraI18n.apply) window.AjouraI18n.apply(screen);
  }
  // Account card on the Minä tab.
  function meCard() {
    if (!enabled) return '';
    const note = flash ? `<p class="success-note" role="status">${esc(flash)}</p>` : ''; flash = '';
    if (!session) return `<div class="me-data sync-box"><h3>Tili</h3>${note}<p>Kirjautumalla autosi ja merkintäsi tallentuvat turvallisesti ja näkyvät myös verkkosivulla ja uudessa puhelimessa.</p><a class="app-button secondary" href="#login">Kirjaudu sisään</a></div>`;
    return `<div class="me-data sync-box"><h3>Tili</h3>${note}<p>Kirjautunut tilillä <strong translate="no">${esc(session.user.email)}</strong></p><p class="sync-status" role="status">${esc(statusText())}</p><div class="sync-actions"><button class="app-button secondary" type="button" data-sync-now>Synkronoi nyt</button><button class="app-back" type="button" data-sync-out>Kirjaudu ulos</button></div></div>`;
  }
  function paintStatus() { const el = document.querySelector('.sync-status'); if (el) { el.textContent = statusText(); if (window.AjouraI18n && window.AjouraI18n.apply) window.AjouraI18n.apply(el.parentNode); } }
  const rerender = () => { const s = document.getElementById('app-screen'), y = s ? s.scrollTop : 0; if (App()) App().refresh(); if (s) s.scrollTop = y; };
  const showError = msg => { const el = document.getElementById('sync-error'); if (el) el.textContent = window.AjouraI18n ? window.AjouraI18n.t(msg) : msg; };

  document.addEventListener('submit', async ev => {
    const f = ev.target; if (f.id !== 'sync-email-form' && f.id !== 'sync-code-form') return;
    ev.preventDefault(); const btn = f.querySelector('button[type=submit]'); if (btn.disabled) return; flash = '';
    if (f.id === 'sync-email-form') {
      const email = f.email.value.trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return showError('Tarkista sähköpostiosoite.');
      btn.disabled = true;
      try { await sendCode(email); step = { email, sent: true }; rerender(); }
      catch (e) { btn.disabled = false; showError(e.status === 429 ? 'Liian monta koodia lyhyessä ajassa. Odota hetki ja yritä uudelleen.' : e instanceof TypeError ? 'Ei verkkoyhteyttä. Yritä uudelleen.' : 'Koodin lähetys ei onnistunut. Yritä hetken päästä uudelleen.'); }
      return;
    }
    const code = f.code.value.trim();
    if (!linkToken(code) && !/^\d{6,10}$/.test(code.replace(/\s/g, ''))) return showError('Liitä sähköpostin linkki tai koodi.');
    btn.disabled = true;
    try { await verify(step.email, code); step = { email: '', sent: false }; flash = ''; await sync(); location.hash = 'home'; }
    catch (e) { btn.disabled = false; showError(e instanceof TypeError ? 'Ei verkkoyhteyttä. Yritä uudelleen.' : 'Linkki tai koodi ei kelpaa tai se on jo käytetty. Pyydä uusi.'); }
  });
  document.addEventListener('click', ev => {
    const t = ev.target;
    if (t.closest('[data-sync-restart]')) { step = { email: step.email, sent: false }; rerender(); }
    if (t.closest('[data-sync-now]')) sync();
    if (t.closest('[data-sync-out]')) signOut();
  });
  window.addEventListener('hashchange', () => { if (state === 'waiting') schedule(300); if (!location.hash.startsWith('#login') && !location.hash.startsWith('#me')) flash = ''; });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') schedule(200); });
  window.addEventListener('online', () => schedule(200));
  setInterval(() => { if (document.visibilityState === 'visible') schedule(0); }, 60000);

  if (enabled && fromLink) {
    session = { ...fromAuth({ ...fromLink, user: { id: '', email: '' } }) };
    call('/auth/v1/user').then(u => { saveSession({ ...session, user: { id: u.id, email: u.email } }); flash = ''; schedule(0); rerender(); }, () => { session = null; flash = 'Kirjautuminen ei onnistunut. Pyydä uusi linkki.'; location.hash = 'login'; });
  }

  window.AjouraSync = {
    enabled, owns: v => enabled && v === 'login', paint, meCard,
    signedIn: () => !!session, forget: () => signedOut(''), changed: () => schedule(), start: () => schedule(0),
    _merge: merge // for tests
  };
})();

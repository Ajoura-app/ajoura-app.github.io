'use strict';
// AJOURA account and sync: sign in (Google, v0.116) and the garage follows you between devices. Data lives in the
// owners' Supabase project (EU, Ireland); each user can only read and write their own row (row level security,
// supabase/migrations). Photos and receipts stay on the device. This file owns the session: access.js asks it for
// the token (AjouraSync.accessToken), so there is one sign-in for the cloud copy and the AI assistant.
(() => {
  const BASE = 'https://sjamwwcqrwspwvilurqn.supabase.co';
  const KEY = 'sb_publishable_Eo71xHp7YIscRqDdLOOVcA_qzywcyZb'; // publishable key: public by design, row level security does the protecting
  // 0.116 (Niklas 6.11.2026): kirjautuminen ja pilvitallennus käyttöön uudessa projektissa. Vanhan projektin
  // (21.10.2026 pois käytöstä) tallennusavaimia ei lueta, joten vanhat istunnot eivät sekoitu uuteen.
  const enabled = !!(BASE && KEY);

  const get = k => { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } };
  const set = (k, v) => { try { v === '' ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (e) {} };
  const getJson = k => { try { return JSON.parse(get(k) || 'null'); } catch (e) { return null; } };
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const sessionKey = 'ajoura-tili', baseKey = 'ajoura-pilvi-base', syncedKey = 'ajoura-pilvi-synced';

  // ---- Session --------------------------------------------------------------------------------------
  let session = getJson(sessionKey);
  if (!session || !session.refresh_token || !session.user) session = null;
  const saveSession = s => { session = s; set(sessionKey, s ? JSON.stringify(s) : ''); try { document.dispatchEvent(new CustomEvent('ajoura-session')); } catch (e) {} };
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
  // Another tab or the installed app may have refreshed the token already; a used refresh token is refused.
  const fresher = () => { const s = getJson(sessionKey); if (s && s.user && session && s.user.id === session.user.id && s.expires_at > session.expires_at) session = s; };
  window.addEventListener('storage', e => { if (e.key === sessionKey) { const s = getJson(sessionKey); session = s && s.refresh_token && s.user ? s : null; } });
  async function token() {
    if (!session) throw new Error('no session');
    fresher();
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
  // The installed iPhone app keeps its own storage apart from Safari. When the link opens in Safari on a phone,
  // Safari hands the sign-in over: it copies a one-off text (its refresh token) and signs itself out.
  const installedApp = document.documentElement.classList.contains('standalone');
  const phoneBrowser = !installedApp && matchMedia('(pointer: coarse)').matches;
  const handoffToken = text => { const m = /^ajoura-login:(\S{6,200})$/.exec(String(text).trim()); return m ? m[1] : ''; };
  const takeHandoff = async text => saveSession(fromAuth(await call('/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: JSON.stringify({ refresh_token: handoffToken(text) }) }, false)));
  // Back from the link in the browser: #access_token=…&refresh_token=… (or #error=… when the link was old).
  const back = new URLSearchParams(location.hash.slice(1));
  const fromLink = back.get('access_token') && back.get('refresh_token') ? { access_token: back.get('access_token'), refresh_token: back.get('refresh_token'), expires_in: Number(back.get('expires_in')) || 3600 } : null;
  if (fromLink || back.get('error_code') || back.get('error_description')) history.replaceState(null, '', location.pathname + location.search + (fromLink ? (phoneBrowser ? '#login' : '#home') : '#login'));
  let linkFlash = !fromLink && (back.get('error_code') || back.get('error_description')) ? 'Kirjautuminen ei onnistunut. Yritä uudelleen.' : '';
  // Google-kirjautuminen: Supabase ohjaa Googleen ja takaisin tälle sivulle, istunto osoitteen #-osassa (yllä).
  const googleUrl = () => BASE + '/auth/v1/authorize?provider=google&redirect_to=' + encodeURIComponent(appUrl());

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

  // ---- Jaettu talli (0.117) -------------------------------------------------------------------------
  // Omistaja kutsuu linkillä (#liity=koodi, kertakäyttöinen, 7 pv). Kutsu odottaa laitteella kirjautumisen yli.
  const inviteKey = 'ajoura-kutsu';
  if (/^#liity=[\w-]{8,100}$/.test(location.hash)) { set(inviteKey, location.hash.slice(7)); history.replaceState(null, '', location.pathname + location.search + '#liity'); }
  let garage = null, inviteLink = '';
  const rpc = (name, args) => call('/rest/v1/rpc/' + name, { method: 'POST', body: JSON.stringify(args || {}) });
  async function loadGarage() {
    const before = JSON.stringify(garage);
    garage = await rpc('my_garage');
    if (before !== JSON.stringify(garage) && /^#(me|liity)/.test(location.hash)) setTimeout(rerender, 0);
    return garage;
  }
  const say = msg => (window.AjouraI18n ? window.AjouraI18n.t(msg) : msg);
  const joinErrors = { invalid: 'Kutsu on vanhentunut tai jo käytetty. Pyydä uusi kutsu.', own: 'Tämä on oma kutsusi. Lähetä linkki sille, jonka haluat kutsua.',
    already_member: 'Kuulut jo jaettuun talliin. Poistu siitä ensin.', has_members: 'Olet jakanut oman tallisi. Poista ensin sen jäsenet.', full: 'Tallissa on jo enimmäismäärä jäseniä.' };
  async function joinGarage(btn) {
    const code = get(inviteKey); if (!code || !session) return;
    btn.disabled = true;
    try {
      await sync(); // ensin oma talli laitteelle, jotta mikään ei jää pilveen yhdistämättä
      const r = await rpc('accept_invite', { p_token: code });
      set(inviteKey, '');
      if (!r || !r.ok) { flash = joinErrors[r && r.reason] || joinErrors.invalid; rerender(); return; }
      set(baseKey, ''); garage = null;
      await sync();
      flash = 'Liityit jaettuun talliin. Omat autosi ja merkintäsi ovat nyt yhteisessä tallissa.'; location.hash = 'me'; rerender();
    } catch (e) { btn.disabled = false; flash = 'Liittyminen ei onnistunut. Tarkista verkkoyhteys ja yritä uudelleen.'; rerender(); }
  }
  async function createInvite() {
    try { await token(); const r = await rpc('create_invite'); inviteLink = appUrl() + '#liity=' + r.token; flash = ''; }
    catch (e) { flash = 'Kutsua ei voitu luoda. Tallissa voi olla enintään viisi jäsentä ja viisi avointa kutsua.'; }
    rerender();
  }
  async function removeMember(id, email) {
    if (!confirm(say('Poistetaanko jäsen jaetusta tallista? Hänen laitteelleen jo siirtyneet tiedot jäävät hänelle.') + '\n' + email)) return;
    try { await token(); await rpc('remove_member', { p_member: id }); await loadGarage(); flash = 'Jäsen poistettu.'; }
    catch (e) { flash = 'Jäsenen poisto ei onnistunut. Yritä uudelleen.'; }
    rerender();
  }
  async function leaveGarage() {
    if (!confirm(say('Poistutaanko jaetusta tallista? Tallin tiedot jäävät tähän laitteeseen omaksi kopioksesi.'))) return;
    try { await token(); await rpc('leave_garage'); set(baseKey, ''); garage = null; await sync(); flash = 'Poistuit jaetusta tallista. Tiedot jäivät tähän laitteeseen.'; }
    catch (e) { flash = 'Poistuminen ei onnistunut. Yritä uudelleen.'; }
    rerender();
  }
  function shareBox() {
    if (!garage) return '';
    if (garage.role === 'member') return `<div class="sync-share"><h4>Jaettu talli</h4><p><span>Tämä talli on jaettu käyttäjältä</span> <strong translate="no">${esc(garage.owner_email || '')}</strong><span>. Voit muokata sitä kuten omaasi.</span></p><button class="app-back" type="button" data-sync-leave>Poistu jaetusta tallista</button></div>`;
    const members = garage.members || [];
    const list = members.length ? `<ul class="sync-members">${members.map(m => `<li><span translate="no">${esc(m.email)}</span><button class="app-back danger-link" type="button" data-sync-remove="${esc(m.id)}" data-email="${esc(m.email)}">Poista</button></li>`).join('')}</ul>` : '';
    const link = inviteLink ? `<label class="app-form sync-invite">Kutsulinkki (kertakäyttöinen, voimassa 7 päivää)<input readonly value="${esc(inviteLink)}" data-sync-link></label><div class="sync-actions"><button class="app-button" type="button" data-sync-share-link>Jaa linkki</button></div>` : '';
    return `<div class="sync-share"><h4>Jaettu talli</h4><p>Kutsu esimerkiksi puolisosi: hän kirjautuu omalla Google-tilillään ja näkee ja muokkaa samaa tallia. Kuvat ja kuitit eivät jakaudu.</p>${list}${link}${inviteLink ? '' : `<button class="app-button secondary" type="button" data-sync-invite>Luo kutsulinkki</button>`}</div>`;
  }
  function joinView() {
    const code = get(inviteKey);
    const note = flash ? `<p class="error-note" role="alert">${esc(flash)}</p>` : '';
    if (!code) return `${top}<h2 class="app-heading">Jaettu talli</h2>${note}<p>Kutsua ei löytynyt. Pyydä tallin omistajalta uusi kutsulinkki.</p><a class="app-button secondary" href="#home">Omaan talliin</a>`;
    if (!session) return `${top}<h2 class="app-heading">Sinut on kutsuttu jaettuun talliin</h2>${note}<p>Kirjaudu ensin omalla Google-tililläsi. Sen jälkeen voit liittyä talliin.</p><a class="app-button sync-google" href="${esc(googleUrl())}" data-sync-google><span class="sync-g" aria-hidden="true" translate="no">G</span> <span>Kirjaudu Google-tilillä</span></a><p class="app-fineprint">Tiedot tallentuvat Supabase-palveluun EU:ssa. <a href="tietosuoja.html">Tietosuoja</a></p>`;
    return `${top}<h2 class="app-heading">Liity jaettuun talliin?</h2>${note}<p>Omat autosi, merkintäsi ja tankkauksesi siirtyvät yhteiseen talliin, ja tallin muut jäsenet näkevät ja voivat muokata niitä. Kuvat ja kuitit jäävät tähän laitteeseen.</p><p>Voit poistua tallista myöhemmin, jolloin tiedot jäävät laitteellesi.</p><button class="app-button" type="button" data-sync-join>Liity talliin</button><button class="app-back" type="button" data-sync-join-cancel>Peruuta</button>`;
  }

  // ---- Sync -----------------------------------------------------------------------------------------
  let state = 'idle', lastError = '', timer = 0, running = null, again = false;
  const App = () => window.AjouraApp;
  // Someone is filling in a form: an entry, vehicle or fill-up form is open, or the cursor is in a field.
  const formViews = ['add', 'edit', 'newcar', 'caredit', 'owner', 'fuel', 'notes'];
  const busyForm = () => { const v = (location.hash.slice(1).split('/')[0]) || ''; const a = document.activeElement; return formViews.includes(v) || !!document.querySelector('.sheet-layer') || !!(a && a.closest && a.closest('#app-screen') && a.matches('input,textarea,select')); };
  async function syncOnce() {
    await token();
    const uid = session.user.id;
    // 0.117 jaettu talli: talli on omistajan rivi. Jäsen synkronoi omistajan riviä; muuten oma rivi.
    const g = await loadGarage(), owner = g && g.owner ? g.owner : uid;
    const rows = await call('/rest/v1/garages?select=data,rev&user_id=eq.' + owner);
    const row = rows && rows[0];
    if (!row && owner !== uid) return 'empty'; // omistaja ei ole vielä tallentanut talliaan pilveen
    // Pohjakopio kelpaa vain samalle tallille: talli vaihtui (liittyminen, poistuminen) = yhdistetään, ei poisteta mitään.
    const stored = getJson(baseKey), base = row && stored && stored.user === uid && (stored.owner || stored.user) === owner ? stored.data : null; // no cloud row: upload, never treat local cars as deleted
    let full = App().state();
    const remote = row ? row.data : { cars: [], sequence: 0, profile: full.profile };
    if (!base && row) full = separate(full, remote);
    const local = clean(full);
    const merged = merge(base, local, remote);
    if (!same(merged, local)) {
      if (busyForm()) return 'later'; // never redraw a form someone is filling in; retry on the next screen
      if (!App().apply(withImages(merged, full))) throw new Error('invalid data');
    }
    // This device now holds the cloud copy merged in: if the save below fails or loses a race, the retry merges against it.
    if (row) set(baseKey, JSON.stringify({ user: uid, owner, data: row.data }));
    if (!row) await call('/rest/v1/garages', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ user_id: uid, data: merged, rev: 1 }) });
    else if (!same(merged, row.data)) {
      const done = await call('/rest/v1/garages?user_id=eq.' + owner + '&rev=eq.' + row.rev, { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ data: merged, rev: row.rev + 1, updated_at: new Date().toISOString() }) });
      if (!done || !done.length) return 'conflict'; // another device saved in between: merge again
    }
    set(baseKey, JSON.stringify({ user: uid, owner, data: merged }));
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
        state = r === 'later' ? 'waiting' : r === 'ok' || r === 'empty' ? 'ok' : 'error'; lastError = r === 'conflict' ? 'Toinen laite tallensi samaan aikaan. Yritetään uudelleen.' : '';
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
  // The base copy stays (it is per user): signing back in later merges instead of duplicating entries.
  function signedOut(note) { saveSession(null); set(syncedKey, ''); state = 'idle'; flash = note || ''; garage = null; inviteLink = ''; }
  async function signOut() {
    if (!confirm('Kirjaudutaanko ulos? Autosi ja merkintäsi jäävät myös tähän laitteeseen.')) return;
    const s = session; signedOut('Kirjauduit ulos. Tiedot ovat yhä tällä laitteella.');
    if (s) fetch(BASE + '/auth/v1/logout', { method: 'POST', headers: { apikey: KEY, Authorization: 'Bearer ' + s.access_token } }).catch(() => {});
    rerender();
  }

  // Tilin poisto (0.116): palvelin poistaa tilin, pilvitallin, tilauksen ja käytön. Tämän laitteen tiedot jäävät.
  async function deleteAccount() {
    const q = 'Poistetaanko tilisi ja pilveen tallennetut tiedot? Tämän laitteen autot ja merkinnät jäävät. Poistoa ei voi perua.';
    if (!session || !confirm(window.AjouraI18n ? window.AjouraI18n.t(q) : q)) return;
    try { await token(); await call('/rest/v1/rpc/delete_my_account', { method: 'POST', body: '{}' }); }
    catch (e) { flash = 'Tilin poisto ei onnistunut. Tarkista verkkoyhteys ja yritä uudelleen.'; rerender(); return; }
    signedOut('Tili ja pilvitiedot poistettu. Tiedot ovat yhä tällä laitteella.'); set(baseKey, ''); garage = null; inviteLink = ''; rerender();
  }

  // ---- Screens --------------------------------------------------------------------------------------
  let step = { email: '', sent: false }, flash = linkFlash;
  const top = '<div class="app-top"><img class="app-brand" src="logo.svg" width="640" height="198" alt="AJOURA"><span class="demo-label">TESTIVERSIO</span></div>';
  const ago = () => { const t = Number(get(syncedKey)); if (!t) return ''; const m = Math.round((Date.now() - t) / 60000); return m < 1 ? 'juuri nyt' : m < 60 ? m + ' min sitten' : new Intl.DateTimeFormat('fi-FI', { day: 'numeric', month: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(t)); };
  const statusText = () => state === 'syncing' ? 'Synkronoidaan…' : state === 'waiting' ? 'Odottaa, kunnes lomake on tallennettu.' : state === 'error' ? lastError : ago() ? 'Synkronoitu ' + ago() + '.' : 'Ei vielä synkronoitu.';
  function loginView() {
    const back = `<a class="app-back" href="${App() && App().cars().some(c => !c.sample) ? '#me' : '#welcome'}">← Takaisin</a>`;
    if (session) return `${top}${back}<h2 class="app-heading">Olet kirjautunut</h2><p class="success-note" role="status">Olet kirjautunut tilillä <strong translate="no">${esc(session.user.email)}</strong></p><p>Autosi ja merkintäsi siirtyvät nyt puhelimen ja verkkosivun välillä.</p>${phoneBrowser ? handoffBox() : ''}<a class="app-button${phoneBrowser ? ' secondary' : ''}" href="#home">${phoneBrowser ? 'Jatka selaimessa' : 'Omaan talliin'} <span aria-hidden="true">→</span></a>`;
    const note = flash ? `<p class="error-note" role="alert">${esc(flash)}</p>` : '';
    return `${top}${back}<h2 class="app-heading">Kirjaudu sisään</h2>${note}<p>Kirjautumalla autosi, merkintäsi ja tankkauksesi tallentuvat pilveen ja näkyvät myös toisella laitteella. Kuvat ja kuitit jäävät tähän laitteeseen.</p><p>Testivaiheessa kirjautuneena voit kokeilla myös tekoälyavustajaa maksutta.</p><a class="app-button sync-google" href="${esc(googleUrl())}" data-sync-google><span class="sync-g" aria-hidden="true" translate="no">G</span> <span>Kirjaudu Google-tilillä</span></a><p class="app-fineprint">Tiedot tallentuvat Supabase-palveluun EU:ssa. <a href="tietosuoja.html">Tietosuoja</a></p>${installedApp ? pasteBox() : ''}`;
  }
  const handoffBox = () => `<div class="me-data sync-handoff"><h3>Käytätkö kotivalikon AJOURA-sovellusta?</h3><p>Linkki avautui selaimeen, joten kotivalikon sovellus ei vielä ole kirjautunut. Siirrä kirjautuminen sinne:</p><ol class="sync-steps"><li>Paina Kopioi kirjautuminen.</li><li>Avaa AJOURA kotivalikosta ja valitse Valikko → Varmuuskopio ja tiedot → Kirjaudu sisään.</li><li>Liitä teksti kohtaan Liitä kirjautuminen ja paina Kirjaudu.</li></ol><button class="app-button" type="button" data-sync-handoff>Kopioi kirjautuminen</button><p class="app-fineprint">Selain kirjautuu samalla ulos. Kirjautumisen voi siirtää vain yhdelle laitteelle.</p></div>`;
  const pasteBox = () => `<div class="me-data sync-handoff"><h3>Avasitko linkin selaimessa?</h3><p>Liitä selaimessa kopioimasi kirjautuminen tähän.</p><form class="app-form" id="sync-handoff-form" novalidate><label>Liitä kirjautuminen<input name="handoff" maxlength="300" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="ajoura-login:…"></label><p class="error-note" id="sync-handoff-error" role="alert"></p><button class="app-button secondary" type="submit">Kirjaudu</button></form></div>`;
  function paint(screen, view) {
    screen.innerHTML = '<div class="screen-content">' + (view === 'liity' ? joinView() : loginView()) + '</div>';
    screen.scrollTop = 0; document.title = 'AJOURA App — Kirjaudu sisään'; // flash stays until the next try or leaving the screen
    const f = screen.querySelector('form input'); if (f) setTimeout(() => f.focus({ preventScroll: true }), 50);
    if (window.AjouraI18n && window.AjouraI18n.apply) window.AjouraI18n.apply(screen);
  }
  // Account card on the Minä tab.
  function meCard() {
    if (!enabled) return '';
    // Viesti pysyy, kunnes käyttäjä siirtyy pois (hashchange tyhjentää), vaikka kortti piirretään välillä uudelleen.
    const note = flash ? `<p class="success-note" role="status">${esc(flash)}</p>` : '';
    if (!session) return `<div class="me-data sync-box"><h3>Tili</h3>${note}<p>Kirjautumalla autosi, merkintäsi ja tankkauksesi tallentuvat pilveen ja siirtyvät uuteen puhelimeen. Kuvat ja kuitit jäävät tähän laitteeseen.</p><a class="app-button secondary" href="#login">Kirjaudu sisään</a></div>`;
    return `<div class="me-data sync-box"><h3>Tili</h3>${note}<p>Kirjautunut tilillä <strong translate="no">${esc(session.user.email)}</strong></p><p class="sync-status" role="status">${esc(statusText())}</p><div class="sync-actions"><button class="app-button secondary" type="button" data-sync-now>Synkronoi nyt</button><button class="app-back" type="button" data-sync-out>Kirjaudu ulos</button></div>${phoneBrowser ? '<a class="app-back" href="#login">Siirrä kirjautuminen kotivalikon sovellukseen →</a>' : ''}${shareBox()}</div><button class="app-back danger-link sync-delete" type="button" data-sync-delete>Poista tili ja pilvitiedot</button>`;
  }
  function paintStatus() { const el = document.querySelector('.sync-status'); if (el) { el.textContent = statusText(); if (window.AjouraI18n && window.AjouraI18n.apply) window.AjouraI18n.apply(el.parentNode); } }
  const rerender = () => { const s = document.getElementById('app-screen'), y = s ? s.scrollTop : 0; if (App()) App().refresh(); if (s) s.scrollTop = y; };
  const showError = msg => { const el = document.getElementById('sync-error'); if (el) el.textContent = window.AjouraI18n ? window.AjouraI18n.t(msg) : msg; };

  document.addEventListener('submit', async ev => {
    const f = ev.target; if (f.id !== 'sync-email-form' && f.id !== 'sync-code-form' && f.id !== 'sync-handoff-form') return;
    ev.preventDefault(); const btn = f.querySelector('button[type=submit]'); if (btn.disabled) return; flash = '';
    const pasted = (f.handoff || f.code || {}).value || '';
    if (f.id === 'sync-handoff-form' || handoffToken(pasted)) {
      const err = msg => { const el = document.getElementById(f.id === 'sync-handoff-form' ? 'sync-handoff-error' : 'sync-error'); if (el) el.textContent = window.AjouraI18n ? window.AjouraI18n.t(msg) : msg; };
      if (!handoffToken(pasted)) return err('Liitä teksti, jonka kopioit selaimessa (alkaa ajoura-login:).');
      btn.disabled = true;
      try { await takeHandoff(pasted); step = { email: '', sent: false }; await sync(); location.hash = 'home'; }
      catch (e) { btn.disabled = false; err(e instanceof TypeError ? 'Ei verkkoyhteyttä. Yritä uudelleen.' : 'Kirjautumista ei voitu siirtää. Se on ehkä jo käytetty. Pyydä uusi linkki.'); }
      return;
    }
    if (f.id === 'sync-email-form') {
      const email = f.email.value.trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return showError('Tarkista sähköpostiosoite.');
      btn.disabled = true;
      try { await sendCode(email); step = { email, sent: true }; rerender(); }
      catch (e) { btn.disabled = false; showError(e.status === 429 ? 'Liian monta yritystä lyhyessä ajassa. Odota hetki ja yritä uudelleen.' : e instanceof TypeError ? 'Ei verkkoyhteyttä. Yritä uudelleen.' : 'Linkin lähetys ei onnistunut. Yritä hetken päästä uudelleen.'); }
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
    if (t.closest('[data-sync-delete]')) deleteAccount();
    if (t.closest('[data-sync-invite]')) createInvite();
    const rm = t.closest('[data-sync-remove]'); if (rm) removeMember(rm.dataset.syncRemove, rm.dataset.email || '');
    if (t.closest('[data-sync-leave]')) leaveGarage();
    const jn = t.closest('[data-sync-join]'); if (jn) joinGarage(jn);
    if (t.closest('[data-sync-join-cancel]')) { set(inviteKey, ''); location.hash = 'home'; }
    if (t.closest('[data-sync-share-link]') && inviteLink) {
      const text = say('Liity jaettuun AJOURA-talliini');
      if (navigator.share) navigator.share({ title: 'AJOURA', text, url: inviteLink }).catch(() => {});
      else if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(inviteLink).then(() => { flash = 'Linkki kopioitu.'; rerender(); }, () => {});
    }
    if (t.matches('[data-sync-link]')) t.select();
    const h = t.closest('[data-sync-handoff]');
    if (h && session) {
      const text = 'ajoura-login:' + session.refresh_token;
      const done = () => { signedOut('Kirjautuminen kopioitu. Avaa nyt AJOURA kotivalikosta ja liitä se kohtaan Liitä kirjautuminen.'); location.hash = 'me'; rerender(); };
      const manual = () => { h.outerHTML = `<label class="app-form">Kopioi tämä teksti<input readonly value="${esc(text)}" onfocus="this.select()"></label><button class="app-button" type="button" data-sync-handoff-done>Kopioitu</button>`; };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, manual); else manual();
    }
    if (t.closest('[data-sync-handoff-done]')) { signedOut('Avaa nyt AJOURA kotivalikosta ja liitä kirjautuminen kohtaan Liitä kirjautuminen.'); location.hash = 'me'; rerender(); }
  });
  window.addEventListener('hashchange', () => { if (state === 'waiting') schedule(300); if (!location.hash.startsWith('#login') && !location.hash.startsWith('#me')) flash = ''; });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') schedule(200); });
  window.addEventListener('online', () => schedule(200));
  setInterval(() => { if (document.visibilityState === 'visible') schedule(0); }, 60000);

  if (enabled && fromLink) {
    session = { ...fromAuth({ ...fromLink, user: { id: '', email: '' } }) };
    call('/auth/v1/user').then(u => { saveSession({ ...session, user: { id: u.id, email: u.email } }); flash = ''; schedule(0); if (get(inviteKey)) location.hash = 'liity'; rerender(); }, () => { session = null; flash = 'Kirjautuminen ei onnistunut. Pyydä uusi linkki.'; location.hash = 'login'; rerender(); });
  }

  window.AjouraSync = {
    enabled, owns: v => enabled && (v === 'login' || v === 'liity'), paint, meCard,
    // access.js: voimassa oleva istuntotunniste (uusitaan tarvittaessa) ja tili. Ei tunnistetta = ei kirjautunut.
    accessToken: async () => { if (!enabled || !session || !session.user.id) return ''; try { await token(); } catch (e) { return ''; } return session ? session.access_token : ''; },
    account: () => (session && session.user.id ? { email: session.user.email } : null), apiKey: KEY, base: BASE,
    signedIn: () => !!session, forget: () => { signedOut(''); set(baseKey, ''); }, changed: () => schedule(), start: () => schedule(0),
    // Readiness only; never grants access. Assistant server rechecks snapshot and membership.
    analysisReady: () => {
      const b=getJson(baseKey),user=session?.user?.id;
      return !!(user&&state==='ok'&&!running&&b?.user===user&&(b.owner||user)===(garage?.owner||user)&&!formViews.includes(location.hash.slice(1).split('/')[0])&&!document.querySelector('.sheet-layer')&&same(clean(App().state()),b.data));
    },
    _merge: merge // for tests
  };
})();

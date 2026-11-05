'use strict';
// AJOURA Plus -valmius (v0.111): keskitetty ominaisuus- ja käyttöoikeusmalli. Kaikki maksullisten ominaisuuksien
// tarkistukset kulkevat tämän tiedoston kautta (window.AjouraAccess); muualle sovellukseen ei kirjoiteta omia
// Plus-ehtoja.
//
// Kaksi toisistaan riippumatonta tilaa:
// - aiEnabled: käyttäjän oma valinta (Asetukset → Uudet ominaisuudet). Laitteen asetus localStorage 'ajoura-tekoaly',
//   oletus pois. Ei ole osa varmuuskopiota eikä ajoneuvojen tietoja.
// - aiEntitled: palvelimen vahvistama käyttöoikeus. Pidetään vain muistissa, EI koskaan localStoragessa, joten
//   selaimen tietoja muokkaamalla sitä ei saa päälle. Haetaan joka käynnistyksellä palvelimelta.
// Tekoälyominaisuutta saa käyttää vain, kun molemmat ovat voimassa (ja kuukausikiintiötä on jäljellä, jos sellainen on).
//
// TURVALLISUUS: tämä tiedosto on vain käyttöliittymän lukitus. Selaimessa ajettavaa koodia voi aina muuttaa, joten
// varsinainen suoja on palvelimella: tekoälyfunktio tarkistaa käyttäjän, voimassa olevan tilauksen ja kiintiön
// omasta tietokannastaan JOKAISESSA pyynnössä eikä luota mihinkään selaimen lähettämään tietoon oikeuksista.
//
// Taustapalvelu (v0.112): Supabase-projekti sjamwwcqrwspwvilurqn, koodi kansiossa supabase/ (testit/test_supabase.py).
// 1. GET /rest/v1/rpc/get_entitlement käyttäjän istuntotunnisteella (Authorization: Bearer …)
//    → {"plan":"plus","status":"active","validUntil":"2027-01-31T23:59:59Z",
//       "quota":{"ai":{"limit":30,"used":12,"resetsAt":"2026-12-01T00:00:00Z"}}}
//    plan: 'free' | 'plus'; quota.ai.limit null = ei rajaa. Virhe tai puuttuva tieto → Free.
// 2. POST /functions/v1/tekoaly, runko = kuva, otsakkeet Authorization ja X-Ajoura-Feature (esim. ai.receipt).
//    Vastaukset: 200 tulos (JSON), 401/402/403 ei oikeutta, 429 kiintiö täynnä, 503 tekoälyä ei ole otettu käyttöön.
// Kirjautuminen (sähköpostikoodi, Supabase Auth) on vain tiimin testikäyttöön (Ylläpito → ominaisuus "account").
// Ilman kirjautumista sovellus ei ota yhteyttä palvelimeen lainkaan: oikeuksia ei kysytä eikä mitään lähetetä.
(() => {
  // Supabase-projekti. key on julkinen (publishable) avain: se kuuluu selaimeen, ja rivitason suojaus ja funktiot
  // rajaavat, mitä sillä saa. Tyhjä avain = palvelua ei ole kytketty: mitään ei lähetetä verkkoon.
  const SUPABASE = { url: 'https://sjamwwcqrwspwvilurqn.supabase.co', key: '' };
  const SERVICE = SUPABASE.key ? { entitlements: SUPABASE.url + '/rest/v1/rpc/get_entitlement', ai: SUPABASE.url + '/functions/v1/tekoaly' } : { entitlements: '', ai: '' };

  // Paketit ja niiden ominaisuudet. Hintoja ja lopullisia käyttörajoja ei ole päätetty: rajat tulevat palvelimelta.
  const PLANS = { free: [], plus: ['ai.receipt', 'ai.odometer', 'ai.servicebook'] };
  // Ominaisuudet: pref = mikä käyttäjän oma valinta vaaditaan lisäksi, quota = mikä kuukausikiintiö kuluu.
  const FEATURES = {
    'ai.receipt': { pref: 'ai', quota: 'ai' },     // tankkauskuitit
    'ai.odometer': { pref: 'ai', quota: 'ai' },    // mittariston kilometrilukema
    'ai.servicebook': { pref: 'ai', quota: 'ai' }  // vanhan huoltokirjan merkinnät
  };
  const PREF = { ai: 'ajoura-tekoaly' };

  const get = k => { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } };
  const set = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} };
  const del = k => { try { localStorage.removeItem(k); } catch (e) {} };

  const FREE = Object.freeze({ plan: 'free', active: false, validUntil: 0, quota: Object.freeze({}) });
  let ent = FREE;

  // ---- Tili (Supabase Auth) ---------------------------------------------------------------------------------
  // Istunto on Supabasen allekirjoittama tunniste: sen muokkaaminen ei anna oikeuksia, palvelin tarkistaa sen.
  // Oma avain (ei sync.js:n 'ajoura-session', joka kuuluu vanhaan, käytöstä poistettuun projektiin).
  const SESSION = 'ajoura-tili';
  const readSession = () => { try { const v = JSON.parse(get(SESSION) || 'null'); return v && v.access_token && v.refresh_token && v.user && v.user.id ? v : null; } catch (e) { return null; } };
  let session = SERVICE.entitlements ? readSession() : null;
  const keep = d => { session = { access_token: d.access_token, refresh_token: d.refresh_token, expires_at: Date.now() + (Number(d.expires_in) || 3600) * 1000, user: { id: d.user.id, email: d.user.email || '' } }; set(SESSION, JSON.stringify(session)); };
  async function auth(path, body) {
    const r = await fetch(SUPABASE.url + '/auth/v1/' + path, { method: 'POST', credentials: 'omit', cache: 'no-store', headers: { apikey: SUPABASE.key, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const b = await r.json().catch(() => null);
    if (!r.ok) throw Object.assign(new Error('auth ' + r.status), { status: r.status });
    return b;
  }
  // Voimassa oleva tunniste; vanheneva uusitaan. Hylätty uusinta = uloskirjaus (tili poistettu tai istunto peruttu).
  async function token() {
    if (!session) return '';
    if (session.expires_at - Date.now() > 60000) return session.access_token;
    try { keep(await auth('token?grant_type=refresh_token', { refresh_token: session.refresh_token })); return session.access_token; }
    catch (e) { if (e.status >= 400 && e.status < 500) forget(); return ''; }
  }
  function forget() { session = null; del(SESSION); ent = FREE; status = 'none'; changed(); }
  // Sähköpostiin tulee kirjautumiskoodi (tai linkki, jos Supabasen viestipohjassa on vain linkki: sen voi liittää koodin tilalle).
  async function sendCode(email) { if (!SERVICE.entitlements) throw fail('service'); await auth('otp', { email: String(email).trim(), create_user: true }); }
  async function verifyCode(email, input) {
    if (!SERVICE.entitlements) throw fail('service');
    let body = { type: 'email', email: String(email).trim(), token: String(input).replace(/\s/g, '') };
    try { const u = new URL(String(input).trim()); const t = u.searchParams.get('token_hash') || u.searchParams.get('token'); if (t) body = { type: u.searchParams.get('type') || 'magiclink', token_hash: t }; } catch (e) { /* koodi, ei linkki */ }
    keep(await auth('verify', body));
    await refresh();
  }
  async function signOut() {
    const t = session && session.access_token;
    forget();
    if (t) fetch(SUPABASE.url + '/auth/v1/logout', { method: 'POST', credentials: 'omit', headers: { apikey: SUPABASE.key, Authorization: 'Bearer ' + t } }).catch(() => {});
  }
  const account = () => (session ? { email: session.user.email } : null);

  let status = session ? 'checking' : 'none'; // none = ei palvelua tai ei kirjautunut, ok = tarkistettu, error = ei yhteyttä

  // Palvelimen vastaus → sisäinen tila. Kaikki tuntematon tai puutteellinen tulkitaan Freeksi. Kiintiön raja null = ei
  // rajaa; puuttuva tai virheellinen raja = 0 (ei käyttöä), jotta virhe ei koskaan avaa rajatonta käyttöä.
  const nonNeg = v => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null);
  function parse(b) {
    if (!b || typeof b !== 'object' || !Object.prototype.hasOwnProperty.call(PLANS, b.plan) || b.plan === 'free') return FREE;
    const until = typeof b.validUntil === 'string' ? Date.parse(b.validUntil) : NaN;
    if (b.status !== 'active' || !(until > Date.now())) return FREE;
    const quota = {};
    for (const [k, q] of Object.entries(b.quota && typeof b.quota === 'object' ? b.quota : {})) {
      if (!q || typeof q !== 'object') continue;
      const limit = q.limit === null ? null : nonNeg(q.limit) ?? 0, used = nonNeg(q.used) || 0, resets = Date.parse(q.resetsAt);
      quota[k] = Object.freeze({ limit, used, resetsAt: Number.isNaN(resets) ? 0 : resets });
    }
    return Object.freeze({ plan: b.plan, active: true, validUntil: until, quota: Object.freeze(quota) });
  }
  // Tilaus voi päättyä sovelluksen ollessa auki: voimassaolo tarkistetaan joka kutsulla, ei vain haettaessa.
  const current = () => (ent.active && ent.validUntil > Date.now() ? ent : FREE);

  function changed() { try { document.dispatchEvent(new CustomEvent('ajoura-access')); } catch (e) {} }
  const authHeaders = async () => { const t = await token(); return t ? { apikey: SUPABASE.key, Authorization: 'Bearer ' + t } : null; };

  let pending = null, checkedAt = 0, expiry = 0; // expiry: ilmoitus, kun tilauskausi päättyy sovelluksen ollessa auki
  function refresh() {
    if (!SERVICE.entitlements || !session) return Promise.resolve(current());
    if (pending) return pending;
    pending = authHeaders()
      .then(h => (h ? fetch(SERVICE.entitlements, { headers: h, credentials: 'omit', cache: 'no-store' }) : null))
      .then(r => (r && r.ok ? r.json() : null))
      .then(b => { ent = parse(b); status = 'ok'; }, () => { ent = FREE; status = 'error'; })
      .then(() => { clearTimeout(expiry); if (ent.active) expiry = setTimeout(changed, Math.min(ent.validUntil - Date.now() + 50, 2 ** 31 - 1)); })
      .then(() => { pending = null; checkedAt = Date.now(); changed(); return current(); });
    return pending;
  }

  const plan = () => current().plan;
  const entitled = f => Object.prototype.hasOwnProperty.call(FEATURES, f) && PLANS[plan()].includes(f);
  const prefOn = p => get(PREF[p]) === '1';
  const aiEnabled = () => prefOn('ai');
  function setAiEnabled(on) { set(PREF.ai, on ? '1' : '0'); changed(); }
  function quota(kind) {
    const q = current().quota[kind];
    if (!q) return null;
    return { limit: q.limit, used: q.used, left: q.limit === null ? null : Math.max(0, q.limit - q.used), resetsAt: q.resetsAt };
  }
  // Ainoa tarkistus, jota sovellus käyttää. reason: 'unknown' (ei tällaista ominaisuutta), 'plan' (ei Plus-oikeutta),
  // 'off' (käyttäjä on kytkenyt pois), 'quota' (kuukauden kiintiö käytetty).
  function check(f) {
    const def = FEATURES[f];
    if (!def) return { ok: false, reason: 'unknown' };
    if (!entitled(f)) return { ok: false, reason: 'plan' };
    if (def.pref && !prefOn(def.pref)) return { ok: false, reason: 'off' };
    const q = def.quota ? quota(def.quota) : null;
    if (q && q.left === 0) return { ok: false, reason: 'quota' };
    return { ok: true, reason: '' };
  }

  const fail = reason => Object.assign(new Error('AjouraAccess: ' + reason), { reason });
  // Ainoa reitti, jota pitkin kuva voi lähteä tekoälypalveluun. Ilman voimassa olevaa oikeutta ja käyttäjän valintaa
  // pyyntöä ei tehdä lainkaan. Palvelimen kielto (402/403) sulkee oikeuden heti myös käyttöliittymästä.
  async function recognize(f, file) {
    const c = check(f);
    if (!c.ok) throw fail(c.reason);
    if (!SERVICE.ai) throw fail('service');
    let r;
    try {
      const h = await authHeaders();
      if (!h) throw fail('plan');
      r = await fetch(SERVICE.ai, { method: 'POST', body: file, credentials: 'omit', cache: 'no-store',
        headers: { ...h, 'Content-Type': (file && file.type) || 'application/octet-stream', 'X-Ajoura-Feature': f } });
    } catch (e) { throw e.reason ? e : fail('network'); }
    if (r.status === 402 || r.status === 403 || r.status === 401) { ent = FREE; changed(); refresh(); throw fail('plan'); }
    if (r.status === 429) { refresh(); throw fail('quota'); }
    if (!r.ok) throw fail('service');
    refresh();
    return r.json();
  }

  // Oikeudet tarkistetaan uudelleen, kun sovellus palaa näkyviin (enintään kerran 10 minuutissa) tai verkko palaa.
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && Date.now() - checkedAt > 6e5) refresh(); });
  window.addEventListener('online', () => refresh());
  refresh();

  // Lukittu olio: muut skriptit eivät voi vaihtaa sitä tai sen funktioita. (Kehittäjätyökaluilla voi silti muuttaa
  // mitä tahansa selaimessa, siksi palvelin tarkistaa oikeuden itse.)
  Object.defineProperty(window, 'AjouraAccess', { enumerable: true, value: Object.freeze({
    plans: Object.freeze(Object.keys(PLANS)), features: Object.freeze(Object.keys(FEATURES)),
    plan, entitled, aiEnabled, setAiEnabled, check, can: f => check(f).ok, quota, recognize, refresh,
    status: () => status, serviceReady: () => !!(SERVICE.entitlements && SERVICE.ai),
    account, sendCode, verifyCode, signOut
  }) });
})();

// Tekoälyfunktion testi (Node: node --test supabase/testit/). Keksitty Supabase: käyttäjät, tilaukset ja kiintiö muistissa.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHandler } from '../functions/tekoaly/index.ts';

const BASE = 'https://projekti.test';
const ENV = { SUPABASE_URL: BASE, SUPABASE_PUBLISHABLE_KEYS: '{"default":"sb_publishable_testi"}', SUPABASE_SECRET_KEYS: '{"default":"sb_secret_testi"}' };

function fakeSupabase({ plan = {}, limit = 2 } = {}) {
  const tokens = { 'tunniste-free': 'u-free', 'tunniste-plus': 'u-plus' };
  const used = {}, calls = [];
  const fetchImpl = async (url, init = {}) => {
    const h = init.headers || {};
    calls.push({ url, headers: h });
    if (url === `${BASE}/auth/v1/user`) {
      const id = tokens[(h.Authorization || '').replace('Bearer ', '')];
      assert.equal(h.apikey, 'sb_publishable_testi');
      return id ? Response.json({ id }) : new Response('{}', { status: 401 });
    }
    if (url.startsWith(`${BASE}/rest/v1/rpc/`)) {
      assert.equal(h.apikey, 'sb_secret_testi', 'palvelinkutsu ilman salaista avainta');
      assert.equal(h.Authorization, undefined, 'uusi salainen avain ei kuulu Authorization-otsakkeeseen');
      const args = JSON.parse(init.body), name = url.split('/').pop();
      if (name === 'ai_reserve') {
        if (plan[args.p_user] !== 'plus') return Response.json({ ok: false, reason: 'plan' });
        if ((used[args.p_user] || 0) >= limit) return Response.json({ ok: false, reason: 'quota', limit });
        used[args.p_user] = (used[args.p_user] || 0) + 1;
        return Response.json({ ok: true, period: '2026-11-01', used: used[args.p_user], limit });
      }
      if (name === 'ai_release') { used[args.p_user] = Math.max(0, (used[args.p_user] || 0) - 1); return new Response('', { status: 204 }); }
    }
    throw new Error('odottamaton pyyntö ' + url);
  };
  return { fetchImpl, used, calls };
}

const pyynto = (headers = {}, body = new Uint8Array([1, 2, 3]), method = 'POST') => new Request(`${BASE}/functions/v1/tekoaly`, {
  method, body: method === 'POST' ? body : undefined,
  headers: { origin: 'https://ajoura-app.github.io', 'content-type': 'image/jpeg', 'x-ajoura-feature': 'ai.receipt', ...headers } });

test('ilman kirjautumista: 401, ei kiintiökutsua', async () => {
  const s = fakeSupabase(); const h = createHandler(k => ENV[k] || '', s.fetchImpl);
  for (const auth of [undefined, 'Bearer ', 'Bearer sb_publishable_testi', 'Bearer vaarennetty']) {
    const r = await h(pyynto(auth ? { authorization: auth } : {}));
    assert.equal(r.status, 401, String(auth));
  }
  assert.ok(!s.calls.some(c => c.url.includes('/rpc/')), 'kiintiötä kysyttiin ilman käyttäjää');
  // Julkinen avain ei ole käyttäjä: hylätään jo ennen Auth-kutsua (alustan JWT-tarkistus päästää sen läpi).
  assert.ok(!s.calls.some(c => (c.headers.Authorization || '').includes('sb_publishable')), 'julkista avainta kokeiltiin käyttäjänä');
});

test('free-käyttäjä: 402, selaimen väitteet eivät auta', async () => {
  const s = fakeSupabase(); const h = createHandler(k => ENV[k] || '', s.fetchImpl);
  const r = await h(pyynto({ authorization: 'Bearer tunniste-free', 'x-ajoura-plan': 'plus', 'x-ajoura-entitled': 'true' }));
  assert.equal(r.status, 402);
  assert.deepEqual(await r.json(), { error: 'plan' });
});

test('plus-käyttäjä: oikeus tarkistetaan, tekoälyä ei ole otettu käyttöön (503) ja varaus palautetaan', async () => {
  const s = fakeSupabase({ plan: { 'u-plus': 'plus' } }); const h = createHandler(k => ENV[k] || '', s.fetchImpl);
  const r = await h(pyynto({ authorization: 'Bearer tunniste-plus' }));
  assert.equal(r.status, 503);
  assert.deepEqual(await r.json(), { error: 'ai_not_configured' });
  assert.equal(s.used['u-plus'], 0, 'kiintiö kului, vaikka tunnistusta ei tehty');
  assert.equal(r.headers.get('access-control-allow-origin'), 'https://ajoura-app.github.io');
});

test('kiintiö täynnä: 429', async () => {
  const s = fakeSupabase({ plan: { 'u-plus': 'plus' }, limit: 0 }); const h = createHandler(k => ENV[k] || '', s.fetchImpl);
  assert.equal((await h(pyynto({ authorization: 'Bearer tunniste-plus' }))).status, 429);
});

test('virheelliset pyynnöt hylätään ennen kiintiötä', async () => {
  const s = fakeSupabase({ plan: { 'u-plus': 'plus' } }); const h = createHandler(k => ENV[k] || '', s.fetchImpl);
  const a = { authorization: 'Bearer tunniste-plus' };
  assert.equal((await h(pyynto({ ...a, 'x-ajoura-feature': 'ai.kaikki' }))).status, 400);
  assert.equal((await h(pyynto({ ...a, 'content-type': 'text/html' }))).status, 415);
  assert.equal((await h(pyynto({ ...a, 'content-length': String(7 * 1024 * 1024) }))).status, 413);
  assert.equal((await h(pyynto(a, undefined, 'GET'))).status, 405);
  assert.equal(s.used['u-plus'] || 0, 0);
  const o = await h(new Request(`${BASE}/functions/v1/tekoaly`, { method: 'OPTIONS', headers: { origin: 'https://ajoura-app.github.io' } }));
  assert.equal(o.status, 200);
  assert.match(o.headers.get('access-control-allow-headers'), /x-ajoura-feature/);
});

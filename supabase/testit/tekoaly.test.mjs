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

// ---- Kuittitunnistus (v0.113): keksitty Claude-asiakas, oikeaan Anthropiciin ei oteta yhteyttä. ----
const KUITTI = { is_receipt: true, date: '2026-11-03', quantity: 41.27, unit: 'l', price_per_unit: 1.889, total: 77.96, currency: 'EUR', fuel: 'Neste Futura 95E10' };
function fakeClaude(vastaus, stop = 'end_turn') {
  const kutsut = [];
  const make = async (apiKey) => ({ messages: { create: async (body) => {
    kutsut.push({ apiKey, body });
    if (vastaus instanceof Error) throw vastaus;
    return { stop_reason: stop, content: [{ type: 'thinking', thinking: '' }, { type: 'text', text: typeof vastaus === 'string' ? vastaus : JSON.stringify(vastaus) }] };
  } } });
  return { make, kutsut };
}
const AVAIMELLA = { ...ENV, ANTHROPIC_API_KEY: 'sk-ant-testi' };

test('kuitti: Haiku 5.5, kuva base64:nä, rakenteinen vastaus; tulos tarkistettuna ja kiintiö kuluu', async () => {
  const s = fakeSupabase({ plan: { 'u-plus': 'plus' } }), c = fakeClaude(KUITTI);
  const h = createHandler(k => AVAIMELLA[k] || '', s.fetchImpl, c.make);
  const r = await h(pyynto({ authorization: 'Bearer tunniste-plus' }, new Uint8Array([255, 216, 255, 1, 2])));
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), KUITTI);
  assert.equal(s.used['u-plus'], 1);
  const { apiKey, body } = c.kutsut[0];
  assert.equal(apiKey, 'sk-ant-testi');
  assert.equal(body.model, 'claude-haiku-5-5');
  assert.equal(body.output_config.effort, 'low');
  assert.equal(body.output_config.format.type, 'json_schema');
  assert.equal(body.output_config.format.schema.additionalProperties, false);
  assert.ok(!('temperature' in body) && !('thinking' in body), 'Haiku 5.5: ei näytteistysparametreja eikä pois kytkettyä ajattelua');
  const kuva = body.messages[0].content[0];
  assert.deepEqual(kuva, { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: Buffer.from([255, 216, 255, 1, 2]).toString('base64') } });
});

test('kuitti: tekoälyn vastaus ei ole luotettava syöte', async () => {
  const s = fakeSupabase({ plan: { 'u-plus': 'plus' } });
  const c = fakeClaude({ is_receipt: true, date: '2999-01-01', quantity: -5, unit: 'gallon', price_per_unit: 'x', total: 1e9, currency: 'euro', fuel: '<img src=x onerror=alert(1)>' });
  const r = await createHandler(k => AVAIMELLA[k] || '', s.fetchImpl, c.make)(pyynto({ authorization: 'Bearer tunniste-plus' }));
  assert.deepEqual(await r.json(), { is_receipt: true, date: null, quantity: null, unit: null, price_per_unit: null, total: null, currency: null, fuel: null });
});

test('kuitti: kieltäytyminen, katkennut tai rikkinäinen vastaus ja tekoälyn virhe: 502, kiintiö ei kulu', async () => {
  for (const [nimi, c] of [['refusal', fakeClaude(KUITTI, 'refusal')], ['max_tokens', fakeClaude(KUITTI, 'max_tokens')],
    ['rikki', fakeClaude('{ei json')], ['virhe', fakeClaude(Object.assign(new Error('401'), { status: 401 }))]]) {
    const s = fakeSupabase({ plan: { 'u-plus': 'plus' } });
    const r = await createHandler(k => AVAIMELLA[k] || '', s.fetchImpl, c.make)(pyynto({ authorization: 'Bearer tunniste-plus' }));
    assert.equal(r.status, 502, nimi);
    assert.equal(s.used['u-plus'], 0, nimi + ': kiintiö kului');
  }
});

test('mittari ja huoltokirja eivät ole vielä valmiita: 501 ennen kiintiötä ja tekoälyä', async () => {
  const s = fakeSupabase({ plan: { 'u-plus': 'plus' } }), c = fakeClaude(KUITTI);
  for (const f of ['ai.odometer', 'ai.servicebook']) {
    const r = await createHandler(k => AVAIMELLA[k] || '', s.fetchImpl, c.make)(pyynto({ authorization: 'Bearer tunniste-plus', 'x-ajoura-feature': f }));
    assert.equal(r.status, 501, f);
  }
  assert.equal(c.kutsut.length, 0);
  assert.ok(!s.calls.some(x => x.url.includes('/rpc/')));
});

test('free-käyttäjän kuva ei mene tekoälylle', async () => {
  const s = fakeSupabase(), c = fakeClaude(KUITTI);
  const r = await createHandler(k => AVAIMELLA[k] || '', s.fetchImpl, c.make)(pyynto({ authorization: 'Bearer tunniste-free' }));
  assert.equal(r.status, 402);
  assert.equal(c.kutsut.length, 0);
});

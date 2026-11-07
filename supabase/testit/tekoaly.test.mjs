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

// ---- Täytä kuvasta: kuitti (0.113), tankkausmittari ja mittaristo (1.19). Keksitty Claude-asiakas, oikeaan Anthropiciin ei oteta yhteyttä. ----
const TYHJA = { kind: 'other', date: null, quantity: null, unit: null, price_per_unit: null, total: null, currency: null, fuel: null, mismatch: false, odometer: null, odometer_unit: null };
const KUITTI = { ...TYHJA, kind: 'receipt', date: '2026-11-03', quantity: 41.27, unit: 'l', price_per_unit: 1.889, total: 77.96, currency: 'EUR', fuel: 'Neste Futura 95E10' };
const PUMPPU = { ...TYHJA, kind: 'pump', quantity: 45.6, unit: 'l', price_per_unit: 1.859, total: 84.77, fuel: '95E10' };
const MITTARI = { ...TYHJA, kind: 'odometer', odometer: 218450, odometer_unit: 'km' };
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
const kutsu = (vastaus, plan = { 'u-plus': 'plus' }, feature = 'ai.receipt') => {
  const s = fakeSupabase({ plan }), c = fakeClaude(vastaus);
  return { s, c, vastaa: (body) => createHandler(k => AVAIMELLA[k] || '', s.fetchImpl, c.make)(pyynto({ authorization: 'Bearer tunniste-plus', 'x-ajoura-feature': feature }, body)) };
};

test('kuva: Haiku 5.5, kuva base64:nä, rakenteinen vastaus; tulos tarkistettuna ja kiintiö kuluu', async () => {
  const { s, c, vastaa } = kutsu({ ...KUITTI, odometer: 5, odometer_unit: 'km', mismatch: true });
  const r = await vastaa(new Uint8Array([255, 216, 255, 1, 2]));
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), KUITTI, 'kuitilla ei saa olla mittarin kenttiä eikä mismatchia');
  assert.equal(s.used['u-plus'], 1);
  const { apiKey, body } = c.kutsut[0];
  assert.equal(apiKey, 'sk-ant-testi');
  assert.equal(body.model, 'claude-haiku-5-5');
  assert.equal(body.output_config.effort, 'low');
  assert.equal(body.output_config.format.type, 'json_schema');
  assert.equal(body.output_config.format.schema.additionalProperties, false);
  assert.deepEqual(body.output_config.format.schema.properties.kind.enum, ['receipt', 'pump', 'odometer', 'other']);
  assert.ok(!('temperature' in body) && !('thinking' in body), 'Haiku 5.5: ei näytteistysparametreja eikä pois kytkettyä ajattelua');
  assert.match(body.messages[0].content[1].text, /Never use the trip meter/);
  const kuva = body.messages[0].content[0];
  assert.deepEqual(kuva, { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: Buffer.from([255, 216, 255, 1, 2]).toString('base64') } });
});

test('kuva: tekoälyn vastaus ei ole luotettava syöte', async () => {
  const r = await kutsu({ kind: 'receipt', date: '2999-01-01', quantity: -5, unit: 'gallon', price_per_unit: 'x', total: 1e9, currency: 'euro', fuel: '<img src=x onerror=alert(1)>', odometer: 123456, odometer_unit: 'km' }).vastaa();
  assert.deepEqual(await r.json(), { ...TYHJA, kind: 'receipt' });
  // Tuntematon laji = other, ja silloin kaikki muu tyhjenee.
  assert.deepEqual(await (await kutsu({ ...KUITTI, kind: 'salakuljetus' }).vastaa()).json(), TYHJA);
  assert.deepEqual(await (await kutsu({ ...KUITTI, kind: 'other' }).vastaa()).json(), TYHJA);
});

test('tankkausmittari: ei päivää, tulos tarkistettuna', async () => {
  const r = await kutsu({ ...PUMPPU, date: '2026-11-03', odometer: 99 }).vastaa();
  assert.deepEqual(await r.json(), PUMPPU);
});

test('tankkausmittari: litrahinta × litrat ei vastaa summaa → mismatch (väärin luettu numero)', async () => {
  for (const [nimi, v] of [['hinta', { ...PUMPPU, price_per_unit: 1.689 }], ['summa', { ...PUMPPU, total: 74.77 }], ['määrä', { ...PUMPPU, quantity: 54.6 }]]) {
    assert.equal((await (await kutsu(v).vastaa()).json()).mismatch, true, nimi);
  }
  // Pyöristysero (litrahinta kolmella desimaalilla, summa sentteinä) ei ole virhe.
  for (const v of [{ ...PUMPPU, total: 84.8 }, { ...PUMPPU, quantity: 45.61, total: 84.79 }]) {
    assert.equal((await (await kutsu(v).vastaa()).json()).mismatch, false, JSON.stringify(v));
  }
  // Puuttuva luku ei ole ristiriita: sovellus laskee kolmannen kahdesta.
  assert.equal((await (await kutsu({ ...PUMPPU, total: null }).vastaa()).json()).mismatch, false);
  // Kuitilla ristiriitaa ei tarkisteta (summaan voi sisältyä muutakin).
  assert.equal((await (await kutsu({ ...KUITTI, total: 99 }).vastaa()).json()).mismatch, false);
});

test('mittaristo: kokonaiskilometrit kokonaislukuna, muut kentät tyhjiä, kiintiö kuluu', async () => {
  const { s, vastaa } = kutsu({ ...MITTARI, odometer: 218450.7, quantity: 5, total: 7 });
  const r = await vastaa();
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { ...MITTARI, odometer: 218451 });
  assert.equal(s.used['u-plus'], 1);
});

test('mittaristo: mahdottomat arvot muuttuvat tyhjiksi, mailit säilyvät mailleina', async () => {
  for (const [nimi, v, odotettu] of [
    ['negatiivinen', { odometer: -5, odometer_unit: 'km' }, { odometer: null, odometer_unit: 'km' }],
    ['nolla', { odometer: 0, odometer_unit: 'km' }, { odometer: null, odometer_unit: 'km' }],
    ['liian iso', { odometer: 9e7, odometer_unit: 'km' }, { odometer: null, odometer_unit: 'km' }],
    ['teksti', { odometer: '123456', odometer_unit: 'furlong' }, { odometer: null, odometer_unit: null }],
    ['mailit', { odometer: 54321, odometer_unit: 'mi' }, { odometer: 54321, odometer_unit: 'mi' }],
  ]) {
    assert.deepEqual(await (await kutsu({ ...MITTARI, ...v }).vastaa()).json(), { ...MITTARI, ...odotettu }, nimi);
  }
});

test('kuva: kieltäytyminen, katkennut tai rikkinäinen vastaus ja tekoälyn virhe: 502, kiintiö ei kulu', async () => {
  for (const [nimi, c] of [['refusal', fakeClaude(KUITTI, 'refusal')], ['max_tokens', fakeClaude(KUITTI, 'max_tokens')],
    ['rikki', fakeClaude('{ei json')], ['virhe', fakeClaude(Object.assign(new Error('401'), { status: 401 }))]]) {
    const s = fakeSupabase({ plan: { 'u-plus': 'plus' } });
    const r = await createHandler(k => AVAIMELLA[k] || '', s.fetchImpl, c.make)(pyynto({ authorization: 'Bearer tunniste-plus' }));
    assert.equal(r.status, 502, nimi);
    assert.equal(s.used['u-plus'], 0, nimi + ': kiintiö kului');
  }
});

test('mittari-ominaisuus (ai.odometer) ja huoltokirja eivät ole vielä valmiita: 501 ennen kiintiötä ja tekoälyä; ai.pump ei ole ominaisuus', async () => {
  const s = fakeSupabase({ plan: { 'u-plus': 'plus' } }), c = fakeClaude(KUITTI);
  for (const f of ['ai.odometer', 'ai.servicebook']) {
    const r = await createHandler(k => AVAIMELLA[k] || '', s.fetchImpl, c.make)(pyynto({ authorization: 'Bearer tunniste-plus', 'x-ajoura-feature': f }));
    assert.equal(r.status, 501, f);
  }
  const r = await createHandler(k => AVAIMELLA[k] || '', s.fetchImpl, c.make)(pyynto({ authorization: 'Bearer tunniste-plus', 'x-ajoura-feature': 'ai.pump' }));
  assert.equal(r.status, 400);
  assert.equal(c.kutsut.length, 0);
  assert.ok(!s.calls.some(x => x.url.includes('/rpc/')));
});

test('free-käyttäjän kuva ei mene tekoälylle', async () => {
  const s = fakeSupabase(), c = fakeClaude(KUITTI);
  const r = await createHandler(k => AVAIMELLA[k] || '', s.fetchImpl, c.make)(pyynto({ authorization: 'Bearer tunniste-free' }));
  assert.equal(r.status, 402);
  assert.equal(c.kutsut.length, 0);
});

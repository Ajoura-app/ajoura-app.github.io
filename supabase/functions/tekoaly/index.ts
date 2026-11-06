// AJOURA: tekoälytunnistuksen palvelin (Supabase Edge Function "tekoaly", v0.112, kuittitunnistus v0.113).
//
// Sovellus (access.js, AjouraAccess.recognize) lähettää kuvan tänne, ei koskaan suoraan tekoälypalveluun. Jokaisessa
// pyynnössä tarkistetaan palvelimella ennen kuin kuvaa käsitellään:
//   1. käyttäjä: Authorization-otsakkeen istuntotunniste tarkistetaan Supabase Authilta (ei selaimen väitteitä),
//   2. Plus-tilaus ja kuukausikiintiö: tietokannan ai_reserve() varaa yhden tunnistuksen atomisesti
//      (ei Plussaa → 402, kiintiö täynnä → 429),
//   3. vasta sitten kuva lähtee Anthropicille (Claude Haiku 5.5) palvelimen omalla avaimella (Supabase-salaisuus
//      ANTHROPIC_API_KEY, ei koskaan repossa eikä selaimessa). Kuvaa ei tallenneta eikä kirjata lokiin.
// Tekoälyn vastaus tarkistetaan täällä (luvut järkevillä väleillä, päivä ei tulevaisuudessa), ja sovellus vain
// esitäyttää lomakkeen: käyttäjä tarkistaa ja tallentaa itse. Epäonnistunut tunnistus ei kuluta kiintiötä.
// Ilman avainta vastaus on 503 (ai_not_configured). Toteutettu: kuitti (ai.receipt). Mittari ja huoltokirja: 501.
//
// Testi: testit/test_supabase.py (Node ajaa tämän tiedoston keksityllä Supabasella).

const FEATURES = new Set(['ai.receipt', 'ai.odometer', 'ai.servicebook']);
const ORIGINS = ['https://ajoura-app.github.io'];
// Clauden kuvamuodot. Sovellus pienentää kuvan ja muuttaa sen JPEG:ksi ennen lähetystä (myös iPhonen HEIC).
const TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_BYTES = 5 * 1024 * 1024;
const MODEL = 'claude-haiku-5-5';

type Client = { messages: { create: (body: Record<string, unknown>) => Promise<any> } };
type MakeClient = (apiKey: string) => Promise<Client>;
// Anthropicin virallinen SDK, tarkka versio. Ladataan vasta tarvittaessa (testit antavat oman korvikkeen).
const anthropicClient: MakeClient = async (apiKey) => {
  const { default: Anthropic } = await import('npm:@anthropic-ai/sdk@1.1.0');
  return new Anthropic({ apiKey, timeout: 30_000, maxRetries: 1 });
};

// Mitä kuvasta poimitaan. Kaikki kentät pakollisia; puuttuva tieto = null (rakenteinen vastaus, JSON-skeema).
const num = { anyOf: [{ type: 'number' }, { type: 'null' }] };
const str = { anyOf: [{ type: 'string' }, { type: 'null' }] };
const SPECS: Record<string, { schema: Record<string, unknown>; prompt: string }> = {
  'ai.receipt': {
    schema: {
      type: 'object', additionalProperties: false,
      required: ['is_receipt', 'date', 'quantity', 'unit', 'price_per_unit', 'total', 'currency', 'fuel'],
      properties: {
        is_receipt: { type: 'boolean' },
        date: { anyOf: [{ type: 'string', format: 'date' }, { type: 'null' }] },
        quantity: num,
        unit: { anyOf: [{ type: 'string', enum: ['l', 'kWh', 'kg'] }, { type: 'null' }] },
        price_per_unit: num,
        total: num,
        currency: str,
        fuel: str,
      },
    },
    prompt: 'The image should be a fuel or EV charging receipt, often Finnish. Extract the purchase. ' +
      'is_receipt: false if the image is not a fuel or charging receipt. Use null for anything not clearly printed; never guess. ' +
      'date: purchase date as YYYY-MM-DD (Finnish receipts write day.month.year). quantity: litres, kWh or kg bought, unit accordingly. ' +
      'price_per_unit and total: as printed, in the receipt currency (decimal comma means decimal point). ' +
      'currency: ISO 4217 code, EUR when the receipt shows € or EUR. fuel: product name as printed, e.g. "95E10", "98E5", "Diesel", "Neste MY Uusiutuva Diesel". ' +
      'Ignore shop items other than the fuel or charging purchase.',
  },
};

const toBase64 = (bytes: Uint8Array): string => {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
};

// Tekoälyn vastaus ei ole luotettava syöte: vain järkevät arvot kelpaavat, muut muuttuvat nulliksi.
const inRange = (v: unknown, lo: number, hi: number) => (typeof v === 'number' && Number.isFinite(v) && v > lo && v < hi ? v : null);
function cleanReceipt(o: any, today: string) {
  const date = typeof o?.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(o.date) && o.date <= today && o.date >= '2000-01-01' ? o.date : null;
  const short = (v: unknown, re: RegExp) => (typeof v === 'string' && re.test(v.trim()) ? v.trim() : null);
  return {
    is_receipt: o?.is_receipt === true,
    date,
    quantity: inRange(o?.quantity, 0, 2000),
    unit: ['l', 'kWh', 'kg'].includes(o?.unit) ? o.unit : null,
    price_per_unit: inRange(o?.price_per_unit, 0, 100),
    total: inRange(o?.total, 0, 20000),
    currency: short(o?.currency, /^[A-Z]{3}$/),
    fuel: short(o?.fuel, /^[\p{L}\p{N} .,+\-/()%]{1,60}$/u),
  };
}

type Env = (name: string) => string;
type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

// Supabasen avainmuuttujat: uudet (JSON-sanakirja, avain "default") tai vanhat (yksi avain).
const keyFrom = (dict: string, legacy: string): string => {
  try { const d = JSON.parse(dict || '{}'); if (typeof d.default === 'string') return d.default; } catch (_e) { /* vanha muoto */ }
  return legacy || '';
};

export function createHandler(env: Env, fetchImpl: Fetch, makeClient: MakeClient = anthropicClient) {
  const base = env('SUPABASE_URL');
  const publishable = keyFrom(env('SUPABASE_PUBLISHABLE_KEYS'), env('SUPABASE_ANON_KEY'));
  const secret = keyFrom(env('SUPABASE_SECRET_KEYS'), env('SUPABASE_SERVICE_ROLE_KEY'));
  // Uusi salainen avain kulkee vain apikey-otsakkeessa; vanha service_role-avain on JWT ja kulkee myös Authorizationissa.
  const admin: Record<string, string> = secret.startsWith('sb_') ? { apikey: secret } : { apikey: secret, Authorization: `Bearer ${secret}` };

  const cors = (origin: string | null): Record<string, string> => ({
    'Access-Control-Allow-Origin': origin && ORIGINS.includes(origin) ? origin : ORIGINS[0],
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info, x-ajoura-feature',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  });
  const reply = (req: Request, status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors(req.headers.get('origin')), 'Content-Type': 'application/json' } });

  async function userOf(token: string): Promise<{ id: string } | null> {
    const r = await fetchImpl(`${base}/auth/v1/user`, { headers: { apikey: publishable, Authorization: `Bearer ${token}` } });
    if (!r.ok) return null;
    const u = await r.json();
    return u && typeof u.id === 'string' ? u : null;
  }
  async function rpc(name: string, args: Record<string, unknown>) {
    const r = await fetchImpl(`${base}/rest/v1/rpc/${name}`, { method: 'POST', headers: { ...admin, 'Content-Type': 'application/json' }, body: JSON.stringify(args) });
    if (!r.ok) throw new Error(`${name}: ${r.status}`);
    const text = await r.text();
    return text ? JSON.parse(text) : null;
  }

  return async function handle(req: Request): Promise<Response> {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: cors(req.headers.get('origin')) });
    if (req.method !== 'POST') return reply(req, 405, { error: 'method' });
    const feature = req.headers.get('x-ajoura-feature') || '';
    if (!FEATURES.has(feature)) return reply(req, 400, { error: 'feature' });
    if (!SPECS[feature]) return reply(req, 501, { error: 'feature_not_ready' });
    // Julkinen avain ei ole käyttäjä: alustan JWT-tarkistus hyväksyy sen, joten käyttäjä tarkistetaan aina tässä.
    const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
    if (!token || token.startsWith('sb_')) return reply(req, 401, { error: 'auth' });
    const user = await userOf(token).catch(() => null);
    if (!user) return reply(req, 401, { error: 'auth' });
    const type = (req.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    if (!TYPES.has(type)) return reply(req, 415, { error: 'type' });
    if (Number(req.headers.get('content-length') || 0) > MAX_BYTES) return reply(req, 413, { error: 'size' });

    let reserved: { ok: boolean; reason?: string; period?: string };
    try { reserved = await rpc('ai_reserve', { p_user: user.id }); } catch (_e) { return reply(req, 503, { error: 'service' }); }
    if (!reserved || !reserved.ok) return reply(req, reserved && reserved.reason === 'quota' ? 429 : 402, { error: (reserved && reserved.reason) || 'plan' });
    const release = () => rpc('ai_release', { p_user: user.id, p_period: reserved.period }).catch(() => null);
    try {
      const image = new Uint8Array(await req.arrayBuffer());
      if (!image.length || image.length > MAX_BYTES) { await release(); return reply(req, 413, { error: 'size' }); }
      const result = await recognize(feature, image, type, env, makeClient);
      if (!result) { await release(); return reply(req, 503, { error: 'ai_not_configured' }); }
      return reply(req, 200, result);
    } catch (e) {
      // Ei kuvaa eikä tekoälyn vastausta lokiin: vain virheen laji.
      console.error('tekoaly', feature, (e as { status?: number; name?: string })?.status || (e as Error)?.name || 'virhe');
      await release();
      return reply(req, 502, { error: 'ai' });
    }
  };
}

// Tekoälykutsu: Claude Haiku 5.5, pieni ajattelutaso (poiminta on helppo tehtävä) ja rakenteinen JSON-vastaus.
// Ilman avainta null (ei tulosta). Kieltäytyminen tai katkennut vastaus = virhe, jolloin varaus palautetaan.
export async function recognize(feature: string, image: Uint8Array, type: string, env: Env, makeClient: MakeClient = anthropicClient): Promise<Record<string, unknown> | null> {
  const key = env('ANTHROPIC_API_KEY');
  const spec = SPECS[feature];
  if (!key || !spec) return null;
  const client = await makeClient(key);
  const msg = await client.messages.create({
    model: MODEL,
    max_tokens: 2048,
    output_config: { effort: 'low', format: { type: 'json_schema', schema: spec.schema } },
    messages: [{ role: 'user', content: [
      { type: 'image', source: { type: 'base64', media_type: type, data: toBase64(image) } },
      { type: 'text', text: spec.prompt },
    ] }],
  });
  if (msg.stop_reason !== 'end_turn') throw Object.assign(new Error('stop_reason ' + msg.stop_reason), { name: 'stop_' + msg.stop_reason });
  const text = (msg.content || []).find((b: { type: string }) => b.type === 'text')?.text;
  if (!text) throw Object.assign(new Error('no text'), { name: 'no_text' });
  // Huominen UTC:nä: Suomessa päivä vaihtuu ennen UTC:tä. Sovellus rajaa lisäksi omaan päiväänsä.
  return cleanReceipt(JSON.parse(text), new Date(Date.now() + 864e5).toISOString().slice(0, 10));
}

let handler: ((req: Request) => Promise<Response>) | null = null;
export default {
  fetch(req: Request) {
    // deno-lint-ignore no-explicit-any
    const D = (globalThis as any).Deno;
    handler = handler || createHandler((name) => D.env.get(name) || '', fetch);
    return handler(req);
  },
};

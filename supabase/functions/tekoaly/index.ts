// AJOURA: tekoälytunnistuksen palvelin (Supabase Edge Function "tekoaly", v0.112).
//
// Sovellus (access.js, AjouraAccess.recognize) lähettää kuvan tänne, ei koskaan suoraan tekoälypalveluun. Jokaisessa
// pyynnössä tarkistetaan palvelimella ennen kuin kuvaa käsitellään:
//   1. käyttäjä: Authorization-otsakkeen istuntotunniste tarkistetaan Supabase Authilta (ei selaimen väitteitä),
//   2. Plus-tilaus ja kuukausikiintiö: tietokannan ai_reserve() varaa yhden tunnistuksen atomisesti
//      (ei Plussaa → 402, kiintiö täynnä → 429),
//   3. vasta sitten kuva menisi tekoälylle palvelimen omalla avaimella.
// Tekoälypalvelua ei ole vielä valittu eikä otettu käyttöön (vaatii erillisen luvan, kustannusarvion ja
// tietosuojaselosteen päivityksen): recognize() palauttaa null, varaus palautetaan ja vastaus on 503.
//
// Testi: testit/test_supabase.py (Node ajaa tämän tiedoston keksityllä Supabasella).

const FEATURES = new Set(['ai.receipt', 'ai.odometer', 'ai.servicebook']);
const ORIGINS = ['https://ajoura-app.github.io'];
const TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']);
const MAX_BYTES = 6 * 1024 * 1024;

type Env = (name: string) => string;
type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

// Supabasen avainmuuttujat: uudet (JSON-sanakirja, avain "default") tai vanhat (yksi avain).
const keyFrom = (dict: string, legacy: string): string => {
  try { const d = JSON.parse(dict || '{}'); if (typeof d.default === 'string') return d.default; } catch (_e) { /* vanha muoto */ }
  return legacy || '';
};

export function createHandler(env: Env, fetchImpl: Fetch) {
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
      const result = await recognize(feature, image, type, env);
      if (!result) { await release(); return reply(req, 503, { error: 'ai_not_configured' }); }
      return reply(req, 200, result);
    } catch (_e) {
      await release();
      return reply(req, 502, { error: 'ai' });
    }
  };
}

// Tekoälykutsu. Ei vielä käytössä: palautetaan null (ei tulosta), eikä kuvaa lähetetä minnekään.
// Kun palvelu otetaan käyttöön, avain luetaan tässä palvelimen salaisuuksista (env), ei koskaan selaimesta.
async function recognize(_feature: string, _image: Uint8Array, _type: string, _env: Env): Promise<Record<string, unknown> | null> {
  return null;
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

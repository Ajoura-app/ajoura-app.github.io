// AJOURA: read-only smoke test for one Traccar Cloud account.
// The browser never sees the Traccar token, device identifiers, or coordinates.
// No database writes and no automatic syncing. Only the test owner can invoke it.

type Env = (key: string) => string;
type Fetcher = typeof fetch;
type Reply = Record<string, string | number | boolean | null>;

const ALLOWED_ORIGIN = 'https://ajoura-app.github.io';
const TRACCAR = 'https://server.traccar.org';
const MAX_JSON = 128 * 1024;
const FETCH_TIMEOUT_MS = 7000;

function cors(origin: string | null): Record<string, string> {
  return origin === ALLOWED_ORIGIN ? {
    'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
  } : {};
}

function send(req: Request, status: number, payload: Reply): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'Vary': 'Origin',
      'X-Content-Type-Options': 'nosniff',
      ...cors(req.headers.get('origin')),
    },
  });
}

function publishableKey(env: Env): string {
  try {
    const keys = JSON.parse(env('SUPABASE_PUBLISHABLE_KEYS') || '{}');
    if (typeof keys.default === 'string') return keys.default;
  } catch (_) { /* Configuration is checked below. */ }
  return env('SUPABASE_PUBLISHABLE_KEY') || env('SUPABASE_ANON_KEY');
}

function validPosition(p: unknown): p is { deviceId: number; latitude: number; longitude: number; fixTime?: string } {
  if (!p || typeof p !== 'object') return false;
  const o = p as Record<string, unknown>;
  return typeof o.deviceId === 'number' && typeof o.latitude === 'number' &&
    typeof o.longitude === 'number' && Number.isFinite(o.latitude) && Number.isFinite(o.longitude) &&
    Math.abs(o.latitude) <= 90 && Math.abs(o.longitude) <= 180 &&
    !(o.latitude === 0 && o.longitude === 0);
}

export function createHandler(env: Env, fetcher: Fetcher = fetch, now: () => number = Date.now) {
  return async function handle(req: Request): Promise<Response> {
    if (req.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: { 'Cache-Control': 'no-store', 'Vary': 'Origin', ...cors(req.headers.get('origin')) },
      });
    }
    if (req.method !== 'GET') return send(req, 405, { ok: false, error: 'method' });

    const owner = env('TRACCAR_TEST_OWNER_ID');
    const traccarToken = env('TRACCAR_API_TOKEN');
    const supabase = env('SUPABASE_URL');
    const pub = publishableKey(env);
    if (!owner || !traccarToken || !supabase || !pub) {
      return send(req, 503, { ok: false, error: 'not_configured' });
    }

    // A publishable API key is NOT a user session, even if the gateway allows it through.
    const match = /^Bearer\s+([^\s]+)$/i.exec(req.headers.get('authorization') || '');
    const jwt = match?.[1] || '';
    if (!jwt || jwt.startsWith('sb_')) return send(req, 401, { ok: false, error: 'auth' });

    try {
      const userResponse = await fetcher(supabase + '/auth/v1/user', {
        method: 'GET',
        headers: { 'apikey': pub, 'Authorization': 'Bearer ' + jwt },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      if (!userResponse.ok) return send(req, 401, { ok: false, error: 'auth' });
      const user = await userResponse.json() as { id?: unknown };
      if (typeof user?.id !== 'string') return send(req, 401, { ok: false, error: 'auth' });
      if (user.id !== owner) return send(req, 403, { ok: false, error: 'forbidden' });
    } catch (_) {
      return send(req, 503, { ok: false, error: 'auth_unavailable' });
    }

    // Fixed host and paths: client-controlled input can never turn this into an open proxy.
    async function traccar(path: string): Promise<unknown> {
      const res = await fetcher(TRACCAR + path, {
        method: 'GET',
        headers: {
          'Authorization': 'Bearer ' + traccarToken,
          'Accept': 'application/json',
        },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      if (!res.ok) throw new Error(res.status === 401 || res.status === 403 ? 'credentials' : 'upstream');
      const raw = await res.text();
      if (raw.length > MAX_JSON) throw new Error('response_size');
      return JSON.parse(raw);
    }

    try {
      const devices = await traccar('/api/devices');
      if (!Array.isArray(devices)) throw new Error('format');
      const allowed = devices.filter(d => Number.isSafeInteger(d?.id) && d.id > 0);
      if (allowed.length !== devices.length) throw new Error('format');

      if (allowed.length !== 1) {
        return send(req, 200, {
          ok: true, deviceCount: allowed.length, selectedDevice: false,
          positionAvailable: false, reason: allowed.length ? 'multiple_devices' : 'no_devices',
        });
      }

      const positions = await traccar('/api/positions');
      if (!Array.isArray(positions)) throw new Error('format');
      const p = positions.find(x => x?.deviceId === allowed[0].id);
      if (!validPosition(p)) {
        return send(req, 200, {
          ok: true, deviceCount: 1, selectedDevice: true, positionAvailable: false,
          reason: 'no_valid_position',
        });
      }

      const epoch = typeof p.fixTime === 'string' ? Date.parse(p.fixTime) : NaN;
      const age = Number.isFinite(epoch) ? Math.max(0, Math.floor((now() - epoch) / 1000)) : null;
      return send(req, 200, {
        ok: true,
        deviceCount: 1,
        selectedDevice: true,
        positionAvailable: true,
        lastFixTime: Number.isFinite(epoch) ? new Date(epoch).toISOString() : null,
        ageSeconds: age,
      });
    } catch (e) {
      // Never return response bodies, bearer tokens, coordinates or device identifiers.
      const code = e instanceof Error && e.message === 'credentials' ? 'traccar_auth' : 'traccar_unavailable';
      return send(req, 502, { ok: false, error: code });
    }
  };
}

let handler: ReturnType<typeof createHandler> | undefined;
export default {
  fetch(req: Request): Promise<Response> {
    // Identical entrypoint pattern to AJOURA's existing tekoaly Edge Function.
    const d = (globalThis as { Deno?: { env: { get: (key: string) => string | undefined } } }).Deno;
    handler ||= createHandler(key => d?.env.get(key) || '');
    return handler(req);
  },
};

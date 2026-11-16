// AJOURA: read-only GPS reader for one Traccar account (test phase, one tester).
// The browser never sees the Traccar token or device hardware identifiers (IMEI, phone).
// No database writes, no device commands, no background polling. Only the test owner can invoke it.
//
// GET without ?action        -> connectivity probe (unchanged since PR #27: no coordinates, no device ids)
// GET ?action=devices        -> [{id, name, status, lastUpdate}]
// GET ?action=position&device=ID
// GET ?action=trips&device=ID&from=ISO&to=ISO   (max 32 days)
// GET ?action=route&device=ID&from=ISO&to=ISO   (max 26 h, thinned to MAX_POINTS)
// GET ?action=stops&device=ID&from=ISO&to=ISO   (max 26 h)
// Times are UTC ISO 8601 ("2026-11-16T09:00:00Z"). Distances in metres, speeds in km/h.

type Env = (key: string) => string;
type Fetcher = typeof fetch;
type Reply = Record<string, unknown>;
type Obj = Record<string, unknown>;

const ALLOWED_ORIGIN = 'https://ajoura-app.github.io';
const TRACCAR = 'https://server.traccar.org';
const MAX_JSON = 128 * 1024;                 // device list, latest positions
const MAX_REPORT_JSON = 2 * 1024 * 1024;     // trips and stops reports
const MAX_ROUTE_JSON = 8 * 1024 * 1024;      // raw positions of one day before thinning
const FETCH_TIMEOUT_MS = 7000;
const REPORT_TIMEOUT_MS = 12000;
const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;
const MAX_TRIPS_RANGE = 32 * DAY;            // a month in Europe/Helsinki plus slack
const MAX_DAY_RANGE = 26 * HOUR;             // a Helsinki day is 23-25 h around DST changes
const MAX_HISTORY = 2 * 366 * DAY;
const FUTURE_SLACK = 5 * 60 * 1000;
const MAX_TRIPS = 1000;
const MAX_STOPS = 300;
const MAX_POINTS = 2000;
const MIN_STEP_M = 10;
const FRESH_SECONDS = 600;                   // older positions are shown as "last known", never as live
const KNOTS_TO_KMH = 1.852;                  // Traccar reports speeds in knots
const RATE_LIMIT = 60;                       // requests per user per minute (best effort, per isolate)
const RATE_WINDOW = 60 * 1000;
const DEVICE_CACHE_MS = 60 * 1000;
const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;
const PARAMS: Record<string, string[]> = {
  status: [], devices: [], position: ['device'],
  trips: ['device', 'from', 'to'], route: ['device', 'from', 'to'], stops: ['device', 'from', 'to'],
};

class Fail extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string) { super(code); this.status = status; this.code = code; }
}

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

// ---- Value cleaning: only known fields, only sane values, never raw upstream objects. ----

const round = (v: number, d: number) => Math.round(v * 10 ** d) / 10 ** d;
const iso = (ms: number) => new Date(ms).toISOString();

function num(v: unknown, min: number, max: number): number | null {
  return typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? v : null;
}

function time(v: unknown): number | null {
  if (typeof v !== 'string') return null;
  const ms = Date.parse(v);
  return Number.isFinite(ms) ? ms : null;
}

function text(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null;
  const s = v.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max);
  return s || null;
}

function point(lat: unknown, lon: unknown): [number, number] | null {
  const a = num(lat, -90, 90), b = num(lon, -180, 180);
  if (a === null || b === null || (a === 0 && b === 0)) return null;
  return [round(a, 5), round(b, 5)];
}

function kmh(knots: unknown): number | null {
  const v = num(knots, 0, 250);
  return v === null ? null : Math.round(v * KNOTS_TO_KMH);
}

function metres(a: [number, number], b: [number, number]): number {
  const r = Math.PI / 180, dLat = (b[0] - a[0]) * r, dLon = (b[1] - a[1]) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.min(1, Math.sqrt(h)));
}

async function readCapped(res: Response, limit: number): Promise<string> {
  const declared = Number(res.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > limit) throw new Error('response_size');
  if (!res.body) return '';
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) { await reader.cancel(); throw new Error('response_size'); }
    chunks.push(value);
  }
  const all = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) { all.set(c, at); at += c.byteLength; }
  return new TextDecoder().decode(all);
}

// ---- Request parsing: everything the browser sends is checked against a fixed list. ----

function parseQuery(url: URL): { action: string; q: Record<string, string> } {
  const action = url.searchParams.get('action') || 'status';
  const allowed = PARAMS[action];
  if (!Object.hasOwn(PARAMS, action) || !allowed) throw new Fail(400, 'action');
  const q: Record<string, string> = {};
  for (const key of new Set(url.searchParams.keys())) {
    if (url.searchParams.getAll(key).length !== 1) throw new Fail(400, 'params');
    if (key === 'action') continue;
    if (!allowed.includes(key)) throw new Fail(400, 'params');
    q[key] = url.searchParams.get(key) || '';
  }
  for (const key of allowed) if (!(key in q)) throw new Fail(400, 'params');
  return { action, q };
}

function parseDevice(v: string): number {
  if (!/^[1-9]\d{0,9}$/.test(v)) throw new Fail(400, 'device');
  const id = Number(v);
  if (!Number.isSafeInteger(id)) throw new Fail(400, 'device');
  return id;
}

function parseRange(q: Record<string, string>, max: number, nowMs: number): { from: number; to: number } {
  if (!ISO_UTC.test(q.from) || !ISO_UTC.test(q.to)) throw new Fail(400, 'range');
  const from = Date.parse(q.from), to = Date.parse(q.to);
  // Date.parse rolls impossible dates over in some engines; the round trip catches 2026-02-30.
  if (!Number.isFinite(from) || !Number.isFinite(to) ||
      iso(from).slice(0, 10) !== q.from.slice(0, 10) || iso(to).slice(0, 10) !== q.to.slice(0, 10)) {
    throw new Fail(400, 'range');
  }
  if (from >= to || to - from > max || to > nowMs + FUTURE_SLACK || from < nowMs - MAX_HISTORY) {
    throw new Fail(400, 'range');
  }
  return { from, to };
}

// ---- Mapping of Traccar objects to the small shapes the app needs. ----

function sameDevice(row: unknown, device: number): boolean {
  if (!row || typeof row !== 'object') return false;
  const id = (row as Obj).deviceId;
  return id === undefined || id === device;
}

function mapTrip(t: Obj, deviceId: number): Reply | null {
  const s = time(t.startTime), e = time(t.endTime);
  if (s === null || e === null || e < s) return null;
  const dist = num(t.distance, 0, 5_000_000);
  const durationS = Math.round((e - s) / 1000);
  const startPos = Number.isSafeInteger(t.startPositionId) && (t.startPositionId as number) > 0 ? t.startPositionId : null;
  return {
    // Stable de-duplication key for a later logbook: the trip's first position never changes.
    key: startPos ? `${deviceId}-${startPos}` : `${deviceId}-s${Math.floor(s / 1000)}`,
    start: iso(s),
    end: iso(e),
    durationS,
    distanceM: dist === null ? null : Math.round(dist),
    // Average speed only when it can be derived from measured distance and a real duration.
    avgSpeedKmh: dist !== null && durationS >= 60 ? Math.round(dist / durationS * 3.6) : null,
    maxSpeedKmh: kmh(t.maxSpeed),
    startPoint: point(t.startLat, t.startLon),
    endPoint: point(t.endLat, t.endLon),
    startAddress: text(t.startAddress, 120),
    endAddress: text(t.endAddress, 120),
  };
}

function mapStop(s: Obj): Reply | null {
  const a = time(s.startTime), b = time(s.endTime);
  const at = point(s.latitude, s.longitude);
  if (a === null || b === null || b < a || !at) return null;
  return { start: iso(a), end: iso(b), durationS: Math.round((b - a) / 1000), point: at, address: text(s.address, 120) };
}

function thinRoute(raw: unknown[], deviceId: number, from: number, to: number) {
  const pts: { p: [number, number]; t: number; v: number | null }[] = [];
  for (const x of raw) {
    if (!x || typeof x !== 'object') continue;
    const o = x as Obj;
    if (o.deviceId !== deviceId || o.valid === false || o.outdated === true) continue;
    const p = point(o.latitude, o.longitude), t = time(o.fixTime);
    if (!p || t === null || t < from || t > to) continue;
    pts.push({ p, t, v: kmh(o.speed) });
  }
  pts.sort((a, b) => a.t - b.t);
  const kept: typeof pts = [];
  pts.forEach((x, i) => {
    const last = kept[kept.length - 1];
    if (!last || i === pts.length - 1 || metres(last.p, x.p) >= MIN_STEP_M) kept.push(x);
  });
  let out = kept, simplified = kept.length < pts.length;
  if (kept.length > MAX_POINTS) {
    const step = Math.ceil(kept.length / (MAX_POINTS - 1));
    out = kept.filter((_, i) => i % step === 0);
    if (out[out.length - 1] !== kept[kept.length - 1]) out.push(kept[kept.length - 1]);
    simplified = true;
  }
  return { points: out.map(x => [x.p[0], x.p[1], Math.floor(x.t / 1000), x.v]), simplified };
}

export function createHandler(env: Env, fetcher: Fetcher = fetch, now: () => number = Date.now) {
  const hits = new Map<string, number[]>();
  // One Traccar account and one owner in the test phase. A multi-user version must key this per account.
  let deviceCache: { at: number; list: Obj[] } | null = null;

  function limited(user: string): boolean {
    const t = now(), recent = (hits.get(user) || []).filter(x => t - x < RATE_WINDOW);
    recent.push(t);
    hits.set(user, recent);
    return recent.length > RATE_LIMIT;
  }

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

    let userId: string;
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
      userId = user.id;
    } catch (_) {
      return send(req, 503, { ok: false, error: 'auth_unavailable' });
    }

    if (limited(userId)) return send(req, 429, { ok: false, error: 'rate' });

    // Fixed host and fixed paths. Query values are built here from validated numbers and dates only,
    // so client-controlled input can never turn this into an open proxy.
    async function traccar(path: string, query: Record<string, string> = {}, limit = MAX_JSON,
      timeout = FETCH_TIMEOUT_MS): Promise<unknown> {
      const qs = new URLSearchParams(query).toString();
      const res = await fetcher(TRACCAR + path + (qs ? '?' + qs : ''), {
        method: 'GET',
        headers: {
          'Authorization': 'Bearer ' + traccarToken,
          'Accept': 'application/json',
        },
        signal: AbortSignal.timeout(timeout),
      });
      if (!res.ok) throw new Error(res.status === 401 || res.status === 403 ? 'credentials' : 'upstream');
      return JSON.parse(await readCapped(res, limit));
    }

    async function devices(): Promise<Obj[]> {
      if (deviceCache && now() - deviceCache.at < DEVICE_CACHE_MS) return deviceCache.list;
      const list = await traccar('/api/devices');
      if (!Array.isArray(list)) throw new Error('format');
      const ok = list.filter(d => Number.isSafeInteger(d?.id) && d.id > 0) as Obj[];
      if (ok.length !== list.length) throw new Error('format');
      deviceCache = { at: now(), list: ok };
      return ok;
    }

    async function owned(v: string): Promise<number> {
      const id = parseDevice(v);
      if (!(await devices()).some(d => d.id === id)) throw new Fail(404, 'device');
      return id;
    }

    try {
      const { action, q } = parseQuery(new URL(req.url));

      if (action === 'status') {
        const allowed = await devices();
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
      }

      if (action === 'devices') {
        // Internal Traccar ids only: never uniqueId (IMEI), phone, model or contact fields.
        const list = (await devices()).map(d => ({
          id: d.id,
          name: text(d.name, 60),
          status: ['online', 'offline', 'unknown'].includes(d.status as string) ? d.status : null,
          lastUpdate: time(d.lastUpdate) === null ? null : iso(time(d.lastUpdate) as number),
        }));
        return send(req, 200, { ok: true, devices: list });
      }

      const device = await owned(q.device);

      if (action === 'position') {
        const positions = await traccar('/api/positions', { deviceId: String(device) });
        if (!Array.isArray(positions)) throw new Error('format');
        const p = positions.find(x => x?.deviceId === device) as Obj | undefined;
        const at = p && p.valid !== false && p.outdated !== true ? point(p.latitude, p.longitude) : null;
        const fix = p ? time(p.fixTime) : null;
        if (!p || !at || fix === null) return send(req, 200, { ok: true, position: null, reason: 'no_valid_position' });
        const age = Math.max(0, Math.floor((now() - fix) / 1000));
        return send(req, 200, {
          ok: true,
          position: {
            point: at, fixTime: iso(fix), ageSeconds: age, fresh: age <= FRESH_SECONDS,
            speedKmh: kmh(p.speed), course: num(p.course, 0, 360),
          },
        });
      }

      const range = parseRange(q, action === 'trips' ? MAX_TRIPS_RANGE : MAX_DAY_RANGE, now());
      const query = { deviceId: String(device), from: iso(range.from), to: iso(range.to) };

      if (action === 'trips') {
        const raw = await traccar('/api/reports/trips', query, MAX_REPORT_JSON, REPORT_TIMEOUT_MS);
        if (!Array.isArray(raw)) throw new Error('format');
        // The report is requested for one device; rows that name another device are dropped.
        const trips = raw.filter(t => sameDevice(t, device))
          .map(t => mapTrip(t as Obj, device)).filter(Boolean) as Reply[];
        trips.sort((a, b) => String(b.start).localeCompare(String(a.start)));
        return send(req, 200, {
          ok: true, trips: trips.slice(0, MAX_TRIPS), truncated: trips.length > MAX_TRIPS,
          dropped: raw.length - trips.length,
        });
      }

      if (action === 'stops') {
        const raw = await traccar('/api/reports/stops', query, MAX_REPORT_JSON, REPORT_TIMEOUT_MS);
        if (!Array.isArray(raw)) throw new Error('format');
        const stops = raw.filter(s => sameDevice(s, device))
          .map(s => mapStop(s as Obj)).filter(Boolean) as Reply[];
        return send(req, 200, { ok: true, stops: stops.slice(0, MAX_STOPS), truncated: stops.length > MAX_STOPS });
      }

      // action === 'route'
      const raw = await traccar('/api/positions', query, MAX_ROUTE_JSON, REPORT_TIMEOUT_MS);
      if (!Array.isArray(raw)) throw new Error('format');
      return send(req, 200, { ok: true, ...thinRoute(raw, device, range.from, range.to) });
    } catch (e) {
      if (e instanceof Fail) return send(req, e.status, { ok: false, error: e.code });
      // Never return response bodies, bearer tokens, coordinates or device identifiers.
      const name = e instanceof Error ? (e.name === 'TimeoutError' ? 'timeout' : e.message) : '';
      if (name === 'credentials') return send(req, 502, { ok: false, error: 'traccar_auth' });
      if (name === 'timeout') return send(req, 504, { ok: false, error: 'traccar_timeout' });
      if (name === 'response_size') return send(req, 502, { ok: false, error: 'traccar_too_large' });
      return send(req, 502, { ok: false, error: 'traccar_unavailable' });
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

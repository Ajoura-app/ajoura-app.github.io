// Mocked tests for the GPS data actions of gps-traccar (devices, position, trips, route, stops).
// All coordinates, times and devices here are invented. No real Traccar or Supabase is contacted.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHandler } from '../functions/gps-traccar/index.ts';

const BASE = 'https://example.supabase.test';
const TRACCAR = 'https://server.traccar.org';
const NOW = Date.parse('2026-11-16T09:01:00Z');
const ENV = {
  SUPABASE_URL: BASE,
  SUPABASE_PUBLISHABLE_KEYS: '{"default":"sb_publishable_fake"}',
  TRACCAR_API_TOKEN: 'token-test-only',
  TRACCAR_TEST_OWNER_ID: 'owner-1',
};
const DEVICES = [
  { id: 13, name: 'Testiauto', uniqueId: '356938035643809', phone: '+358401234567', status: 'online',
    lastUpdate: '2026-11-16T08:59:00Z', model: 'TK-TEST' },
  { id: 14, name: 'Toinen testiauto', uniqueId: '356938035643810', status: 'offline' },
];
const TRIP = {
  deviceId: 13, deviceName: 'Testiauto', startPositionId: 501, endPositionId: 777,
  startTime: '2026-11-16T07:00:00.000+00:00', endTime: '2026-11-16T07:30:00.000+00:00',
  distance: 30000, duration: 1800000, averageSpeed: 32.4, maxSpeed: 54,
  startLat: 61.123456789, startLon: 23.987654321, endLat: 61.4, endLon: 23.5,
  startAddress: 'Keksitie 1', endAddress: null, startOdometer: 1, endOdometer: 2,
};

function harness({ user = 'owner-1', devices = DEVICES, positions, trips = [TRIP], stops = [],
  status = {}, hang = false, authStatus = 200, rawBody = {} } = {}) {
  const calls = [];
  const fakeFetch = async (url, init = {}) => {
    calls.push({ url, init });
    if (url === BASE + '/auth/v1/user') {
      return authStatus === 200 ? Response.json({ id: user }) : new Response('', { status: authStatus });
    }
    assert.equal(init.headers.Authorization, 'Bearer token-test-only');
    assert.equal(init.headers.Accept, 'application/json');
    assert.equal(init.method, 'GET');
    const u = new URL(url);
    if (hang) throw new DOMException('The operation timed out.', 'TimeoutError');
    if (status[u.pathname]) return new Response('', { status: status[u.pathname] });
    if (rawBody[u.pathname]) return new Response(rawBody[u.pathname], { status: 200 });
    if (u.pathname === '/api/devices') return Response.json(devices);
    if (u.pathname === '/api/positions') return Response.json(positions ?? []);
    if (u.pathname === '/api/reports/trips') return Response.json(trips);
    if (u.pathname === '/api/reports/stops') return Response.json(stops);
    throw new Error('Unexpected request ' + u.pathname);
  };
  const handler = createHandler(k => ENV[k] || '', fakeFetch, () => NOW);
  return { handler, calls, upstream: () => calls.filter(c => c.url.startsWith(TRACCAR)) };
}

function get(query, authorization = 'Bearer user-jwt') {
  return new Request(BASE + '/functions/v1/gps-traccar?' + query, {
    method: 'GET', headers: { authorization, origin: 'https://ajoura-app.github.io', apikey: 'sb_publishable_fake' },
  });
}

const DAY = 'from=2026-11-16T00:00:00Z&to=2026-11-16T09:00:00Z';

test('devices: only internal id, name, status and last update; never IMEI or phone', async () => {
  const { handler } = harness();
  const r = await handler(get('action=devices'));
  assert.equal(r.status, 200);
  const body = await r.json();
  assert.deepEqual(body.devices, [
    { id: 13, name: 'Testiauto', status: 'online', lastUpdate: '2026-11-16T08:59:00.000Z' },
    { id: 14, name: 'Toinen testiauto', status: 'offline', lastUpdate: null },
  ]);
  const raw = JSON.stringify(body);
  for (const secret of ['356938035643809', '+358401234567', 'TK-TEST', 'token-test-only']) assert.ok(!raw.includes(secret));
});

test('every action is owner-only and checks the session before Traccar is contacted', async () => {
  for (const q of ['action=devices', 'action=position&device=13', `action=trips&device=13&${DAY}`,
    `action=route&device=13&${DAY}`, `action=stops&device=13&${DAY}`]) {
    const other = harness({ user: 'another-user' });
    assert.equal((await other.handler(get(q))).status, 403, q);
    assert.equal(other.upstream().length, 0);
    const anon = harness({ authStatus: 401 });
    assert.equal((await anon.handler(get(q, 'Bearer sb_publishable_fake'))).status, 401, q);
    assert.equal((await anon.handler(get(q, ''))).status, 401, q);
    assert.equal(anon.upstream().length, 0);
  }
});

test('a device that is not on the account is refused (404) and its data is never requested', async () => {
  const { handler, upstream } = harness();
  const r = await handler(get('action=position&device=99'));
  assert.equal(r.status, 404);
  assert.equal((await r.json()).error, 'device');
  assert.deepEqual(upstream().map(c => new URL(c.url).pathname), ['/api/devices']);
});

test('multiple devices: the requested one is used, the other is never mixed in', async () => {
  const positions = [
    { deviceId: 13, latitude: 61.1, longitude: 23.1, fixTime: '2026-11-16T09:00:00Z', valid: true },
    { deviceId: 14, latitude: 60.2, longitude: 24.9, fixTime: '2026-11-16T09:00:30Z', valid: true },
  ];
  const { handler, upstream } = harness({ positions });
  const body = await (await handler(get('action=position&device=14'))).json();
  assert.deepEqual(body.position.point, [60.2, 24.9]);
  const last = new URL(upstream().at(-1).url);
  assert.equal(last.pathname, '/api/positions');
  assert.equal(last.searchParams.get('deviceId'), '14');
});

test('position: knots become km/h, age is computed, stale positions are not "fresh"', async () => {
  for (const [fixTime, fresh, age] of [['2026-11-16T09:00:00Z', true, 60], ['2026-11-16T07:01:00Z', false, 7200]]) {
    const { handler } = harness({ positions: [{ deviceId: 13, latitude: 61.5, longitude: 23.7, fixTime, speed: 10, course: 90 }] });
    const body = await (await handler(get('action=position&device=13'))).json();
    assert.deepEqual(body.position, {
      point: [61.5, 23.7], fixTime: new Date(fixTime).toISOString(), ageSeconds: age, fresh, speedKmh: 19, course: 90,
    });
  }
});

test('position: missing, invalid, 0/0 and outdated fixes are reported as no position, not as zeros', async () => {
  for (const positions of [[], [{ deviceId: 13, latitude: 0, longitude: 0, fixTime: '2026-11-16T09:00:00Z' }],
    [{ deviceId: 13, latitude: 95, longitude: 23, fixTime: '2026-11-16T09:00:00Z' }],
    [{ deviceId: 13, latitude: 61, longitude: 23, fixTime: 'eilen' }],
    [{ deviceId: 13, latitude: 61, longitude: 23, fixTime: '2026-11-16T09:00:00Z', valid: false }],
    [{ deviceId: 13, latitude: 61, longitude: 23, fixTime: '2026-11-16T09:00:00Z', outdated: true }]]) {
    const { handler } = harness({ positions });
    const r = await handler(get('action=position&device=13'));
    assert.equal(r.status, 200);
    assert.deepEqual(await r.json(), { ok: true, position: null, reason: 'no_valid_position' });
  }
});

test('trips: fixed report path, validated query, units converted, only app fields returned', async () => {
  const { handler, upstream } = harness();
  const r = await handler(get('action=trips&device=13&from=2026-10-31T22:00:00Z&to=2026-11-16T09:00:00Z'));
  assert.equal(r.status, 200);
  const body = await r.json();
  assert.deepEqual(body, {
    ok: true, truncated: false, dropped: 0,
    trips: [{
      key: '13-501', start: '2026-11-16T07:00:00.000Z', end: '2026-11-16T07:30:00.000Z', durationS: 1800,
      distanceM: 30000, avgSpeedKmh: 60, maxSpeedKmh: 100,
      startPoint: [61.12346, 23.98765], endPoint: [61.4, 23.5], startAddress: 'Keksitie 1', endAddress: null,
    }],
  });
  const u = new URL(upstream().at(-1).url);
  assert.equal(u.origin + u.pathname, TRACCAR + '/api/reports/trips');
  assert.deepEqual(Object.fromEntries(u.searchParams), {
    deviceId: '13', from: '2026-10-31T22:00:00.000Z', to: '2026-11-16T09:00:00.000Z',
  });
  assert.ok(!JSON.stringify(body).includes('Odometer'));
});

test('trips: broken rows are dropped and counted, other devices never leak in, newest first', async () => {
  const trips = [
    { ...TRIP, startPositionId: 1, startTime: '2026-11-10T07:00:00Z', endTime: '2026-11-10T07:20:00Z' },
    { ...TRIP, startPositionId: 2, startTime: '2026-11-12T07:00:00Z', endTime: '2026-11-12T06:00:00Z' },
    { ...TRIP, startPositionId: 3, startTime: 'huomenna' },
    { ...TRIP, startPositionId: 4, deviceId: 14 },
    { ...TRIP, startPositionId: 5, distance: -5, startTime: '2026-11-14T07:00:00Z', endTime: '2026-11-14T07:00:30Z' },
    { ...TRIP, startPositionId: undefined, startTime: '2026-11-15T07:00:00Z', endTime: '2026-11-15T07:10:00Z' },
  ];
  const { handler } = harness({ trips });
  const body = await (await handler(get(`action=trips&device=13&${DAY}`))).json();
  assert.deepEqual(body.trips.map(t => t.key), [`13-s${Date.parse('2026-11-15T07:00:00Z') / 1000}`, '13-5', '13-1']);
  assert.equal(body.dropped, 3);
  const short = body.trips.find(t => t.key === '13-5');
  assert.equal(short.distanceM, null);
  assert.equal(short.avgSpeedKmh, null);
});

test('time ranges: strict UTC format, order, maximum length, no future, no ancient history', async () => {
  const bad = [
    'from=2026-11-16&to=2026-11-17',
    'from=2026-11-16T00:00:00+02:00&to=2026-11-16T09:00:00Z',
    'from=2026-11-16T09:00:00Z&to=2026-11-16T08:00:00Z',
    'from=2026-11-16T09:00:00Z&to=2026-11-16T09:00:00Z',
    'from=2026-02-30T00:00:00Z&to=2026-03-02T00:00:00Z',
    'from=2026-10-10T00:00:00Z&to=2026-11-16T00:00:00Z',
    'from=2026-11-16T00:00:00Z&to=2026-11-17T00:00:00Z',
    'from=2023-01-01T00:00:00Z&to=2023-01-20T00:00:00Z',
    'from=2026-11-16T00:00:00Z',
  ];
  for (const range of bad) {
    const { handler, upstream } = harness();
    const r = await handler(get(`action=trips&device=13&${range}`));
    assert.equal(r.status, 400, range);
    assert.ok(['range', 'params'].includes((await r.json()).error), range);
    assert.ok(upstream().every(c => new URL(c.url).pathname === '/api/devices'), range);
  }
});

test('Helsinki months and days around DST changes fit the limits', async () => {
  // March 2026 in Europe/Helsinki: 1.3. 00:00 EET = 28.2. 22:00Z, 1.4. 00:00 EEST = 31.3. 21:00Z.
  const month = harness();
  assert.equal((await month.handler(get('action=trips&device=13&from=2026-02-28T22:00:00Z&to=2026-03-31T21:00:00Z'))).status, 200);
  // 25.10.2026 is 25 hours long in Helsinki (EEST -> EET).
  const day = harness({ positions: [] });
  assert.equal((await day.handler(get('action=route&device=13&from=2026-10-24T21:00:00Z&to=2026-10-25T22:00:00Z'))).status, 200);
  const twoDays = harness();
  assert.equal((await twoDays.handler(get('action=route&device=13&from=2026-11-14T00:00:00Z&to=2026-11-16T00:00:00Z'))).status, 400);
});

test('route: invalid points removed, sorted, compact [lat, lon, time, km/h], long routes thinned', async () => {
  const positions = [];
  const start = Date.parse('2026-11-16T05:00:00Z');
  for (let i = 0; i < 6000; i++) {
    positions.push({ id: i, deviceId: 13, valid: true, latitude: 61 + i * 0.0005, longitude: 23 + i * 0.0002,
      fixTime: new Date(start + i * 1000).toISOString(), speed: 20, attributes: { ignition: true, ip: '10.0.0.1' } });
  }
  positions.push({ deviceId: 13, valid: false, latitude: 62, longitude: 24, fixTime: '2026-11-16T05:30:00Z' });
  positions.push({ deviceId: 14, valid: true, latitude: 60, longitude: 25, fixTime: '2026-11-16T05:30:00Z' });
  positions.reverse();
  const { handler, upstream } = harness({ positions });
  const r = await handler(get(`action=route&device=13&${DAY}`));
  assert.equal(r.status, 200);
  const body = await r.json();
  assert.equal(body.simplified, true);
  assert.ok(body.points.length <= 2000 && body.points.length > 1000, String(body.points.length));
  assert.deepEqual(body.points[0], [61, 23, start / 1000, 37]);
  assert.deepEqual(body.points.at(-1).slice(0, 2), [63.9995, 24.1998]);
  for (let i = 1; i < body.points.length; i++) assert.ok(body.points[i][2] > body.points[i - 1][2]);
  const raw = JSON.stringify(body);
  assert.ok(!raw.includes('ignition') && !raw.includes('10.0.0.1') && !raw.includes('"60,'));
  const u = new URL(upstream().at(-1).url);
  assert.equal(u.pathname, '/api/positions');
  assert.equal(u.searchParams.get('deviceId'), '13');
});

test('route: points closer than 10 m are merged, the end point is kept', async () => {
  const positions = [0, 1, 2, 3].map(i => ({ deviceId: 13, latitude: 61 + i * 0.00001, longitude: 23,
    fixTime: new Date(Date.parse('2026-11-16T06:00:00Z') + i * 1000).toISOString() }));
  const { handler } = harness({ positions });
  const body = await (await handler(get(`action=route&device=13&${DAY}`))).json();
  assert.equal(body.points.length, 2);
  assert.equal(body.simplified, true);
});

test('route: points outside the requested time window are never returned', async () => {
  const positions = [
    { deviceId: 13, latitude: 60.5, longitude: 22.5, fixTime: '2026-11-15T23:59:00Z' },
    { deviceId: 13, latitude: 61.0, longitude: 23.0, fixTime: '2026-11-16T06:00:00Z' },
    { deviceId: 13, latitude: 61.1, longitude: 23.1, fixTime: '2026-11-16T06:10:00Z' },
    { deviceId: 13, latitude: 61.9, longitude: 23.9, fixTime: '2026-11-16T09:00:01Z' },
  ];
  const { handler } = harness({ positions });
  const body = await (await handler(get(`action=route&device=13&${DAY}`))).json();
  assert.deepEqual(body.points.map(p => p.slice(0, 2)), [[61, 23], [61.1, 23.1]]);
});

test('stops: mapped to time, duration, point and address only', async () => {
  const stops = [{ deviceId: 13, positionId: 9, latitude: 61.2, longitude: 23.4, address: 'Keksikatu 2\n',
    startTime: '2026-11-16T07:30:00Z', endTime: '2026-11-16T08:00:00Z', duration: 1800000, engineHours: 0 },
  { deviceId: 13, latitude: 0, longitude: 0, startTime: '2026-11-16T08:00:00Z', endTime: '2026-11-16T08:10:00Z' }];
  const { handler } = harness({ stops });
  const body = await (await handler(get(`action=stops&device=13&${DAY}`))).json();
  assert.deepEqual(body, { ok: true, truncated: false, stops: [{
    start: '2026-11-16T07:30:00.000Z', end: '2026-11-16T08:00:00.000Z', durationS: 1800, point: [61.2, 23.4], address: 'Keksikatu 2',
  }] });
});

test('input that could steer the upstream request is rejected before Traccar is called', async () => {
  for (const q of ['action=admin', 'action=commands&device=13', 'action=position&device=13;x', 'action=position&device=-1',
    'action=position&device=1e3', 'action=position&device=0x10', 'action=position&device=013',
    'action=position&device=13&device=14', 'action=position', 'action=devices&url=https://evil.example',
    'action=position&device=13&path=/api/users', 'action=devices&action=position']) {
    const { handler, upstream } = harness();
    const r = await handler(get(q));
    assert.equal(r.status, 400, q);
    assert.ok(upstream().every(c => new URL(c.url).pathname === '/api/devices'), q);
  }
});

test('only the fixed Traccar host and read-only paths are ever contacted', async () => {
  const { handler, upstream } = harness({ positions: [] });
  for (const q of ['', 'action=devices', 'action=position&device=13', `action=trips&device=13&${DAY}`,
    `action=route&device=13&${DAY}`, `action=stops&device=13&${DAY}`]) await handler(get(q));
  const paths = new Set(upstream().map(c => { const u = new URL(c.url); assert.equal(u.origin, TRACCAR); return u.pathname; }));
  assert.deepEqual([...paths].sort(), ['/api/devices', '/api/positions', '/api/reports/stops', '/api/reports/trips']);
});

test('Traccar failures: expired token, timeout, oversized and broken responses give safe errors', async () => {
  const cases = [
    [{ status: { '/api/reports/trips': 401 } }, 502, 'traccar_auth'],
    [{ status: { '/api/devices': 403 } }, 502, 'traccar_auth'],
    [{ status: { '/api/reports/trips': 500 } }, 502, 'traccar_unavailable'],
    [{ hang: true }, 504, 'traccar_timeout'],
    [{ rawBody: { '/api/reports/trips': 'x'.repeat(3 * 1024 * 1024) } }, 502, 'traccar_too_large'],
    [{ rawBody: { '/api/reports/trips': '<html>error</html>' } }, 502, 'traccar_unavailable'],
    [{ trips: { not: 'a list' } }, 502, 'traccar_unavailable'],
  ];
  for (const [opts, code, error] of cases) {
    const { handler } = harness(opts);
    const r = await handler(get(`action=trips&device=13&${DAY}`));
    assert.equal(r.status, code, error);
    const raw = await r.text();
    assert.deepEqual(JSON.parse(raw), { ok: false, error });
    assert.ok(!raw.includes('token-test-only'));
  }
});

test('per-user rate limit stops request floods before they reach Traccar', async () => {
  const { handler, upstream } = harness();
  for (let i = 0; i < 60; i++) assert.equal((await handler(get('action=devices'))).status, 200);
  const r = await handler(get('action=devices'));
  assert.equal(r.status, 429);
  assert.equal((await r.json()).error, 'rate');
  assert.equal(upstream().length, 1, 'device list is cached for a minute');
});

test('the device list is cached briefly so one screen does not multiply upstream calls', async () => {
  const { handler, upstream } = harness({ positions: [] });
  await handler(get('action=position&device=13'));
  await handler(get(`action=trips&device=13&${DAY}`));
  assert.equal(upstream().filter(c => new URL(c.url).pathname === '/api/devices').length, 1);
});

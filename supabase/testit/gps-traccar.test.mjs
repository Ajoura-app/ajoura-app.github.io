import test from 'node:test';
import assert from 'node:assert/strict';
import { createHandler } from '../functions/gps-traccar/index.ts';

const BASE = 'https://example.supabase.test';
const TRACCAR = 'https://server.traccar.org';
const ENV = {
  SUPABASE_URL: BASE,
  SUPABASE_PUBLISHABLE_KEYS: '{"default":"sb_publishable_fake"}',
  TRACCAR_API_TOKEN: 'token-test-only',
  TRACCAR_TEST_OWNER_ID: 'owner-1',
};

function harness({ env = {}, user = 'owner-1', devices = [{ id: 13, name: 'TEST ONLY' }],
  positions = [{ deviceId: 13, latitude: 62.7, longitude: 22.8, fixTime: '2026-11-16T09:00:00Z' }],
  upstreamStatus = 200, authStatus = 200 } = {}) {
  const settings = { ...ENV, ...env };
  const calls = [];
  const fakeFetch = async (url, init = {}) => {
    calls.push({ url, init });
    if (url === BASE + '/auth/v1/user') {
      assert.equal(init.headers.apikey, 'sb_publishable_fake');
      return authStatus === 200 ? Response.json({ id: user }) : new Response('', { status: authStatus });
    }
    assert.equal(init.headers.Authorization, 'Bearer token-test-only');
    if (upstreamStatus !== 200) return new Response('', { status: upstreamStatus });
    if (url === TRACCAR + '/api/devices') return Response.json(devices);
    if (url === TRACCAR + '/api/positions') return Response.json(positions);
    throw new Error('Unexpected request');
  };
  const handler = createHandler(k => settings[k] || '', fakeFetch, () => Date.parse('2026-11-16T09:01:00Z'));
  return { handler, calls };
}
function request(method = 'GET', authorization = 'Bearer user-jwt', origin = 'https://ajoura-app.github.io') {
  return new Request(BASE + '/functions/v1/gps-traccar', {
    method, headers: { authorization, origin, apikey: 'sb_publishable_fake' },
  });
}

test('unauthenticated or public API-key requests are rejected before upstream access', async () => {
  for (const token of ['', 'Bearer ', 'Bearer sb_publishable_fake', 'Bearer forged']) {
    const { handler, calls } = harness({ authStatus: 401 });
    const result = await handler(request('GET', token));
    assert.equal(result.status, 401);
    assert.ok(calls.every(c => !c.url.startsWith(TRACCAR)));
  }
});

test('only the configured owner can access the Traccar account', async () => {
  const { handler, calls } = harness({ user: 'another-user' });
  const r = await handler(request());
  assert.equal(r.status, 403);
  assert.equal((await r.json()).error, 'forbidden');
  assert.equal(calls.filter(c => c.url.startsWith(TRACCAR)).length, 0);
});

test('without owner or Traccar token the probe cannot be enabled accidentally', async () => {
  for (const key of ['TRACCAR_TEST_OWNER_ID', 'TRACCAR_API_TOKEN']) {
    const { handler, calls } = harness({ env: { [key]: '' } });
    assert.equal((await handler(request())).status, 503);
    assert.equal(calls.length, 0);
  }
});

test('one device: returns limited connectivity metadata only, no GPS coordinates or device IDs', async () => {
  const { handler, calls } = harness();
  const r = await handler(request());
  assert.equal(r.status, 200);
  const body = await r.json();
  assert.deepEqual(body, {
    ok: true, deviceCount: 1, selectedDevice: true, positionAvailable: true,
    lastFixTime: '2026-11-16T09:00:00.000Z', ageSeconds: 60,
  });
  assert.ok(!JSON.stringify(body).includes('22.8'));
  assert.ok(!JSON.stringify(body).includes('13'));
  assert.ok(!JSON.stringify(body).includes('token-test-only'));
  assert.deepEqual(calls.filter(c => c.url.startsWith(TRACCAR)).map(c => c.url), [
    TRACCAR + '/api/devices', TRACCAR + '/api/positions',
  ]);
  assert.equal(r.headers.get('cache-control'), 'no-store');
  assert.equal(r.headers.get('access-control-allow-origin'), 'https://ajoura-app.github.io');
});

test('multiple devices: does not arbitrarily select one or fetch positions', async () => {
  const { handler, calls } = harness({ devices: [{ id: 1 }, { id: 2 }] });
  const r = await handler(request());
  assert.deepEqual(await r.json(), {
    ok: true, deviceCount: 2, selectedDevice: false,
    positionAvailable: false, reason: 'multiple_devices',
  });
  assert.ok(!calls.some(c => c.url.endsWith('/api/positions')));
});

test('missing and invalid positions are not presented as valid', async () => {
  for (const positions of [
    [], [{ deviceId: 13, latitude: 0, longitude: 0 }],
    [{ deviceId: 13, latitude: 192, longitude: 22 }],
    [{ deviceId: 999, latitude: 62, longitude: 22 }],
  ]) {
    const { handler } = harness({ positions });
    const r = await handler(request());
    assert.equal(r.status, 200);
    assert.equal((await r.json()).positionAvailable, false);
  }
});

test('Traccar errors become safe, generic responses', async () => {
  for (const [upstreamStatus, expected] of [[401, 'traccar_auth'], [503, 'traccar_unavailable']]) {
    const { handler } = harness({ upstreamStatus });
    const r = await handler(request());
    assert.equal(r.status, 502);
    assert.equal((await r.json()).error, expected);
  }
});

test('GET-only and CORS restrictions', async () => {
  const { handler } = harness();
  assert.equal((await handler(request('POST'))).status, 405);
  const good = await handler(request('OPTIONS'));
  assert.equal(good.status, 204);
  assert.equal(good.headers.get('access-control-allow-origin'), 'https://ajoura-app.github.io');
  const other = await handler(request('OPTIONS', '', 'https://evil.example'));
  assert.equal(other.status, 204);
  assert.equal(other.headers.get('access-control-allow-origin'), null);
});

// Proxy tests. Everything here runs without a key and makes no network call,
// except the live test, which runs only with KAZASHI_LIVE=1 and MODEL_API_KEY
// set and calls the real Meta Model API (no mocks of Muse anywhere).
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import test from 'node:test';
import handler from '../api/narrate.js';
import { buildMessages, callMuse, HttpError, Limiter, validateSummary } from '../lib/narrate.js';

const SUMMARY = {
  title: 'Take 1',
  duration: 12.4,
  handSeconds: 3.2,
  cast: [
    { id: 'inu', name: 'ignored', enters: 0, exits: 12.4, travel: 3.1, turns: 2, heading: 'both', height: 'low' },
    { id: 'sagi', name: 'ignored', enters: 4.2, exits: 11, travel: 1.4, turns: 0, heading: 'left', height: 'high' },
  ],
};

function call(method, body, headers = {}) {
  const req = Readable.from(body === undefined ? [] : [Buffer.from(typeof body === 'string' ? body : JSON.stringify(body))]);
  Object.assign(req, { method, headers: { origin: 'https://nickthelegend.github.io', ...headers }, socket: { remoteAddress: '10.0.0.1' } });
  return new Promise((resolve) => {
    const res = {
      statusCode: 0,
      headers: {},
      setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
      end(s) { resolve({ status: this.statusCode, headers: this.headers, body: s ? JSON.parse(s) : null }); },
    };
    handler(req, res);
  });
}

test('rebuilds the summary from known fields only', () => {
  const s = validateSummary(SUMMARY);
  assert.deepEqual(s.cast.map((c) => c.name), ['Dog', 'Heron']);
  assert.equal(JSON.stringify(s).includes('ignored'), false);
  assert.match(buildMessages(s)[1].content, /Dog: on stage from 0s to 12.4s/);
});

test('rejects unknown creatures, bad numbers and empty takes', () => {
  assert.throws(() => validateSummary({ ...SUMMARY, cast: [{ ...SUMMARY.cast[0], id: 'unicorn' }] }), /not a Kazashi creature/);
  assert.throws(() => validateSummary({ ...SUMMARY, duration: 999 }), /duration must be/);
  assert.throws(() => validateSummary({ ...SUMMARY, cast: [{ ...SUMMARY.cast[0], heading: 'up' }] }), /heading must be/);
  assert.throws(() => validateSummary({ duration: 5, handSeconds: 0, cast: [] }), /nothing to narrate/);
  assert.throws(() => validateSummary('hello'), /JSON staging summary/);
});

test('limits each address per minute and the whole server per day', () => {
  let t = Date.UTC(2026, 10, 15, 12);
  const l = new Limiter({ perMinute: 2, perDay: 3, now: () => t });
  l.check('a');
  l.check('a');
  assert.throws(() => l.check('a'), (e) => e instanceof HttpError && e.status === 429 && /a minute/.test(e.message));
  l.check('b');
  assert.throws(() => l.check('c'), /daily narration limit/);
  t += 24 * 3600 * 1000;
  l.check('c');
});

test('says "AI unavailable" when the server has no key', async () => {
  await assert.rejects(callMuse(validateSummary(SUMMARY), { apiKey: '' }), (e) => e.status === 503 && /MODEL_API_KEY is not set/.test(e.message));
  const saved = process.env.MODEL_API_KEY;
  delete process.env.MODEL_API_KEY;
  try {
    const r = await call('POST', SUMMARY, { 'x-forwarded-for': '10.9.9.9' });
    assert.equal(r.status, 503);
    assert.equal(r.body.error, 'AI unavailable');
    assert.equal(r.headers['access-control-allow-origin'], 'https://nickthelegend.github.io');
  } finally {
    if (saved !== undefined) process.env.MODEL_API_KEY = saved;
  }
});

test('refuses other methods, other origins and broken bodies', async () => {
  assert.equal((await call('GET')).status, 405);
  assert.equal((await call('POST', SUMMARY, { origin: 'https://evil.example' })).status, 403);
  assert.equal((await call('OPTIONS', undefined, { origin: 'https://evil.example' })).status, 403);
  const pre = await call('OPTIONS');
  assert.equal(pre.status, 204);
  assert.equal(pre.headers['access-control-allow-methods'], 'POST, OPTIONS');
  const bad = await call('POST', '{not json', { 'x-forwarded-for': '10.1.1.1' });
  assert.equal(bad.status, 400);
  assert.match(bad.body.detail, /not JSON/);
});

test('live: Muse writes 3–4 timed lines for a real staging summary', { skip: !(process.env.KAZASHI_LIVE === '1' && process.env.MODEL_API_KEY) }, async () => {
  const out = await callMuse(validateSummary(SUMMARY), { apiKey: process.env.MODEL_API_KEY });
  assert.ok(out.lines.length >= 3 && out.lines.length <= 4);
  for (const l of out.lines) {
    assert.equal(typeof l.text, 'string');
    assert.ok(l.text.length > 0 && l.text.length <= 110);
    assert.ok(Number.isFinite(l.at));
  }
  console.log(JSON.stringify(out, null, 2));
});

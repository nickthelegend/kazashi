// Kazashi narration proxy: the only server Kazashi has. The browser sends a
// staging summary of a theatre take (who was on stage, when, which way they
// moved); this module validates it, builds the prompt on the server, calls
// Muse (muse-spark-1.3, Meta Model API) with the key from the environment, and
// returns 3–4 timed lines. It allows one model and one route, rate-limits per
// IP and caps requests per day. The key never reaches the browser.

export const MODEL = 'muse-spark-1.3';
export const API_URL = 'https://api.meta.ai/v1/chat/completions';
export const ROUTE = '/api/narrate';

/** The 25 cast members the app can put on stage (id → English name). */
export const CAST = {
  tori: 'Bird', inu: 'Dog', usagi: 'Rabbit', hebi: 'Snake', kirin: 'Giraffe',
  sagi: 'Heron', kani: 'Crab', ga: 'Moth', rakuda: 'Camel', zou: 'Elephant',
  kumo: 'Giant spider', kurage: 'Tiny jellyfish', washi: 'Great eagle', koi: 'Little koi', tsubame: 'Little swallow',
  tako: 'Octopus', niwatori: 'Rooster', kamome: 'Gull', tonbo: 'Dragonfly', kawauso: 'Otter',
  ryu: 'Dragon', kaeru: 'Frog', kabuto: 'Beetle', fukurou: 'Owl', sakana: 'Fish',
};

export class HttpError extends Error {
  constructor(status, error, detail) {
    super(`${error}: ${detail}`);
    this.status = status;
    this.body = { error, detail };
  }
}

const num = (v, lo, hi, name) => {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < lo || v > hi) throw new HttpError(400, 'Bad request', `${name} must be a number from ${lo} to ${hi}`);
  return Math.round(v * 10) / 10;
};
const oneOf = (v, list, name) => {
  if (!list.includes(v)) throw new HttpError(400, 'Bad request', `${name} must be one of ${list.join(', ')}`);
  return v;
};

/** Strictly re-builds the summary from known fields only (free text from the client never reaches the model). */
export function validateSummary(body) {
  if (!body || typeof body !== 'object') throw new HttpError(400, 'Bad request', 'send a JSON staging summary');
  const duration = num(body.duration, 1, 21, 'duration');
  const handSeconds = num(body.handSeconds ?? 0, 0, 21, 'handSeconds');
  if (!Array.isArray(body.cast) || body.cast.length > 6) throw new HttpError(400, 'Bad request', 'cast must be a list of at most 6');
  const cast = body.cast.map((c, i) => {
    if (!c || typeof c !== 'object' || !Object.hasOwn(CAST, c.id)) throw new HttpError(400, 'Bad request', `cast[${i}].id is not a Kazashi creature`);
    return {
      name: CAST[c.id],
      enters: num(c.enters, 0, 21, `cast[${i}].enters`),
      exits: num(c.exits, 0, 21, `cast[${i}].exits`),
      travel: num(c.travel, 0, 100, `cast[${i}].travel`),
      turns: Math.round(num(c.turns, 0, 400, `cast[${i}].turns`)),
      heading: oneOf(c.heading, ['left', 'right', 'both'], `cast[${i}].heading`),
      height: oneOf(c.height, ['low', 'middle', 'high'], `cast[${i}].height`),
    };
  });
  if (!cast.length && handSeconds < 0.5) throw new HttpError(400, 'Bad request', 'the take is empty: nothing to narrate');
  return { duration, handSeconds, cast };
}

export function buildMessages(s) {
  const who = s.cast.length
    ? s.cast
        .map(
          (c) =>
            `- ${c.name}: on stage from ${c.enters}s to ${c.exits}s, travelled ${c.travel} m along the wall, ` +
            `heading ${c.heading === 'both' ? 'back and forth' : c.heading}, turned ${c.turns} time(s), mostly ${c.height} on the wall`,
        )
        .join('\n')
    : '- No creatures; only the performer\'s bare hand shadows.';
  return [
    {
      role: 'system',
      content:
        'You are the narrator (benshi) of a tiny paper shadow-puppet theatre played on a real wall at home. ' +
        'Write narration for exactly the performance described: 3 or 4 short lines, present tense, warm and a little playful, ' +
        'each at most 90 characters, no emoji, no stage directions, no names of real people. ' +
        'Give each line a start time in seconds ("at") that matches when its moment happens; the first line starts at 0.',
    },
    {
      role: 'user',
      content: `The take lasts ${s.duration} seconds. Hands were in the lantern light for ${s.handSeconds} seconds.\nCast and staging:\n${who}`,
    },
  ];
}

export const RESPONSE_FORMAT = {
  type: 'json_schema',
  json_schema: {
    name: 'narration',
    strict: true,
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['lines'],
      properties: {
        lines: {
          type: 'array',
          minItems: 3,
          maxItems: 4,
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['text', 'at'],
            properties: { text: { type: 'string' }, at: { type: 'number' } },
          },
        },
      },
    },
  },
};

/** Calls Muse; throws HttpError with a readable reason on any failure. */
export async function callMuse(summary, { apiKey, fetchImpl = fetch, timeoutMs = 25000 } = {}) {
  if (!apiKey) throw new HttpError(503, 'AI unavailable', 'MODEL_API_KEY is not set on the narration server');
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  let res;
  try {
    res = await fetchImpl(API_URL, {
      method: 'POST',
      signal: ctrl.signal,
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        messages: buildMessages(summary),
        response_format: RESPONSE_FORMAT,
        reasoning_effort: 'low',
        max_completion_tokens: 1500,
      }),
    });
  } catch (e) {
    throw new HttpError(502, 'AI unavailable', e.name === 'AbortError' ? 'Muse did not answer within 25 s' : `could not reach Muse (${e.message})`);
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    const detail = res.status === 401 || res.status === 403 ? 'the server key was rejected' : res.status === 429 ? 'Muse is rate-limiting this key' : `Muse returned HTTP ${res.status}`;
    throw new HttpError(502, 'AI unavailable', detail);
  }
  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim()) throw new HttpError(502, 'AI unavailable', `Muse returned no text (finish: ${data?.choices?.[0]?.finish_reason ?? 'unknown'})`);
  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new HttpError(502, 'AI unavailable', 'Muse returned text that is not the requested JSON');
  }
  const lines = Array.isArray(parsed?.lines)
    ? parsed.lines.filter((l) => l && typeof l.text === 'string').map((l) => ({ text: l.text.slice(0, 110), at: Number(l.at) }))
    : [];
  if (lines.length < 3) throw new HttpError(502, 'AI unavailable', `Muse returned ${lines.length} lines; 3 are needed`);
  return { lines: lines.slice(0, 4), model: data.model ?? MODEL };
}

/** Per-IP sliding window plus a daily cap (UTC day), held in this instance's memory. */
export class Limiter {
  constructor({ perMinute = 6, perDay = 300, now = () => Date.now() } = {}) {
    this.perMinute = perMinute;
    this.perDay = perDay;
    this.now = now;
    this.ips = new Map();
    this.day = '';
    this.count = 0;
  }
  check(ip) {
    const t = this.now();
    const day = new Date(t).toISOString().slice(0, 10);
    if (day !== this.day) {
      this.day = day;
      this.count = 0;
    }
    if (this.count >= this.perDay) throw new HttpError(429, 'AI unavailable', 'the daily narration limit is reached; try again tomorrow (UTC)');
    const recent = (this.ips.get(ip) ?? []).filter((x) => t - x < 60_000);
    if (recent.length >= this.perMinute) throw new HttpError(429, 'Slow down', `at most ${this.perMinute} narrations a minute from one address`);
    recent.push(t);
    this.ips.set(ip, recent);
    if (this.ips.size > 5000) this.ips.clear();
    this.count++;
  }
}

export function allowedOrigin(origin, list) {
  if (!origin) return null;
  return list.includes(origin) ? origin : null;
}

export const DEFAULT_ORIGINS = ['https://nickthelegend.github.io', 'https://localhost:8093', 'http://localhost:8093'];

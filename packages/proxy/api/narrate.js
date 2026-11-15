// Vercel serverless function (Node): POST /api/narrate.
// Env: MODEL_API_KEY (required), ALLOWED_ORIGINS (comma list), PER_IP_PER_MIN, DAILY_CAP.
import { allowedOrigin, callMuse, DEFAULT_ORIGINS, HttpError, Limiter, validateSummary } from '../lib/narrate.js';

const origins = (process.env.ALLOWED_ORIGINS ?? DEFAULT_ORIGINS.join(','))
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const limiter = new Limiter({
  perMinute: Number(process.env.PER_IP_PER_MIN ?? 6),
  perDay: Number(process.env.DAILY_CAP ?? 300),
});

async function readJson(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  const chunks = [];
  let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > 16 * 1024) throw new HttpError(413, 'Bad request', 'the summary is larger than 16 KB');
    chunks.push(c);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8') || 'null');
  } catch {
    throw new HttpError(400, 'Bad request', 'the body is not JSON');
  }
}

function send(res, status, body, origin) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.end(JSON.stringify(body));
}

export default async function handler(req, res) {
  const origin = allowedOrigin(req.headers.origin, origins);
  if (req.method === 'OPTIONS') {
    if (!origin) return send(res, 403, { error: 'Forbidden', detail: 'this origin may not use the Kazashi narration server' }, null);
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Max-Age', '600');
    return send(res, 204, {}, origin);
  }
  try {
    if (req.method !== 'POST') throw new HttpError(405, 'Method not allowed', 'POST a staging summary');
    if (req.headers.origin && !origin) throw new HttpError(403, 'Forbidden', 'this origin may not use the Kazashi narration server');
    const ip = String(req.headers['x-forwarded-for'] ?? req.socket?.remoteAddress ?? 'unknown').split(',')[0].trim();
    const summary = validateSummary(await readJson(req));
    limiter.check(ip);
    const out = await callMuse(summary, { apiKey: process.env.MODEL_API_KEY });
    return send(res, 200, out, origin);
  } catch (e) {
    if (e instanceof HttpError) return send(res, e.status, e.body, origin);
    console.error('[kazashi-proxy]', e);
    return send(res, 500, { error: 'AI unavailable', detail: 'the narration server failed' }, origin);
  }
}

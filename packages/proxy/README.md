# Kazashi narration proxy

One Vercel serverless function, `POST /api/narrate`. After you record a take in the theatre, the app sends a
**staging summary** (which creatures were on stage, when they entered and left, how far and which way they moved). This
function checks it, writes the prompt on the server and asks **Muse** (`muse-spark-1.3`, Meta Model API) for 3–4 timed
narration lines. The theatre shows them as paper captions on the wall when the take replays (captions only, no speech).

Kazashi works fully without this server. If it is not configured or fails, the app says **"AI narration unavailable"**
with the reason and the theatre carries on.

## What it allows

- One model (`muse-spark-1.3`), one upstream URL (`https://api.meta.ai/v1/chat/completions`), one route.
- Only the 25 Kazashi creature ids and bounded numbers. Free text from the browser never reaches the model.
- `ALLOWED_ORIGINS` for CORS (default: `https://nickthelegend.github.io`, `https://localhost:8093`, `http://localhost:8093`).
- Per-IP limit (`PER_IP_PER_MIN`, default 6) and a daily cap (`DAILY_CAP`, default 300, reset at 00:00 UTC).
  Both counters live in the function instance's memory. Vercel can run several warm instances, so the effective
  global cap is up to `DAILY_CAP` × instances. For a strict global cap, put a store such as Upstash Redis behind
  `Limiter`.
- Readable errors: `503 AI unavailable` (no key), `502 AI unavailable` (Muse down, slow, rejected the key, bad output),
  `429` (limits), `400`/`403`/`405`/`413`.

## Deploy (Vercel)

```bash
cd packages/proxy
npx vercel link                       # new project, root = packages/proxy, framework "Other"
npx vercel env add MODEL_API_KEY production      # paste the Meta Model API key at the prompt
npx vercel env add ALLOWED_ORIGINS production    # https://nickthelegend.github.io
npx vercel deploy --prod
curl -s -X POST https://<deployment>/api/narrate -H 'Origin: https://nickthelegend.github.io' \
  -H 'Content-Type: application/json' \
  -d '{"duration":10,"handSeconds":2,"cast":[{"id":"inu","enters":0,"exits":10,"travel":2,"turns":1,"heading":"both","height":"low"}]}'
```

Then build the app with the proxy URL: `VITE_KAZASHI_PROXY_URL=https://<deployment> npm run build` in `packages/app`
(the Pages workflow reads it from the repository variable `KAZASHI_PROXY_URL`).

## Run locally (emulator recordings)

```bash
( set -a; . /path/to/file-with-MODEL_API_KEY.env; set +a; node dev-server.mjs )   # http://localhost:8787/api/narrate
echo 'VITE_KAZASHI_PROXY_URL=http://localhost:8787' > ../app/.env.local          # gitignored
```

## Tests

`npm test` runs validation, the rate limiter and the handler's error paths without a key or network.
`npm run test:live` with `MODEL_API_KEY` in the environment also calls the real Meta Model API once.

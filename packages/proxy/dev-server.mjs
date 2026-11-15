// Local runner for the Vercel function (the same handler), for emulator runs:
//   ( set -a; . /path/to/.env; set +a; node dev-server.mjs )   # serves http://localhost:8787/api/narrate
// The key is read from the environment only; nothing is printed about it.
import http from 'node:http';
import handler from './api/narrate.js';
import { ROUTE } from './lib/narrate.js';

const port = Number(process.env.PORT ?? 8787);
http
  .createServer((req, res) => {
    if (new URL(req.url ?? '/', 'http://x').pathname !== ROUTE) {
      res.statusCode = 404;
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({ error: 'Not found', detail: `only ${ROUTE} exists` }));
    }
    handler(req, res).catch((e) => {
      console.error(e);
      res.statusCode = 500;
      res.end();
    });
  })
  .listen(port, '127.0.0.1', () => console.log(`kazashi narration proxy on http://localhost:${port}${ROUTE} (key ${process.env.MODEL_API_KEY ? 'present' : 'MISSING'})`));

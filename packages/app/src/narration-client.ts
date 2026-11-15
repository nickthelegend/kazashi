/**
 * Talks to the Kazashi narration proxy (packages/proxy). The browser never
 * holds a model key: it sends a staging summary and gets back Muse's lines.
 * Every failure becomes a readable "AI narration unavailable" reason; the
 * theatre works the same without narration. Narration is shown as paper
 * captions only: Kazashi never uses browser speech synthesis.
 */
import { type Narration, NARRATION_ROUTE, normalizeNarration, type StagingSummary } from '@kazashi/core/narration';

const PROXY = (import.meta.env.VITE_KAZASHI_PROXY_URL as string | undefined)?.replace(/\/$/, '') ?? '';

export class NarrationUnavailable extends Error {}

export function narrationConfigured(): boolean {
  return PROXY.length > 0;
}

export async function requestNarration(summary: StagingSummary): Promise<Narration> {
  if (!PROXY) throw new NarrationUnavailable('setup required: no narration server is configured for this build');
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 30000);
  let res: Response;
  try {
    res = await fetch(`${PROXY}${NARRATION_ROUTE}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(summary),
      signal: ctrl.signal,
    });
  } catch (e) {
    throw new NarrationUnavailable((e as Error).name === 'AbortError' ? 'the narration server did not answer in 30 s' : 'the narration server is unreachable');
  } finally {
    clearTimeout(timer);
  }
  let body: { lines?: unknown; model?: string; error?: string; detail?: string } = {};
  try {
    body = await res.json();
  } catch {
    /* handled below */
  }
  if (!res.ok) throw new NarrationUnavailable(body.detail ?? `the narration server returned HTTP ${res.status}`);
  try {
    return { lines: normalizeNarration(body, summary.duration), model: body.model ?? 'muse-spark-1.3', createdAt: Date.now() };
  } catch (e) {
    throw new NarrationUnavailable(`Muse's reply was unusable (${(e as Error).message})`);
  }
}

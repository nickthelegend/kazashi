/**
 * Synthesised sound, no samples: a koto-like pluck (Karplus–Strong), paper
 * rustle (band-passed noise) and the ink bleed (low noise swell). The context
 * starts on the first user gesture (entering XR).
 */

// Miyako-bushi (in scale) on D: D, Eb, G, A, Bb.
const SCALE = [0, 1, 5, 7, 8];
const BASE_HZ = 293.66;

export class Sound {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  muted = false;

  start(): void {
    if (this.ctx) {
      void this.ctx.resume();
      return;
    }
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    this.ctx = new Ctor();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.6;
    this.master.connect(this.ctx.destination);
    const len = this.ctx.sampleRate;
    this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    let seed = 1234567;
    for (let i = 0; i < len; i++) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      d[i] = (seed / 0x7fffffff) * 2 - 1;
    }
  }

  private ready(): AudioContext | null {
    return this.muted || !this.ctx || !this.master ? null : this.ctx;
  }

  /** A plucked string on scale degree `step` (wraps into higher octaves). */
  pluck(step: number, gain = 0.5): void {
    const ctx = this.ready();
    if (!ctx) return;
    const octave = Math.floor(step / SCALE.length);
    const semis = SCALE[((step % SCALE.length) + SCALE.length) % SCALE.length] + octave * 12;
    const hz = BASE_HZ * 2 ** (semis / 12);
    const sr = ctx.sampleRate;
    const dur = 1.8;
    const buf = ctx.createBuffer(1, Math.floor(sr * dur), sr);
    const out = buf.getChannelData(0);
    const period = Math.max(2, Math.round(sr / hz));
    const line = new Float32Array(period);
    let seed = step * 7919 + 17;
    for (let i = 0; i < period; i++) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      line[i] = (seed / 0x7fffffff) * 2 - 1;
    }
    let idx = 0;
    for (let i = 0; i < out.length; i++) {
      const next = (idx + 1) % period;
      const v = 0.497 * (line[idx] + line[next]);
      out[i] = line[idx];
      line[idx] = v;
      idx = next;
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    const tone = ctx.createBiquadFilter();
    tone.type = 'lowpass';
    tone.frequency.value = 3200;
    src.connect(tone).connect(g).connect(this.master!);
    src.start();
  }

  private noiseBurst(dur: number, filter: BiquadFilterType, hz: number, q: number, gain: number, attack = 0.01): void {
    const ctx = this.ready();
    if (!ctx || !this.noise) return;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = filter;
    f.frequency.value = hz;
    f.Q.value = q;
    const g = ctx.createGain();
    const t = ctx.currentTime;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.master!);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.05);
  }

  rustle(): void {
    this.noiseBurst(0.22, 'bandpass', 3800, 0.9, 0.25, 0.005);
    setTimeout(() => this.noiseBurst(0.12, 'bandpass', 5200, 1.2, 0.12, 0.004), 70);
  }

  inkBleed(): void {
    this.noiseBurst(1.1, 'lowpass', 420, 0.7, 0.35, 0.25);
  }

  tap(): void {
    this.noiseBurst(0.06, 'bandpass', 2400, 2, 0.3, 0.002);
  }

  /** A short rising phrase for a completed act. */
  flourish(): void {
    [0, 2, 3, 5].forEach((s, i) => setTimeout(() => this.pluck(s + 5, 0.4), i * 140));
  }
}

export const sound = new Sound();

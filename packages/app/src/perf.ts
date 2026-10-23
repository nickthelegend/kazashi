/**
 * Frame-cost probe for the emulator gates: CPU time of the ECS update plus
 * the render submission, and the renderer's draw calls and triangles, per
 * frame. Desktop numbers, not Quest numbers.
 */
import { createSystem, type World } from '@iwsdk/core';

interface Sample {
  cpu: number;
  ecs: number;
  render: number;
  calls: number;
  triangles: number;
}

const state = {
  target: 0,
  samples: [] as Sample[],
  frameStart: 0,
  ecsEnd: 0,
  renderMs: 0,
};

export class PerfStartSystem extends createSystem({}) {
  update(): void {
    state.frameStart = performance.now();
    state.renderMs = 0;
  }
}

export class PerfEndSystem extends createSystem({}) {
  update(): void {
    state.ecsEnd = performance.now();
  }
}

export function installPerf(world: World): void {
  const r = world.renderer;
  const render = r.render.bind(r);
  r.render = (scene, camera) => {
    const t0 = performance.now();
    render(scene, camera);
    const t1 = performance.now();
    state.renderMs += t1 - t0;
    if (state.samples.length < state.target && state.frameStart > 0) {
      const ecs = state.ecsEnd - state.frameStart;
      state.samples.push({
        ecs,
        render: state.renderMs,
        cpu: ecs + state.renderMs,
        calls: r.info.render.calls,
        triangles: r.info.render.triangles,
      });
    }
  };
  const pct = (xs: number[], p: number) => {
    const s = [...xs].sort((a, b) => a - b);
    return s.length ? s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))] : 0;
  };
  (window as unknown as { __kazashiPerf: unknown }).__kazashiPerf = {
    start(frames = 600) {
      state.samples = [];
      state.target = frames;
    },
    get count() {
      return state.samples.length;
    },
    result() {
      const s = state.samples;
      const cpu = s.map((x) => x.cpu);
      return {
        frames: s.length,
        cpuP50: pct(cpu, 50),
        cpuP95: pct(cpu, 95),
        ecsP95: pct(s.map((x) => x.ecs), 95),
        renderP95: pct(s.map((x) => x.render), 95),
        callsMax: Math.max(0, ...s.map((x) => x.calls)),
        callsP50: pct(s.map((x) => x.calls), 50),
        trianglesMax: Math.max(0, ...s.map((x) => x.triangles)),
      };
    },
  };
}

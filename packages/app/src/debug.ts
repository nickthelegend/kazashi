/**
 * Test hook: read-only views of live state for the emulator e2e scripts and
 * the pose tool. It drives nothing; the tests move the emulated hands through
 * IWER, and the app scores them like any hand.
 */
import { TARGET_POSES } from '@kazashi/core/bestiary';
import { dirFromLightFrame, fromLightFrame } from '@kazashi/core/lightframe';
import { app } from './app.js';
import { shadow } from './hand-system.js';

export interface PlacedHand {
  device: 'hand-left' | 'hand-right';
  poseId: string;
  fingers?: Record<string, string>;
  weight?: number;
  position: { x: number; y: number; z: number };
  orientation: { fingers: number[]; palm: number[] };
}

export function installDebugHook(): void {
  (window as unknown as { __kazashi: unknown }).__kazashi = {
    get ready() {
      return app.lightReady;
    },
    light: () => [...app.light],
    wall: () => (app.wall ? { id: app.wall.id, kind: app.wall.kind, origin: app.wall.origin, normal: app.wall.normal, halfU: app.wall.halfU, halfV: app.wall.halfV } : null),
    surfaces: () => app.surfaces.map((s) => ({ id: s.id, kind: s.kind, origin: s.origin, normal: s.normal })),
    shadow: () => ({ ...shadow, center: [...shadow.center] }),
    settings: () => ({ ...app.settings }),
    progress: () => JSON.parse(JSON.stringify(app.progress)),
    /** World-space IWER placement of an authored pose for the current lantern and wall. */
    recipe(id: string, offset: [number, number, number] = [0, 0, 0]): PlacedHand[] {
      const t = TARGET_POSES[id];
      if (!t) throw new Error(`no authored pose ${id}`);
      return t.recipe.hands.map((h) => {
        const w = [h.wrist[0] + offset[0], h.wrist[1] + offset[1], h.wrist[2] + offset[2]];
        const p = fromLightFrame(app.frame, w);
        return {
          device: `hand-${h.hand}` as const,
          poseId: h.poseId,
          fingers: h.fingers,
          weight: h.weight,
          position: { x: p[0], y: p[1], z: p[2] },
          orientation: { fingers: dirFromLightFrame(app.frame, h.fingersDir), palm: dirFromLightFrame(app.frame, h.palmDir) },
        };
      });
    },
    /** World joints of a hand in the light frame (pose tool). */
    lightFrameJoints: () => app.lightHands.map((h) => Array.from(h)),
  };
}

/**
 * Hands → shadow. Every frame: read joints (or a replayed take), move the
 * shadow proxy. At 15 Hz: put the hands in the lantern's light frame, run the
 * analytic rasteriser, and publish the shadow's size and centre on the wall.
 */
import { imageToWall, toLightFrame, type Vec3 } from '@kazashi/core/lightframe';
import { MIN_DEPTH } from '@kazashi/core/silhouette';
import { createSystem, type Entity } from '@iwsdk/core';
import { app } from './app.js';
import { ShadowScale } from './components.js';
import { ShadowProxy } from './shadow-proxy.js';

export const SCORE_HZ = 15;
const NO_HANDS: readonly null[] = [null, null];

export const shadow = {
  /** Increments on every 15 Hz scoring tick. */
  seq: 0,
  valid: false,
  /** Shadow centre on the wall (world). */
  center: [0, 0, 0] as Vec3,
  /** sqrt(area) on the wall, metres. */
  size: 0,
  /** sqrt(area) on the 1 m pinhole image: depends only on hand-to-lantern distance. */
  imageSize: 0,
  height: 0,
  hands: 0,
  /** Seconds spent in the last raster+score (for the perf log). */
  lastCostMs: 0,
};

export class HandSystem extends createSystem({ scale: { required: [ShadowScale] } }) {
  readonly proxy = new ShadowProxy();
  private entity!: Entity;
  private acc = 0;
  private readonly list: Float32Array[] = [];
  private replaying = false;
  /** Joint smoothing (time constant 50 ms) against held-pose jitter. */
  private readonly smooth = [new Float32Array(75), new Float32Array(75)];
  private readonly wasTracked = [false, false];

  init(): void {
    this.scene.add(this.proxy.root);
    this.entity = this.world.createEntity();
    this.entity.addComponent(ShadowScale, {});
  }

  update(delta: number): void {
    const frame = this.xrFrame;
    const ref = this.xrManager.getReferenceSpace();
    this.player.updateMatrixWorld();
    app.hands.update(frame, ref, this.player.matrixWorld, delta);

    const replay = app.replayHands;
    if (!!replay !== this.replaying) {
      this.replaying = !!replay;
      this.proxy.setOccluding(!this.replaying);
    }
    if (replay) {
      app.shadowHands[0] = replay[0];
      app.shadowHands[1] = replay[1];
    } else {
      // Smooth live joints, and keep the last pose for 150 ms of tracking loss.
      const a = 1 - Math.exp(-delta / 0.05);
      for (let h = 0; h < 2; h++) {
        const hand = h === 0 ? app.hands.hands.left : app.hands.hands.right;
        const out = this.smooth[h];
        if (hand.tracked) {
          if (!this.wasTracked[h]) out.set(hand.joints);
          else for (let i = 0; i < 75; i++) out[i] += (hand.joints[i] - out[i]) * a;
        }
        this.wasTracked[h] = hand.tracked;
        app.shadowHands[h] = hand.tracked || hand.lostFor < 0.15 ? out : null;
      }
    }
    this.proxy.update(app.lightReady ? app.shadowHands : NO_HANDS);

    this.acc += delta;
    if (this.acc < 1 / SCORE_HZ) return;
    this.acc = 0;
    const t0 = performance.now();
    this.list.length = 0;
    if (app.lightReady) {
      for (let h = 0; h < 2; h++) {
        const j = app.shadowHands[h];
        if (!j) continue;
        const lj = toLightFrame(app.frame, j, app.lightHands[h]);
        // A hand beside or behind the lantern casts nothing on the wall.
        let inFront = true;
        for (let i = 2; i < 75; i += 3) if (-lj[i] < MIN_DEPTH) inFront = false;
        if (inFront) this.list.push(lj);
      }
    }
    const ok = app.scorer.update(this.list);
    shadow.valid = ok;
    shadow.hands = this.list.length;
    if (ok) {
      const m = app.scorer.measure;
      const d = app.wallDistance;
      shadow.imageSize = Math.sqrt(m.area);
      shadow.size = shadow.imageSize * d;
      shadow.height = (m.bounds.maxY - m.bounds.minY) * d;
      imageToWall(app.frame, d, m.cx, m.cy, shadow.center);
    }
    shadow.seq++;
    shadow.lastCostMs = performance.now() - t0;
    const e = this.entity;
    e.setValue(ShadowScale, 'valid', ok);
    e.setValue(ShadowScale, 'size', ok ? shadow.size : 0);
    e.setValue(ShadowScale, 'height', ok ? shadow.height : 0);
    e.setValue(ShadowScale, 'wallDistance', app.wallDistance);
    e.setValue(ShadowScale, 'hands', this.list.length);
  }
}

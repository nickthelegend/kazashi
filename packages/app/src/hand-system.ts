/**
 * Hands → shadow. Every frame: read joints (or a replayed take), move the
 * shadow proxy. At 15 Hz: put the hands in the lantern's light frame, run the
 * analytic rasteriser, and publish the shadow's size and centre on the wall.
 */
import { imageToWall, toLightFrame, type Vec3 } from '@kazashi/core/lightframe';
import { createSystem, type Entity } from '@iwsdk/core';
import { app } from './app.js';
import { ShadowScale } from './components.js';
import { ShadowProxy } from './shadow-proxy.js';

export const SCORE_HZ = 15;

export const shadow = {
  /** Increments on every 15 Hz scoring tick. */
  seq: 0,
  valid: false,
  /** Shadow centre on the wall (world). */
  center: [0, 0, 0] as Vec3,
  /** sqrt(area) on the wall, metres. */
  size: 0,
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
      // Tolerate brief tracking loss: keep the last pose for 150 ms.
      app.shadowHands[0] = app.hands.hands.left.tracked || app.hands.hands.left.lostFor < 0.15 ? app.hands.hands.left.joints : null;
      app.shadowHands[1] = app.hands.hands.right.tracked || app.hands.hands.right.lostFor < 0.15 ? app.hands.hands.right.joints : null;
      if (app.hands.hands.left.lostFor > 10) app.shadowHands[0] = null;
      if (app.hands.hands.right.lostFor > 10) app.shadowHands[1] = null;
    }
    this.proxy.update(app.lightReady ? app.shadowHands : [null, null]);

    this.acc += delta;
    if (this.acc < 1 / SCORE_HZ) return;
    this.acc = 0;
    const t0 = performance.now();
    this.list.length = 0;
    if (app.lightReady) {
      for (let h = 0; h < 2; h++) {
        const j = app.shadowHands[h];
        if (!j) continue;
        toLightFrame(app.frame, j, app.lightHands[h]);
        this.list.push(app.lightHands[h]);
      }
    }
    const ok = app.scorer.update(this.list);
    shadow.valid = ok;
    shadow.hands = this.list.length;
    if (ok) {
      const m = app.scorer.measure;
      const d = app.wallDistance;
      shadow.size = Math.sqrt(m.area) * d;
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

/** Short captions on a paper strip just below eye level (inside the glasses' view too). */
import { createSystem, DoubleSide, Mesh, MeshBasicMaterial, PlaneGeometry, Vector3 } from '@iwsdk/core';
import { app } from './app.js';
import { canvasTexture, COLORS, FONT_DISPLAY, paper, redraw } from './paint.js';

export class ToastSystem extends createSystem({}) {
  private mesh!: Mesh;
  private until = 0;
  private time = 0;
  private readonly head = new Vector3();
  private readonly fwd = new Vector3();

  init(): void {
    const tex = canvasTexture(1024, 128, (ctx) => paper(ctx, 1024, 128));
    this.mesh = new Mesh(new PlaneGeometry(0.42, 0.0525), new MeshBasicMaterial({ map: tex, transparent: true, side: DoubleSide, depthTest: false }));
    this.mesh.name = 'Toast';
    this.mesh.renderOrder = 20;
    this.mesh.visible = false;
    this.scene.add(this.mesh);
    this.cleanupFuncs.push(
      app.events.on('toast', (text) => {
        redraw(tex, (ctx) => {
          paper(ctx, 1024, 128);
          ctx.fillStyle = COLORS.vermilion;
          ctx.fillRect(0, 0, 14, 128);
          ctx.fillStyle = COLORS.sumi;
          ctx.font = `800 52px ${FONT_DISPLAY}`;
          ctx.textBaseline = 'middle';
          ctx.fillText(text, 44, 68, 950);
        });
        this.until = this.time + 3;
        this.mesh.visible = true;
        console.info(`[kazashi] ${text}`);
      }),
    );
  }

  update(_d: number, time: number): void {
    this.time = time;
    if (!this.mesh.visible) return;
    if (time > this.until || !this.xrManager.isPresenting) {
      this.mesh.visible = false;
      return;
    }
    this.player.head.getWorldPosition(this.head);
    this.player.head.getWorldDirection(this.fwd).negate();
    this.mesh.position.copy(this.head).addScaledVector(this.fwd, 0.7);
    this.mesh.position.y -= 0.16;
    this.mesh.lookAt(this.head);
  }
}

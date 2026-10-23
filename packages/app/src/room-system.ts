/**
 * Reads detected planes into classified surfaces (no labels: orientation,
 * height and size only), keeps the lit wall, and runs the shoji fallback:
 * no wall within 5 s → a paper screen follows your gaze until you pinch.
 */
import { classifyPlanes, pickWall, type PlaneInput, shojiSurface, type Surface } from '@kazashi/core/room';
import {
  createSystem,
  DoubleSide,
  type Entity,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  Quaternion,
  Vector3,
  XRPlane,
} from '@iwsdk/core';
import { app } from './app.js';
import { sound } from './audio.js';
import { RoomModes, RoomState } from './components.js';
import { canvasTexture, paper } from './paint.js';

export const WALL_TIMEOUT_S = 5;
const SHOJI_W = 1.6;
const SHOJI_H = 1.8;

function shojiTexture() {
  return canvasTexture(512, 576, (ctx) => {
    paper(ctx, 512, 576, '#f6efe0');
    ctx.strokeStyle = '#5a3b26';
    ctx.lineWidth = 7;
    for (let i = 1; i < 4; i++) {
      ctx.beginPath();
      ctx.moveTo((512 * i) / 4, 0);
      ctx.lineTo((512 * i) / 4, 576);
      ctx.stroke();
    }
    for (let i = 1; i < 6; i++) {
      ctx.beginPath();
      ctx.moveTo(0, (576 * i) / 6);
      ctx.lineTo(512, (576 * i) / 6);
      ctx.stroke();
    }
    ctx.lineWidth = 26;
    ctx.strokeStyle = '#3b2216';
    ctx.strokeRect(13, 13, 486, 550);
  });
}

export class RoomSystem extends createSystem({
  planes: { required: [XRPlane] },
  state: { required: [RoomState] },
}) {
  private stateEntity!: Entity;
  private dirty = true;
  private rescanTimer = 0;
  private scanTime = 0;
  private shoji: Mesh | null = null;
  private shojiSurface: Surface | null = null;
  private readonly head = new Vector3();
  private readonly fwd = new Vector3();
  private readonly q = new Quaternion();
  private readonly v = new Vector3();

  init(): void {
    this.stateEntity = this.world.createEntity();
    this.stateEntity.addComponent(RoomState, { mode: RoomModes.scanning });
    this.cleanupFuncs.push(
      this.queries.planes.subscribe('qualify', () => (this.dirty = true)),
      this.queries.planes.subscribe('disqualify', () => (this.dirty = true)),
    );
    const onEnd = () => this.resetSession();
    this.xrManager.addEventListener('sessionend', onEnd);
    this.cleanupFuncs.push(() => this.xrManager.removeEventListener('sessionend', onEnd));
  }

  private resetSession(): void {
    this.scanTime = 0;
    this.shoji?.removeFromParent();
    this.shoji = null;
    this.shojiSurface = null;
    app.wall = null;
    this.stateEntity.setValue(RoomState, 'mode', RoomModes.scanning);
  }

  private readPlanes(): PlaneInput[] {
    const out: PlaneInput[] = [];
    for (const e of this.queries.planes.entities) {
      const obj = e.object3D;
      const plane = e.getValue(XRPlane, '_plane') as XRPlane | undefined;
      if (!obj || !plane) continue;
      obj.updateMatrixWorld(true);
      const n = new Vector3(0, 1, 0).applyQuaternion(obj.getWorldQuaternion(this.q)).normalize();
      const points = plane.polygon.map((p) => {
        const w = new Vector3(p.x, 0, p.z).applyMatrix4(obj.matrixWorld);
        return [w.x, w.y, w.z] as [number, number, number];
      });
      if (points.length >= 3) out.push({ id: `plane-${e.index}`, normal: [n.x, n.y, n.z], points });
    }
    return out;
  }

  /** Re-pick the lit wall from the lantern's current aim. */
  repickWall(aim: Vector3): void {
    const surfaces = this.shojiSurface ? [...app.surfaces, this.shojiSurface] : app.surfaces;
    const w = pickWall(surfaces, app.light, [aim.x, aim.y, aim.z]);
    if (w?.id !== app.wall?.id) {
      app.wall = w;
      app.events.emit('wall', w);
    }
    this.stateEntity.setValue(RoomState, 'wallId', w?.id ?? '');
    if (w) this.stateEntity.setValue(RoomState, 'mode', w.kind === 'shoji' ? RoomModes.shoji : RoomModes.wall);
  }

  update(delta: number): void {
    if (!this.xrManager.isPresenting) return;
    this.scanTime += delta;
    this.rescanTimer -= delta;
    if (this.dirty && this.rescanTimer <= 0) {
      this.dirty = false;
      this.rescanTimer = 0.5;
      app.surfaces = classifyPlanes(this.readPlanes());
      this.stateEntity.setValue(RoomState, 'surfaces', app.surfaces.length);
      this.stateEntity.setValue(RoomState, 'walls', app.surfaces.filter((s) => s.kind === 'wall').length);
      if (app.wall && !app.surfaces.some((s) => s.id === app.wall!.id) && app.wall.kind !== 'shoji') {
        app.wall = null;
        app.events.emit('wall', null);
        // The wall went away (room changed): look again, then offer the shoji.
        this.scanTime = 0;
        this.stateEntity.setValue(RoomState, 'mode', RoomModes.scanning);
      }
    }
    this.stateEntity.setValue(RoomState, 'scanSeconds', this.scanTime);

    const mode = this.stateEntity.getValue(RoomState, 'mode');
    if (!app.wall && !this.shojiSurface && this.scanTime > WALL_TIMEOUT_S && mode === RoomModes.scanning) {
      this.stateEntity.setValue(RoomState, 'mode', RoomModes.shojiGhost);
      this.showShojiGhost();
      app.events.emit('toast', 'No wall found: pinch to stand a shoji screen');
    }
    if (this.stateEntity.getValue(RoomState, 'mode') === RoomModes.shojiGhost && this.shoji) {
      this.placeGhost();
      const xr = this.input.xr;
      if (xr.getSelectState('left').start || xr.getSelectState('right').start) this.placeShoji();
    }
  }

  private showShojiGhost(): void {
    const mat = new MeshBasicMaterial({ map: shojiTexture(), transparent: true, opacity: 0.55, side: DoubleSide, depthWrite: false });
    this.shoji = new Mesh(new PlaneGeometry(SHOJI_W, SHOJI_H), mat);
    this.shoji.name = 'Shoji';
    this.scene.add(this.shoji);
  }

  private placeGhost(): void {
    const s = this.shoji!;
    this.player.head.getWorldPosition(this.head);
    this.player.head.getWorldDirection(this.fwd).negate();
    this.fwd.y = 0;
    if (this.fwd.lengthSq() < 1e-4) this.fwd.set(0, 0, -1);
    this.fwd.normalize();
    // In front of the lantern if it is placed, else in front of the viewer.
    const base = app.lightReady ? this.v.set(app.light[0], 0, app.light[2]) : this.v.set(this.head.x, 0, this.head.z);
    const d = app.lightReady ? 1.3 : 1.7;
    s.position.set(base.x + this.fwd.x * d, Math.max(SHOJI_H / 2, 0.95), base.z + this.fwd.z * d);
    s.lookAt(s.position.x - this.fwd.x, s.position.y, s.position.z - this.fwd.z);
  }

  private placeShoji(): void {
    const s = this.shoji!;
    (s.material as MeshBasicMaterial).opacity = 1;
    (s.material as MeshBasicMaterial).transparent = false;
    (s.material as MeshBasicMaterial).depthWrite = true;
    const facing = new Vector3(0, 0, 1).applyQuaternion(s.quaternion);
    this.shojiSurface = shojiSurface([s.position.x, s.position.y, s.position.z], [facing.x, facing.y, facing.z], SHOJI_W, SHOJI_H);
    this.stateEntity.setValue(RoomState, 'mode', RoomModes.shoji);
    app.wall = this.shojiSurface;
    this.stateEntity.setValue(RoomState, 'wallId', 'shoji');
    app.events.emit('wall', app.wall);
    sound.rustle();
  }

  get shojiPlaced(): boolean {
    return this.shojiSurface !== null;
  }
}

/**
 * The lantern: placed on a desk within reach (or floating at chest height
 * when there is none), pinch-grabbable to change the shadow's size, and the
 * one light that casts the hand shadow onto the chosen wall. Also owns the
 * dusk overlays on room surfaces and the shadow catcher on the wall.
 */
import { makeLightFrame, fromLightFrame, wallDistance } from '@kazashi/core/lightframe';
import { pickLanternSpot, type Surface, toSurface } from '@kazashi/core/room';
import {
  createSystem,
  type Entity,
  Grabbed,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  OneHandGrabbable,
  PlaneGeometry,
  PokeInteractable,
  Pressed,
  RayInteractable,
  ShaderMaterial,
  ShadowMaterial,
  SpotLight,
  Vector3,
  XRAnchor,
} from '@iwsdk/core';
import { app } from './app.js';
import { sound } from './audio.js';
import { Lantern, PaperButton } from './components.js';
import { createDuskMaterial } from './dusk-material.js';
import { canvasTexture, COLORS, drawGlyph, type Glyph, paper } from './paint.js';
import { createLantern, TAB_NAMES } from './scene-assets/lantern.scene-asset.js';
import { SHADOW_LAYER } from './shadow-proxy.js';
import type { RoomSystem } from './room-system.js';

/** Where the hand is expected, in the light frame (matches the authored poses). */
export const STAGE_POINT: [number, number, number] = [0.05, 0.1, -0.3];
const TAB_ACTIONS: Record<(typeof TAB_NAMES)[number], { action: string; glyph: Glyph }> = {
  Tab_Hint: { action: 'hint', glyph: 'hint' },
  Tab_Retry: { action: 'retry', glyph: 'retry' },
  Tab_Next: { action: 'next', glyph: 'next' },
};
const DUSK_KINDS = new Set(['wall', 'floor', 'ceiling', 'desk', 'shoji']);

export class LanternSystem extends createSystem({
  lantern: { required: [Lantern] },
  held: { required: [Lantern, Grabbed] },
  buttons: { required: [PaperButton] },
  pressed: { required: [PaperButton, Pressed] },
}) {
  entity: Entity | null = null;
  private root: Object3D | null = null;
  private lightOrigin: Object3D | null = null;
  private paper: ShaderMaterial | null = null;
  private spot!: SpotLight;
  private catcher!: Mesh;
  private duskMeshes = new Map<string, Mesh>();
  private duskMaterial!: ShaderMaterial;
  private dusk = 0;
  private sessionTime = 0;
  private everGrabbed = false;
  private readonly head = new Vector3();
  private readonly fwd = new Vector3();
  private readonly lightPos = new Vector3();
  private readonly aim = new Vector3();
  private readonly stage = new Vector3();
  private readonly tmp = new Vector3();
  room!: RoomSystem;

  init(): void {
    this.spot = new SpotLight('#ffcf8a', 6, 0, Math.PI / 3.2, 0.55, 0);
    this.spot.name = 'LanternSpot';
    this.spot.castShadow = true;
    this.spot.shadow.mapSize.set(512, 512);
    this.spot.shadow.bias = -0.0004;
    this.spot.shadow.normalBias = 0.01;
    this.spot.shadow.radius = 3;
    this.spot.shadow.camera.near = 0.04;
    this.spot.shadow.camera.far = 8;
    this.spot.shadow.camera.layers.enable(SHADOW_LAYER);
    this.spot.visible = false;
    this.scene.add(this.spot, this.spot.target);

    this.catcher = new Mesh(new PlaneGeometry(1, 1), new ShadowMaterial({ color: COLORS.sumi, opacity: 0.86, depthWrite: false }));
    this.catcher.name = 'WallShadow';
    this.catcher.receiveShadow = true;
    this.catcher.renderOrder = 2;
    this.catcher.visible = false;
    this.scene.add(this.catcher);

    this.duskMaterial = createDuskMaterial();

    this.cleanupFuncs.push(
      this.queries.held.subscribe('qualify', () => {
        this.everGrabbed = true;
        sound.rustle();
      }),
      this.queries.held.subscribe('disqualify', () => this.onRelease()),
      this.queries.pressed.subscribe('qualify', (e) => {
        const action = e.getValue(PaperButton, 'action') as string;
        e.setValue(PaperButton, 'presses', (e.getValue(PaperButton, 'presses') as number) + 1);
        sound.tap();
        const obj = e.object3D;
        if (obj) obj.scale.setScalar(0.85);
        app.events.emit('button', action);
      }),
      app.events.on('wall', (w) => this.onWall(w)),
    );
    const onEnd = () => this.removeLantern();
    this.xrManager.addEventListener('sessionend', onEnd);
    this.cleanupFuncs.push(() => this.xrManager.removeEventListener('sessionend', onEnd));
  }

  private createLanternEntity(): void {
    const root = createLantern();
    this.root = root;
    this.lightOrigin = root.getObjectByName('LightOrigin') ?? root;
    this.paper = ((root.getObjectByName('Body') as Mesh).material as ShaderMaterial) ?? null;
    this.scene.add(root);
    const e = this.world.createTransformEntity(root);
    e.addComponent(Lantern, { placed: false, onDesk: false });
    e.addComponent(OneHandGrabbable, { rotate: false, translate: true });
    e.addComponent(XRAnchor);
    this.entity = e;
    for (const name of TAB_NAMES) {
      const tab = root.getObjectByName(name) as Mesh;
      const { action, glyph } = TAB_ACTIONS[name];
      tab.material = new MeshBasicMaterial({
        map: canvasTexture(176, 144, (ctx) => {
          paper(ctx, 176, 144);
          ctx.strokeStyle = COLORS.vermilion;
          ctx.lineWidth = 8;
          ctx.strokeRect(4, 4, 168, 136);
          drawGlyph(ctx, glyph, 88, 72, 46, COLORS.sumi);
        }),
      });
      const te = this.world.createTransformEntity(tab, { parent: e });
      te.addComponent(PaperButton, { action });
      te.addComponent(PokeInteractable);
      te.addComponent(RayInteractable);
    }
  }

  private removeLantern(): void {
    this.entity?.dispose();
    this.entity = null;
    this.root = null;
    app.lightReady = false;
    this.spot.visible = false;
    this.catcher.visible = false;
    this.sessionTime = 0;
    this.everGrabbed = false;
    for (const m of this.duskMeshes.values()) m.removeFromParent();
    this.duskMeshes.clear();
  }

  /** Place (or re-place) the lantern near the viewer. */
  placeLantern(): void {
    if (!this.root) this.createLanternEntity();
    const root = this.root!;
    this.player.head.getWorldPosition(this.head);
    this.player.head.getWorldDirection(this.fwd).negate();
    this.fwd.y = 0;
    if (this.fwd.lengthSq() < 1e-4) this.fwd.set(0, 0, -1);
    this.fwd.normalize();
    const spot = pickLanternSpot(app.surfaces, [this.head.x, this.head.y, this.head.z], [this.fwd.x, this.fwd.y, this.fwd.z]);
    if (spot) {
      root.position.set(spot.point[0], spot.point[1], spot.point[2]);
    } else {
      root.position.set(this.head.x + this.fwd.x * 0.42, this.head.y - 0.55, this.head.z + this.fwd.z * 0.42);
    }
    root.rotation.set(0, Math.atan2(-this.fwd.x, -this.fwd.z) + Math.PI, 0);
    this.entity!.setValue(Lantern, 'placed', true);
    this.entity!.setValue(Lantern, 'onDesk', !!spot);
    this.updateLight();
    this.room.repickWall(this.aimFromViewer());
    sound.rustle();
  }

  private aimFromViewer(): Vector3 {
    // Ahead of the viewer and gently upward: over the hand, onto the wall.
    return this.aim.copy(this.fwd).setY(0.33).normalize();
  }

  private onRelease(): void {
    const root = this.root;
    if (!root) return;
    // Settle onto a desk just below.
    for (const s of app.surfaces) {
      if (s.kind !== 'desk') continue;
      const p = toSurface(s, [root.position.x, root.position.y, root.position.z]);
      if (Math.abs(p.a) <= s.halfU && Math.abs(p.b) <= s.halfV && p.h > -0.02 && p.h < 0.12) {
        root.position.y = s.origin[1];
        this.entity?.setValue(Lantern, 'onDesk', true);
      }
    }
    this.updateLight();
    if (!app.wall || app.wall.kind !== 'shoji') this.room.repickWall(this.aimFromViewer());
  }

  private onWall(w: Surface | null): void {
    this.catcher.visible = !!w;
    if (!w) return;
    const n = new Vector3(...w.normal);
    this.catcher.position.set(w.origin[0], w.origin[1], w.origin[2]).addScaledVector(n, 0.004);
    this.catcher.lookAt(this.tmp.copy(this.catcher.position).add(n));
    this.catcher.scale.set(w.halfU * 2, w.halfV * 2, 1);
    this.updateLight();
  }

  private updateLight(): void {
    if (!this.lightOrigin) return;
    this.lightOrigin.updateWorldMatrix(true, false);
    this.lightOrigin.getWorldPosition(this.lightPos);
    app.light = [this.lightPos.x, this.lightPos.y, this.lightPos.z];
    const w = app.wall;
    if (w) {
      app.frame = makeLightFrame(app.light, w.normal);
      app.wallDistance = wallDistance(app.light, w.origin, w.normal);
      fromLightFrame(app.frame, STAGE_POINT, this.stagePoint);
      this.stage.set(...this.stagePoint);
      this.aim.subVectors(this.stage, this.lightPos).normalize();
    } else {
      this.aim.copy(this.fwd).setY(0.33).normalize();
      app.wallDistance = 0;
    }
    app.lightReady = !!w && app.wallDistance > 0.25;
    this.spot.position.copy(this.lightPos);
    this.spot.target.position.copy(this.lightPos).addScaledVector(this.aim, Math.max(1, app.wallDistance));
    this.spot.target.updateMatrixWorld();
    this.spot.visible = app.lightReady;
    this.duskMaterial.uniforms.uLight.value.copy(this.lightPos);
    this.duskMaterial.uniforms.uAim.value.copy(this.aim);
    this.duskMaterial.uniforms.uRange.value = Math.max(1.2, app.wallDistance * 0.9);
  }
  private readonly stagePoint: [number, number, number] = [0, 0, 0];
  private seenSurfaces: Surface[] | null = null;

  private syncDusk(): void {
    const keep = new Set<string>();
    for (const s of app.surfaces) {
      if (!DUSK_KINDS.has(s.kind)) continue;
      keep.add(s.id);
      if (this.duskMeshes.has(s.id)) continue;
      const m = new Mesh(new PlaneGeometry(s.halfU * 2, s.halfV * 2), this.duskMaterial);
      m.name = `Dusk_${s.kind}`;
      const n = new Vector3(...s.normal);
      m.position.set(...s.origin).addScaledVector(n, 0.002);
      m.up.set(...s.v);
      m.lookAt(this.tmp.copy(m.position).add(n));
      m.renderOrder = 1;
      this.scene.add(m);
      this.duskMeshes.set(s.id, m);
    }
    for (const [id, m] of this.duskMeshes) {
      if (!keep.has(id)) {
        m.removeFromParent();
        m.geometry.dispose();
        this.duskMeshes.delete(id);
      }
    }
  }

  update(delta: number, time: number): void {
    if (!this.xrManager.isPresenting) return;
    this.sessionTime += delta;
    // Place once surfaces have had a moment to arrive.
    if (!this.root && this.sessionTime > 1.2) this.placeLantern();
    if (!this.root) return;
    // Walked away from an untouched lantern: bring it along.
    this.player.head.getWorldPosition(this.head);
    if (!this.everGrabbed && this.head.distanceTo(this.root.position) > 1.6) this.placeLantern();

    if (this.queries.held.entities.size > 0) this.updateLight();
    // Planes can arrive after the lantern: look for a wall whenever they change.
    if (!app.wall && app.surfaces !== this.seenSurfaces) {
      this.seenSurfaces = app.surfaces;
      this.room.repickWall(this.aimFromViewer());
    }

    this.syncDusk();
    this.dusk = Math.min(0.62, this.dusk + delta * 0.25);
    const flicker = 0.93 + 0.05 * Math.sin(time * 7.3) + 0.02 * Math.sin(time * 13.1);
    this.duskMaterial.uniforms.uDusk.value = this.dusk;
    this.duskMaterial.uniforms.uFlicker.value = flicker;
    this.spot.intensity = 6 * flicker;
    if (this.paper) this.paper.uniforms.uTime.value = time;

    for (const e of this.queries.buttons.entities) {
      const o = e.object3D;
      if (o && o.scale.x < 1) o.scale.setScalar(Math.min(1, o.scale.x + delta * 1.5));
    }
  }
}

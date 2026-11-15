/**
 * Inked creatures. When a shadow matches, the shadow itself inks black on the
 * wall (a blot in the hand's shape), then the blot dissolves while the animal
 * it was standing for bleeds in from its centre: a procedural profile body
 * (head, ears or beak, body, tail, jointed legs) on a small bone rig. Walkers
 * stride along a brush line painted under their feet, with the planted foot
 * held to it; fliers flap up the wall and onto the ceiling; everyone runs the
 * real wall's extent and leaps the corner. Replays drive the same creatures.
 */
import { type CreatureDef, targetShape } from '@kazashi/core/bestiary';
import { BodyAnimator, type BodyPlan, poseVertices } from '@kazashi/core/body';
import { bodyPlan } from '@kazashi/core/creatures';
import { buildCreatureMesh } from '@kazashi/core/creature-mesh';
import { closestOnSurface, findJump, fromSurface, type Surface, type SurfaceKind, toSurface } from '@kazashi/core/room';
import type { Vec3 } from '@kazashi/core/lightframe';
import {
  BufferAttribute,
  BufferGeometry,
  createSystem,
  DynamicDrawUsage,
  type Entity,
  Matrix4,
  Mesh,
  PlaneGeometry,
  Quaternion,
  ShaderMaterial,
  Vector3,
} from '@iwsdk/core';
import { app } from './app.js';
import { sound } from './audio.js';
import { Creature } from './components.js';
import { createCreatureMaterial, createStrokeMaterial } from './creature-material.js';

type Phase = 'ink' | 'morph' | 'peel' | 'run' | 'jump' | 'fade' | 'replay';
export type CreatureMode = 'puzzle' | 'stage' | 'replay';

/** The animal is drawn a little larger than the hand shadow it came from. */
export const BODY_SCALE = 1.2;
const INK_S = 0.75;
const MORPH_S = 1.0;
const PEEL_S = 0.45;

interface Jump {
  from: Vector3;
  to: Vector3;
  ctrl: Vector3;
  qFrom: Quaternion;
  qTo: Quaternion;
  surface: Surface;
  a: number;
  b: number;
  du: number;
  dv: number;
  t: number;
}

interface Stroke {
  mesh: Mesh;
  material: ShaderMaterial;
  surface: Surface;
  b: number;
  min: number;
  max: number;
  fade: number;
}

export interface LiveCreature {
  key: string;
  def: CreatureDef;
  plan: BodyPlan;
  anim: BodyAnimator;
  entity: Entity;
  mesh: Mesh;
  material: ShaderMaterial;
  posAttr: BufferAttribute;
  /** The inked hand shadow that turns into the animal (null once gone). */
  blot: Mesh | null;
  blotMaterial: ShaderMaterial | null;
  stroke: Stroke | null;
  size: number;
  surface: Surface;
  a: number;
  b: number;
  du: number;
  dv: number;
  /** +1 when the head points along the surface's +u. */
  facing: number;
  phase: Phase;
  t: number;
  life: number;
  mode: CreatureMode;
  jump: Jump | null;
  jumps: number;
  visited: string[];
  lastA: number;
}

const SPEED: Record<CreatureDef['locomotion'], number> = {
  trot: 0.42,
  hop: 0.5,
  fly: 0.62,
  slither: 0.3,
  swim: 0.36,
  scuttle: 0.4,
  stalk: 0.26,
};

const grounded = (p: BodyPlan) => p.gait === 'walk' || p.gait === 'scuttle' || p.gait === 'hop' || p.gait === 'slither';

const staticAttrs = new Map<string, { rest: Float32Array; head: Float32Array; index: Uint32Array; extent: number }>();

function attrsFor(plan: BodyPlan) {
  let s = staticAttrs.get(plan.id);
  if (!s) {
    const n = plan.vertexBones.length;
    const head = new Float32Array(n);
    for (let i = 0; i < n; i++) head[i] = plan.vertexBones[i] === plan.eye.bone ? 1 : 0;
    let extent = 0;
    for (let i = 0; i < plan.positions.length; i += 2) extent = Math.max(extent, Math.hypot(plan.positions[i], plan.positions[i + 1]));
    s = { rest: plan.positions, head, index: plan.indices, extent };
    staticAttrs.set(plan.id, s);
  }
  return s;
}

const blotCache = new Map<string, { geometry: BufferGeometry; extent: number }>();

/** The hand shadow as a flat ink mesh (unit-area space, as the scorer sees it). */
function blotGeometry(id: string): { geometry: BufferGeometry; extent: number } {
  let c = blotCache.get(id);
  if (!c) {
    const data = buildCreatureMesh(targetShape(id), { legs: 0, facing: 1 });
    const n = data.positions.length / 2;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = data.positions[i * 2];
      pos[i * 3 + 1] = data.positions[i * 2 + 1];
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(pos, 3));
    g.setAttribute('rest', new BufferAttribute(data.positions, 2));
    g.setAttribute('head', new BufferAttribute(new Float32Array(n), 1));
    g.setIndex(new BufferAttribute(data.indices, 1));
    g.computeBoundingSphere();
    c = { geometry: g, extent: Math.max(Math.abs(data.minX), Math.abs(data.maxX), Math.abs(data.minY), Math.abs(data.maxY)) };
    blotCache.set(id, c);
  }
  return c;
}

const STROKE_GEOMETRY = new PlaneGeometry(1, 1);
let keySeq = 0;

export class CreatureSystem extends createSystem({ creatures: { required: [Creature] } }) {
  readonly live: LiveCreature[] = [];
  private readonly m = new Matrix4();
  private readonly q = new Quaternion();
  private readonly qz = new Quaternion();
  private readonly z = new Vector3(0, 0, 1);
  private readonly u = new Vector3();
  private readonly v = new Vector3();
  private readonly n = new Vector3();
  private readonly p = new Vector3();

  init(): void {
    const onEnd = () => this.clear();
    this.xrManager.addEventListener('sessionend', onEnd);
    this.cleanupFuncs.push(() => this.xrManager.removeEventListener('sessionend', onEnd));
  }

  clear(): void {
    for (const c of [...this.live]) this.remove(c);
  }

  spawn(id: string, surface: Surface, a: number, b: number, size: number, mode: CreatureMode): LiveCreature {
    const def = app.defs.get(id);
    if (!def) throw new Error(`unknown creature ${id}`);
    const plan = bodyPlan(id);
    const s = attrsFor(plan);
    const geometry = new BufferGeometry();
    const posAttr = new BufferAttribute(new Float32Array(plan.vertexBones.length * 3), 3);
    posAttr.setUsage(DynamicDrawUsage);
    geometry.setAttribute('position', posAttr);
    geometry.setAttribute('rest', new BufferAttribute(s.rest, 2));
    geometry.setAttribute('head', new BufferAttribute(s.head, 1));
    geometry.setIndex(new BufferAttribute(s.index, 1));
    const material = createCreatureMaterial();
    material.uniforms.uExtent.value = s.extent;
    material.uniforms.uEye.value.set(plan.eye.x, plan.eye.y, plan.eye.r);
    if (app.settings.highContrast) material.uniforms.uColor.value.set('#000000');
    const mesh = new Mesh(geometry, material);
    mesh.name = `Creature_${id}`;
    mesh.renderOrder = 3;
    mesh.frustumCulled = false;
    this.scene.add(mesh);
    const entity = this.world.createTransformEntity(mesh);
    entity.addComponent(Creature, { creatureId: id, surfaceId: surface.id, replay: mode === 'replay', surfacesVisited: surface.id });

    // The inked hand shadow, exactly where the shadow fell (puzzles and slides).
    let blot: Mesh | null = null;
    let blotMaterial: ShaderMaterial | null = null;
    if (mode !== 'replay') {
      const bg = blotGeometry(id);
      blotMaterial = createCreatureMaterial();
      blotMaterial.uniforms.uExtent.value = bg.extent;
      if (app.settings.highContrast) blotMaterial.uniforms.uColor.value.set('#000000');
      blot = new Mesh(bg.geometry, blotMaterial);
      blot.name = `Blot_${id}`;
      blot.renderOrder = 3;
      blot.frustumCulled = false;
      this.scene.add(blot);
    }

    const c: LiveCreature = {
      key: `c${++keySeq}`,
      def,
      plan,
      anim: new BodyAnimator(plan, keySeq * 1.37),
      entity,
      mesh,
      material,
      posAttr,
      blot,
      blotMaterial,
      stroke: null,
      size: size * BODY_SCALE,
      surface,
      a,
      b,
      du: 0,
      dv: 0,
      facing: def.facing,
      phase: mode === 'replay' ? 'replay' : 'ink',
      t: 0,
      life: mode === 'puzzle' ? 11 : Infinity,
      mode,
      jump: null,
      jumps: 0,
      visited: [surface.id],
      lastA: a,
    };
    if (blot) this.placeBlot(c, size);
    material.uniforms.uInk.value = mode === 'replay' ? 1 : 0;
    this.chooseDirection(c);
    this.live.push(c);
    this.pose(c, 0);
    this.place(c, 0);
    return c;
  }

  remove(c: LiveCreature): void {
    const i = this.live.indexOf(c);
    if (i >= 0) this.live.splice(i, 1);
    c.mesh.removeFromParent();
    c.mesh.geometry.dispose();
    c.material.dispose();
    this.dropBlot(c);
    this.dropStroke(c);
    if (c.entity.active) c.entity.dispose();
  }

  private dropBlot(c: LiveCreature): void {
    c.blot?.removeFromParent();
    c.blotMaterial?.dispose();
    c.blot = null;
    c.blotMaterial = null;
  }

  private dropStroke(c: LiveCreature): void {
    if (!c.stroke) return;
    c.stroke.mesh.removeFromParent();
    c.stroke.material.dispose();
    c.stroke = null;
  }

  /** Run toward the nearer edge that has somewhere to jump to. */
  private chooseDirection(c: LiveCreature): void {
    const speed = SPEED[c.def.locomotion];
    const kinds = this.jumpKinds(c);
    const edgeL = fromSurface(c.surface, -c.surface.halfU, c.b);
    const edgeR = fromSurface(c.surface, c.surface.halfU, c.b);
    const canL = !!findJump(app.surfaces, c.surface, edgeL, kinds);
    const canR = !!findJump(app.surfaces, c.surface, edgeR, kinds);
    let dir: number = c.def.facing;
    if (canL !== canR) dir = canL ? -1 : 1;
    if (c.plan.gait === 'fly') {
      c.du = dir * speed * 0.6;
      c.dv = speed * 0.55;
    } else {
      c.du = dir * speed;
      c.dv = 0;
    }
    c.facing = dir;
  }

  private jumpKinds(c: LiveCreature): SurfaceKind[] {
    return c.plan.gait === 'fly' ? ['ceiling', 'wall'] : ['wall'];
  }

  private basis(s: Surface): Quaternion {
    this.u.set(...s.u);
    this.v.set(...s.v);
    this.n.set(...s.normal);
    this.m.makeBasis(this.u, this.v, this.n);
    return this.q.setFromRotationMatrix(this.m);
  }

  /** Pose the mesh on its surface at (a, b), facing its travel. */
  private place(c: LiveCreature, lift: number, pulse = 1): void {
    const s = c.surface;
    if (c.du !== 0) c.facing = Math.sign(c.du);
    const tilt = c.plan.gait === 'fly' ? Math.atan2(c.dv, Math.abs(c.du) + 1e-6) * 0.35 * c.facing : 0;
    this.qz.setFromAxisAngle(this.z, tilt);
    c.mesh.quaternion.copy(this.basis(s)).multiply(this.qz);
    const p = fromSurface(s, c.a, c.b, 0.006 + lift);
    c.mesh.position.set(p[0], p[1], p[2]);
    c.mesh.scale.set(c.size * c.facing * pulse, c.size * pulse, c.size);
  }

  /** The blot sits where the live shadow was, the same size and unmirrored. */
  private placeBlot(c: LiveCreature, shadowSize: number): void {
    const blot = c.blot!;
    blot.quaternion.copy(this.basis(c.surface));
    const p = fromSurface(c.surface, c.a, c.b, 0.005);
    blot.position.set(p[0], p[1], p[2]);
    blot.scale.set(shadowSize, shadowSize, shadowSize);
  }

  /** Advance the rig by the distance actually travelled and upload the pose. */
  private pose(c: LiveCreature, delta: number): void {
    const moved = Math.abs(c.a - c.lastA) / c.size;
    c.lastA = c.a;
    const tr = c.anim.step(delta, c.phase === 'run' || c.phase === 'replay' ? moved : 0);
    poseVertices(c.plan, tr, c.anim.lift, c.posAttr.array as Float32Array, 3);
    c.posAttr.needsUpdate = true;
  }

  /** The ground line under a walker: it grows as the creature covers the wall. */
  private paintStroke(c: LiveCreature, delta: number): void {
    const s = c.surface;
    if (!grounded(c.plan) || s.kind !== 'wall') {
      if (c.stroke) this.fadeStroke(c, delta);
      return;
    }
    const half = c.size * 0.5;
    const ground = c.b + c.plan.groundY * c.size - 0.004;
    if (!c.stroke || c.stroke.surface !== s) {
      this.dropStroke(c);
      const material = createStrokeMaterial();
      if (app.settings.highContrast) material.uniforms.uColor.value.set('#000000');
      const mesh = new Mesh(STROKE_GEOMETRY, material);
      mesh.name = `Stroke_${c.def.id}`;
      mesh.renderOrder = 2;
      mesh.frustumCulled = false;
      this.scene.add(mesh);
      c.stroke = { mesh, material, surface: s, b: ground, min: c.a - half, max: c.a + half, fade: 1 };
    }
    const st = c.stroke;
    st.min = Math.max(-s.halfU, Math.min(st.min, c.a - half));
    st.max = Math.min(s.halfU, Math.max(st.max, c.a + half));
    const len = st.max - st.min;
    const thick = Math.max(0.012, c.size * 0.035);
    st.material.uniforms.uLen.value = len;
    st.material.uniforms.uOpacity.value = Math.min(0.85, st.material.uniforms.uOpacity.value + delta * 2) * st.fade;
    st.mesh.quaternion.copy(this.basis(s));
    const p = fromSurface(s, (st.min + st.max) / 2, st.b - thick * 0.3, 0.004);
    st.mesh.position.set(p[0], p[1], p[2]);
    st.mesh.scale.set(len, thick, 1);
  }

  private fadeStroke(c: LiveCreature, delta: number): void {
    const st = c.stroke!;
    st.fade = Math.max(0, st.fade - delta * 1.2);
    st.material.uniforms.uOpacity.value = 0.85 * st.fade;
    if (st.fade <= 0) this.dropStroke(c);
  }

  update(delta: number): void {
    for (const c of [...this.live]) {
      c.t += delta;
      switch (c.phase) {
        case 'ink': {
          // The shadow itself inks black, with a vermilion wet edge.
          const k = Math.min(1, c.t / INK_S);
          c.blotMaterial!.uniforms.uInk.value = k;
          this.pose(c, delta);
          this.place(c, 0);
          if (k >= 1) {
            c.phase = 'morph';
            c.t = 0;
            sound.rustle();
          }
          break;
        }
        case 'morph': {
          // The blot dissolves while the animal bleeds in over it.
          const k = Math.min(1, c.t / MORPH_S);
          const e = k * k * (3 - 2 * k);
          if (c.blotMaterial) c.blotMaterial.uniforms.uInk.value = 1 - Math.min(1, k * 1.25);
          c.material.uniforms.uInk.value = e;
          this.pose(c, delta);
          this.place(c, 0, 0.88 + 0.12 * e);
          if (k >= 1) {
            this.dropBlot(c);
            c.phase = 'peel';
            c.t = 0;
          }
          break;
        }
        case 'peel': {
          const k = Math.min(1, c.t / PEEL_S);
          this.pose(c, delta);
          this.place(c, Math.sin(k * Math.PI) * 0.03, 1 + Math.sin(k * Math.PI) * 0.05);
          if (k >= 1) {
            c.phase = 'run';
            c.t = 0;
          }
          break;
        }
        case 'run':
          this.run(c, delta);
          break;
        case 'jump':
          this.stepJump(c, delta);
          break;
        case 'fade': {
          const k = Math.max(0, 1 - c.t / 0.8);
          c.material.uniforms.uInk.value = k;
          if (c.blotMaterial) c.blotMaterial.uniforms.uInk.value = Math.min(c.blotMaterial.uniforms.uInk.value, k);
          if (c.stroke) this.fadeStroke(c, delta);
          this.pose(c, delta);
          if (k <= 0) this.remove(c);
          break;
        }
        case 'replay':
          this.pose(c, delta);
          this.place(c, 0);
          this.paintStroke(c, delta);
          break;
      }
    }
  }

  private run(c: LiveCreature, delta: number): void {
    const s = c.surface;
    c.a += c.du * delta;
    c.b += c.dv * delta;
    this.pose(c, delta);
    this.place(c, 0);
    this.paintStroke(c, delta);

    const marginU = c.size * 0.5;
    const marginV = c.size * 0.45;
    const outU = Math.abs(c.a) > s.halfU - marginU;
    const outV = c.b > s.halfV - marginV || c.b < -s.halfV + marginV;
    if (outU || outV) {
      const exit = fromSurface(s, c.a, c.b);
      const j = findJump(app.surfaces, s, exit, this.jumpKinds(c), Math.max(0.2, c.size * 0.6));
      // On stage (theatre) the cast stays on the lit wall; puzzle creatures roam.
      if (j && c.mode === 'puzzle' && c.jumps < 3) this.startJump(c, exit, j);
      else {
        // Nowhere to go: turn around (fliers glide back down).
        if (outU) c.du = -c.du;
        if (outV) c.dv = -Math.abs(c.dv) * Math.sign(c.b);
        c.a = Math.max(-s.halfU + marginU, Math.min(s.halfU - marginU, c.a));
        c.b = Math.max(-s.halfV + marginV, Math.min(s.halfV - marginV, c.b));
        c.lastA = c.a;
      }
    }
    if (c.t > c.life && c.phase === 'run') {
      c.phase = 'fade';
      c.t = 0;
    }
  }

  private startJump(c: LiveCreature, exit: Vec3, j: ReturnType<typeof findJump> & object): void {
    const from = new Vector3(...exit);
    const to = new Vector3(...fromSurface(j.surface, j.a, j.b, 0.006));
    const nFrom = new Vector3(...c.surface.normal);
    const nTo = new Vector3(...j.surface.normal);
    const ctrl = from.clone().add(to).multiplyScalar(0.5).addScaledVector(nFrom.add(nTo).normalize(), 0.3).add(new Vector3(0, 0.22, 0));
    const qFrom = c.mesh.quaternion.clone();
    const entry = toSurface(j.surface, exit);
    let du = 0;
    let dv = 0;
    const speed = SPEED[c.def.locomotion];
    if (j.surface.kind === 'ceiling') {
      const d = new Vector3(j.a - entry.a, j.b - entry.b, 0);
      if (d.lengthSq() < 1e-6) d.set(0, 1, 0);
      d.normalize();
      du = d.x * speed;
      dv = d.y * speed;
    } else {
      du = Math.sign(j.a - entry.a || c.du || 1) * speed * (c.plan.gait === 'fly' ? 0.6 : 1);
      dv = c.plan.gait === 'fly' ? speed * 0.5 : 0;
    }
    const qTo = this.basis(j.surface).clone();
    c.jump = { from, to, ctrl, qFrom, qTo, surface: j.surface, a: j.a, b: j.b, du, dv, t: 0 };
    c.phase = 'jump';
    sound.pluck(3 + (c.jumps % 4), 0.25);
  }

  private stepJump(c: LiveCreature, delta: number): void {
    const j = c.jump!;
    j.t += delta / 0.8;
    const t = Math.min(1, j.t);
    const e = t * t * (3 - 2 * t);
    const a = 1 - e;
    this.p.copy(j.from).multiplyScalar(a * a).addScaledVector(j.ctrl, 2 * a * e).addScaledVector(j.to, e * e);
    c.mesh.position.copy(this.p);
    c.mesh.quaternion.copy(j.qFrom).slerp(j.qTo, e);
    // Mid-air: legs keep cycling as if running.
    c.anim.step(delta, (Math.abs(c.du) * delta) / c.size);
    poseVertices(c.plan, c.anim.transforms, c.anim.lift, c.posAttr.array as Float32Array, 3);
    c.posAttr.needsUpdate = true;
    if (c.stroke) this.fadeStroke(c, delta);
    if (t >= 1) {
      c.surface = j.surface;
      c.a = j.a;
      c.b = j.b;
      c.lastA = j.a;
      c.du = j.du;
      c.dv = j.dv;
      c.jump = null;
      c.jumps++;
      c.phase = 'run';
      if (!c.visited.includes(j.surface.id)) c.visited.push(j.surface.id);
      c.entity.setValue(Creature, 'surfaceId', j.surface.id);
      c.entity.setValue(Creature, 'jumps', c.jumps);
      c.entity.setValue(Creature, 'surfacesVisited', c.visited.join(','));
    }
  }

  /** Replay: move a creature to recorded coordinates (`facing` +1 = head toward +u). */
  setReplayPose(c: LiveCreature, surface: Surface, a: number, b: number, facing: number): void {
    c.surface = surface;
    c.a = a;
    c.b = b;
    c.du = facing * 0.001;
  }

  /** A creature dropped by a cast card lands on the wall at a world point. */
  landAt(id: string, point: Vec3, size: number): LiveCreature | null {
    const w = app.wall;
    if (!w) return null;
    const p = closestOnSurface(w, point, size * 0.6);
    return this.spawn(id, w, p.a, p.b, size, 'stage');
  }
}

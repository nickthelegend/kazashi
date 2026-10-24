/**
 * Inked creatures: a rigged sumi silhouette that peels off the wall and runs
 * along the real wall's extent, leaping to the next wall at a corner or up
 * onto the ceiling (fliers). Replays drive the same creatures from a take.
 */
import { type CreatureDef, groupIndex, legsFor, type RigRole, targetShape } from '@kazashi/core/bestiary';
import { buildCreatureMesh, type CreatureMeshData, LEG_GROUP } from '@kazashi/core/creature-mesh';
import { closestOnSurface, findJump, fromSurface, type Surface, type SurfaceKind, toSurface } from '@kazashi/core/room';
import type { Vec3 } from '@kazashi/core/lightframe';
import {
  BufferAttribute,
  BufferGeometry,
  CircleGeometry,
  MeshBasicMaterial,
  createSystem,
  type Entity,
  Matrix4,
  Mesh,
  Quaternion,
  ShaderMaterial,
  Vector3,
} from '@iwsdk/core';
import { app } from './app.js';
import { sound } from './audio.js';
import { Creature } from './components.js';
import { createCreatureMaterial, RIG_SLOTS } from './creature-material.js';

type Phase = 'ink' | 'peel' | 'run' | 'jump' | 'fade' | 'replay';
export type CreatureMode = 'puzzle' | 'stage' | 'replay';

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

export interface LiveCreature {
  key: string;
  def: CreatureDef;
  entity: Entity;
  mesh: Mesh;
  material: ShaderMaterial;
  size: number;
  surface: Surface;
  a: number;
  b: number;
  du: number;
  dv: number;
  phase: Phase;
  t: number;
  life: number;
  mode: CreatureMode;
  jump: Jump | null;
  jumps: number;
  visited: string[];
  seed: number;
  /** Rig slots resolved once at spawn: group index, role, leg phase. */
  rig: { g: number; role: RigRole; phase: number }[];
}

const ROLE: Record<RigRole, { amp: number; speed: number; bias: number }> = {
  ear: { amp: 0.16, speed: 9, bias: 0 },
  jaw: { amp: 0.2, speed: 9, bias: -0.08 },
  leg: { amp: 0.42, speed: 11, bias: 0 },
  wing: { amp: 0.5, speed: 7, bias: 0.05 },
  tail: { amp: 0.3, speed: 6, bias: 0 },
  antenna: { amp: 0.14, speed: 4, bias: 0 },
  neck: { amp: 0.12, speed: 2.6, bias: 0 },
  fin: { amp: 0.3, speed: 5, bias: 0 },
  claw: { amp: 0.25, speed: 6, bias: 0 },
};

const SPEED: Record<CreatureDef['locomotion'], number> = {
  trot: 0.75,
  hop: 0.65,
  fly: 0.72,
  slither: 0.35,
  swim: 0.45,
  scuttle: 0.6,
  stalk: 0.3,
};

const meshCache = new Map<string, { data: CreatureMeshData; geometry: BufferGeometry }>();

export function creatureGeometry(id: string, def: CreatureDef): { data: CreatureMeshData; geometry: BufferGeometry } {
  let c = meshCache.get(id);
  if (!c) {
    const data = buildCreatureMesh(targetShape(id), { legs: legsFor(def), facing: def.facing });
    const g = new BufferGeometry();
    const pos = new Float32Array((data.positions.length / 2) * 3);
    for (let i = 0; i < data.positions.length / 2; i++) {
      pos[i * 3] = data.positions[i * 2];
      pos[i * 3 + 1] = data.positions[i * 2 + 1];
    }
    g.setAttribute('position', new BufferAttribute(pos, 3));
    g.setAttribute('group', new BufferAttribute(data.groups, 1));
    g.setIndex(new BufferAttribute(data.indices, 1));
    g.computeBoundingSphere();
    c = { data, geometry: g };
    meshCache.set(id, c);
  }
  return c;
}

let keySeq = 0;
const EYE_GEOMETRY = new CircleGeometry(0.034, 14);
const EYE_MATERIAL = new MeshBasicMaterial({ color: '#f3ead7' });

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
    const { data, geometry } = creatureGeometry(id, def);
    const material = createCreatureMaterial();
    material.uniforms.uExtent.value = Math.max(Math.abs(data.minX), Math.abs(data.maxX), Math.abs(data.minY), Math.abs(data.maxY));
    if (app.settings.highContrast) material.uniforms.uColor.value.set('#000000');
    const pv = material.uniforms.uPivot.value as { set(x: number, y: number, z: number, w: number): void }[];
    for (let g = 0; g < RIG_SLOTS; g++) pv[g].set(data.pivots[g * 2], data.pivots[g * 2 + 1], 0, 0);
    const mesh = new Mesh(geometry, material);
    mesh.name = `Creature_${id}`;
    if (data.eye) {
      const eye = new Mesh(EYE_GEOMETRY, EYE_MATERIAL);
      eye.name = 'Eye';
      eye.position.set(data.eye[0], data.eye[1], 0.002);
      eye.renderOrder = 4;
      mesh.add(eye);
    }
    mesh.renderOrder = 3;
    mesh.frustumCulled = false;
    this.scene.add(mesh);
    const entity = this.world.createTransformEntity(mesh);
    entity.addComponent(Creature, { creatureId: id, surfaceId: surface.id, replay: mode === 'replay', surfacesVisited: surface.id });
    const c: LiveCreature = {
      key: `c${++keySeq}`,
      def,
      entity,
      mesh,
      material,
      size,
      surface,
      a,
      b,
      du: 0,
      dv: 0,
      phase: mode === 'replay' ? 'replay' : 'ink',
      t: 0,
      life: mode === 'puzzle' ? 9 : Infinity,
      mode,
      jump: null,
      jumps: 0,
      visited: [surface.id],
      seed: keySeq * 1.37,
      rig: [],
    };
    let leg = 0;
    for (const [key, role] of Object.entries(def.rig)) {
      const g = groupIndex(key, def.hands);
      c.rig.push({ g, role, phase: role === 'leg' ? (leg++ % 2) * Math.PI : g * 0.7 + c.seed });
    }
    // Ink-grown legs walk in diagonal pairs.
    for (let i = 0; i < 4; i++) {
      if (data.groupMask & (1 << (LEG_GROUP + i))) c.rig.push({ g: LEG_GROUP + i, role: 'leg', phase: (i % 2) * Math.PI + (i > 1 ? Math.PI / 2 : 0) });
    }
    if (mode === 'replay') material.uniforms.uInk.value = 1;
    this.chooseDirection(c);
    this.live.push(c);
    this.place(c, 0);
    return c;
  }

  remove(c: LiveCreature): void {
    const i = this.live.indexOf(c);
    if (i >= 0) this.live.splice(i, 1);
    c.mesh.removeFromParent();
    c.material.dispose();
    if (c.entity.active) c.entity.dispose();
  }

  /** Run toward the nearer edge that has somewhere to jump to. */
  private chooseDirection(c: LiveCreature): void {
    const speed = SPEED[c.def.locomotion];
    const kinds = this.jumpKinds(c);
    const edgeL = fromSurface(c.surface, -c.surface.halfU, c.b);
    const edgeR = fromSurface(c.surface, c.surface.halfU, c.b);
    const canL = !!findJump(app.surfaces, c.surface, edgeL, kinds);
    const canR = !!findJump(app.surfaces, c.surface, edgeR, kinds);
    // Head first, unless only the other way leads somewhere.
    let dir: number = c.def.facing;
    if (canL !== canR) dir = canL ? -1 : 1;
    if (c.def.locomotion === 'fly') {
      c.du = dir * speed * 0.55;
      c.dv = speed * 0.8;
    } else {
      c.du = dir * speed;
      c.dv = 0;
    }
  }

  private jumpKinds(c: LiveCreature): SurfaceKind[] {
    return c.def.locomotion === 'fly' ? ['ceiling', 'wall'] : ['wall'];
  }

  /** Pose the mesh on its surface at (a, b), facing its travel. */
  private place(c: LiveCreature, lift: number, pulse = 1): void {
    const s = c.surface;
    const mirror = c.du === 0 ? 1 : Math.sign(c.du) * c.def.facing;
    const tilt = c.def.locomotion === 'fly' ? Math.atan2(c.dv, Math.abs(c.du) + 1e-6) * 0.5 * Math.sign(c.du || 1) : 0;
    this.u.set(...s.u);
    this.v.set(...s.v);
    this.n.set(...s.normal);
    this.m.makeBasis(this.u, this.v, this.n);
    this.q.setFromRotationMatrix(this.m);
    this.qz.setFromAxisAngle(this.z, tilt);
    c.mesh.quaternion.copy(this.q).multiply(this.qz);
    const p = fromSurface(s, c.a, c.b, 0.006 + lift);
    c.mesh.position.set(p[0], p[1], p[2]);
    c.mesh.scale.set(c.size * mirror * pulse, c.size * pulse, c.size);
  }

  private animateRig(c: LiveCreature, time: number, gait: number): void {
    const rig = c.material.uniforms.uRig.value as { set(x: number, y: number, z: number, w: number): void }[];
    for (let g = 0; g < RIG_SLOTS; g++) rig[g].set(0, 0, 0, 0);
    for (const slot of c.rig) {
      const r = ROLE[slot.role];
      let amp = r.amp;
      if (slot.role === 'leg') amp *= gait;
      if (slot.role === 'ear' || slot.role === 'jaw') amp *= 0.5 + 0.5 * Math.max(0, Math.sin(time * 1.3 + c.seed + slot.g));
      rig[slot.g].set(amp, r.speed, slot.phase, r.bias);
    }
    c.material.uniforms.uTime.value = time;
  }

  update(delta: number, time: number): void {
    for (const c of [...this.live]) {
      c.t += delta;
      switch (c.phase) {
        case 'ink': {
          const k = Math.min(1, c.t / 0.9);
          c.material.uniforms.uInk.value = k;
          this.animateRig(c, time, 0);
          this.place(c, 0);
          if (k >= 1) {
            c.phase = 'peel';
            c.t = 0;
            sound.rustle();
          }
          break;
        }
        case 'peel': {
          const k = Math.min(1, c.t / 0.6);
          const lift = Math.sin(k * Math.PI) * 0.04;
          this.animateRig(c, time, k);
          this.place(c, lift, 1 + Math.sin(k * Math.PI) * 0.06);
          if (k >= 1) {
            c.phase = 'run';
            c.t = 0;
          }
          break;
        }
        case 'run':
          this.run(c, delta, time);
          break;
        case 'jump':
          this.stepJump(c, delta, time);
          break;
        case 'fade': {
          const k = Math.max(0, 1 - c.t / 0.8);
          c.material.uniforms.uInk.value = k;
          this.animateRig(c, time, 0.5);
          if (k <= 0) this.remove(c);
          break;
        }
        case 'replay':
          this.animateRig(c, time, 1);
          this.place(c, 0);
          break;
      }
    }
  }

  private run(c: LiveCreature, delta: number, time: number): void {
    const s = c.surface;
    const gait = 1;
    c.a += c.du * delta;
    c.b += c.dv * delta;
    let bob = 0;
    switch (c.def.locomotion) {
      case 'trot':
        bob = Math.abs(Math.sin(time * 9 + c.seed)) * 0.025 * c.size * 3;
        break;
      case 'hop':
        bob = Math.abs(Math.sin(time * 5 + c.seed)) * 0.12;
        break;
      case 'slither':
      case 'swim':
        bob = Math.sin(time * 3 + c.seed) * 0.04;
        break;
      case 'scuttle':
        bob = Math.abs(Math.sin(time * 14)) * 0.01;
        break;
      default:
        bob = Math.sin(time * 2 + c.seed) * 0.02;
    }
    const b0 = c.b;
    c.b += bob;
    this.animateRig(c, time, gait);
    this.place(c, 0);
    c.b = b0;

    const margin = c.size * 0.45;
    const outU = Math.abs(c.a) > s.halfU - margin;
    const outV = c.b > s.halfV - margin || c.b < -s.halfV + margin;
    if (outU || outV) {
      const exit = fromSurface(s, c.a, c.b);
      const j = findJump(app.surfaces, s, exit, this.jumpKinds(c), Math.max(0.2, c.size * 0.6));
      // On stage (theatre) the cast stays on the lit wall; puzzle creatures roam.
      if (j && c.mode === 'puzzle' && c.jumps < 3) this.startJump(c, exit, j);
      else {
        // Nowhere to go: turn around (fliers glide back down).
        if (outU) c.du = -c.du;
        if (outV) c.dv = -Math.abs(c.dv) * Math.sign(c.b);
        c.a = Math.max(-s.halfU + margin, Math.min(s.halfU - margin, c.a));
        c.b = Math.max(-s.halfV + margin, Math.min(s.halfV - margin, c.b));
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
    // Direction on the new surface: away from where we came in.
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
      du = Math.sign(j.a - entry.a || c.du || 1) * speed * (c.def.locomotion === 'fly' ? 0.55 : 1);
      dv = c.def.locomotion === 'fly' ? speed * 0.6 : 0;
    }
    // Target orientation.
    this.u.set(...j.surface.u);
    this.v.set(...j.surface.v);
    this.n.set(...j.surface.normal);
    this.m.makeBasis(this.u, this.v, this.n);
    const qTo = new Quaternion().setFromRotationMatrix(this.m);
    c.jump = { from, to, ctrl, qFrom, qTo, surface: j.surface, a: j.a, b: j.b, du, dv, t: 0 };
    c.phase = 'jump';
    sound.pluck(3 + (c.jumps % 4), 0.25);
  }

  private stepJump(c: LiveCreature, delta: number, time: number): void {
    const j = c.jump!;
    j.t += delta / 0.8;
    const t = Math.min(1, j.t);
    const e = t * t * (3 - 2 * t);
    const a = 1 - e;
    this.p.copy(j.from).multiplyScalar(a * a).addScaledVector(j.ctrl, 2 * a * e).addScaledVector(j.to, e * e);
    c.mesh.position.copy(this.p);
    c.mesh.quaternion.copy(j.qFrom).slerp(j.qTo, e);
    this.animateRig(c, time, 1.5);
    if (t >= 1) {
      c.surface = j.surface;
      c.a = j.a;
      c.b = j.b;
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

  /** Replay: move a creature to recorded coordinates. */
  setReplayPose(c: LiveCreature, surface: Surface, a: number, b: number, facing: number): void {
    c.surface = surface;
    c.a = a;
    c.b = b;
    c.du = facing * c.def.facing * 0.001;
  }

  /** A creature dropped by a cast card lands on the wall at a world point. */
  landAt(id: string, point: Vec3, size: number): LiveCreature | null {
    const w = app.wall;
    if (!w) return null;
    const p = closestOnSurface(w, point, size * 0.6);
    return this.spawn(id, w, p.a, p.b, size, 'stage');
  }
}

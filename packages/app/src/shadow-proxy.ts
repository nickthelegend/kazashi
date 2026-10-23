/**
 * Invisible stand-ins for the hands that cast the GPU shadow: instanced joint
 * spheres and bone cylinders plus a palm prism per hand, depth-only in the
 * main pass and solid in the lantern's shadow pass. They use the same bones and radii as
 * the analytic matcher, so the shadow you see is the shape being scored.
 */
import { BONES, JOINT_RADII, PALM_POLYGON } from '@kazashi/core/hand';
import {
  BufferAttribute,
  BufferGeometry,
  CylinderGeometry,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  Quaternion,
  SphereGeometry,
  Vector3,
} from '@iwsdk/core';

export const SHADOW_LAYER = 3;
const MAX_HANDS = 2;
const PALM_THICKNESS = 0.022;

export class ShadowProxy {
  readonly root = new Group();
  private readonly spheres: InstancedMesh;
  private readonly bones: InstancedMesh;
  private readonly palms: Mesh[] = [];
  private readonly m = new Matrix4();
  private readonly q = new Quaternion();
  private readonly s = new Vector3();
  private readonly a = new Vector3();
  private readonly b = new Vector3();
  private readonly up = new Vector3(0, 1, 0);
  private readonly n = new Vector3();

  constructor() {
    this.root.name = 'ShadowProxy';
    // Depth-only in the main pass: real hands (passthrough) stay in front of
    // the dusk overlay and wall art. Pushed back a little so the emulator's
    // hand visual is never z-fought.
    const mat = new MeshBasicMaterial({ color: 0x000000, colorWrite: false, polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 4 });
    this.spheres = new InstancedMesh(new SphereGeometry(1, 10, 8), mat, 25 * MAX_HANDS);
    this.bones = new InstancedMesh(new CylinderGeometry(1, 1, 1, 10, 1, true), mat, BONES.length * MAX_HANDS);
    this.spheres.frustumCulled = false;
    this.bones.frustumCulled = false;
    for (const o of [this.spheres, this.bones]) {
      o.castShadow = true;
      o.renderOrder = -10;
      o.layers.enable(SHADOW_LAYER);
      this.root.add(o);
    }
    for (let h = 0; h < MAX_HANDS; h++) {
      const g = new BufferGeometry();
      const n = PALM_POLYGON.length;
      g.setAttribute('position', new BufferAttribute(new Float32Array(n * 2 * 3), 3));
      const idx: number[] = [];
      for (let i = 1; i < n - 1; i++) idx.push(0, i, i + 1, n, n + i + 1, n + i);
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        idx.push(i, j, n + j, i, n + j, n + i);
      }
      g.setIndex(idx);
      const palm = new Mesh(g, mat);
      palm.castShadow = true;
      palm.frustumCulled = false;
      palm.renderOrder = -10;
      palm.layers.enable(SHADOW_LAYER);
      this.palms.push(palm);
      this.root.add(palm);
    }
  }

  /** Replayed hands cast shadows but must not punch holes in the main view. */
  setOccluding(on: boolean): void {
    for (const o of [this.spheres, this.bones, ...this.palms]) {
      if (on) o.layers.enable(0);
      else o.layers.disable(0);
    }
  }

  /** `hands` are world-space joint arrays, or null for an absent hand. */
  update(hands: readonly (Float32Array | null)[]): void {
    let si = 0;
    let bi = 0;
    for (let h = 0; h < MAX_HANDS; h++) {
      const j = hands[h];
      const palm = this.palms[h];
      palm.visible = !!j;
      if (!j) continue;
      for (let i = 0; i < 25; i++) {
        const r = JOINT_RADII[i];
        this.m.makeScale(r, r, r).setPosition(j[i * 3], j[i * 3 + 1], j[i * 3 + 2]);
        this.spheres.setMatrixAt(si++, this.m);
      }
      for (const bone of BONES) {
        this.a.set(j[bone.a * 3], j[bone.a * 3 + 1], j[bone.a * 3 + 2]);
        this.b.set(j[bone.b * 3], j[bone.b * 3 + 1], j[bone.b * 3 + 2]);
        const len = this.a.distanceTo(this.b);
        const r = (JOINT_RADII[bone.a] + JOINT_RADII[bone.b]) / 2;
        this.n.subVectors(this.b, this.a).normalize();
        this.q.setFromUnitVectors(this.up, this.n);
        this.s.set(r, Math.max(len, 1e-4), r);
        this.a.add(this.b).multiplyScalar(0.5);
        this.m.compose(this.a, this.q, this.s);
        this.bones.setMatrixAt(bi++, this.m);
      }
      // Palm prism: the polygon offset ± half thickness along the palm normal.
      const pos = palm.geometry.getAttribute('position') as BufferAttribute;
      const n = PALM_POLYGON.length;
      this.a.set(j[18] - j[0], j[19] - j[1], j[20] - j[2]); // wrist → index proximal
      this.b.set(j[63] - j[0], j[64] - j[1], j[65] - j[2]); // wrist → pinky proximal
      this.n.crossVectors(this.a, this.b).normalize().multiplyScalar(PALM_THICKNESS / 2);
      for (let k = 0; k < n; k++) {
        const ji = PALM_POLYGON[k];
        const x = j[ji * 3];
        const y = j[ji * 3 + 1];
        const z = j[ji * 3 + 2];
        pos.setXYZ(k, x + this.n.x, y + this.n.y, z + this.n.z);
        pos.setXYZ(n + k, x - this.n.x, y - this.n.y, z - this.n.z);
      }
      pos.needsUpdate = true;
    }
    this.spheres.count = si;
    this.bones.count = bi;
    this.spheres.instanceMatrix.needsUpdate = true;
    this.bones.instanceMatrix.needsUpdate = true;
  }
}

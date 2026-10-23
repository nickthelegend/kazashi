/**
 * Wall HUD pieces: the kamishibai target card, the match ring and the ghost
 * hand that shows the pose. Plain meshes and canvas textures; one draw call each.
 */
import { BONES, JOINT_RADII } from '@kazashi/core/hand';
import type { CreatureDef } from '@kazashi/core/bestiary';
import type { Shape2D } from '@kazashi/core/silhouette';
import {
  CanvasTexture,
  Color,
  CylinderGeometry,
  DoubleSide,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  Quaternion,
  ShaderMaterial,
  SphereGeometry,
  Vector3,
} from '@iwsdk/core';
import { canvasTexture, COLORS, drawSilhouette, FONT_DISPLAY, FONT_MONO, paper, redraw } from './paint.js';

export const CARD_W = 640;
export const CARD_H = 448;

export interface CardInfo {
  def: CreatureDef;
  shape: Shape2D;
  label: string;
  stars: number;
  note: string;
  highContrast: boolean;
}

export function paintCard(ctx: CanvasRenderingContext2D, info: CardInfo): void {
  const W = CARD_W;
  const H = CARD_H;
  paper(ctx, W, H, info.highContrast ? '#ffffff' : COLORS.paper);
  // Kamishibai frame: vermilion border with a wooden inner rule.
  ctx.strokeStyle = COLORS.vermilion;
  ctx.lineWidth = 22;
  ctx.strokeRect(11, 11, W - 22, H - 22);
  ctx.strokeStyle = '#3b2216';
  ctx.lineWidth = 3;
  ctx.strokeRect(30, 30, W - 60, H - 60);
  const ink = info.highContrast ? '#000000' : COLORS.sumi;
  drawSilhouette(ctx, info.shape, { x: 52, y: 70, w: 300, h: 330 }, ink);
  ctx.fillStyle = ink;
  ctx.font = `700 22px ${FONT_MONO}`;
  ctx.fillText(info.label.toUpperCase(), 380, 92);
  ctx.font = `800 64px ${FONT_DISPLAY}`;
  ctx.fillText(info.def.name, 376, 168);
  ctx.font = `400 26px ${FONT_MONO}`;
  wrap(ctx, info.def.hint, 380, 214, 220, 32);
  // Brush stars.
  for (let i = 0; i < 3; i++) {
    ctx.fillStyle = i < info.stars ? COLORS.vermilion : 'rgba(15,14,13,0.18)';
    star(ctx, 400 + i * 52, 370, 20);
  }
  if (info.note) {
    ctx.fillStyle = COLORS.vermilion;
    ctx.font = `700 26px ${FONT_MONO}`;
    ctx.fillText(info.note, 380, 330);
  }
}

function wrap(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, w: number, lh: number): void {
  let line = '';
  for (const word of text.split(' ')) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > w && line) {
      ctx.fillText(line, x, y);
      y += lh;
      line = word;
    } else line = test;
  }
  if (line) ctx.fillText(line, x, y);
}

function star(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number): void {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.45 : r;
    ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fill();
}

export class TargetCard {
  readonly mesh: Mesh;
  private readonly tex: CanvasTexture;
  constructor() {
    this.tex = canvasTexture(CARD_W, CARD_H, (ctx) => paper(ctx, CARD_W, CARD_H));
    this.mesh = new Mesh(new PlaneGeometry(1, CARD_H / CARD_W), new MeshBasicMaterial({ map: this.tex, side: DoubleSide }));
    this.mesh.name = 'TargetCard';
    this.mesh.renderOrder = 3;
    this.mesh.visible = false;
  }
  show(info: CardInfo): void {
    redraw(this.tex, (ctx) => paintCard(ctx, info));
    this.mesh.visible = true;
  }
}

/** The match ring: a vermilion arc that fills while the match is held. */
export class MatchRing {
  readonly mesh: Mesh;
  readonly material: ShaderMaterial;
  constructor() {
    this.material = new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: DoubleSide,
      uniforms: {
        uProgress: { value: 0 },
        uClose: { value: 0 },
        uWarn: { value: 0 },
        uTime: { value: 0 },
        uInk: { value: new Color(COLORS.vermilion) },
        uPaper: { value: new Color(COLORS.lamp) },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() { vUv = uv * 2.0 - 1.0; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
      `,
      fragmentShader: /* glsl */ `
        uniform float uProgress; uniform float uClose; uniform float uWarn; uniform float uTime;
        uniform vec3 uInk; uniform vec3 uPaper;
        varying vec2 vUv;
        void main() {
          float r = length(vUv);
          float band = smoothstep(0.80, 0.83, r) * (1.0 - smoothstep(0.95, 0.98, r));
          if (band < 0.01) discard;
          float ang = atan(vUv.x, vUv.y) / 6.2831853 + 0.5; // 0 at the bottom, clockwise
          float filled = step(1.0 - ang, uProgress);
          float dash = uWarn > 0.5 ? step(0.5, fract(ang * 24.0 - uTime)) : 1.0;
          vec3 col = mix(uPaper, uInk, filled);
          float a = band * mix(0.25 + 0.45 * uClose, 0.95, filled) * dash;
          gl_FragColor = vec4(col, a);
        }
      `,
    });
    this.mesh = new Mesh(new PlaneGeometry(2, 2), this.material);
    this.mesh.name = 'MatchRing';
    this.mesh.renderOrder = 4;
    this.mesh.visible = false;
  }
}

/** Ghost hands: where to hold your hands for the current target. */
export class GhostHands {
  readonly root = new Group();
  private readonly spheres: InstancedMesh;
  private readonly bones: InstancedMesh;
  private readonly m = new Matrix4();
  private readonly q = new Quaternion();
  private readonly a = new Vector3();
  private readonly b = new Vector3();
  private readonly s = new Vector3();
  private readonly up = new Vector3(0, 1, 0);
  readonly material: MeshBasicMaterial;

  constructor() {
    this.root.name = 'GhostHands';
    this.material = new MeshBasicMaterial({ color: COLORS.lamp, transparent: true, opacity: 0.38, depthWrite: false });
    this.spheres = new InstancedMesh(new SphereGeometry(1, 10, 8), this.material, 50);
    this.bones = new InstancedMesh(new CylinderGeometry(1, 1, 1, 8, 1, true), this.material, BONES.length * 2);
    this.spheres.frustumCulled = false;
    this.bones.frustumCulled = false;
    this.root.add(this.spheres, this.bones);
    this.root.visible = false;
  }

  /** `hands` are world-space joints. */
  set(hands: Float32Array[]): void {
    let si = 0;
    let bi = 0;
    for (const j of hands) {
      for (let i = 0; i < 25; i++) {
        const r = JOINT_RADII[i] * 0.9;
        this.m.makeScale(r, r, r).setPosition(j[i * 3], j[i * 3 + 1], j[i * 3 + 2]);
        this.spheres.setMatrixAt(si++, this.m);
      }
      for (const bone of BONES) {
        this.a.set(j[bone.a * 3], j[bone.a * 3 + 1], j[bone.a * 3 + 2]);
        this.b.set(j[bone.b * 3], j[bone.b * 3 + 1], j[bone.b * 3 + 2]);
        const len = this.a.distanceTo(this.b);
        const r = ((JOINT_RADII[bone.a] + JOINT_RADII[bone.b]) / 2) * 0.9;
        this.q.setFromUnitVectors(this.up, this.b.clone().sub(this.a).normalize());
        this.s.set(r, Math.max(1e-4, len), r);
        this.m.compose(this.a.add(this.b).multiplyScalar(0.5), this.q, this.s);
        this.bones.setMatrixAt(bi++, this.m);
      }
    }
    this.spheres.count = si;
    this.bones.count = bi;
    this.spheres.instanceMatrix.needsUpdate = true;
    this.bones.instanceMatrix.needsUpdate = true;
  }
}

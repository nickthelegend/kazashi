/**
 * Sumi-ink creature material. The vertex shader is the procedural rig: each
 * finger group rotates about its root joint (ears twitch, jaws snap, legs
 * swing, wings beat). The fragment shader bleeds the ink in from the centre
 * through paper-fibre noise, and dissolves it out the same way.
 */
import { Color, DoubleSide, ShaderMaterial, Vector4 } from '@iwsdk/core';

export const RIG_SLOTS = 16;

export function createCreatureMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    name: 'SumiCreature',
    side: DoubleSide,
    transparent: false,
    uniforms: {
      uTime: { value: 0 },
      uInk: { value: 0 },
      uExtent: { value: 1 },
      uColor: { value: new Color('#0f0e0d') },
      uEdge: { value: new Color('#b83a22') },
      uPivot: { value: Array.from({ length: RIG_SLOTS }, () => new Vector4()) },
      uRig: { value: Array.from({ length: RIG_SLOTS }, () => new Vector4()) },
    },
    vertexShader: /* glsl */ `
      attribute float group;
      uniform float uTime;
      uniform vec4 uPivot[${RIG_SLOTS}];
      uniform vec4 uRig[${RIG_SLOTS}];
      varying vec2 vLocal;
      void main() {
        int g = int(group + 0.5);
        vec4 r = uRig[g];
        // x: amplitude (rad), y: angular speed, z: phase, w: bias (rad)
        float ang = r.w + r.x * sin(uTime * r.y + r.z);
        vec2 piv = uPivot[g].xy;
        vec2 d = position.xy - piv;
        float c = cos(ang);
        float s = sin(ang);
        vec2 p = piv + vec2(c * d.x - s * d.y, s * d.x + c * d.y);
        vLocal = position.xy;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 0.0, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uInk;
      uniform float uExtent;
      uniform vec3 uColor;
      uniform vec3 uEdge;
      varying vec2 vLocal;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p) {
        vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
      }
      void main() {
        float fib = noise(vLocal * 9.0) * 0.6 + noise(vLocal * 23.0) * 0.4;
        float r = length(vLocal) / uExtent;
        float front = r * 0.75 + fib * 0.35;
        float t = uInk * 1.15;
        if (front > t) discard;
        // A thin vermilion wet edge while the ink is still spreading.
        float wet = smoothstep(0.07, 0.0, t - front) * step(uInk, 0.999);
        gl_FragColor = vec4(mix(uColor, uEdge, wet * 0.8), 1.0);
      }
    `,
  });
}

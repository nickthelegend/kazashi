/**
 * Glowing washi: warm lamp colour, horizontal bamboo ribs, fibre noise and a
 * slow candle flicker driven by the `uTime` uniform.
 */
import { Color, ShaderMaterial } from '@iwsdk/core';

export function createPaperMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    name: 'WashiGlow',
    uniforms: {
      uTime: { value: 0 },
      uGlow: { value: 1 },
      uLamp: { value: new Color('#ffd08a') },
      uEdge: { value: new Color('#b83a22') },
    },
    vertexShader: /* glsl */ `
      varying vec3 vPos;
      varying vec3 vNormalV;
      varying vec3 vViewDir;
      void main() {
        vPos = position;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vNormalV = normalize(normalMatrix * normal);
        vViewDir = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform float uGlow;
      uniform vec3 uLamp;
      uniform vec3 uEdge;
      varying vec3 vPos;
      varying vec3 vNormalV;
      varying vec3 vViewDir;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p) {
        vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
      }
      void main() {
        float ang = atan(vPos.z, vPos.x);
        vec2 uv = vec2(ang * 3.0, vPos.y * 60.0);
        float fibre = noise(uv * vec2(6.0, 1.5)) * 0.5 + noise(uv * 3.0) * 0.5;
        float rib = smoothstep(0.82, 1.0, abs(fract(vPos.y * 82.0) * 2.0 - 1.0));
        float facing = clamp(dot(vNormalV, vViewDir), 0.0, 1.0);
        float centre = 1.0 - abs((vPos.y - 0.135) / 0.09);
        float flicker = 0.92 + 0.05 * sin(uTime * 7.3) + 0.03 * sin(uTime * 13.1 + 1.7);
        float glow = (0.55 + 0.45 * centre) * (0.65 + 0.35 * facing) * flicker * uGlow;
        vec3 col = uLamp * glow * (0.86 + 0.24 * fibre);
        col = mix(col, uEdge * 0.55, rib * 0.55);
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
}

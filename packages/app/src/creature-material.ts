/**
 * Sumi-ink materials. The creature material bleeds ink in from the centre
 * through soft, low-frequency paper fibre (a feathered front with a thin
 * vermilion wet edge), and dissolves out the same way. The eye is a hole cut
 * through the head, as in a paper shadow puppet, so the lamplit wall shows
 * through. Vertex positions are posed on the CPU; `rest` keeps the unposed
 * coordinates so the ink and the eye travel with the body.
 */
import { Color, DoubleSide, ShaderMaterial, Vector3 } from '@iwsdk/core';

const NOISE = /* glsl */ `
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
  }
`;

export function createCreatureMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    name: 'SumiCreature',
    side: DoubleSide,
    transparent: true,
    depthWrite: false,
    uniforms: {
      uInk: { value: 0 },
      uExtent: { value: 1 },
      uColor: { value: new Color('#0f0e0d') },
      uEdge: { value: new Color('#b83a22') },
      /** Eye centre (rest space) and radius; radius 0 means no eye. */
      uEye: { value: new Vector3(0, 0, 0) },
    },
    vertexShader: /* glsl */ `
      attribute vec2 rest;
      attribute float head;
      varying vec2 vRest;
      varying float vHead;
      void main() {
        vRest = rest;
        vHead = head;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uInk;
      uniform float uExtent;
      uniform vec3 uColor;
      uniform vec3 uEdge;
      uniform vec3 uEye;
      varying vec2 vRest;
      varying float vHead;
      ${NOISE}
      void main() {
        float fib = noise(vRest * 3.5) * 0.65 + noise(vRest * 9.0) * 0.35;
        float front = length(vRest) / uExtent * 0.8 + fib * 0.3;
        float edge = uInk * 1.14 - front;
        float a = smoothstep(0.0, 0.06, edge);
        if (a < 0.004) discard;
        if (uEye.z > 0.0 && vHead > 0.5 && length(vRest - uEye.xy) < uEye.z) discard;
        float wet = smoothstep(0.16, 0.0, edge) * step(uInk, 0.999);
        gl_FragColor = vec4(mix(uColor, uEdge, wet * 0.75), a);
      }
    `,
  });
}

/**
 * A dry-brush ground line on the wall, under a walking creature. `uLen` is the
 * stroke's length in metres so the bristle streaks keep their scale as it grows.
 */
export function createStrokeMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    name: 'SumiStroke',
    side: DoubleSide,
    transparent: true,
    depthWrite: false,
    uniforms: {
      uLen: { value: 1 },
      uOpacity: { value: 0 },
      uColor: { value: new Color('#0f0e0d') },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
    `,
    fragmentShader: /* glsl */ `
      uniform float uLen;
      uniform float uOpacity;
      uniform vec3 uColor;
      varying vec2 vUv;
      ${NOISE}
      void main() {
        float x = vUv.x * uLen;
        float ends = smoothstep(0.0, 0.08, x) * smoothstep(0.0, 0.14, uLen - x);
        float wobble = (noise(vec2(x * 3.0, 1.7)) - 0.5) * 0.35;
        float y = abs(vUv.y - 0.5 - wobble * 0.3) * 2.0;
        float body = 1.0 - smoothstep(0.55, 1.0, y + (noise(vec2(x * 7.0, 4.2)) - 0.5) * 0.4);
        float streak = smoothstep(0.25, 0.65, noise(vec2(x * 2.5, vUv.y * 9.0)));
        float a = ends * body * mix(0.55, 1.0, streak) * uOpacity;
        if (a < 0.01) discard;
        gl_FragColor = vec4(uColor, a);
      }
    `,
  });
}

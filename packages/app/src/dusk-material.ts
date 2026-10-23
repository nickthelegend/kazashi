/**
 * Draws over real surfaces (detected planes): the room dims to dusk, and the
 * lantern's light pool warms whatever it reaches. Passthrough pixels are never
 * read or changed; this is alpha-blended geometry on the planes.
 */
import { Color, ShaderMaterial, Vector3 } from '@iwsdk/core';

export function createDuskMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    name: 'Dusk',
    transparent: true,
    depthWrite: false,
    uniforms: {
      uLight: { value: new Vector3() },
      uAim: { value: new Vector3(0, 0, -1) },
      uDusk: { value: 0 },
      uRange: { value: 1.6 },
      uSumi: { value: new Color('#0f0e0d') },
      uLamp: { value: new Color('#ffb15c') },
      uFlicker: { value: 1 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vWorld;
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        vWorld = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uLight; uniform vec3 uAim; uniform float uDusk; uniform float uRange;
      uniform vec3 uSumi; uniform vec3 uLamp; uniform float uFlicker;
      varying vec3 vWorld;
      void main() {
        vec3 d = vWorld - uLight;
        float dist = length(d);
        float pool = exp(-dist * dist / (uRange * uRange));
        float cone = smoothstep(0.55, 0.92, dot(normalize(d), normalize(uAim)));
        float lit = clamp(pool * 0.9 + cone * 0.55, 0.0, 1.0) * uFlicker;
        float darkA = uDusk * (1.0 - lit);
        float glowA = 0.22 * lit * uDusk;
        float a = darkA + glowA;
        if (a < 0.002) discard;
        vec3 col = (uSumi * darkA + uLamp * glowA) / a;
        gl_FragColor = vec4(col, a);
      }
    `,
  });
}

import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';

/**
 * The finishing pass: what turns a render into a painting.
 * - A brush pass: a smooth Kuwahara filter, so flat areas turn into soft patches of paint while
 *   edges stay clean (off on Low quality).
 * - Thin coloured lines from the depth buffer: the darker shade of the surface itself, never black,
 *   gone entirely past about 40 m.
 * - Aerial perspective: past 30 m colours drift toward the sky at the horizon and lose saturation.
 * - A colour grade: blue shadows, warm light; then paper grain, a faint canvas weave and a vignette.
 * It reads the depth texture of the buffer the scene was rendered into, so the composer must be
 * created with a render target that owns a DepthTexture.
 */
export class FinishPass extends Pass {
  quad: FullScreenQuad;
  mat: THREE.ShaderMaterial;
  constructor(camera: THREE.PerspectiveCamera) {
    super();
    this.mat = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null },
        tDepth: { value: null },
        uRes: { value: new THREE.Vector2(1, 1) },
        uNear: { value: camera.near },
        uFar: { value: camera.far },
        uTime: { value: 0 },
        uInk: { value: new THREE.Color('#2e2230') },
        uInkK: { value: 1 },
        uLineW: { value: 1 },
        uBrush: { value: 0 },
        uHaze: { value: 1 },
        uHazeCol: { value: new THREE.Color('#bcdcf0') },
        uGrain: { value: 0.035 },
        uVignette: { value: 0.28 },
        uSat: { value: 1.02 },
        uShadowTint: { value: new THREE.Vector3(0.84, 0.92, 1.16) },
        uHighTint: { value: new THREE.Vector3(1.06, 1.0, 0.92) },
        uNight: { value: 0 },
        uSun: { value: new THREE.Vector2(0.5, 0.8) },
        uSunVis: { value: 0 },
        uSunCol: { value: new THREE.Color('#ffe2a8') },
        uMist: { value: 0 },
        uMistCol: { value: new THREE.Color('#dfe8f4') },
      },
      vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
      fragmentShader: /* glsl */ `
        #include <packing>
        uniform sampler2D tDiffuse, tDepth;
        uniform vec2 uRes; uniform float uNear, uFar, uTime, uInkK, uLineW, uBrush, uHaze, uGrain, uVignette, uSat, uNight, uSunVis, uMist;
        uniform vec2 uSun; uniform vec3 uSunCol, uMistCol, uHazeCol;
        uniform vec3 uInk, uShadowTint, uHighTint;
        varying vec2 vUv;
        float lin(vec2 uv){
          float d = texture2D(tDepth, uv).x;
          return -perspectiveDepthToViewZ(d, uNear, uFar);
        }
        float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
        float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y); }
        // Smooth Kuwahara: four overlapping 3x3 sectors around the pixel, each weighted by how flat it is.
        // Flat sectors win, so colour pools into patches and an edge keeps the side it belongs to.
        vec3 brush(vec2 uv, float stepPx){
          vec2 st = stepPx / uRes;
          vec3 acc = vec3(0.0); float wsum = 0.0;
          for (int q = 0; q < 4; q++) {
            vec2 sgn = vec2(q == 0 || q == 2 ? -1.0 : 1.0, q < 2 ? -1.0 : 1.0);
            vec3 m = vec3(0.0), m2 = vec3(0.0);
            for (int i = 0; i < 3; i++) for (int j = 0; j < 3; j++) {
              vec3 c = texture2D(tDiffuse, uv + vec2(float(i), float(j)) * sgn * st).rgb;
              m += c; m2 += c * c;
            }
            m /= 9.0; m2 = max(m2 / 9.0 - m * m, 0.0);
            float v = m2.r + m2.g + m2.b;
            float w = 1.0 / (1.0 + pow(v * 900.0, 2.0));
            acc += m * w; wsum += w;
          }
          return acc / wsum;
        }
        void main(){
          vec4 src = texture2D(tDiffuse, vUv);
          float dc = lin(vUv);
          // brush strokes thin out with distance, so far detail melts but the near world keeps its shapes
          float bk = uBrush * (uRes.y / 1080.0) * mix(1.0, 0.6, smoothstep(10.0, 120.0, dc));
          vec3 col = bk > 0.25 ? brush(vUv, bk) : src.rgb;
          vec2 px = uLineW / uRes;
          float dl = lin(vUv - vec2(px.x, 0.0)), dr = lin(vUv + vec2(px.x, 0.0));
          float dd = lin(vUv - vec2(0.0, px.y)), du = lin(vUv + vec2(0.0, px.y));
          float dmin = min(dc, min(min(dl, dr), min(dd, du)));
          // Silhouettes: a big jump in depth relative to the nearer surface.
          float jump = max(max(dl, dr), max(dd, du)) - dmin;
          float sil = smoothstep(0.06, 0.16, jump / max(dmin, 0.1));
          // Creases: where the surface bends sharply (second derivative of depth).
          float lap = abs(dl + dr + dd + du - 4.0 * dc) / max(dc, 0.1);
          float crease = smoothstep(0.02, 0.06, lap) * 0.4;
          // lines live only near the eye: they thin from 12 m and are gone by 40 m
          float fade = 1.0 - smoothstep(12.0, 40.0, dmin);
          float ink = max(sil, crease) * fade * uInkK;
          // Luma before the grade decides where hatching goes.
          float luma = dot(col, vec3(0.299, 0.587, 0.114));
          // Grade: saturation, cool shadows, warm lights.
          vec3 grey = vec3(luma);
          col = mix(grey, col, uSat);
          float sh = 1.0 - smoothstep(0.05, 0.45, luma);
          col *= mix(uHighTint, uShadowTint, sh);
          float solid = 1.0 - step(uFar * 0.9, dc);
          // Aerial perspective: distance turns blue-grey and pale, like the far ranges in a valley painting.
          float hz = smoothstep(30.0, 320.0, dc) * solid * uHaze;
          float hl = dot(col, vec3(0.299, 0.587, 0.114));
          col = mix(col, mix(vec3(hl), col, 0.55), hz * 0.8);
          col = mix(col, uHazeCol, hz * 0.42);
          // Morning mist: soft, pale, thicker with distance, only on solid ground.
          float mist = (1.0 - exp(-dc * 0.0045)) * uMist * solid;
          col = mix(col, uMistCol, mist * 0.55);
          // Sun shafts: march toward the sun and gather open sky, so light spills past hills and clouds.
          if (uSunVis > 0.01) {
            vec2 dlt = (uSun - vUv) / 22.0;
            vec2 uv2 = vUv; float acc = 0.0, w = 1.0;
            for (int i = 0; i < 22; i++) { uv2 += dlt; float sky = step(uFar * 0.9, lin(clamp(uv2, 0.001, 0.999))); acc += sky * w; w *= 0.93; }
            float fall = 1.0 - smoothstep(0.0, 0.9, length((vUv - uSun) * vec2(uRes.x / uRes.y, 1.0)));
            col += uSunCol * acc / 12.0 * fall * uSunVis * 0.35;
          }
          // Teal night: shadows lean blue-green, lights stay warm.
          col = mix(col, col * vec3(0.78, 1.02, 1.08) + vec3(0.0, 0.015, 0.03), uNight * 0.8);
          // Ink on top.
          // the line takes the darker shade of what it outlines (the nearer side), a little cooler
          vec3 nearCol = dc <= dmin + 0.01 ? col : texture2D(tDiffuse, vUv).rgb;
          vec3 inkCol = nearCol * mix(vec3(0.42, 0.46, 0.58), vec3(0.5, 0.6, 0.75), uNight);
          col = mix(col, inkCol, clamp(ink * 0.75, 0.0, 0.8));
          // Vignette and grain.
          vec2 q = vUv - 0.5;
          col *= 1.0 - dot(q, q) * uVignette * 1.6;
          float g = hash(vUv * uRes + fract(uTime * 13.0) * 100.0) - 0.5;
          col += g * uGrain * (0.35 + luma);
          // paper: a slow blotchy tooth and a faint canvas weave, the same on every frame
          vec2 fc = gl_FragCoord.xy * (1080.0 / uRes.y);
          float tooth = vnoise(fc * 0.045) * 0.6 + vnoise(fc * 0.19) * 0.4;
          float weave = sin(fc.x * 1.9) * sin(fc.y * 1.9);
          col *= 1.0 + (tooth - 0.5) * 0.045 + weave * 0.012;
          gl_FragColor = vec4(max(col, 0.0), src.a);
        }`,
      depthTest: false, depthWrite: false,
    });
    this.quad = new FullScreenQuad(this.mat);
  }

  setSize(w: number, h: number) { this.mat.uniforms.uRes.value.set(w, h); }

  render(renderer: THREE.WebGLRenderer, writeBuffer: THREE.WebGLRenderTarget, readBuffer: THREE.WebGLRenderTarget) {
    this.mat.uniforms.tDiffuse.value = readBuffer.texture;
    this.mat.uniforms.tDepth.value = readBuffer.depthTexture;
    if (this.renderToScreen) renderer.setRenderTarget(null);
    else { renderer.setRenderTarget(writeBuffer); if (this.clear) renderer.clear(); }
    this.quad.render(renderer);
  }

  dispose() { this.mat.dispose(); this.quad.dispose(); }
}

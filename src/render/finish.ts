import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';

/**
 * The finishing pass: what turns a render into a painting.
 * - Ink lines from the depth buffer (silhouettes and creases), thinner and lighter with distance,
 *   in the spirit of French comic line art.
 * - Light diagonal hatching in the deepest shadows.
 * - A color grade: richer saturation, blue-violet shadows, warm highlights.
 * - Soft vignette and a fine film grain.
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
        uHatch: { value: 1 },
        // kept for callers; the brush pass and aerial haze of the painted look are gone
        uBrush: { value: 0 },
        uHaze: { value: 1 },
        uHazeCol: { value: new THREE.Color('#bcdcf0') },
        uGrain: { value: 0.035 },
        uVignette: { value: 0.28 },
        uSat: { value: 1.12 },
        uShadowTint: { value: new THREE.Vector3(0.86, 0.9, 1.14) },
        uHighTint: { value: new THREE.Vector3(1.04, 1.0, 0.95) },
        uNight: { value: 0 },
        uSun: { value: new THREE.Vector2(0.5, 0.8) },
        uSunVis: { value: 0 },
        uSunCol: { value: new THREE.Color('#ffe2a8') },
        uMist: { value: 0 },
        uDream: { value: 0 },
        uMistCol: { value: new THREE.Color('#dfe8f4') },
      },
      vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
      fragmentShader: /* glsl */ `
        #include <packing>
        uniform sampler2D tDiffuse, tDepth;
        uniform vec2 uRes; uniform float uNear, uFar, uTime, uInkK, uLineW, uHatch, uBrush, uHaze, uGrain, uVignette, uSat, uNight, uSunVis, uMist, uDream;
        uniform vec2 uSun; uniform vec3 uSunCol, uMistCol, uHazeCol;
        uniform vec3 uInk, uShadowTint, uHighTint;
        varying vec2 vUv;
        float lin(vec2 uv){
          float d = texture2D(tDepth, uv).x;
          return -perspectiveDepthToViewZ(d, uNear, uFar);
        }
        float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
        void main(){
          vec4 src = texture2D(tDiffuse, vUv);
          vec3 col = src.rgb;
          vec2 px = uLineW / uRes;
          float dc = lin(vUv);
          float dl = lin(vUv - vec2(px.x, 0.0)), dr = lin(vUv + vec2(px.x, 0.0));
          float dd = lin(vUv - vec2(0.0, px.y)), du = lin(vUv + vec2(0.0, px.y));
          float dmin = min(dc, min(min(dl, dr), min(dd, du)));
          // Silhouettes: a big jump in depth relative to the nearer surface.
          float jump = max(max(dl, dr), max(dd, du)) - dmin;
          float sil = smoothstep(0.06, 0.16, jump / max(dmin, 0.1));
          // Creases: where the surface bends sharply (second derivative of depth).
          float lap = abs(dl + dr + dd + du - 4.0 * dc) / max(dc, 0.1);
          float crease = smoothstep(0.02, 0.06, lap) * 0.4;
          float fade = 1.0 - smoothstep(30.0, 700.0, dmin) * 0.75;
          float ink = max(sil, crease) * fade * uInkK;
          // Luma before the grade decides where hatching goes.
          float luma = dot(col, vec3(0.299, 0.587, 0.114));
          // Grade: saturation, cool shadows, warm lights.
          vec3 grey = vec3(luma);
          col = mix(grey, col, uSat + 0.16 * uDream);
          float sh = 1.0 - smoothstep(0.05, 0.45, luma);
          // (the dream shots keep their clear blues: the warm light tint is mostly lifted there)
          col *= mix(mix(uHighTint, vec3(1.0), uDream * 0.8), uShadowTint, sh);
          float solid = 1.0 - step(uFar * 0.9, dc);
          float diag = abs(fract((gl_FragCoord.x + gl_FragCoord.y) / (5.0 * uLineW)) - 0.5) * 2.0;
          float hatch = smoothstep(0.55, 0.85, diag) * (1.0 - smoothstep(0.03, 0.16, luma)) * solid * fade * uHatch * 0.22;
          col = mix(col, uInk * 0.6, hatch);
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
          vec3 inkCol = mix(uInk, vec3(0.05, 0.08, 0.16), uNight);
          col = mix(col, inkCol * (0.6 + 0.4 * luma), clamp(ink, 0.0, 0.92));
          col = mix(col, col * vec3(1.02, 1.0, 0.98) + vec3(0.04, 0.032, 0.022), uDream * 0.7);
          // Vignette and grain.
          vec2 q = vUv - 0.5;
          col *= 1.0 - dot(q, q) * uVignette * 1.6 * (1.0 - 0.6 * uDream);
          float g = hash(vUv * uRes + fract(uTime * 13.0) * 100.0) - 0.5;
          col += g * uGrain * (0.35 + luma);
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

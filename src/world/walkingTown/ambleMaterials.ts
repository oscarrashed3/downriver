import * as THREE from 'three';
import { paint, softRamp, PAINT } from '../../render/paint';

// Materials for Old Amble: the body (stone-plated skin, pale hide, antler, moss, eyes) and the growth on it
// (vines, ferns, flowers, leaves: alpha-tested cards from one painted atlas). Both are the game's toon material
// with the painted look, so Amble lights with the world; both skin with the rig.
//
// The body's surface detail is painted in REST space (the bind-pose position), so the plates, cracks and moss
// never swim over the skin when Amble breathes or walks.

const BODY_GLSL = /* glsl */ `
  varying vec3 vRest; varying vec4 vSkin; varying float vFold;
  vec3 aHash3(vec3 p){
    p = vec3(dot(p, vec3(127.1, 311.7, 74.7)), dot(p, vec3(269.5, 183.3, 246.1)), dot(p, vec3(113.5, 271.9, 124.6)));
    return fract(sin(p) * 43758.5453);
  }
  // cellular noise: nearest and second-nearest feature distances, and the nearest cell's random value
  vec3 aVor(vec3 x){
    vec3 n = floor(x), f = fract(x);
    float f1 = 8.0, f2 = 8.0, id = 0.0;
    for (int k = -1; k <= 1; k++) for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
      vec3 g = vec3(float(i), float(j), float(k));
      vec3 o = aHash3(n + g);
      vec3 r = g + o * 0.85 - f;
      float d = dot(r, r);
      if (d < f1) { f2 = f1; f1 = d; id = o.x; } else if (d < f2) { f2 = d; }
    }
    return vec3(sqrt(f1), sqrt(f2), id);
  }
`;

let bodyMat: THREE.MeshToonMaterial | null = null;
/** Old Amble's skin, shell, antlers and moss (one material, vertex-coloured, see ambleBody.ts for aSkin). */
export function ambleBodyMaterial(): THREE.MeshToonMaterial {
  if (bodyMat) return bodyMat;
  const m = paint(new THREE.MeshToonMaterial({ color: '#ffffff', vertexColors: true, gradientMap: softRamp() }), { variation: 0, rim: 0.7 });
  const base = m.onBeforeCompile;
  m.onBeforeCompile = (sh, r) => {
    base.call(m, sh, r);
    sh.uniforms.uMossA = { value: new THREE.Color('#5b7f34') };
    sh.uniforms.uMossB = { value: new THREE.Color('#a3bb58') };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 aSkin; attribute float aFold; varying vec3 vRest; varying vec4 vSkin; varying float vFold;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n  vRest = position; vSkin = aSkin; vFold = aFold;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uMossA, uMossB;\n' + BODY_GLSL)
      .replace('#include <color_fragment>', `#include <color_fragment>
        {
          vec3 rp = vRest;
          float kind = vSkin.w;
          float rock = vSkin.x, mossW = vSkin.y, ao = vSkin.z;
          float n1 = pNoise(rp * 0.55), n2 = pNoise(rp * 2.1 + 7.0), n3 = pNoise(rp * 6.0 + 3.0);
          vec3 alb = diffuseColor.rgb;
          if (kind < 0.5) {
            // stone and rock-skin: broken into plates by deep cracks, finer cracks inside each plate
            vec3 v1 = aVor(rp * 0.42);
            vec3 v2 = aVor(rp * 1.5 + 11.0);
            float crack1 = 1.0 - smoothstep(0.02, 0.1, v1.y - v1.x);
            float crack2 = 1.0 - smoothstep(0.01, 0.06, v2.y - v2.x);
            alb *= mix(1.0, (0.9 + 0.16 * v1.z) * (1.0 - 0.22 * crack1) * (1.0 - 0.1 * crack2), rock);
            // each plate is a little rounded: lighter in its middle
            alb *= mix(1.0, 0.94 + 0.12 * smoothstep(0.0, 0.5, v1.y - v1.x), rock);
            alb *= 0.92 + 0.14 * n1 + 0.06 * n3;
          } else if (kind < 1.5) {
            // pale hide: soft, faintly streaked like short fur, a few freckles of grey
            // short hair lying back along the head and down the neck: fine strokes, tufts, and softer clumps
            float hairF = pNoise(rp * vec3(26.0, 26.0, 3.5));
            float hairM = pNoise(rp * vec3(9.0, 9.0, 1.6) + 2.0);
            alb *= 0.9 + 0.1 * hairF + 0.08 * hairM + 0.03 * n2;
            alb = mix(alb, alb * vec3(1.03, 0.95, 0.84), smoothstep(0.45, 0.75, n1) * 0.35);
            alb = mix(alb, alb * vec3(0.84, 0.82, 0.78), smoothstep(0.72, 0.8, n2) * 0.5 * rock * 4.0);
          } else if (kind < 2.5) {
            // antler: pale, a fine grain running along, little dark pits
            alb *= 0.93 + 0.08 * pNoise(rp * vec3(3.0, 9.0, 3.0)) + 0.04 * n1;
            alb *= 1.0 - 0.18 * smoothstep(0.78, 0.84, n3);
          } else if (kind > 2.5 && kind < 3.5) {
            // the eye: deep and dark, a soft warm glint low in the iris
            alb *= 0.55;
          } else if (kind > 3.5 && kind < 4.5) {
            alb *= 0.94 + 0.1 * pNoise(rp * vec3(12.0, 2.0, 12.0));
          } else if (kind > 5.5) {
            // the legs' and neck's hide: layered like old rock and bark, in long horizontal folds. Each fold is
            // lit along its rounded top and dark in the crease under it; a fainter crease halves it; the hide
            // between is streaked along the fold and split here and there by short upright cracks.
            float fw = vFold + (n1 - 0.5) * 0.35;
            float fp = fract(fw);
            float crease = 1.0 - smoothstep(0.0, 0.12, fp);
            float half_ = (1.0 - smoothstep(0.0, 0.06, abs(fp - 0.5))) * 0.45;
            float roll = smoothstep(0.1, 0.55, fp) * (1.0 - smoothstep(0.7, 1.0, fp));
            float streak = pNoise(vec3(rp.x * 1.4, fw * 9.0, rp.z * 1.4));
            vec3 vc = aVor(vec3(rp.x * 1.1, fw * 2.4, rp.z * 1.1) + 3.0);
            float split = (1.0 - smoothstep(0.02, 0.09, vc.y - vc.x)) * smoothstep(0.25, 0.6, fp) * (1.0 - smoothstep(0.75, 0.95, fp));
            alb *= 0.84 + 0.2 * roll + 0.1 * streak + 0.06 * n3;
            alb *= (1.0 - 0.42 * crease) * (1.0 - 0.18 * half_) * (1.0 - 0.22 * split);
            alb = mix(alb, alb * vec3(1.04, 1.0, 0.9), smoothstep(0.55, 0.8, n2) * 0.5);
          }
          // moss: a soft cushion texture, broken up at its edges so it creeps over the stone in ragged patches
          float mk = (kind > 4.5 && kind < 5.5) ? 1.0 : smoothstep(0.44, 0.6, mossW + (n1 - 0.5) * 0.55 + (n2 - 0.5) * 0.35);
          if (mk > 0.0) {
            vec3 mv = aVor(rp * 3.4 + 5.0);
            // three greens in broad drifts: deep moss, leaf green and a sunny yellow-green
            float drift = pNoise(rp * 0.11 + 4.0);
            vec3 mA = mix(uMossA, vec3(0.27, 0.40, 0.17), smoothstep(0.55, 0.8, drift) * 0.7);
            vec3 mB = mix(uMossB, vec3(0.74, 0.76, 0.33), smoothstep(0.25, 0.05, drift) * 0.8);
            vec3 mc = mix(mA, mB, clamp(n1 * 0.7 + n3 * 0.5 - 0.1, 0.0, 1.0));
            mc *= 0.8 + 0.32 * smoothstep(0.0, 0.55, mv.x);
            // flecks of yellow-green and tiny pale flowers in the thicker moss
            mc = mix(mc, vec3(0.78, 0.82, 0.42), smoothstep(0.82, 0.88, n3) * 0.6);
            mc = mix(mc, vec3(0.96, 0.92, 0.84), smoothstep(0.93, 0.95, pNoise(rp * 9.0)) * mk * 0.7);
            if (kind > 4.5 && kind < 5.5) mc = mix(mc, alb, 0.45);
            alb = mix(alb, mc, mk);
          }
          alb *= 1.0 - 0.55 * ao;
          diffuseColor.rgb = alb;
        }`);
  };
  m.customProgramCacheKey = () => 'ambleBody3';
  bodyMat = m;
  return m;
}

// ------------------------------------------------------------------------------------------------ growth atlas

/** The atlas cells (3 x 2): leaves, fern frond, flowers / vine strip, lupin, grass. */
export const CELL = { leaves: 0, fern: 1, flowers: 2, vine: 3, lupin: 4, grass: 5 } as const;
export function cellUV(cell: number, u: number, v: number): [number, number] {
  const cx = cell % 3, cy = Math.floor(cell / 3);
  return [(cx + u) / 3, 1 - (cy + 1 - v) / 2];
}

let atlas: THREE.CanvasTexture | null = null;
function growthAtlas(): THREE.CanvasTexture {
  if (atlas) return atlas;
  const S = 256, c = document.createElement('canvas'); c.width = S * 3; c.height = S * 2;
  const x = c.getContext('2d')!;
  let s = 19; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const leaf = (cx: number, cy: number, len: number, wid: number, rot: number, fill: string, vein = 'rgba(200,200,200,1)') => {
    x.save(); x.translate(cx, cy); x.rotate(rot);
    x.fillStyle = fill;
    x.beginPath(); x.moveTo(0, 0);
    x.bezierCurveTo(wid, len * 0.2, wid * 0.9, len * 0.75, 0, len);
    x.bezierCurveTo(-wid * 0.9, len * 0.75, -wid, len * 0.2, 0, 0);
    x.fill();
    x.strokeStyle = vein; x.lineWidth = Math.max(1, wid * 0.08);
    x.beginPath(); x.moveTo(0, len * 0.05); x.lineTo(0, len * 0.9); x.stroke();
    x.restore();
  };
  // 0: a spray of round leaves (white; the vertex colour greens it), shaded a little towards the middle
  {
    const ox = 0, oy = 0;
    for (let i = 0; i < 26; i++) {
      const a = r() * Math.PI * 2, d = Math.pow(r(), 0.7) * S * 0.33;
      const g = 205 + Math.floor(r() * 50);
      leaf(ox + S / 2 + Math.cos(a) * d * 0.5, oy + S / 2 + Math.sin(a) * d * 0.5, 40 + r() * 36, 18 + r() * 12, a - Math.PI / 2, `rgb(${g},${g},${g})`);
    }
  }
  // 1: a fern frond, the stem up the middle, pinnae shrinking to the tip (drawn tip-up)
  {
    const ox = S, oy = 0;
    x.strokeStyle = 'rgb(190,190,190)'; x.lineWidth = 5;
    x.beginPath(); x.moveTo(ox + S / 2, oy + S - 4); x.quadraticCurveTo(ox + S / 2 + 6, oy + S / 2, ox + S / 2, oy + 6); x.stroke();
    for (let i = 0; i < 17; i++) {
      const t = i / 16, y = oy + S - 10 - t * (S - 22);
      const L = (1 - t * 0.85) * 92 + 6;
      for (const sd of [-1, 1]) {
        const g = 215 + Math.floor(r() * 40);
        x.save(); x.translate(ox + S / 2 + 2 * Math.sin(t * 3), y); x.rotate(sd * (1.15 - t * 0.35));
        x.fillStyle = `rgb(${g},${g},${g})`;
        x.beginPath(); x.moveTo(0, 0);
        // a pinna: a long leaflet with scalloped edges
        for (let k = 0; k <= 6; k++) { const u = k / 6; x.lineTo(-L * u, -7 * Math.sin(Math.PI * u) - 3 * Math.sin(u * 20)); }
        for (let k = 6; k >= 0; k--) { const u = k / 6; x.lineTo(-L * u, 7 * Math.sin(Math.PI * u) + 2 * Math.sin(u * 20)); }
        x.fill(); x.restore();
      }
    }
  }
  // 2: flowers, full colour: little white, cream and pink five-petal blooms with golden middles
  {
    const ox = S * 2, oy = 0;
    const petal = ['#fffaf2', '#fff4e6', '#ffffff', '#fde6ee', '#fff7dc'];
    for (let i = 0; i < 9; i++) {
      const a = r() * Math.PI * 2, d = Math.pow(r(), 0.6) * S * 0.3;
      const cx = ox + S / 2 + Math.cos(a) * d, cy = oy + S / 2 + Math.sin(a) * d;
      const R = 22 + r() * 14;
      x.fillStyle = 'rgb(120,160,80)';
      x.fillStyle = petal[Math.floor(r() * petal.length)];
      for (let k = 0; k < 5; k++) {
        x.save(); x.translate(cx, cy); x.rotate((k / 5) * Math.PI * 2 + a);
        x.beginPath(); x.ellipse(0, -R * 0.55, R * 0.36, R * 0.55, 0, 0, Math.PI * 2); x.fill(); x.restore();
      }
      x.fillStyle = '#e8b030'; x.beginPath(); x.arc(cx, cy, R * 0.26, 0, Math.PI * 2); x.fill();
      x.fillStyle = '#f6d060'; x.beginPath(); x.arc(cx - R * 0.06, cy - R * 0.06, R * 0.12, 0, Math.PI * 2); x.fill();
    }
  }
  // 3: a vine strip: a wandering stem top to bottom, heart-shaped leaves alternating off it (white)
  {
    const ox = 0, oy = S;
    x.strokeStyle = 'rgb(170,170,170)'; x.lineWidth = 4;
    x.beginPath();
    for (let k = 0; k <= 20; k++) { const t = k / 20; const px = ox + S / 2 + Math.sin(t * 7) * 10, py = oy + t * S; if (k) x.lineTo(px, py); else x.moveTo(px, py); }
    x.stroke();
    for (let i = 0; i < 13; i++) {
      const t = (i + 0.5) / 13, py = oy + t * S, px = ox + S / 2 + Math.sin(t * 7) * 10;
      const sd = i % 2 ? 1 : -1;
      const g = 200 + Math.floor(r() * 55);
      leaf(px, py, 46 + r() * 22, 26 + r() * 10, sd * (0.9 + r() * 0.5) - 0.2, `rgb(${g},${g},${g})`);
      if (r() < 0.5) leaf(px, py + 6, 30, 16, -sd * 1.2, `rgb(${g - 15},${g - 15},${g - 15})`);
    }
  }
  // 4: a lupin: a tall spike of purple pea-flowers paling to the tip, on a green stem with a fan of leaves
  {
    const ox = S, oy = S;
    x.strokeStyle = '#5f8a3a'; x.lineWidth = 6;
    x.beginPath(); x.moveTo(ox + S / 2, oy + S); x.lineTo(ox + S / 2, oy + 30); x.stroke();
    for (let k = 0; k < 7; k++) { x.save(); x.translate(ox + S / 2, oy + S - 30); x.rotate(-1.3 + k * 0.43); x.fillStyle = '#6f9a44'; x.beginPath(); x.ellipse(0, -26, 6, 26, 0, 0, Math.PI * 2); x.fill(); x.restore(); }
    for (let i = 0; i < 46; i++) {
      const t = i / 45, py = oy + S - 70 - t * (S - 100);
      const w = (1 - t) * 28 + 7;
      const px = ox + S / 2 + (r() - 0.5) * w * 1.4;
      const cA = [ [118, 88, 196], [150, 118, 220], [196, 176, 240] ];
      const c0 = cA[Math.min(2, Math.floor(t * 2.6 + r() * 0.5))];
      x.fillStyle = `rgb(${c0[0]},${c0[1]},${c0[2]})`;
      x.beginPath(); x.ellipse(px, py, 7 + (1 - t) * 4, 6, r() * 2, 0, Math.PI * 2); x.fill();
      if (r() < 0.4) { x.fillStyle = '#f4f0ff'; x.beginPath(); x.ellipse(px, py - 2, 3, 2.5, 0, 0, Math.PI * 2); x.fill(); }
    }
  }
  // 5: a tuft of long grass blades (white; tinted gold to green by the vertex colour)
  {
    const ox = S * 2, oy = S;
    for (let i = 0; i < 15; i++) {
      const bx = ox + S / 2 + (r() - 0.5) * 110, h = 110 + r() * 140, lean = (r() - 0.5) * 140;
      const g = 190 + Math.floor(r() * 65);
      x.fillStyle = `rgb(${g},${g},${g})`;
      x.beginPath(); x.moveTo(bx - 4, oy + S); x.quadraticCurveTo(bx + lean * 0.3, oy + S - h * 0.6, bx + lean, oy + S - h); x.quadraticCurveTo(bx + lean * 0.3 + 2, oy + S - h * 0.55, bx + 4, oy + S); x.fill();
    }
  }
  atlas = new THREE.CanvasTexture(c);
  atlas.colorSpace = THREE.SRGBColorSpace;
  atlas.anisotropy = 4;
  return atlas;
}

let cardMat: THREE.MeshToonMaterial | null = null;
let cardDepth: THREE.MeshDepthMaterial | null = null;
/**
 * The growth on Amble: alpha-tested cards from the atlas, vertex-coloured, double-sided. aSway (amount, phase)
 * swings the free-hanging ends of vines in the vertex shader (before skinning, so the sway rides the body).
 * No depth write, drawn after the body, like the Sky Isles' ivy: the screen ink then never traces every leaf.
 */
export function ambleCardMaterial(): THREE.MeshToonMaterial {
  if (cardMat) return cardMat;
  const m = paint(new THREE.MeshToonMaterial({
    color: '#ffffff', vertexColors: true, gradientMap: softRamp(), map: growthAtlas(), alphaTest: 0.5, side: THREE.DoubleSide,
    depthWrite: false,
  }), { variation: 0, rim: 1.1 });
  const base = m.onBeforeCompile;
  m.onBeforeCompile = (sh, r) => {
    base.call(m, sh, r);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 aSway; uniform float uTime;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        transformed += vec3(sin(uTime * 0.9 + aSway.y), 0.0, cos(uTime * 0.7 + aSway.y * 1.7)) * aSway.x;`);
  };
  m.customProgramCacheKey = () => 'ambleCards1';
  cardMat = m;
  return m;
}
/** Shadows for the cards (the leaf shapes, not their quads). */
export function ambleCardDepth(): THREE.MeshDepthMaterial {
  return (cardDepth ??= new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: growthAtlas(), alphaTest: 0.5 }));
}

export { PAINT };

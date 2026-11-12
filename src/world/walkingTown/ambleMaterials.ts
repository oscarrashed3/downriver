import * as THREE from 'three';
import { paint, softRamp, PAINT } from '../../render/paint';

// Materials for Old Amble: the body (stone-plated skin, pale hide, antler, moss, eyes) and the growth on it
// (vines, ferns, flowers, leaves: alpha-tested cards from one painted atlas). Both are the game's toon material
// with the painted look, so Amble lights with the world; both skin with the rig.
//
// The body's surface detail is painted in REST space (the bind-pose position), so the plates, cracks and moss
// never swim over the skin when Amble breathes or walks.

const BODY_GLSL = /* glsl */ `
  varying vec3 vRest; varying vec4 vSkin; varying float vFold; varying vec4 vDet; varying vec3 vDir;
  uniform float uBump;
  // the skin's height (metres) and how deep in a crease this fragment is, for the bump and the occlusion
  float ambH; float ambCav;
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
  // how much of a detail of wavelength wl (metres) to keep at fp metres per pixel (fades before it would shimmer)
  float aLod(float wl, float fp){ return 1.0 - smoothstep(0.25, 0.7, fp * 4.5 / wl); }
  // noise stretched along a direction: fine across it, long along it (fur strands, antler grain)
  // (a macro: pNoise is declared after this block)
  #define aStreak(p, d, across, along) pNoise((p) * (across) + (d) * dot((p), (d)) * ((along) - (across)))
  // a bump normal from a height field in metres (the screen-space derivative method)
  vec3 aPerturb(vec3 sp, vec3 sn, vec2 dH, float fd){
    vec3 sx = dFdx(sp), sy = dFdy(sp);
    vec3 r1 = cross(sy, sn), r2 = cross(sn, sx);
    float det = dot(sx, r1) * fd;
    vec3 g = sign(det) * (dH.x * r1 + dH.y * r2);
    return normalize(abs(det) * sn - g);
  }
`;

/** How strongly the skin's fine detail bumps the light (0 turns the bump off; the occlusion stays). */
export const AMBLE_BUMP = { value: 1.0 };

let bodyMat: THREE.MeshToonMaterial | null = null;
/** Old Amble's skin, shell, antlers and moss (one material, vertex-coloured, see ambleParts.ts for the attributes).
 * The fine detail is all made here, from the rest-space position: the wrinkles and folds along their fold lines, the
 * fine cracked hide of the legs, the strands and clumps of the fur, the grain of the antlers, the growth ridges of
 * the toenails; each is turned into a bump of the normal and into occlusion in its creases (and moss creeps into
 * the deepest folds); each fades out before it gets too small on screen to draw. */
export function ambleBodyMaterial(): THREE.MeshToonMaterial {
  if (bodyMat) return bodyMat;
  const m = paint(new THREE.MeshToonMaterial({ color: '#ffffff', vertexColors: true, gradientMap: softRamp() }), { variation: 0, rim: 0.7 });
  const base = m.onBeforeCompile;
  m.onBeforeCompile = (sh, r) => {
    base.call(m, sh, r);
    sh.uniforms.uMossA = { value: new THREE.Color('#5b7f34') };
    sh.uniforms.uMossB = { value: new THREE.Color('#a3bb58') };
    sh.uniforms.uBump = AMBLE_BUMP;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 aSkin; attribute float aFold; attribute vec4 aDet; attribute vec3 aDir;\nvarying vec3 vRest; varying vec4 vSkin; varying float vFold; varying vec4 vDet; varying vec3 vDir;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n  vRest = position; vSkin = aSkin; vFold = aFold; vDet = aDet; vDir = aDir;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uMossA, uMossB;\n' + BODY_GLSL)
      .replace('#include <color_fragment>', `#include <color_fragment>
        ambH = 0.0; ambCav = 0.0;
        {
          vec3 rp = vRest;
          float kind = vSkin.w;
          float rock = vSkin.x, mossW = vSkin.y, ao = vSkin.z;
          // (the eye's own skin values are its place on the eyeball instead: across, up, angle off its axis)
          bool isEye = kind > 2.5 && kind < 3.5;
          if (isEye) { rock = 0.0; mossW = -9.0; ao = 0.0; }
          float fp = max(length(fwidth(rp)), 1e-4);
          float n1 = pNoise(rp * 0.55), n2 = pNoise(rp * 2.1 + 7.0), n3 = pNoise(rp * 6.0 + 3.0);
          vec3 alb = diffuseColor.rgb;
          vec3 fdir = vDir; float fdl = length(fdir); fdir = fdl > 1e-3 ? fdir / fdl : vec3(0.0, 0.0, 1.0);

          // ---- wrinkles and folds along the fold coordinate: a rounded roll between two sharp creases, a finer
          // crease halfway, the creases fading in and out along their length
          if (vDet.x > 0.0 && !isEye) {
            float fwid = fwidth(vFold);
            float fw = vFold + (pNoise(rp * 0.7) - 0.5) * 0.35;
            float ff = fract(fw);
            float crease = 1.0 - smoothstep(0.0, 0.26, min(ff, 1.0 - ff));
            float roll = pow(max(sin(3.14159 * ff), 0.0), 0.6);
            float along = mix(0.35, 1.0, smoothstep(0.3, 0.65, pNoise(rp * 0.45 + 11.0)));
            float f2 = fract(fw * 2.0 + 0.5 + (pNoise(rp * 1.7) - 0.5) * 0.6);
            float c2 = 1.0 - smoothstep(0.0, 0.12, min(f2, 1.0 - f2));
            float l1 = 1.0 - smoothstep(0.1, 0.3, fwid), l2 = (1.0 - smoothstep(0.05, 0.15, fwid)) * clamp(vDet.x * 16.0 - 0.3, 0.0, 1.0);
            ambH += vDet.x * along * (l1 * (roll - 1.0) - 0.3 * c2 * l2);
            ambCav += (crease * 0.42 * l1 + c2 * 0.12 * l2) * along * clamp(vDet.x * 12.0, 0.0, 1.0);
          }
          // ---- cracked hide (an elephant's): a fine network of cracks, finer ones inside, a pebbly grain
          if (vDet.z > 0.0) {
            vec3 q = rp * 1.15 + vec3(pNoise(rp * 0.45), pNoise(rp * 0.45 + 3.1), pNoise(rp * 0.45 + 7.7)) * 1.8;
            float r1 = 1.0 - abs(pNoise(q) * 2.0 - 1.0);
            float r2 = 1.0 - abs(pNoise(q * 2.7 + 5.0) * 2.0 - 1.0);
            float cr1 = smoothstep(0.82, 0.965, r1) * aLod(0.8, fp);
            float cr2 = smoothstep(0.85, 0.97, r2) * aLod(0.3, fp);
            float peb = (pNoise(rp * 6.0) - 0.5) * aLod(0.16, fp);
            ambH += vDet.z * (-0.03 * cr1 - 0.012 * cr2 + 0.006 * peb);
            ambCav += vDet.z * (cr1 * 0.4 + cr2 * 0.2);
            alb *= 1.0 + vDet.z * (0.05 * peb + 0.06 * (n2 - 0.5));
          }
          // ---- fur: strands lying along the coat, gathered into soft clumps
          if (vDet.y > 0.0) {
            float sF = aStreak(rp, fdir, 15.0, 1.4), sC = aStreak(rp + 3.0, fdir, 4.2, 0.6);
            float lf = aLod(0.067, fp), lc = aLod(0.24, fp);
            // painted strokes: long, soft-edged dabs of lighter and darker hair laid along the coat, the way a
            // painter would brush it (big enough to read from a few metres)
            float pS = aStreak(rp + 9.0, fdir, 5.5, 0.6), pT = aStreak(rp + 2.3, fdir, 11.0, 1.1);
            float lp = aLod(0.18, fp), lt = aLod(0.09, fp);
            float dab = smoothstep(0.38, 0.62, pS) - 0.5, dab2 = smoothstep(0.4, 0.6, pT) - 0.5;
            ambH += vDet.y * (0.003 * (sF - 0.5) * lf + 0.01 * (sC - 0.5) * lc + 0.008 * dab * lp);
            alb *= 1.0 + vDet.y * ((sF - 0.5) * 0.12 * lf + (sC - 0.5) * 0.08 * lc + dab * 0.26 * lp + dab2 * 0.16 * lt);
          }

          if (kind < 0.5) {
            // stone: broken into plates by deep cracks, finer cracks inside each plate
            vec3 wq = vec3(pNoise(rp * 0.2), pNoise(rp * 0.2 + 5.3), pNoise(rp * 0.2 + 9.1)) - 0.5;
            vec3 v1 = aVor(rp * 0.42 + wq * 1.4);
            vec3 v2 = aVor(rp * 1.5 + 11.0 + wq * 3.0);
            float crack1 = 1.0 - smoothstep(0.02, 0.1, v1.y - v1.x);
            float crack2 = 1.0 - smoothstep(0.01, 0.06, v2.y - v2.x);
            alb *= mix(1.0, (0.9 + 0.16 * v1.z) * (1.0 - 0.22 * crack1) * (1.0 - 0.1 * crack2), rock);
            alb *= mix(1.0, 0.94 + 0.12 * smoothstep(0.0, 0.5, v1.y - v1.x), rock);
            alb *= 0.92 + 0.14 * n1 + 0.06 * n3;
          } else if (kind < 1.5) {
            // the coat: soft tonal drifts
            alb *= 0.96 + 0.06 * n2;
            alb = mix(alb, alb * vec3(1.03, 0.95, 0.84), smoothstep(0.45, 0.75, n1) * 0.3);
          } else if (kind < 2.5) {
            // antler: weathered bone like old driftwood: a grain running along it, long splits in the grain,
            // silvered where the weather has worn it, little dark pits
            float g1 = aStreak(rp, fdir, 7.0, 0.7), g2 = aStreak(rp + 4.0, fdir, 16.0, 1.2);
            float split = smoothstep(0.9, 0.98, 1.0 - abs(g1 * 2.0 - 1.0)) * aLod(0.3, fp);
            float lg = aLod(0.062, fp);
            ambH += 0.002 * (g2 - 0.5) * lg + 0.006 * (g1 - 0.5) * aLod(0.14, fp);
            ambCav += split * 0.2;
            alb *= (0.95 + 0.08 * g2 * lg + 0.04 * n1);
            alb = mix(alb, vec3(0.84, 0.82, 0.77), smoothstep(0.55, 0.8, n1) * 0.35);
          } else if (isEye) {
            // the eye: a deer's, big, dark and kind. A soft-edged horizontal pupil; a warm brown iris with fibres
            // and a golden ring round the pupil, darkening to a dark rim; the white only at the corners, pinker at
            // its very edge; the upper part of the eyeball in the shade of the heavy lid
            vec2 e2 = vSkin.xy; float ea = vSkin.z;
            float ang = atan(e2.y, e2.x), er = length(e2);
            float fib = pNoise(vec3(cos(ang) * 7.0, sin(ang) * 7.0, er * 8.0)) * 0.55 + pNoise(vec3(cos(ang) * 19.0, sin(ang) * 19.0, er * 3.0)) * 0.45;
            vec3 iris = mix(vec3(0.16, 0.085, 0.04), vec3(0.045, 0.026, 0.016), smoothstep(0.2, 0.7, ea)) * (0.75 + 0.5 * fib);
            iris = mix(iris, vec3(0.3, 0.17, 0.07), smoothstep(0.22, 0.3, ea) * (1.0 - smoothstep(0.3, 0.42, ea)) * 0.45);
            float pup = 1.0 - smoothstep(0.88, 1.06, length(e2 / vec2(0.4, 0.15)));
            vec3 ec = mix(iris, vec3(0.012, 0.008, 0.006), pup * step(ea, 1.2));
            ec = mix(ec, vec3(0.03, 0.018, 0.012), smoothstep(0.78, 0.9, ea));
            vec3 white = mix(vec3(0.42, 0.33, 0.27), vec3(0.36, 0.22, 0.18), smoothstep(1.0, 1.4, ea));
            ec = mix(ec, white, smoothstep(1.02, 1.18, ea));
            ec *= 1.0 - 0.5 * smoothstep(0.05, 0.55, e2.y);
            alb = ec;
          } else if (kind > 3.5 && kind < 4.5) {
            // toenails: horn, ridged across with growth lines, streaked along
            float rid = sin(vFold * 6.2832 + pNoise(rp * 3.0) * 2.0);
            float lr = 1.0 - smoothstep(0.08, 0.25, fwidth(vFold));
            ambH += 0.004 * rid * lr;
            alb *= 0.95 + 0.04 * rid * lr + 0.08 * pNoise(rp * vec3(6.0, 1.5, 6.0));
          } else if (kind > 5.5) {
            // the bare hide: warm grey, a little blotchy, browner in the creases
            alb *= 0.93 + 0.1 * n1 + 0.04 * n3;
            alb = mix(alb, alb * vec3(1.05, 0.98, 0.88), smoothstep(0.5, 0.8, n2) * 0.4);
          }
          // creases: dark, warmer, and the deepest folds of the bare hide catch moss
          alb = mix(alb, alb * vec3(0.6, 0.52, 0.46), clamp(ambCav, 0.0, 1.0) * 0.75);
          if (kind > 5.5) mossW += clamp(ambCav - 0.2, 0.0, 1.0) * 0.5 * smoothstep(0.35, 0.6, pNoise(rp * 0.3 + 2.0));
          // moss: a soft cushion texture, broken up at its edges so it creeps over the stone in ragged patches
          float mk = (kind > 4.5 && kind < 5.5) ? 1.0 : smoothstep(0.44, 0.6, mossW + (n1 - 0.5) * 0.55 + (n2 - 0.5) * 0.35);
          if (mk > 0.0) {
            vec3 mv = aVor(rp * 3.4 + 5.0);
            float drift = pNoise(rp * 0.11 + 4.0);
            vec3 mA = mix(uMossA, vec3(0.27, 0.40, 0.17), smoothstep(0.55, 0.8, drift) * 0.7);
            vec3 mB = mix(uMossB, vec3(0.74, 0.76, 0.33), smoothstep(0.25, 0.05, drift) * 0.8);
            vec3 mc = mix(mA, mB, clamp(n1 * 0.7 + n3 * 0.5 - 0.1, 0.0, 1.0));
            mc *= 0.8 + 0.32 * smoothstep(0.0, 0.55, mv.x);
            mc = mix(mc, vec3(0.78, 0.82, 0.42), smoothstep(0.82, 0.88, n3) * 0.6);
            mc = mix(mc, vec3(0.96, 0.92, 0.84), smoothstep(0.93, 0.95, pNoise(rp * 9.0)) * mk * 0.7);
            if (kind > 4.5 && kind < 5.5) mc = mix(mc, alb, 0.45);
            alb = mix(alb, mc, mk);
            // moss is soft: it lies over the creases and grows in little cushions
            ambH = mix(ambH, 0.04 * (pNoise(rp * 4.0) - 0.5) * aLod(0.25, fp), mk);
          }
          alb *= 1.0 - 0.55 * ao;
          diffuseColor.rgb = alb;
        }`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        normal = normalize(mix(normal, aPerturb(-vViewPosition, normal, vec2(dFdx(ambH), dFdy(ambH)) * uBump, faceDirection), 0.8));`)
      // wet things shine: the eyes (a sharp highlight of the sun, a soft window of sky reflected over the top of
      // the eyeball, both following the light and the view), and a softer sheen on the nose, lips and inner lids
      .replace('#include <dithering_fragment>', `#include <dithering_fragment>
        #if NUM_DIR_LIGHTS > 0
        if (vDet.w > 0.0) {
          bool wEye = vSkin.w > 2.5 && vSkin.w < 3.5;
          vec3 eV = normalize(vViewPosition);
          vec3 eN = normalize(normal);
          vec3 eH = normalize(directionalLights[0].direction + eV);
          float nh = max(dot(eN, eH), 0.0);
          float eS = wEye ? pow(nh, 120.0) * 2.2 + pow(nh, 24.0) * 0.22 : pow(nh, 30.0) * 0.4;
          vec3 eR = reflect(-eV, eN);
          vec3 vUp = normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz);
          float ry = dot(eR, vUp);
          float fres = 0.06 + 0.94 * pow(1.0 - max(dot(eN, eV), 0.0), 4.0);
          vec3 sky = mix(vec3(0.62, 0.66, 0.6), vec3(0.75, 0.85, 1.0), smoothstep(-0.1, 0.5, ry)) * smoothstep(-0.3, 0.3, ry);
          float win = wEye ? smoothstep(0.12, 0.3, ry) * (1.0 - smoothstep(0.8, 0.95, ry)) * 0.32 : 0.0;
          gl_FragColor.rgb += vDet.w * (vec3(1.0, 0.97, 0.9) * eS + sky * (fres * (wEye ? 0.5 : 0.25) + win));
        }
        #endif`);
  };
  m.customProgramCacheKey = () => 'ambleBody7';
  bodyMat = m;
  return m;
}

// ------------------------------------------------------------------------------------------------ growth atlas

/** The atlas cells (4 x 2): leaves, fern frond, flowers, a lock of long hair / vine strip, lupin, grass, a tuft
 * of short fur (rows of four; each row is drawn where cellOrigin puts it). */
export const CELL = { leaves: 0, fern: 1, flowers: 2, vine: 3, lupin: 4, grass: 5, lock: 6, tuft: 7 } as const;
const COLS = 4;
export function cellUV(cell: number, u: number, v: number): [number, number] {
  const cx = cell % COLS, cy = Math.floor(cell / COLS);
  return [(cx + u) / COLS, 1 - (cy + 1 - v) / 2];
}
/** Where a cell sits in the atlas canvas (pixels, top left). */
const cellOrigin = (cell: number, S: number): [number, number] => [(cell % COLS) * S, Math.floor(cell / COLS) * S];

let atlas: THREE.CanvasTexture | null = null;
function growthAtlas(): THREE.CanvasTexture {
  if (atlas) return atlas;
  const S = 256, c = document.createElement('canvas'); c.width = S * COLS; c.height = S * 2;
  const x = c.getContext('2d')!;
  let s = 19; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  // each cell is drawn clipped to its own square, so nothing bleeds into its neighbours
  x.save();
  const clipTo = (cell: number) => { x.restore(); x.save(); const [cx0, cy0] = cellOrigin(cell, S); x.beginPath(); x.rect(cx0, cy0, S, S); x.clip(); };
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
    clipTo(CELL.leaves);
    const [ox, oy] = cellOrigin(CELL.leaves, S);
    for (let i = 0; i < 26; i++) {
      const a = r() * Math.PI * 2, d = Math.pow(r(), 0.7) * S * 0.33;
      const g = 205 + Math.floor(r() * 50);
      leaf(ox + S / 2 + Math.cos(a) * d * 0.5, oy + S / 2 + Math.sin(a) * d * 0.5, 40 + r() * 36, 18 + r() * 12, a - Math.PI / 2, `rgb(${g},${g},${g})`);
    }
  }
  // 1: a fern frond, the stem up the middle, pinnae shrinking to the tip (drawn tip-up)
  {
    clipTo(CELL.fern);
    const [ox, oy] = cellOrigin(CELL.fern, S);
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
        for (let k = 0; k <= 6; k++) { const u = k / 6; x.lineTo(-L * u * sd, -7 * Math.sin(Math.PI * u) - 3 * Math.sin(u * 20)); }
        for (let k = 6; k >= 0; k--) { const u = k / 6; x.lineTo(-L * u * sd, 7 * Math.sin(Math.PI * u) + 2 * Math.sin(u * 20)); }
        x.fill(); x.restore();
      }
    }
  }
  // 2: flowers, full colour: little white, cream and pink five-petal blooms with golden middles
  {
    clipTo(CELL.flowers);
    const [ox, oy] = cellOrigin(CELL.flowers, S);
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
    clipTo(CELL.vine);
    const [ox, oy] = cellOrigin(CELL.vine, S);
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
    clipTo(CELL.lupin);
    const [ox, oy] = cellOrigin(CELL.lupin, S);
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
    clipTo(CELL.grass);
    const [ox, oy] = cellOrigin(CELL.grass, S);
    for (let i = 0; i < 15; i++) {
      const bx = ox + S / 2 + (r() - 0.5) * 110, h = 110 + r() * 140, lean = (r() - 0.5) * 140;
      const g = 190 + Math.floor(r() * 65);
      x.fillStyle = `rgb(${g},${g},${g})`;
      x.beginPath(); x.moveTo(bx - 4, oy + S); x.quadraticCurveTo(bx + lean * 0.3, oy + S - h * 0.6, bx + lean, oy + S - h); x.quadraticCurveTo(bx + lean * 0.3 + 2, oy + S - h * 0.55, bx + 4, oy + S); x.fill();
    }
  }
  // 6: a lock of long hair, painted: a soft solid lock from a broad root, parting near its end into three or four
  // curling points, with a few lighter and darker strokes of strands down it (white and greys; the vertex colour
  // tints it)
  {
    clipTo(CELL.lock);
    const [ox, oy] = cellOrigin(CELL.lock, S);
    const cx = ox + S / 2;
    const tips = [[-0.2, 0.86], [-0.05, 0.98], [0.1, 0.92], [0.24, 0.8]];
    x.fillStyle = 'rgb(225,225,225)';
    for (const [tx, ty] of tips) {
      const ex = cx + tx * S, ey = oy + ty * S;
      x.beginPath(); x.moveTo(cx - S * 0.34, oy);
      x.bezierCurveTo(cx - S * 0.32, oy + S * 0.4, ex - S * 0.1, ey - S * 0.3, ex, ey);
      x.bezierCurveTo(ex + S * 0.06, ey - S * 0.32, cx + S * 0.3, oy + S * 0.4, cx + S * 0.34, oy);
      x.fill();
    }
    // strands: darker between the locks, lighter down their middles
    for (let i = 0; i < 26; i++) {
      const u = (r() - 0.5) * 1.3, t = tips[Math.floor(r() * tips.length)];
      const g = r() < 0.5 ? 195 + Math.floor(r() * 25) : 240 + Math.floor(r() * 15);
      x.strokeStyle = `rgb(${g},${g},${g})`; x.lineWidth = 2 + r() * 3; x.lineCap = 'round';
      x.beginPath(); x.moveTo(cx + u * S * 0.26, oy + 4);
      x.quadraticCurveTo(cx + u * S * 0.2 + (r() - 0.5) * 20, oy + S * 0.5, cx + t[0] * S * (0.6 + 0.3 * r()), oy + t[1] * S * (0.75 + 0.2 * r()));
      x.stroke();
    }
  }
  // 7: a tuft of short fur fanning up from its base (white)
  {
    clipTo(CELL.tuft);
    const [ox, oy] = cellOrigin(CELL.tuft, S);
    for (let i = 0; i < 60; i++) {
      const a = (r() - 0.5) * 1.6, len = S * (0.45 + 0.45 * r()) * (1 - Math.abs(a) * 0.3);
      const bx = ox + S / 2 + (r() - 0.5) * S * 0.3, by = oy + S - 4;
      const g = Math.round(185 + 70 * r());
      x.strokeStyle = `rgb(${g},${g},${g})`; x.lineWidth = 2 + r() * 3; x.lineCap = 'round';
      x.beginPath(); x.moveTo(bx, by); x.quadraticCurveTo(bx + Math.sin(a) * len * 0.4, by - len * 0.55, bx + Math.sin(a) * len, by - Math.cos(a) * len); x.stroke();
    }
  }
  x.restore();
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
    sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_begin>', `#include <normal_fragment_begin>
        #ifdef DOUBLE_SIDED
          normal *= faceDirection;
        #endif`);
  };
  m.customProgramCacheKey = () => 'ambleCards2';
  cardMat = m;
  return m;
}
/** Shadows for the cards (the leaf shapes, not their quads). */
export function ambleCardDepth(): THREE.MeshDepthMaterial {
  return (cardDepth ??= new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: growthAtlas(), alphaTest: 0.5 }));
}

export { PAINT };

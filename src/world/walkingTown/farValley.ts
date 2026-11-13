// World 3, the Walking Town: the far valley for the wow shot. Amble's world is small (you can walk round it in a
// few minutes), so from a long lens far out in the meadow the land beyond it would drop away over the curve. For
// that one shot a painted distance stands behind it, as in Oscar's picture 1: a green valley with a winding river
// and a lake, a little town of cream walls and red roofs on a hill, blue hills, and two ranges of snowy mountains,
// each layer paler and bluer with the distance. It is made of a few flat layers facing the lens (one draw for the
// land and one for the town), placed just over the meadow's own horizon and carried with the camera.
import * as THREE from 'three';

const C = (h: string) => new THREE.Color(h);
const deg = Math.PI / 180;

/** A layer's silhouette: height (degrees over the horizon) at an azimuth (degrees, + to the right). */
type Sil = (az: number) => number;

function hash(n: number) { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); }
function vnoise(x: number) { const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f); return hash(i) * (1 - u) + hash(i + 1) * u; }
const fbm = (x: number) => vnoise(x) * 0.55 + vnoise(x * 2.3 + 7) * 0.28 + vnoise(x * 5.1 + 3) * 0.17;

export class FarValley {
  root = new THREE.Group();
  private pos: number[] = [];
  private col: number[] = [];
  private idx: number[] = [];

  constructor() {
    this.root.name = 'farValley';
    this.root.visible = false;
    const W = 46; // half the width covered, degrees (the long lens sees about +-26)
    // ---- the farthest range: faint and pale, nearly lost in the haze
    const peaksFarthest: [number, number, number][] = [[-42, 10.5, 0.7], [-30, 14.0, 0.75], [-14, 12.0, 0.7], [0, 15.5, 0.8], [12, 18.0, 0.85], [26, 13.5, 0.8], [42, 16.0, 0.8]];
    this.mountains(1000, W, peaksFarthest, 0.66, { rock: C('#b4c0de'), rockShade: C('#a2b0d4'), snow: C('#f6f8fc'), snowShade: C('#d6deef'), haze: C('#d2dcec') }, 5);
    // ---- the far range: tall, mostly snow
    const peaksFar: [number, number, number][] = [[-38, 9.5, 0.8], [-24, 12.0, 0.85], [-9, 10.0, 0.8], [5, 13.5, 0.9], [19, 21.0, 1.05], [33, 15.0, 0.95], [45, 12.0, 0.9]];
    this.mountains(860, W, peaksFar, 0.74, { rock: C('#93a2c8'), rockShade: C('#71819f'), snow: C('#fbfcff'), snowShade: C('#b9c5e2'), haze: C('#c3d1e8') }, 1);
    // ---- the near range: blue-grey, darker, the snow only on the tops
    const peaksNear: [number, number, number][] = [[-40, 6.5, 0.7], [-28, 8.0, 0.75], [-15, 6.2, 0.7], [-2, 8.5, 0.75], [11, 9.5, 0.8], [27, 12.0, 0.85], [40, 8.5, 0.8]];
    this.mountains(640, W, peaksNear, 0.8, { rock: C('#7688a8'), rockShade: C('#55637f'), snow: C('#f4f6fb'), snowShade: C('#aebbd8'), haze: C('#a9bad4') }, 2);
    // ---- the blue-green hills in front of the mountains, with woods on them
    const hillSil: Sil = az => 3.0 + 2.6 * fbm(az * 0.11 + 4) + 1.2 * Math.sin(az * 0.07 + 1);
    this.band(470, W, hillSil, C('#7a9c80'), C('#9ab8b0'), 3);
    this.copses(470, W, hillSil, 3, 26, 0.38, C('#58785e'), C('#8aa890'));
    // ---- the valley: rolling green and gold, copses and hedgerows of round trees along its fields
    const valSil: Sil = az => 1.0 + 0.9 * fbm(az * 0.12 + 9) + (az > 15 && az < 30 ? 1.4 * Math.sin(((az - 15) / 15) * Math.PI) : 0);
    this.band(330, W, valSil, C('#8fae58'), C('#b2c47e'), 4, C('#5f8240'));
    this.copses(330, W, valSil, 4, 34, 0.45, C('#4f7536'), C('#9cbc5c'));
    // ---- the lake, the river winding to it, catching the sky (just over the valley floor)
    this.lake(320, 10, 12, 0.35, 0.75);
    this.river(318);
    const land = new THREE.BufferGeometry();
    land.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    land.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    land.setIndex(this.idx);
    const mat = new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, toneMapped: false });
    const mesh = new THREE.Mesh(land, mat);
    mesh.frustumCulled = false; mesh.renderOrder = -1; mesh.userData.noOutline = true;
    this.root.add(mesh);
    this.root.add(this.town(312, 21, 0.6));
    this.root.add(this.cloudLayer());
  }

  /**
   * Put it behind the meadow's horizon for a camera at `cam` looking along `dirH` (level for the lens, whose up is
   * `up`): its own horizon goes where the planet's edge (radius `groundR`) stands in that direction.
   */
  place(cam: THREE.Vector3, dirH: THREE.Vector3, up: THREE.Vector3, center: THREE.Vector3, groundR: number) {
    const c = center.clone().sub(cam), L2 = c.lengthSq();
    const A = c.dot(dirH), B = c.dot(up), T = Math.sqrt(Math.max(0, L2 - groundR * groundR));
    const m = Math.hypot(A, B);
    // the two elevations whose rays just touch the ground's sphere; its edge in front is the upper one
    const e = Math.atan2(B, A) + Math.acos(THREE.MathUtils.clamp(T / m, -1, 1));
    const f = dirH.clone().multiplyScalar(Math.cos(e)).addScaledVector(up, Math.sin(e)).normalize();
    const u = up.clone().multiplyScalar(Math.cos(e)).addScaledVector(dirH, -Math.sin(e)).normalize();
    const z = f.clone().negate(), x = new THREE.Vector3().crossVectors(u, z).normalize();
    this.root.matrixAutoUpdate = false;
    this.root.matrix.makeBasis(x, u, z).setPosition(cam);
    this.root.matrixWorldNeedsUpdate = true;
  }

  // ------------------------------------------------------------------ building

  private v(d: number, az: number, el: number, c: THREE.Color) {
    this.pos.push(d * Math.tan(az * deg), d * Math.tan(el * deg), -d);
    this.col.push(c.r, c.g, c.b);
    return this.pos.length / 3 - 1;
  }

  /** A strip from under the horizon up to the silhouette, in `rows` rows, coloured by `paint(az, el, top)`. */
  private strip(d: number, W: number, sil: Sil, paint: (az: number, el: number, top: number, slope: number) => THREE.Color, n = 160, rows = [0, 1]) {
    const base = this.pos.length / 3;
    for (let i = 0; i <= n; i++) {
      const az = -W + (2 * W * i) / n;
      const top = sil(az), slope = (sil(az + 0.25) - sil(az - 0.25)) / 0.5;
      for (const f of rows) {
        const el = -14 + (top + 14) * f;
        this.v(d, az, el, paint(az, el, top, slope));
      }
    }
    const R = rows.length;
    for (let i = 0; i < n; i++) for (let j = 0; j < R - 1; j++) {
      const a = base + i * R + j, b = a + R;
      this.idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }

  private band(d: number, W: number, sil: Sil, low: THREE.Color, high: THREE.Color, seed: number, trees?: THREE.Color) {
    this.strip(d, W, sil, (az, el, top) => {
      const k = THREE.MathUtils.clamp((el + 3) / (top + 3), 0, 1);
      const c = low.clone().lerp(high, k * 0.8);
      // fields: soft stripes of gold and green across the valley, and hedgerows of darker trees
      if (trees) {
        const fld = vnoise(az * 0.6 + seed * 13 + Math.floor((el + 14) * 1.6) * 3.1);
        c.lerp(C('#c8c070'), fld > 0.62 ? 0.4 : 0);
        if (Math.abs(((el + 14) * 1.6) % 1 - 0.5) < 0.08) c.lerp(trees, 0.6);
        if (top - el < 0.18) c.lerp(trees, 0.5);
        // woods and copses scattered over it
        if (vnoise(az * 1.7 + el * 2.3 + seed * 7) * 0.7 + vnoise(az * 4.1 - el * 3.7) * 0.3 > 0.68) c.lerp(trees, 0.55);
      }
      return c;
    }, trees ? 360 : 180, trees ? [0, 0.3, 0.5, 0.6, 0.68, 0.74, 0.8, 0.85, 0.89, 0.93, 0.96, 1] : [0, 0.6, 1]);
  }

  private mountains(d: number, W: number, peaks: [number, number, number][], snowLine: number, P: { rock: THREE.Color; rockShade: THREE.Color; snow: THREE.Color; snowShade: THREE.Color; haze: THREE.Color }, seed: number) {
    // each peak a ridged pyramid; the range is the highest of them, with a jagged edge
    const sil: Sil = az => {
      let h = 1.2;
      for (const [x, hp, s] of peaks) {
        const dx = Math.abs(az - x);
        h = Math.max(h, hp - dx * s * (0.85 + 0.3 * vnoise(az * 0.7 + x)));
      }
      return h + 0.35 * (fbm(az * 0.9 + seed * 5) - 0.5) + 0.12 * (vnoise(az * 4 + seed) - 0.5);
    };
    // the lit side faces left (the sun is off to that side of the lens), the far side in soft blue shade; the
    // light turns over the ridges softly, gullies streak down the faces, the snow lies in a soft-edged cap, and the
    // range's foot sinks into the blue haze of the distance
    this.strip(d, W, sil, (az, el, top, slope) => {
      const lit = THREE.MathUtils.smoothstep(slope + 0.9 * (vnoise(az * 1.3 + seed * 9) - 0.5), -0.5, 0.5);
      const gully = THREE.MathUtils.smoothstep(vnoise(az * 3.1 + el * 0.25 + seed * 2), 0.55, 0.85);
      const line = top * snowLine + 1.1 * (vnoise(az * 1.6 + seed * 3) - 0.5) - (top > 7 ? 0.8 : 0) - gully * 0.9;
      const snow = THREE.MathUtils.smoothstep(el, line - 0.25, line + 0.35);
      const rock = P.rockShade.clone().lerp(P.rock, lit * 0.9).multiplyScalar(1 - 0.12 * gully);
      const sn = P.snowShade.clone().lerp(P.snow, lit).lerp(P.snowShade, gully * 0.35 * (1 - lit));
      const c = rock.lerp(sn, snow);
      // a little darker towards the top of the rock (the haze thins with height)
      const f = THREE.MathUtils.clamp((el + 1) / (top + 1), 0, 1);
      return c.lerp(P.haze, THREE.MathUtils.clamp(0.7 - f * 0.75, 0, 0.7));
    }, 320, [0, 0.2, 0.32, 0.42, 0.5, 0.56, 0.62, 0.67, 0.72, 0.76, 0.8, 0.84, 0.87, 0.9, 0.93, 0.95, 0.97, 0.985, 1]);
  }

  /** Round painterly trees: a dark crown with a sunlit cap, a soft shadow under it (a flat fan facing the lens). */
  private treeBlob(d: number, az: number, el: number, r: number, dark: THREE.Color, light: THREE.Color) {
    const base = this.pos.length / 3, n = 14;
    const ctr = this.v(d - 0.5, az - r * 0.15, el + r * 0.35, light);
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * Math.PI * 2;
      const wob = 1 + 0.12 * Math.sin(a * 5 + az);
      const up = Math.sin(a);
      this.v(d - 0.5, az + Math.cos(a) * r * wob, el + up * r * 0.85 * wob, up > 0.2 && Math.cos(a) < 0.3 ? dark.clone().lerp(light, 0.45) : dark);
    }
    for (let i = 0; i < n; i++) this.idx.push(ctr, base + 1 + i, base + 2 + i);
  }

  /** Copses and hedgerows over a band: clumps of round trees, and lines of them along field edges. */
  private copses(d: number, W: number, sil: Sil, seed: number, count: number, size: number, dark: THREE.Color, light: THREE.Color) {
    let s = seed * 9301 + 7;
    const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    for (let k = 0; k < count; k++) {
      const az = -W + r() * 2 * W, top = sil(az);
      const el = top - 0.2 - r() * Math.min(2.2, top + 0.8);
      const hedge = r() < 0.4;
      const m = hedge ? 7 : 2 + Math.floor(r() * 5);
      for (let j = 0; j < m; j++) {
        const rr = size * (0.6 + r() * 0.6);
        const a2 = hedge ? az + j * rr * 1.3 : az + (r() - 0.5) * size * 3;
        const e2 = hedge ? el + j * 0.03 : el + (r() - 0.5) * size;
        if (e2 > sil(a2) - 0.05) continue;
        this.treeBlob(d - j * 0.01, a2, e2 + rr * 0.5, rr, dark.clone().multiplyScalar(0.9 + r() * 0.2), light);
      }
    }
  }

  /** A big soft cumulus, painted once into a texture. */
  static cloudTexture() {
    const S = 256, cv = document.createElement('canvas'); cv.width = S * 2; cv.height = S;
    const g = cv.getContext('2d')!;
    let s = 11; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    // puffs: big ones low and wide, smaller ones heaped on top; each lit from the upper left, shaded underneath
    for (let pass = 0; pass < 2; pass++) for (let k = 0; k < 46; k++) {
      const t = k / 46;
      const x = S * (0.25 + 1.5 * r()), base = S * 0.78;
      const rad = S * (0.12 + 0.16 * r()) * (1 - 0.5 * Math.abs(x / S - 1));
      const y = base - rad * 0.4 - (1 - Math.abs(x / S - 1)) * S * 0.42 * r() * (0.4 + t);
      const gr = g.createRadialGradient(x - rad * 0.3, y - rad * 0.35, rad * 0.1, x, y, rad);
      if (pass === 0) { gr.addColorStop(0, 'rgba(206,214,232,0.9)'); gr.addColorStop(1, 'rgba(206,214,232,0)'); g.fillStyle = gr; g.beginPath(); g.arc(x, y + rad * 0.25, rad * 1.05, 0, Math.PI * 2); g.fill(); }
      else { gr.addColorStop(0, 'rgba(255,253,248,1)'); gr.addColorStop(0.6, 'rgba(246,244,244,0.85)'); gr.addColorStop(1, 'rgba(236,238,246,0)'); g.fillStyle = gr; g.beginPath(); g.arc(x, y, rad, 0, Math.PI * 2); g.fill(); }
    }
    // a flat, soft, shaded underside
    const ug = g.createLinearGradient(0, S * 0.6, 0, S * 0.9);
    ug.addColorStop(0, 'rgba(190,200,222,0)'); ug.addColorStop(1, 'rgba(190,200,222,0.55)');
    g.globalCompositeOperation = 'source-atop'; g.fillStyle = ug; g.fillRect(0, 0, S * 2, S);
    g.globalCompositeOperation = 'destination-out';
    const cut = g.createLinearGradient(0, S * 0.8, 0, S * 0.95); cut.addColorStop(0, 'rgba(0,0,0,0)'); cut.addColorStop(1, 'rgba(0,0,0,1)');
    g.fillStyle = cut; g.fillRect(0, S * 0.8, S * 2, S * 0.2);
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  private cloudLayer() {
    const tex = FarValley.cloudTexture();
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, fog: false, toneMapped: false });
    const grp = new THREE.Group();
    const at: [number, number, number, number][] = [[-30, 9, 70, 720], [-6, 14, 110, 900], [16, 8, 60, 700], [34, 15, 95, 920], [-44, 13, 80, 900], [4, 22, 80, 1100], [26, 24, 70, 1100]];
    for (const [az, el, w, d] of at) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, w * 0.5), mat);
      m.position.set(d * Math.tan(az * deg), d * Math.tan(el * deg), -d);
      m.renderOrder = -1; m.frustumCulled = false; m.userData.noOutline = true;
      grp.add(m);
    }
    return grp;
  }

  /** The lake: a long soft oval lying on the valley floor, a pale shore round it, the sky in it (lighter at its far
   * side, deeper blue near), the far hills' dark reflection along its back edge, and glints across it. */
  private lake(d: number, az0: number, half: number, el0: number, h: number) {
    const ring = (sc: number, cIn: (up: number) => THREE.Color, dz: number) => {
      const base = this.pos.length / 3, n = 48;
      const mid = this.v(d - dz, az0, el0, cIn(0));
      for (let i = 0; i <= n; i++) {
        const a = (i / n) * Math.PI * 2;
        const az = az0 + Math.cos(a) * half * sc * (1 + 0.12 * Math.sin(a * 3));
        const el = el0 + Math.sin(a) * h * sc * (Math.sin(a) > 0 ? 0.7 : 1);
        this.v(d - dz, az, el, cIn(Math.sin(a)));
      }
      for (let i = 0; i < n; i++) this.idx.push(mid, base + 1 + i, base + 2 + i);
    };
    ring(1.12, () => C('#b9c890'), 0);
    ring(1.0, up => C('#7fb2d2').lerp(C('#d4ecf6'), THREE.MathUtils.smoothstep(up, -0.6, 0.9)), 0.3);
    // the far hills mirrored along its back edge
    const b0 = this.pos.length / 3;
    this.v(d - 0.6, az0 - half * 0.85, el0 + h * 0.45, C('#7f9ea2')); this.v(d - 0.6, az0 + half * 0.85, el0 + h * 0.45, C('#7f9ea2'));
    this.v(d - 0.6, az0 + half * 0.7, el0 + h * 0.62, C('#93b4bc')); this.v(d - 0.6, az0 - half * 0.7, el0 + h * 0.62, C('#93b4bc'));
    this.idx.push(b0, b0 + 1, b0 + 2, b0, b0 + 2, b0 + 3);
    // glints
    for (const [a0, a1, e] of [[-0.6, 0.5, 0.04], [-0.3, 0.2, -0.22], [0.1, 0.6, 0.2]] as const) {
      const g0 = this.pos.length / 3;
      this.v(d - 1, az0 + half * a0, el0 + e, C('#f4fbff')); this.v(d - 1, az0 + half * a1, el0 + e, C('#f4fbff'));
      this.v(d - 1, az0 + half * a1, el0 + e + 0.05, C('#e8f6ff')); this.v(d - 1, az0 + half * a0, el0 + e + 0.05, C('#e8f6ff'));
      this.idx.push(g0, g0 + 1, g0 + 2, g0, g0 + 2, g0 + 3);
    }
  }

  /** The river, winding from the right across the valley into the lake. */
  private river(d: number) {
    const pts: [number, number][] = [];
    for (let i = 0; i <= 40; i++) { const t = i / 40; pts.push([-40 + t * 41, 1.2 - 0.85 * t + 0.3 * Math.sin(t * 9)]); }
    for (let i = 0; i < pts.length - 1; i++) {
      const [a0, e0] = pts[i], [a1, e1] = pts[i + 1], w = 0.05 + 0.06 * (1 - i / 40);
      const b = this.pos.length / 3;
      this.v(d, a0, e0 - w, C('#9fcbe0')); this.v(d, a1, e1 - w, C('#9fcbe0')); this.v(d, a1, e1 + w, C('#b9dcec')); this.v(d, a0, e0 + w, C('#b9dcec'));
      this.idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
    }
  }

  /** The little town on its hill: cream walls, red roofs, a white church tower (one mesh). */
  private town(d: number, az0: number, el0: number) {
    const pos: number[] = [], col: number[] = [], idx: number[] = [];
    const quad = (p: [number, number][], c: THREE.Color, dz = 0) => {
      const b = pos.length / 3;
      for (const [az, el] of p) { pos.push((d - dz) * Math.tan(az * deg), (d - dz) * Math.tan(el * deg), -(d - dz)); col.push(c.r, c.g, c.b); }
      if (p.length === 4) idx.push(b, b + 1, b + 2, b, b + 2, b + 3); else idx.push(b, b + 1, b + 2);
    };
    let s = 7;
    const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    const walls = [C('#efe2c6'), C('#e6d4b2'), C('#f4ead6')], roofs = [C('#c4643e'), C('#b0553a'), C('#d07a4c')];
    // houses stepping up the hill, a few rows deep (the back rows higher and a little bluer)
    for (let row = 0; row < 3; row++) {
      for (let i = 0; i < 9 - row * 2; i++) {
        const az = az0 - 4 + row * 0.9 + i * (0.9 + r() * 0.25), w = 0.28 + r() * 0.22, h = 0.22 + r() * 0.14;
        const hill = Math.sin(THREE.MathUtils.clamp((az - (az0 - 5)) / 10, 0, 1) * Math.PI) * 0.9;
        const el = el0 - 1.0 + hill + row * 0.32;
        const haze = row * 0.12, wc = walls[Math.floor(r() * 3)].clone().lerp(C('#c8d4e4'), haze), rc = roofs[Math.floor(r() * 3)].clone().lerp(C('#b8a8b8'), haze);
        const dz = (2 - row) * 0.5;
        quad([[az - w, el], [az + w, el], [az + w, el + h], [az - w, el + h]], wc, dz);
        quad([[az - w - 0.06, el + h], [az + w + 0.06, el + h], [az, el + h + 0.22 + r() * 0.1]], rc, dz);
        // a window or two
        quad([[az - w * 0.4, el + h * 0.35], [az - w * 0.2, el + h * 0.35], [az - w * 0.2, el + h * 0.6], [az - w * 0.4, el + h * 0.6]], C('#7a6a5a').lerp(C('#c8d4e4'), haze), dz + 0.01);
      }
    }
    // the church tower and its spire
    const ta = az0 + 2.4, te = el0 + 0.2;
    quad([[ta - 0.22, te - 0.6], [ta + 0.22, te - 0.6], [ta + 0.22, te + 1.3], [ta - 0.22, te + 1.3]], C('#f6efe0'), 1.6);
    quad([[ta - 0.27, te + 1.3], [ta + 0.27, te + 1.3], [ta, te + 2.0]], C('#a84e36'), 1.6);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, toneMapped: false, side: THREE.DoubleSide }));
    m.frustumCulled = false; m.renderOrder = -1; m.userData.noOutline = true;
    return m;
  }
}

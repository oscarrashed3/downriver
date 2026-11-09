import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { NOISE_GLSL, PAINT } from '../../render/paint';

/**
 * A far floating island crowned with castle ruins (picture 1): a keep and a cluster of varied towers (round with
 * tall cone roofs, square and crenellated, one slender spire, one broken), a two-tier arched arcade along its
 * front rim with the sky showing through, a rocky cliff underside that tapers to a ragged point, waterfalls
 * streaking down it, and trees round the rim. It is backdrop, seen hundreds of metres away through blue haze, so
 * it is one merged mesh with vertex colours and a cheap lit-and-hazed shader (lighter at the top, bluer at the
 * base). Units: metres; the island is ~120 m wide, its arcade faces +Z.
 */

const COL = {
  rock: '#e9d6ae', rockDark: '#cdb48c', grass: '#a3c873', tree: '#74a45c', treeDark: '#5d8c50',
  stone: '#f2e8d4', stoneShade: '#e2d4bc', roof: '#8c9fcf', roofWarm: '#c98d74', fall: '#ffffff',
};

function colorize(g: THREE.BufferGeometry, hex: string, jitter = 0, rnd?: () => number, emissive = 0) {
  const c = new THREE.Color(hex);
  const n = g.getAttribute('position').count;
  const a = new Float32Array(n * 3), e = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const k = 1 + (rnd ? (rnd() - 0.5) * jitter : 0);
    a[i * 3] = c.r * k; a[i * 3 + 1] = c.g * k; a[i * 3 + 2] = c.b * k;
    e[i] = emissive;
  }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  g.setAttribute('aGlow', new THREE.BufferAttribute(e, 1));
  return g;
}
function prep(g: THREE.BufferGeometry) {
  const ng = g.index ? g.toNonIndexed() : g;
  for (const k of Object.keys(ng.attributes)) if (k !== 'position' && k !== 'normal') ng.deleteAttribute(k);
  ng.computeVertexNormals();
  return ng;
}

/** An arcade: a wall with `n` round-headed arches cut through it, standing on y = 0, centred on x, `depth` thick. */
function arcade(width: number, height: number, depth: number, n: number, archH = 0.72) {
  const s = new THREE.Shape();
  s.moveTo(-width / 2, 0); s.lineTo(width / 2, 0); s.lineTo(width / 2, height); s.lineTo(-width / 2, height); s.closePath();
  const bay = width / n, aw = bay * 0.66, ah = height * archH;
  for (let i = 0; i < n; i++) {
    const cx = -width / 2 + bay * (i + 0.5);
    const h = new THREE.Path();
    h.moveTo(cx - aw / 2, 0); h.lineTo(cx + aw / 2, 0); h.lineTo(cx + aw / 2, ah - aw / 2);
    h.absarc(cx, ah - aw / 2, aw / 2, 0, Math.PI, false);
    h.lineTo(cx - aw / 2, 0);
    s.holes.push(h);
  }
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false, curveSegments: 8 });
  g.translate(0, 0, -depth / 2);
  return g;
}

export function farIsleGeometry(seed = 3): THREE.BufferGeometry {
  let s = seed * 9301 + 49297;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const parts: THREE.BufferGeometry[] = [];
  const add = (g: THREE.BufferGeometry, hex: string, jitter = 0.08, glow = 0) => parts.push(colorize(prep(g), hex, jitter, r, glow));

  // the rock: a lathe that bulges under the rim, then tapers to a ragged point, carved into cliff buttresses
  const prof: THREE.Vector2[] = [];
  const N = 22, depth = 120, R0 = 60;
  for (let i = 0; i <= N; i++) {
    const f = i / N;
    const rad = R0 * (f < 0.12 ? 1 + f * 0.6 : 1.07 * Math.pow(1 - (f - 0.12) / 0.88, 1.35)) + 1.2;
    prof.push(new THREE.Vector2(rad, -f * depth));
  }
  prof.reverse();
  const rock = new THREE.LatheGeometry(prof, 56);
  const rp = rock.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < rp.count; i++) {
    const x = rp.getX(i), y = rp.getY(i), z = rp.getZ(i);
    const a = Math.atan2(z, x);
    // vertical buttresses and gullies, ledges, and a ragged, off-centre point
    const ridge = 0.1 * Math.abs(Math.sin(a * 7 + Math.sin(y * 0.05) * 0.6)) + 0.06 * Math.sin(a * 17 + y * 0.03);
    const ledge = y < -8 ? 0.05 * Math.sin(y * 0.35 + a * 2) : 0;
    const k = 0.9 + ridge + ledge;
    const lean = Math.max(0, -y - 40) * 0.12;
    rp.setXYZ(i, x * k + lean, y, z * k - lean * 0.4);
  }
  const rc = colorize(prep(rock), COL.rock, 0.12, r);
  // darker, warmer rock in the gullies and low down
  const pc = rc.getAttribute('position'), cc = rc.getAttribute('color') as THREE.BufferAttribute, nn = rc.getAttribute('normal');
  const dark = new THREE.Color(COL.rockDark);
  for (let i = 0; i < pc.count; i++) {
    const y = pc.getY(i), a = Math.atan2(pc.getZ(i), pc.getX(i));
    const g = Math.max(0, Math.sin(a * 7 + Math.sin(y * 0.05) * 0.6)) < 0.25 ? 0.6 : 0;
    const k = Math.min(1, g + Math.max(0, -y - 20) / 140 + (nn.getY(i) < -0.6 ? 0.2 : 0));
    cc.setXYZ(i, cc.getX(i) + (dark.r - cc.getX(i)) * k, cc.getY(i) + (dark.g - cc.getY(i)) * k, cc.getZ(i) + (dark.b - cc.getZ(i)) * k);
  }
  parts.push(rc);
  // the green cap, a little domed, with grass spilling over the rim
  const cap = new THREE.CylinderGeometry(R0 * 1.06, R0 * 1.07, 5, 56, 1);
  cap.translate(0, 0.5, 0);
  add(cap, COL.grass, 0.1);
  const dome = new THREE.SphereGeometry(R0 * 1.0, 40, 8, 0, Math.PI * 2, 0, 0.32);
  dome.scale(1, 0.25, 1); dome.translate(0, -12.5, 0);
  add(dome, COL.grass, 0.12);
  for (let k = 0; k < 8; k++) {
    // hanging green on the cliff tops
    const a = r() * Math.PI * 2, w = 5 + r() * 5;
    const g = new THREE.SphereGeometry(w, 10, 6); g.scale(1, 0.8 + r() * 0.6, 0.4); g.rotateY(-a + Math.PI / 2);
    g.translate(Math.cos(a) * R0 * 1.02, -4 - r() * 6, Math.sin(a) * R0 * 1.02);
    add(g, COL.tree, 0.15);
  }

  // the castle, toward the back of the island: a keep, and towers of many kinds
  // (the keep)
  const keep = new THREE.BoxGeometry(24, 30, 20); keep.translate(-4, 17, -18); add(keep, COL.stone);
  const keepRoof = new THREE.ConeGeometry(17.5, 16, 4); keepRoof.rotateY(Math.PI / 4); keepRoof.translate(-4, 40, -18); add(keepRoof, COL.roof, 0.04);
  const hall = new THREE.BoxGeometry(34, 16, 14); hall.translate(14, 10, -6); add(hall, COL.stoneShade);
  const hallRoof = new THREE.CylinderGeometry(0.01, 10, 34, 3, 1); hallRoof.rotateZ(Math.PI / 2); hallRoof.scale(1, 0.7, 1); hallRoof.translate(14, 21, -6); add(hallRoof, COL.roofWarm, 0.05);
  // [x, z, radius, height, kind] kind: 0 cone roof, 1 crenellated, 2 broken, 3 slender spire
  const towers: [number, number, number, number, number][] = [
    [-22, -26, 5.5, 46, 0], [12, -28, 4.5, 56, 0], [26, -10, 4.2, 34, 1], [-30, -2, 4.5, 30, 2],
    [-6, -36, 3, 72, 3], [32, -26, 3.6, 42, 0], [-18, -12, 3.4, 38, 1], [4, -8, 3.8, 26, 2],
  ];
  for (const [x, z, rad, h, kind] of towers) {
    const square = kind === 1 && r() < 0.5;
    const tw = square ? new THREE.BoxGeometry(rad * 2, h, rad * 2) : new THREE.CylinderGeometry(rad, rad * 1.1, h, 14);
    tw.translate(x, h / 2 + 2, z); add(tw, COL.stone);
    if (kind === 0 || kind === 3) {
      const c = new THREE.ConeGeometry(rad * (kind === 3 ? 1.25 : 1.4), rad * (kind === 3 ? 5.5 : 3), 14);
      c.translate(x, h + 2 + rad * (kind === 3 ? 2.75 : 1.5), z); add(c, kind === 3 ? COL.roofWarm : COL.roof, 0.04);
      // a ring of corbels under the roof
      const band = new THREE.CylinderGeometry(rad * 1.18, rad * 1.05, 2, 14); band.translate(x, h + 1.5, z); add(band, COL.stoneShade);
    } else {
      // crenellations; a broken tower keeps only a few, at different heights
      const nCr = square ? 8 : 7;
      for (let k = 0; k < nCr; k++) {
        if (kind === 2 && r() < 0.5) continue;
        const a = (k / nCr) * Math.PI * 2;
        const hh = kind === 2 ? 1 + r() * 6 : 3;
        const b = new THREE.BoxGeometry(rad * 0.55, hh, rad * 0.55);
        b.translate(x + Math.cos(a) * rad * 0.85, h + 2 + hh / 2, z + Math.sin(a) * rad * 0.85); add(b, COL.stone);
      }
    }
    // a few dark windows
    for (let k = 0; k < 2; k++) {
      const wy = h * (0.5 + k * 0.25);
      const w = new THREE.BoxGeometry(rad * 0.4, rad * 0.9, 0.6); w.translate(x, wy, z + rad * (square ? 1.0 : 1.02)); add(w, '#6a6f94', 0.05);
    }
  }
  // the curtain wall behind, broken in places
  for (let k = 0; k < 9; k++) {
    if (k === 3 || k === 6) continue;
    const a = Math.PI + 0.25 + k * 0.33, R = 44;
    const h = 9 + r() * 6 * (k % 3 === 0 ? 0.3 : 1);
    const w = new THREE.BoxGeometry(15, h, 2.6); w.rotateY(-a + Math.PI / 2); w.translate(Math.cos(a) * R, h / 2 + 2, Math.sin(a) * R); add(w, COL.stoneShade);
  }

  // the arcade along the front rim: two tiers, like an old aqueduct, running off onto a rock pinnacle
  const ax = 6, az = 42;
  const arc1 = arcade(78, 24, 5, 6, 0.74); arc1.translate(ax, 1, az); add(arc1, COL.stone, 0.05);
  const deck = new THREE.BoxGeometry(80, 2, 6.4); deck.translate(ax, 25.8, az); add(deck, COL.stoneShade, 0.04);
  const arc2 = arcade(78, 15, 4, 10, 0.68); arc2.translate(ax, 26.8, az); add(arc2, COL.stone, 0.05);
  const cop = new THREE.BoxGeometry(80, 1.4, 5.4); cop.translate(ax, 42.4, az); add(cop, COL.stoneShade, 0.04);
  // the pinnacle under its far end
  const pin = new THREE.ConeGeometry(14, 70, 10, 4); pin.rotateX(Math.PI); pin.translate(ax + 46, -34, az + 2); add(pin, COL.rockDark, 0.12);
  const pinTop = new THREE.CylinderGeometry(14.5, 14, 3, 10); pinTop.translate(ax + 46, 0, az + 2); add(pinTop, COL.grass, 0.1);
  const arcEnd = arcade(16, 24, 5, 1, 0.74); arcEnd.translate(ax + 46, 1, az); add(arcEnd, COL.stone, 0.05);

  // trees: round crowns round the walls and along the rim
  for (let k = 0; k < 26; k++) {
    const a = r() * Math.PI * 2, d = 26 + r() * 32;
    const sz = 4 + r() * 5;
    const t = new THREE.IcosahedronGeometry(sz, 1); t.scale(1, 0.9, 1); t.translate(Math.cos(a) * d, 2 + sz * 0.7, Math.sin(a) * d);
    add(t, r() < 0.5 ? COL.tree : COL.treeDark, 0.18);
  }
  // waterfalls: bright streaks spilling off the rim (they glow a little and fade out below, in the shader)
  const falls: [number, number, number][] = [[0.55, 9, 110], [2.3, 6, 90], [-0.9, 5, 70]];
  for (const [a, w, len] of falls) {
    const f = new THREE.PlaneGeometry(w, len, 1, 6); f.translate(0, -len / 2, 0);
    const p = f.getAttribute('position') as THREE.BufferAttribute;
    // the curtain bows out from the cliff as it falls, and widens
    for (let i = 0; i < p.count; i++) { const y = p.getY(i); p.setXYZ(i, p.getX(i) * (1 + -y / len * 0.8), y, Math.pow(-y / len, 1.5) * 10); }
    f.rotateY(Math.PI / 2 - a); f.translate(Math.cos(a) * (R0 + 3), 2, Math.sin(a) * (R0 + 3));
    add(f, COL.fall, 0.02, 1);
  }

  const g = mergeGeometries(parts)!;
  for (const p of parts) p.dispose();
  g.computeBoundingSphere();
  return g;
}

/** The hazed material for far backdrop solids: soft sun, sky fill, a value gradient, and a pull toward the haze. */
export function farMaterial() {
  return new THREE.ShaderMaterial({
    side: THREE.DoubleSide, vertexColors: true,
    // drawn between the far sea's puffs without writing depth (no ink through the clouds); its triangles are pre-sorted
    transparent: true, depthWrite: false,
    uniforms: {
      uFloorY: { value: -1e4 },
      uSun: PAINT.uSun,
      uHaze: { value: new THREE.Color('#bcd2ec') },
      uHazeK: { value: 0.42 },
      uShade: { value: new THREE.Color('#7f8fc8') },
      uLight: { value: new THREE.Color('#fff6e8') },
    },
    vertexShader: /* glsl */ `
      attribute float aGlow;
      varying vec3 vC; varying vec3 vN; varying vec3 vW; varying float vLy; varying float vGlow;
      void main(){
        vC = color; vLy = position.y; vGlow = aGlow; vN = normalize(mat3(modelMatrix) * normal);
        vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uSun, uHaze, uShade, uLight; uniform float uHazeK, uFloorY;
      varying vec3 vC; varying vec3 vN; varying vec3 vW; varying float vLy; varying float vGlow;
      ${NOISE_GLSL}
      void main(){
        vec3 N = normalize(vN);
        if (!gl_FrontFacing) N = -N;
        float l = smoothstep(-0.15, 0.45, dot(N, uSun));
        vec3 col = mix(vC * uShade * 1.12, vC * uLight * 1.06, l);
        col *= 0.94 + pNoise(vW * 0.08) * 0.12;
        // waterfalls: bright, fading to mist as they fall
        col = mix(col, vec3(1.05, 1.06, 1.08), vGlow * 0.8);
        // a value gradient: lighter at the top, cooler and hazier toward the base, where it sinks into the cloud sea
        float low = smoothstep(10.0, -110.0, vLy);
        col = mix(col, col * vec3(0.9, 0.95, 1.08), low * 0.6);
        float hk = uHazeK + (1.0 - uHazeK) * 0.55 * low;
        float a = smoothstep(uFloorY - 4.0, uFloorY + 18.0, vLy) * (1.0 - vGlow * smoothstep(-30.0, -100.0, vLy));
        gl_FragColor = vec4(mix(col, uHaze, clamp(hk, 0.0, 0.95)), a);
      }`,
  });
}

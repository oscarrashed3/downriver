import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { NOISE_GLSL, PAINT } from '../../render/paint';

/**
 * A far floating island crowned with castle ruins (picture 1), built for its silhouette at 600-1000 m through
 * blue haze: a tall rock underside tapering in steps to a ragged point, with moss on its ledges and several thin
 * waterfalls; stepped green terraces held by stone walls, with greenery cascading over every edge; a cluster of
 * towers of varied height (cone roofs, a slender spire, crenellated and broken ones) round a keep; a two-tier
 * arcade on the front terrace; and a long arched viaduct striding out to a rock pinnacle with its own tower.
 * One merged mesh with vertex colours and a cheap lit-and-hazed shader (warm stone with a value gradient, lighter
 * at the top, bluer toward the base). Units: metres; the island is ~110 m wide, its arcade faces +Z.
 * geometry.userData.falls holds the foot of each waterfall (local), for mist.
 */

const COL = {
  rock: '#ead2a6', rockDark: '#c4a07a', rockLow: '#b49a86', moss: '#8db866', grass: '#9cc86c', grassDeep: '#7eae5a',
  tree: '#6f9f58', treeDark: '#557f48', stone: '#f1e2c4', stoneShade: '#dcc8a4', wall: '#e4cfa8',
  roof: '#8597c8', roofWarm: '#c98d74', fall: '#ffffff',
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
  const R0 = 55, depth = 175;

  // ---- the rock: bulges under the rim, then tapers in steps (ledges) to a ragged, off-centre point,
  // carved into buttresses and gullies; moss on the ledges and under the rim, warmer and darker low down
  const prof: THREE.Vector2[] = [];
  const N = 30;
  for (let i = 0; i <= N; i++) {
    const f = i / N;
    let rad = f < 0.08 ? 1 + f * 0.8 : 1.06 * Math.pow(1 - (f - 0.08) / 0.92, 1.15);
    // steps: the taper pauses at a few ledges
    rad *= 1 + 0.06 * Math.max(0, Math.sin(f * 22));
    prof.push(new THREE.Vector2(R0 * rad + 0.8, -f * depth));
  }
  prof.reverse();
  const rock = new THREE.LatheGeometry(prof, 64);
  const rp = rock.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < rp.count; i++) {
    const x = rp.getX(i), y = rp.getY(i), z = rp.getZ(i);
    const a = Math.atan2(z, x);
    const ridge = 0.12 * Math.abs(Math.sin(a * 6 + Math.sin(y * 0.04) * 0.7)) + 0.06 * Math.sin(a * 15 + y * 0.05);
    const k = 0.88 + ridge;
    const lean = Math.max(0, -y - 70) * 0.14;
    rp.setXYZ(i, x * k + lean, y, z * k - lean * 0.3);
  }
  const rc = colorize(prep(rock), COL.rock, 0.1, r);
  const pc = rc.getAttribute('position'), cc = rc.getAttribute('color') as THREE.BufferAttribute, nn = rc.getAttribute('normal');
  const dark = new THREE.Color(COL.rockDark), low = new THREE.Color(COL.rockLow), moss = new THREE.Color(COL.moss);
  const tmp = new THREE.Color();
  for (let i = 0; i < pc.count; i++) {
    const y = pc.getY(i), a = Math.atan2(pc.getZ(i), pc.getX(i));
    tmp.setRGB(cc.getX(i), cc.getY(i), cc.getZ(i));
    // gullies darker, the lower rock warmer and duskier
    const gully = Math.abs(Math.sin(a * 6 + Math.sin(y * 0.04) * 0.7)) < 0.3 ? 0.5 : 0;
    tmp.lerp(dark, gully);
    tmp.lerp(low, Math.min(1, Math.max(0, (-y - 30) / 130)) * 0.8);
    // moss: on the ledges (faces turned up) and in a ragged band under the rim
    const ledge = nn.getY(i) > 0.15 ? 0.8 : 0;
    const band = y > -14 - 8 * Math.abs(Math.sin(a * 5)) ? 0.85 : 0;
    tmp.lerp(moss, Math.max(ledge, band) * (0.75 + 0.25 * Math.sin(a * 13)));
    cc.setXYZ(i, tmp.r, tmp.g, tmp.b);
  }
  parts.push(rc);
  // hanging greenery: curtains of green spilling over the rim and the ledges
  for (let k = 0; k < 22; k++) {
    const a = r() * Math.PI * 2, w = 5 + r() * 7, yy = k < 14 ? -2 - r() * 6 : -30 - r() * 60;
    const rad = yy > -10 ? R0 * 1.04 : R0 * (1.06 * Math.pow(1 - (-yy / depth - 0.08) / 0.92, 1.15)) * 0.92;
    const g = new THREE.SphereGeometry(w, 8, 6); g.scale(1, 1.3 + r() * 1.2, 0.35); g.rotateY(-a + Math.PI / 2);
    g.translate(Math.cos(a) * rad, yy - w * 0.6, Math.sin(a) * rad);
    add(g, r() < 0.5 ? COL.tree : COL.grassDeep, 0.15);
  }

  // ---- the terraces: three steps rising toward the back, each held by a stone wall with green on top
  const tiers: [number, number, number, number][] = [
    // [radius, centre z, top y, wall height]
    [R0 * 1.04, 0, 1.5, 4],
    [36, -10, 11, 9.5],
    [22, -18, 20, 9],
  ];
  for (const [rad, cz, ty, wh] of tiers) {
    const wall = new THREE.CylinderGeometry(rad, rad * 1.02, wh, 48, 1, true); wall.translate(0, ty - wh / 2, cz);
    add(wall, ty < 5 ? COL.grass : COL.wall, 0.08);
    const top = new THREE.CylinderGeometry(rad * 1.01, rad * 1.01, 1.2, 48); top.translate(0, ty, cz);
    add(top, COL.grass, 0.12);
    // greenery tumbling over the wall
    const nG = Math.round(rad / 4);
    for (let k = 0; k < nG; k++) {
      const a = r() * Math.PI * 2, w = 2.5 + r() * 3;
      const g = new THREE.SphereGeometry(w, 8, 6); g.scale(1, 1 + r(), 0.5); g.rotateY(-a + Math.PI / 2);
      g.translate(Math.cos(a) * rad * 1.01, ty - w * 0.5, cz + Math.sin(a) * rad * 1.01);
      add(g, r() < 0.5 ? COL.tree : COL.grassDeep, 0.15);
    }
  }

  // ---- the castle on the top terraces: a keep and a cluster of towers of varied height
  const keep = new THREE.BoxGeometry(18, 26, 16); keep.translate(-2, 20 + 13, -20); add(keep, COL.stone);
  const keepRoof = new THREE.ConeGeometry(13.5, 14, 4); keepRoof.rotateY(Math.PI / 4); keepRoof.translate(-2, 46 + 7, -20); add(keepRoof, COL.roof, 0.04);
  const hall = new THREE.BoxGeometry(28, 13, 12); hall.translate(14, 11 + 6.5, -8); add(hall, COL.stoneShade);
  const hallRoof = new THREE.CylinderGeometry(0.01, 8.5, 28, 3, 1); hallRoof.rotateZ(Math.PI / 2); hallRoof.scale(1, 0.7, 1); hallRoof.translate(14, 27.5, -8); add(hallRoof, COL.roofWarm, 0.05);
  // [x, z, radius, base y, height, kind] kind: 0 cone roof, 1 crenellated, 2 broken, 3 slender spire
  const towers: [number, number, number, number, number, number][] = [
    [-16, -24, 4.8, 20, 34, 0], [10, -26, 4.2, 20, 44, 0], [24, -12, 3.8, 11, 30, 1], [-28, -6, 4.2, 11, 22, 2],
    [-4, -32, 2.6, 20, 58, 3], [20, -24, 3.2, 20, 26, 0], [-20, -14, 3.0, 20, 28, 1], [32, 4, 3.0, 1.5, 24, 0],
    [-36, 10, 3.4, 1.5, 18, 2],
  ];
  for (const [x, z, rad, y0, h, kind] of towers) {
    const square = kind === 1;
    const tw = square ? new THREE.BoxGeometry(rad * 2, h, rad * 2) : new THREE.CylinderGeometry(rad, rad * 1.12, h, 14);
    tw.translate(x, y0 + h / 2, z); add(tw, COL.stone);
    if (kind === 0 || kind === 3) {
      const c = new THREE.ConeGeometry(rad * (kind === 3 ? 1.3 : 1.45), rad * (kind === 3 ? 5.5 : 3.1), 14);
      c.translate(x, y0 + h + rad * (kind === 3 ? 2.75 : 1.55), z); add(c, kind === 3 ? COL.roofWarm : COL.roof, 0.04);
      const band = new THREE.CylinderGeometry(rad * 1.2, rad * 1.05, 1.8, 14); band.translate(x, y0 + h - 0.4, z); add(band, COL.stoneShade);
    } else {
      // crenellations; a broken tower keeps only a few, at different heights
      const nCr = square ? 8 : 7;
      for (let k = 0; k < nCr; k++) {
        if (kind === 2 && r() < 0.5) continue;
        const a = (k / nCr) * Math.PI * 2;
        const hh = kind === 2 ? 1 + r() * 5 : 2.6;
        const bx = new THREE.BoxGeometry(rad * 0.55, hh, rad * 0.55);
        bx.translate(x + Math.cos(a) * rad * 0.85, y0 + h + hh / 2, z + Math.sin(a) * rad * 0.85); add(bx, COL.stone);
      }
    }
    for (let k = 0; k < 2; k++) {
      const wy = y0 + h * (0.5 + k * 0.25);
      const w = new THREE.BoxGeometry(rad * 0.4, rad * 0.9, 0.6); w.translate(x, wy, z + rad * 1.03); add(w, '#6c7096', 0.05);
    }
  }

  // ---- the arcade on the middle terrace's front: two tiers of arches with sky through them
  const arc1 = arcade(44, 15, 3.5, 5, 0.74); arc1.translate(-4, 11, 25); add(arc1, COL.stone, 0.05);
  const deck = new THREE.BoxGeometry(45, 1.4, 4.4); deck.translate(-4, 26.6, 25); add(deck, COL.stoneShade, 0.04);
  const arc2 = arcade(44, 9, 3, 8, 0.66); arc2.translate(-4, 27.3, 25); add(arc2, COL.stone, 0.05);

  // ---- the viaduct: a long, slender arched bridge from the island's rim out to a rock pinnacle
  const vx0 = R0 * 0.9, vx1 = R0 + 95, vz = 14, vy = -2;
  const span = vx1 - vx0;
  const via = arcade(span, 26, 3.2, 8, 0.8); via.rotateY(0); via.translate((vx0 + vx1) / 2, vy - 26 + 1.5, vz); add(via, COL.stone, 0.06);
  const viaDeck = new THREE.BoxGeometry(span + 2, 1.6, 4.2); viaDeck.translate((vx0 + vx1) / 2, vy + 1.8, vz); add(viaDeck, COL.stoneShade, 0.04);
  // the pinnacle: a tall spike of rock with a green top and a small tower
  const pin = new THREE.ConeGeometry(12, 95, 10, 5); pin.rotateX(Math.PI); pin.translate(vx1 + 6, vy - 47.5 - 3, vz);
  const pp = pin.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < pp.count; i++) { const y = pp.getY(i); pp.setX(i, pp.getX(i) + Math.sin(y * 0.08) * 2.5); }
  add(pin, COL.rockDark, 0.12);
  const pinTop = new THREE.CylinderGeometry(12.5, 12, 2.4, 10); pinTop.translate(vx1 + 6, vy - 1.5, vz); add(pinTop, COL.grass, 0.1);
  const pt = new THREE.CylinderGeometry(3.4, 3.8, 20, 12); pt.translate(vx1 + 6, vy + 9, vz); add(pt, COL.stone);
  const ptr = new THREE.ConeGeometry(4.8, 10, 12); ptr.translate(vx1 + 6, vy + 24, vz); add(ptr, COL.roof, 0.04);
  for (let k = 0; k < 4; k++) {
    const g = new THREE.SphereGeometry(3 + r() * 2, 8, 6); g.scale(1, 1.6, 0.5);
    const a = r() * 6.28; g.rotateY(-a); g.translate(vx1 + 6 + Math.cos(a) * 11, vy - 5, vz + Math.sin(a) * 11); add(g, COL.tree, 0.15);
  }

  // ---- trees: round crowns along the terraces and the rim
  for (let k = 0; k < 34; k++) {
    const t = r();
    const [rad, cz, ty] = t < 0.5 ? tiers[0] : t < 0.8 ? tiers[1] : tiers[2];
    const a = r() * Math.PI * 2, d = rad * (0.75 + r() * 0.2);
    const sz = 3 + r() * 4;
    const tr = new THREE.IcosahedronGeometry(sz, 1); tr.scale(1, 0.9, 1); tr.translate(Math.cos(a) * d, ty + sz * 0.7, cz + Math.sin(a) * d);
    add(tr, r() < 0.5 ? COL.tree : COL.treeDark, 0.18);
  }
  // ---- waterfalls: thin bright ribbons spilling off the rim and the terraces (they fade to mist below)
  const falls: [number, number, number, number][] = [[0.95, 3.5, 150, 0], [1.45, 2.5, 120, 0], [2.4, 4, 140, 0], [0.4, 2.2, 100, 0], [1.2, 2, 11, 11]];
  const feet: THREE.Vector3[] = [];
  for (const [a, w, len, top] of falls) {
    const f = new THREE.PlaneGeometry(w, len, 1, 8); f.translate(0, -len / 2, 0);
    const p = f.getAttribute('position') as THREE.BufferAttribute;
    // the ribbon bows out from the cliff as it falls, and widens a little
    for (let i = 0; i < p.count; i++) { const y = p.getY(i); p.setXYZ(i, p.getX(i) * (1 + -y / len * 0.6), y, Math.pow(-y / len, 1.4) * len * 0.08); }
    const rad = top > 0 ? tiers[1][0] + 0.5 : R0 + 2.5;
    const cz = top > 0 ? tiers[1][1] : 0;
    f.rotateY(Math.PI / 2 - a); f.translate(Math.cos(a) * rad, top + 1.5, cz + Math.sin(a) * rad);
    add(f, COL.fall, 0.02, 1);
    if (top === 0) feet.push(new THREE.Vector3(Math.cos(a) * (rad + len * 0.08), -len, Math.sin(a) * (rad + len * 0.08)));
  }

  const g = mergeGeometries(parts)!;
  for (const p of parts) p.dispose();
  g.computeBoundingSphere();
  g.userData.falls = feet;
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
      uHazeK: { value: 0.5 },
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
        float low = smoothstep(20.0, -150.0, vLy);
        col = mix(col, col * vec3(0.86, 0.93, 1.1), low * 0.7);
        col *= 1.0 + 0.08 * smoothstep(0.0, 50.0, vLy);
        float hk = uHazeK + (1.0 - uHazeK) * 0.6 * low;
        float a = smoothstep(uFloorY - 4.0, uFloorY + 18.0, vLy) * (1.0 - vGlow * smoothstep(-40.0, -140.0, vLy));
        gl_FragColor = vec4(mix(col, uHaze, clamp(hk, 0.0, 0.95)), a);
      }`,
  });
}

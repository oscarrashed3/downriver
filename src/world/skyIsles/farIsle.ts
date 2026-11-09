import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { NOISE_GLSL, PAINT } from '../../render/paint';

/**
 * A far floating island crowned with castle ruins: towers, a broken curtain wall and a tall arcade, with a
 * waterfall spilling off its rim. It is backdrop, seen hundreds of metres away through blue haze, so it is one
 * merged mesh with vertex colours and a cheap lit-and-hazed shader. Units: metres; the island is ~110 m wide.
 */

const COL = {
  rock: '#e6d3ad', rockDark: '#c9b28c', grass: '#9cc46e', tree: '#6e9e58', stone: '#efe4cf', roof: '#8fa0c8', fall: '#f4f8fb',
};

function colorize(g: THREE.BufferGeometry, hex: string, jitter = 0, rnd?: () => number) {
  const c = new THREE.Color(hex);
  const n = g.getAttribute('position').count;
  const a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const k = 1 + (rnd ? (rnd() - 0.5) * jitter : 0);
    a[i * 3] = c.r * k; a[i * 3 + 1] = c.g * k; a[i * 3 + 2] = c.b * k;
  }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
}
function prep(g: THREE.BufferGeometry) {
  const ng = g.index ? g.toNonIndexed() : g;
  for (const k of Object.keys(ng.attributes)) if (k !== 'position' && k !== 'normal') ng.deleteAttribute(k);
  ng.computeVertexNormals();
  return ng;
}

/** An arcade: a wall with `n` round-headed arches cut through it. */
function arcade(width: number, height: number, depth: number, n: number) {
  const s = new THREE.Shape();
  s.moveTo(-width / 2, 0); s.lineTo(width / 2, 0); s.lineTo(width / 2, height); s.lineTo(-width / 2, height); s.closePath();
  const bay = width / n, aw = bay * 0.62, ah = height * 0.68;
  for (let i = 0; i < n; i++) {
    const cx = -width / 2 + bay * (i + 0.5);
    const h = new THREE.Path();
    h.moveTo(cx - aw / 2, 0); h.lineTo(cx + aw / 2, 0); h.lineTo(cx + aw / 2, ah - aw / 2);
    h.absarc(cx, ah - aw / 2, aw / 2, 0, Math.PI, false);
    h.lineTo(cx - aw / 2, 0);
    s.holes.push(h);
  }
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false, curveSegments: 6 });
  g.translate(0, 0, -depth / 2);
  return g;
}

export function farIsleGeometry(seed = 3): THREE.BufferGeometry {
  let s = seed * 9301 + 49297;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const parts: THREE.BufferGeometry[] = [];
  const add = (g: THREE.BufferGeometry, hex: string, jitter = 0.08) => parts.push(colorize(prep(g), hex, jitter, r));

  // the rock: a lathe that tapers to a ragged point, roughened with noise
  const prof: THREE.Vector2[] = [];
  const N = 14;
  for (let i = 0; i <= N; i++) {
    const f = i / N;
    const rad = 55 * (1 - Math.pow(f, 1.6)) * (0.92 + 0.08 * Math.sin(f * 9)) + 1.5;
    prof.push(new THREE.Vector2(rad, -f * 95));
  }
  prof.reverse();
  const rock = new THREE.LatheGeometry(prof, 28);
  const rp = rock.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < rp.count; i++) {
    const x = rp.getX(i), y = rp.getY(i), z = rp.getZ(i);
    const a = Math.atan2(z, x);
    const k = 1 + 0.12 * Math.sin(a * 5 + y * 0.08) + 0.08 * Math.sin(a * 11 - y * 0.15) + (y < -10 ? 0.1 * Math.sin(y * 0.3 + a * 3) : 0);
    rp.setXYZ(i, x * k, y, z * k);
  }
  add(rock, COL.rock, 0.16);
  // the green cap
  const cap = new THREE.CylinderGeometry(58, 55, 4, 28, 1);
  cap.translate(0, 1, 0);
  add(cap, COL.grass, 0.1);

  // castle: a keep, towers (some broken), a curtain wall and a tall arcade at the front
  const keep = new THREE.BoxGeometry(26, 26, 20); keep.translate(-6, 16, -14); add(keep, COL.stone);
  const keepRoof = new THREE.ConeGeometry(17, 14, 4); keepRoof.rotateY(Math.PI / 4); keepRoof.translate(-6, 36, -14); add(keepRoof, COL.roof, 0.04);
  const towers: [number, number, number, number, boolean][] = [
    [-24, -20, 5, 40, true], [10, -24, 4.5, 50, true], [16, -4, 4, 30, false], [-28, 4, 4, 26, false], [-4, -30, 3.5, 58, true],
  ];
  for (const [x, z, rad, h, roof] of towers) {
    const tw = new THREE.CylinderGeometry(rad, rad * 1.08, h, 12); tw.translate(x, h / 2 + 2, z); add(tw, COL.stone);
    if (roof) { const c = new THREE.ConeGeometry(rad * 1.35, rad * 2.6, 12); c.translate(x, h + 2 + rad * 1.3, z); add(c, COL.roof, 0.04); }
    else {
      // a broken top: a few crenels left standing
      for (let k = 0; k < 5; k++) {
        if (r() < 0.35) continue;
        const a = (k / 5) * Math.PI * 2;
        const b = new THREE.BoxGeometry(rad * 0.6, 2 + r() * 3, rad * 0.6); b.translate(x + Math.cos(a) * rad * 0.8, h + 3, z + Math.sin(a) * rad * 0.8); add(b, COL.stone);
      }
    }
  }
  // the curtain wall, broken in places
  for (let k = 0; k < 9; k++) {
    if (k === 4 || k === 6) continue;
    const a = -0.6 + k * 0.32, R = 38;
    const h = 8 + r() * 6 * (k % 3 === 0 ? 0.3 : 1);
    const w = new THREE.BoxGeometry(12.5, h, 2.5); w.rotateY(-a + Math.PI / 2); w.translate(Math.cos(a) * R, h / 2 + 2, Math.sin(a) * R - 6); add(w, COL.stone);
  }
  // the arcade: two tiers, like an old aqueduct, at the front-left of the island
  const arc1 = arcade(44, 18, 4, 4); arc1.rotateY(0.35); arc1.translate(-16, 2, 26); add(arc1, COL.stone);
  const arc2 = arcade(30, 12, 3.4, 4); arc2.rotateY(0.35); arc2.translate(-16, 20, 26); add(arc2, COL.stone);
  const gal = new THREE.BoxGeometry(44, 1.6, 5); gal.rotateY(0.35); gal.translate(-16, 20, 26); add(gal, COL.stone);

  // trees: round crowns round the walls and on the rim
  for (let k = 0; k < 18; k++) {
    const a = r() * Math.PI * 2, d = 30 + r() * 24;
    const sz = 4 + r() * 4;
    const t = new THREE.IcosahedronGeometry(sz, 1); t.scale(1, 0.9, 1); t.translate(Math.cos(a) * d, 2 + sz * 0.7, Math.sin(a) * d);
    add(t, COL.tree, 0.18);
  }
  // a waterfall off the rim
  const fall = new THREE.PlaneGeometry(7, 80, 1, 4); fall.translate(0, -40, 0); fall.rotateY(-0.5); fall.translate(30, 2, 47); add(fall, COL.fall, 0.02);
  const fall2 = new THREE.PlaneGeometry(4, 55, 1, 3); fall2.translate(0, -27, 0); fall2.rotateY(0.9); fall2.translate(-44, 2, 33); add(fall2, COL.fall, 0.02);

  const g = mergeGeometries(parts)!;
  for (const p of parts) p.dispose();
  g.computeBoundingSphere();
  return g;
}

/** The hazed material for far backdrop solids: soft sun, sky fill, and a strong pull toward the haze colour. */
export function farMaterial() {
  return new THREE.ShaderMaterial({
    side: THREE.DoubleSide, vertexColors: true,
    // drawn between the far sea's puffs without writing depth (no ink through the clouds); its triangles are pre-sorted
    transparent: true, depthWrite: false,
    uniforms: {
      uFloorY: { value: -1e4 },
      uSun: PAINT.uSun,
      uHaze: { value: new THREE.Color('#bcd2ec') },
      uHazeK: { value: 0.58 },
      uShade: { value: new THREE.Color('#7f8fc4') },
    },
    vertexShader: /* glsl */ `
      varying vec3 vC; varying vec3 vN; varying vec3 vW; varying float vLy;
      void main(){
        vC = color; vLy = position.y; vN = normalize(mat3(modelMatrix) * normal);
        vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uSun, uHaze, uShade; uniform float uHazeK, uFloorY;
      varying vec3 vC; varying vec3 vN; varying vec3 vW; varying float vLy;
      ${NOISE_GLSL}
      void main(){
        vec3 N = normalize(vN);
        if (!gl_FrontFacing) N = -N;
        float l = smoothstep(-0.1, 0.5, dot(N, uSun));
        vec3 col = mix(vC * uShade * 1.1, vC * 1.05, l);
        col *= 0.94 + pNoise(vW * 0.08) * 0.12;
        // haze thickens toward the bottom of the island, where it sinks into the cloud sea
        float hk = uHazeK + (1.0 - uHazeK) * 0.6 * smoothstep(0.0, -90.0, vLy);
        // and fades out where it goes down into the cloud floor
        float a = smoothstep(uFloorY - 4.0, uFloorY + 14.0, vLy);
        gl_FragColor = vec4(mix(col, uHaze, clamp(hk, 0.0, 0.95)), a);
      }`,
  });
}

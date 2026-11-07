import * as THREE from 'three';

/** Flowing water: stripes drift along the river, foam at the edges, glow with health. */
export function makeWaterMaterial(color: string, deep: string, ocean = false): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    fog: true,
    side: ocean ? THREE.FrontSide : THREE.DoubleSide,
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      {
        uTime: { value: 0 },
        uColor: { value: new THREE.Color(color) },
        uDeep: { value: new THREE.Color(deep) },
        uHealth: { value: 0.5 },
        uSpeed: { value: 1 },
        uOcean: { value: ocean ? 1 : 0 },
        uSun: { value: new THREE.Vector3(0.5, 0.35, 0.8).normalize() },
      },
    ]),
    vertexShader: /* glsl */ `
      #include <fog_pars_vertex>
      varying vec2 vUv;
      varying vec3 vN;
      varying vec3 vW;
      varying vec3 vView;
      void main() {
        vUv = uv;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vW = wp.xyz;
        vN = normalize(mat3(modelMatrix) * normal);
        vView = cameraPosition - wp.xyz;
        vec4 mvPosition = viewMatrix * wp;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }
    `,
    fragmentShader: /* glsl */ `
      #include <fog_pars_fragment>
      uniform float uTime; uniform vec3 uColor; uniform vec3 uDeep; uniform float uHealth;
      uniform float uSpeed; uniform float uOcean; uniform vec3 uSun;
      varying vec2 vUv; varying vec3 vN; varying vec3 vW; varying vec3 vView;
      float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
      float n2(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
        return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }
      void main() {
        vec3 V = normalize(vView);
        vec3 N = normalize(vN);
        float fres = pow(1.0 - abs(dot(N, V)), 3.0);
        vec3 col;
        float a;
        if (uOcean > 0.5) {
          vec2 p = vW.xz * 0.08 + vW.y * 0.05;
          float w = n2(p + uTime * 0.15) * 0.5 + n2(p * 2.3 - uTime * 0.1) * 0.5;
          col = mix(uDeep, uColor, 0.45 + 0.4 * w);
          col += vec3(1.0, 0.9, 0.7) * smoothstep(0.72, 0.95, w) * 0.25;
          a = 0.82 + fres * 0.15;
        } else {
          float flow = vUv.y * 0.35 - uTime * (1.2 + uSpeed);
          float stripes = n2(vec2(vUv.x * 3.0, flow)) * 0.6 + n2(vec2(vUv.x * 7.0, flow * 2.3)) * 0.4;
          float edge = smoothstep(0.62, 1.0, abs(vUv.x));
          // painted: three flat value bands, darker down the middle, like gouache
          float band = floor((0.35 + 0.5 * stripes - (1.0 - abs(vUv.x)) * 0.18) * 3.0) / 3.0;
          col = mix(uDeep, uColor, clamp(band + 0.2, 0.0, 1.0));
          // brush dashes: short white strokes that ride the current
          float dash = n2(vec2(vUv.x * 16.0, flow * 5.0));
          float stroke = smoothstep(0.86, 0.9, dash) * smoothstep(0.98, 0.9, abs(vUv.x));
          // foam along the banks, broken into dabs
          float foam = edge * smoothstep(0.35, 0.6, n2(vec2(vUv.x * 9.0, flow * 3.0)));
          col = mix(col, vec3(0.97, 0.98, 1.0), clamp(stroke * 0.75 + foam * 0.8, 0.0, 1.0));
          a = mix(0.78, 0.95, edge);
        }
        float spec = pow(max(dot(reflect(-uSun, N), V), 0.0), 40.0);
        col += vec3(1.0, 0.92, 0.75) * spec * 0.6 + fres * vec3(0.9, 0.95, 1.0) * 0.25;
        // A sick river is dull and grey; a healthy one glows.
        col = mix(col * vec3(0.72, 0.72, 0.7), col * 1.12, uHealth);
        gl_FragColor = vec4(col, a);
        #include <fog_fragment>
      }
    `,
  });
}

/**
 * The falling stream between two worlds, as one piece of water: at the lip it is as wide and flat as the river it
 * leaves (so the two meet without a seam), then it gathers into a rounded column as it falls. The uv matches the
 * river's (x across from -1 to 1, y along in metres), so the same painted water shader runs down it.
 */
export function fallGeometry(curve: THREE.Curve<THREE.Vector3>, side0: THREE.Vector3, riverW: number, r: number, n = 200, m = 18): THREE.BufferGeometry {
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  const P = curve.getSpacedPoints(n);
  const len = curve.getLength();
  const T = new THREE.Vector3(), B = side0.clone(), N = new THREE.Vector3(), v = new THREE.Vector3();
  for (let i = 0; i <= n; i++) {
    const s = i / n;
    curve.getTangentAt(s, T);
    // carry the river's own "across" down the fall, so the sheet never twists
    B.addScaledVector(T, -B.dot(T)).normalize();
    N.crossVectors(T, B).normalize();
    const k = s < 0.14 ? (s / 0.14) * (s / 0.14) * (3 - 2 * s / 0.14) : 1;
    const width = riverW * (1 - k) + r * 1.35 * k - (s > 0.85 ? (s - 0.85) / 0.15 * r * 0.35 : 0);
    const thick = 0.1 * (1 - k) + r * 0.75 * k;
    for (let j = 0; j <= m; j++) {
      const a = (j / m) * Math.PI * 2;
      v.copy(P[i]).addScaledVector(B, Math.cos(a) * width).addScaledVector(N, Math.sin(a) * thick);
      pos.push(v.x, v.y, v.z);
      uv.push(Math.cos(a), s * len);
    }
  }
  for (let i = 0; i < n; i++) for (let j = 0; j < m; j++) {
    const a = i * (m + 1) + j, b = a + 1, c = a + m + 1, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

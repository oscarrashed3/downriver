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
          col = mix(uDeep, uColor, 0.35 + 0.45 * stripes);
          col = mix(col, vec3(1.0), edge * 0.55 + smoothstep(0.78, 0.95, stripes) * 0.35);
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

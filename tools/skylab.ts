// Dev-only page: the Sky Isles hero pieces on their own, lit like the game at midday (or golden hour),
// with the game's sky, fog, bloom and finishing pass. Open /downriver/skylab.html?piece=whale&view=side
// Each piece lives in src/world/skyIsles/lab/<piece>.ts and exports default (ctx) => LabPiece.
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { FinishPass } from '../src/render/finish';
import { PAINT } from '../src/render/paint';
import { Sky } from '../src/world/sky';
import type { LabCtx, LabPiece } from '../src/world/skyIsles/lab/types';

const q = new URLSearchParams(location.search);
const W = Number(q.get('w') ?? 1600), H = Number(q.get('h') ?? 900);
const golden = q.get('light') === 'golden';
const r = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
r.setSize(W, H); r.setPixelRatio(1);
r.toneMapping = THREE.NeutralToneMapping; r.toneMappingExposure = 0.92;
r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFShadowMap;
document.body.appendChild(r.domElement);
const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(golden ? '#f3d6b0' : '#cfe5f2', Number(q.get('fog') ?? 0.0022));
const sunDir = golden ? new THREE.Vector3(0.75, 0.16, -0.64).normalize() : new THREE.Vector3(0.45, 0.78, 0.43).normalize();
const sky = new Sky(scene, sunDir);
sky.clouds.visible = false;
(sky.mat.uniforms.uSun.value as THREE.Vector3).copy(sunDir);
if (golden) { sky.mat.uniforms.uTop.value.set('#6f9fe0'); sky.mat.uniforms.uHorizon.value.set('#ffe0b0'); }
const sun = new THREE.DirectionalLight(golden ? '#ffc98a' : '#fff1da', 2.4);
sun.position.copy(sunDir).multiplyScalar(200); sun.castShadow = true;
const sc = sun.shadow.camera; sc.left = -60; sc.right = 60; sc.top = 60; sc.bottom = -60; sc.near = 1; sc.far = 500;
sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.06;
scene.add(sun, sun.target);
PAINT.uSun.value.copy(sunDir);
PAINT.uCenter.value.set(0, -5000, 0);
PAINT.uAmbSky.value.set(golden ? '#b89a9a' : '#8fa6cf').multiplyScalar(0.62);
PAINT.uAmbGround.value.set(golden ? '#9a7a6a' : '#7a7a8a').multiplyScalar(0.36);
PAINT.uSunCol.value.set(sun.color).multiplyScalar(sun.intensity / 2.6);
PAINT.uWind.value.set(1, 0, 0.3).normalize();

const camera = new THREE.PerspectiveCamera(Number(q.get('fov') ?? 45), W / H, 0.1, 6000);
const rt = new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType, depthTexture: new THREE.DepthTexture(W, H) });
const composer = new EffectComposer(r, rt);
composer.addPass(new RenderPass(scene, camera));
composer.addPass(new UnrealBloomPass(new THREE.Vector2(W, H), 0.2, 0.5, 0.96));
const finish = new FinishPass(camera);
composer.addPass(finish);
composer.addPass(new OutputPass());
finish.mat.uniforms.uRes.value.set(W, H);
(finish.mat.uniforms.uHazeCol.value as THREE.Color).copy((scene.fog as THREE.FogExp2).color);

const ctx: LabCtx = { THREE, scene, camera, renderer: r, sun, sunDir, params: q, golden };
const pieceName = q.get('piece') ?? 'whale';
const mod = await import(`../src/world/skyIsles/lab/${pieceName}.ts`);
const piece: LabPiece = await mod.default(ctx);
const viewName = q.get('view') ?? Object.keys(piece.views)[0];
function applyView(name: string) {
  const v = piece.views[name] ?? Object.values(piece.views)[0];
  camera.position.fromArray(v.pos); camera.lookAt(new THREE.Vector3().fromArray(v.look));
  if (v.fov) { camera.fov = v.fov; camera.updateProjectionMatrix(); }
}
applyView(viewName);
let t = 0;
const dt = 1 / 30;
/** Advance the simulation by `sec` seconds without rendering (used by the shot script). */
(window as any).__advance = (sec: number) => { const n = Math.round(sec / dt); for (let i = 0; i < n; i++) step(); };
(window as any).__view = (name: string) => applyView(name);
(window as any).__views = Object.keys(piece.views);
function step() {
  t += dt; PAINT.uTime.value = t; sky.mat.uniforms.uTime.value = t;
  piece.update(dt, t);
  if (piece.camera) piece.camera(camera, t);
  sky.mesh.position.copy(camera.position);
}
(window as any).__advance(Number(q.get('t') ?? 0));
function frame() {
  if (!q.has('still')) step();
  composer.render();
  (window as any).__frames = ((window as any).__frames ?? 0) + 1;
  requestAnimationFrame(frame);
}
(window as any).__ready = true;
frame();

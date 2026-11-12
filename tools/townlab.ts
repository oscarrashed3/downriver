// Dev-only page: the Walking Town's hero pieces on their own, lit like World 3's warm early afternoon, with the
// game's sky, fog, bloom and finishing pass. Open /downriver/townlab.html?piece=amble&view=threeq
// Each piece lives in src/world/walkingTown/lab/<piece>.ts and exports default (ctx) => LabPiece.
// Query: piece, view, t (seconds simulated before the first frame), still (no stepping), w, h, fov, fog.
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { FinishPass } from '../src/render/finish';
import { PAINT } from '../src/render/paint';
import { Sky } from '../src/world/sky';
import type { LabCtx, LabPiece } from '../src/world/walkingTown/lab/types';

const q = new URLSearchParams(location.search);
const W = Number(q.get('w') ?? 1600), H = Number(q.get('h') ?? 900);
const r = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
r.setSize(W, H); r.setPixelRatio(1);
r.toneMapping = THREE.NeutralToneMapping; r.toneMappingExposure = 0.94;
r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFShadowMap;
document.body.appendChild(r.domElement);
const scene = new THREE.Scene();
// warm early afternoon (World 2 ended in golden late afternoon; this is a softer, earlier warmth)
const FOG = '#dfe6e2';
scene.fog = new THREE.FogExp2(FOG, Number(q.get('fog') ?? 0.0016));
const sunDir = new THREE.Vector3(-0.55, 0.66, 0.5).normalize();
const sky = new Sky(scene, sunDir);
sky.clouds.visible = false;
(sky.mat.uniforms.uSun.value as THREE.Vector3).copy(sunDir);
sky.mat.uniforms.uTop.value.set('#4f8fdc'); sky.mat.uniforms.uHorizon.value.set('#d8ecf4');
const sun = new THREE.DirectionalLight('#ffeccc', 2.5);
sun.position.copy(sunDir).multiplyScalar(220); sun.castShadow = true;
const sc = sun.shadow.camera; sc.left = -62; sc.right = 62; sc.top = 62; sc.bottom = -62; sc.near = 1; sc.far = 520;
sun.shadow.mapSize.set(4096, 4096); sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.08;
scene.add(sun, sun.target);
PAINT.uSun.value.copy(sunDir);
PAINT.uCenter.value.set(0, -5000, 0);
PAINT.uAmbSky.value.set('#a6b4d4').multiplyScalar(0.62);
PAINT.uAmbGround.value.set('#9a8f6a').multiplyScalar(0.48);
PAINT.uSunCol.value.set(sun.color).multiplyScalar(sun.intensity / 2.6);
PAINT.uRimCol.value.set('#ffe2b0');
PAINT.uWind.value.set(1, 0, 0.3).normalize();

const camera = new THREE.PerspectiveCamera(Number(q.get('fov') ?? 40), W / H, 0.2, 8000);
const rt = new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType, depthTexture: new THREE.DepthTexture(W, H) });
const composer = new EffectComposer(r, rt);
composer.addPass(new RenderPass(scene, camera));
composer.addPass(new UnrealBloomPass(new THREE.Vector2(W, H), 0.18, 0.5, 0.96));
const finish = new FinishPass(camera);
composer.addPass(finish);
composer.addPass(new OutputPass());
finish.mat.uniforms.uRes.value.set(W, H);
(finish.mat.uniforms.uHazeCol.value as THREE.Color).set(FOG);

const ctx: LabCtx = { THREE, scene, camera, renderer: r, sun, sunDir, params: q, golden: false };
const pieceName = q.get('piece') ?? 'amble';
const mod = await import(`../src/world/walkingTown/lab/${pieceName}.ts`);
const piece: LabPiece = await mod.default(ctx);
const viewName = q.get('view') ?? Object.keys(piece.views)[0];
function applyView(name: string) {
  const v = piece.views[name] ?? Object.values(piece.views)[0];
  camera.position.fromArray(v.pos); camera.lookAt(new THREE.Vector3().fromArray(v.look));
  camera.fov = v.fov ?? Number(q.get('fov') ?? 40); camera.updateProjectionMatrix();
  // keep the shadow map centred on what the camera looks at
  const c = new THREE.Vector3().fromArray(v.look);
  sun.target.position.copy(c); sun.position.copy(c).addScaledVector(sunDir, 220);
  piece.onView?.(name, camera);
}
applyView(viewName);
let t = 0;
const dt = 1 / 30;
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
r.info.autoReset = false;
function frame() {
  if (!q.has('still')) step();
  r.info.reset();
  composer.render();
  (window as any).__info = { calls: r.info.render.calls, triangles: r.info.render.triangles, programs: r.info.programs?.length };
  (window as any).__frames = ((window as any).__frames ?? 0) + 1;
  requestAnimationFrame(frame);
}
(window as any).__ready = true;
frame();

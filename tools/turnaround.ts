// Dev-only page: Nilo in four views (front, three-quarter, side, back), for comparing with the turnaround sheet.
import * as THREE from 'three';
import { Player } from '../src/player/player';
import { PAINT } from '../src/render/paint';

const W = 1600, H = 900;
const r = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
r.setSize(W, H); r.setPixelRatio(1); r.shadowMap.enabled = true; r.setClearColor('#efe6d6');
document.body.appendChild(r.domElement);
const scene = new THREE.Scene();
const sun = new THREE.DirectionalLight('#fff4e0', 2.2); sun.position.set(3, 6, 5); sun.castShadow = true; scene.add(sun);
scene.add(new THREE.HemisphereLight('#c8d4f0', '#6a5040', 1.1));
PAINT.uSun.value.copy(sun.position).normalize();
PAINT.uCenter.value.set(0, -1000, 0);
const q = new URLSearchParams(location.search);
const pose = q.get('pose') ?? 'stand';
const views = [0, -0.7, -Math.PI / 2, Math.PI];
const players: Player[] = [];
views.forEach((yaw, i) => {
  const p = new Player(); p.grounded = true; p.hasDrop = true; p.dropGlow = 0.3;
  p.root.position.set((i - 1.5) * 1.5, 0, 0); p.root.rotation.y = yaw;
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.6, 0.08, 24), new THREE.MeshToonMaterial({ color: '#7a8a48' })); base.position.set((i - 1.5) * 1.5, -0.04, 0); scene.add(base);
  const hide = q.get('hide');
  if (hide) p.root.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh && (m.geometry as any).type === hide) m.visible = false; });
  scene.add(p.root); players.push(p);
});
const cam = new THREE.PerspectiveCamera(22, W / H, 0.1, 100);
const zoom = q.get('zoom');
if (zoom) { const i = +zoom; cam.position.set((i - 1.5) * 1.5, 1.45, 3.2); cam.lookAt((i - 1.5) * 1.5, 1.35, 0); }
else { cam.position.set(0, 1.2, 9.5); cam.lookAt(0, 0.95, 0); }
let t = 0;
function frame() {
  const dt = 1 / 60; t += dt;
  for (const p of players) {
    p.pose = pose === 'sit' ? { sit: 1 } : pose === 'talk' ? { talking: true } : pose === 'wave' ? { wave: 1 } : {};
    const sp = pose === 'walk' ? 4 : pose === 'run' ? 9 : 0;
    p.animate(dt, sp, false);
  }
  r.render(scene, cam);
  (window as any).__frames = ((window as any).__frames ?? 0) + 1;
  requestAnimationFrame(frame);
}
frame();

import * as THREE from 'three';
import { AmbleRig, BONE, REST, SHELL, LEGS, type AmblePose, type Leg } from './ambleRig';
import { buildAmbleBody, type AmbleBodyBuild } from './ambleBody';
import { buildAmbleGrowth } from './ambleGrowth';
import { ambleBodyMaterial, ambleCardMaterial, ambleCardDepth } from './ambleMaterials';
import { AmbleBirds, type Perch } from './ambleBirds';
import { SkyBirds } from '../skyIsles/skyBirds';
import { townRng } from './rand';

/**
 * Old Amble: the huge, gentle creature the Walking Town lives on. Part tortoise, part elk: a domed, plated shell
 * covered in moss with terraces on top for the village, four pillar legs with layered rock-like skin, wide flat
 * toes, a long neck, a kind elk's head and huge pale antlers hung with vines. Awake the whole time: it breathes
 * (the shell lifting slowly, with a deep sigh now and then), its ears turn and flick, its eyes wander and blink
 * slowly, its head sways, and white birds land on its antlers and lift off again.
 *
 * Build: one skinned mesh for the whole body (shell, plates, legs, feet, neck, head, eyes, ears, antlers, moss;
 * see ambleBody.ts), one skinned mesh of cards for the growth (vines, ferns, flowers, leaves; ambleGrowth.ts),
 * one instanced draw for the birds that land, one for the flock circling above. Rig: ambleRig.ts.
 *
 * Space: `root` is Amble's frame (faces +Z, up +Y, feet on y = 0). Place and turn it in the world.
 * For the game:
 *   - `shellTop`: a frame riding on the shell bone at the top terrace's centre (y = SHELL.yTop). Build the village
 *     under it, in shell-local coordinates (creature rest coordinates minus shellTop's rest position): it
 *     breathes, sways and walks with the shell. `shellRest` is a plain mesh of the shell in rest pose for
 *     raycasting heights and walls while building.
 *   - `pose`: head lift / yaw, a foot held up, walking speed, lean (see AmblePose).
 *   - `stoneSlot`: a frame on the front left foot, in the gap between its third and fourth toes.
 *   - `mouth`, `eyeL`/`eyeR`, `brow`: frames on the head (water, the eye look, the vines over the eyes).
 *   - `addPerch()`: more places for the birds to land (windmill caps, roofs).
 */
export class Amble {
  root = new THREE.Group();
  rig = new AmbleRig();
  body: THREE.SkinnedMesh;
  growth: THREE.SkinnedMesh;
  birds: AmbleBirds;
  flock: SkyBirds;
  shellTop = new THREE.Object3D();
  stoneSlot = new THREE.Object3D();
  mouth = new THREE.Object3D();
  eyeL = new THREE.Object3D(); eyeR = new THREE.Object3D();
  build: AmbleBodyBuild;
  /** The shell alone in rest pose (not added to the scene): for raycasting when placing the village. */
  shellRest: THREE.Mesh;
  stats = { triangles: 0, cards: 0, bones: 0 };
  private perches: Perch[] = [];
  private rng = townRng(17);
  private next = { blink: 2, earL: 3, earR: 5, look: 1, sigh: 14 };
  private sighT = -100;
  private look = { x: 0, y: 0, tx: 0, ty: 0 };
  private flick = { L: -10, R: -10 };
  private blinkT = -10;

  get pose(): AmblePose { return this.rig.pose; }

  constructor(opts: { birds?: number; flock?: number } = {}) {
    this.root.name = 'Amble';
    this.root.add(this.rig.rootBone);
    this.build = buildAmbleBody(3);
    const bodyGeo = this.build.geometry;
    this.body = new THREE.SkinnedMesh(bodyGeo, ambleBodyMaterial());
    this.body.castShadow = true; this.body.receiveShadow = true;
    this.body.userData.noOutline = true;
    const growth = buildAmbleGrowth(this.build, 5);
    this.growth = new THREE.SkinnedMesh(growth.geometry, ambleCardMaterial());
    this.growth.customDepthMaterial = ambleCardDepth();
    this.growth.castShadow = true; this.growth.receiveShadow = true;
    this.growth.renderOrder = 1;
    this.growth.userData.noOutline = true;
    this.root.add(this.body, this.growth);
    this.root.updateMatrixWorld(true);
    this.body.bind(this.rig.skeleton);
    this.growth.bind(this.rig.skeleton);
    // generous fixed bounds (the skinned bounds would walk every vertex through the bones)
    const bs = new THREE.Sphere(new THREE.Vector3(0, 16, 2), 48);
    this.body.boundingSphere = bs.clone(); this.growth.boundingSphere = bs.clone();
    bodyGeo.boundingSphere = bs.clone(); growth.geometry.boundingSphere = bs.clone();
    this.stats = { triangles: this.build.triangles + growth.quads * 2, cards: growth.quads, bones: this.rig.bones.length };

    // frames for the game
    const B = (n: number) => this.rig.bones[n];
    const at = (o: THREE.Object3D, bone: number, p: THREE.Vector3) => { o.position.copy(p).sub(REST[bone]); B(bone).add(o); };
    at(this.shellTop, BONE.shell, new THREE.Vector3(0, SHELL.yTop, SHELL.cz));
    at(this.stoneSlot, BONE.footFL, this.build.stoneSlot);
    at(this.mouth, BONE.head, this.build.mouth);
    at(this.eyeL, BONE.head, REST[BONE.eyeL]); at(this.eyeR, BONE.head, REST[BONE.eyeR]);

    // the shell in rest pose, for raycasting (shell-bone vertices only)
    this.shellRest = this.restShell(bodyGeo);

    // birds: perched on the upward antler tips; a flock wheeling high over the shell
    const tips = this.build.antlerTips.filter(t => t.up && t.p.y > 27);
    tips.forEach((tp, i) => this.perches.push({ bone: B(BONE.head), local: tp.p.clone().sub(REST[BONE.head]).add(new THREE.Vector3(0, 0.05, 0)), yaw: (i * 1.7) % (Math.PI * 2) }));
    this.birds = new AmbleBirds(this.root, this.perches, opts.birds ?? 5);
    this.birds.centres = [new THREE.Vector3(0, 35, 28), new THREE.Vector3(0, 33, -4), new THREE.Vector3(8, 34, 14)];
    this.flock = new SkyBirds([
      { center: new THREE.Vector3(-4, 42, -2), radius: 26, speed: 0.11, birds: opts.flock ?? 6, span: 1.4 },
      { center: new THREE.Vector3(10, 37, 20), radius: 15, speed: -0.16, birds: 3, span: 1.3 },
    ], 9);
    this.root.add(this.flock.mesh);
    this.rig.update(0);
    this.birds.update(0, 0);
  }

  /** Add a place for the birds to land: a point on any object riding Amble (in that object's space). */
  addPerch(obj: THREE.Object3D, local: THREE.Vector3, yaw = 0) { this.perches.push({ bone: obj, local: local.clone(), yaw }); }

  private restShell(g: THREE.BufferGeometry) {
    const si = g.attributes.skinIndex as THREE.BufferAttribute, sw = g.attributes.skinWeight as THREE.BufferAttribute;
    const idx = g.index!.array;
    const keep: number[] = [];
    for (let i = 0; i < idx.length; i += 3) {
      let ok = true;
      for (let k = 0; k < 3; k++) { const v = idx[i + k]; if (!(si.getX(v) === BONE.shell && sw.getX(v) > 0.99)) { ok = false; break; } }
      if (ok) keep.push(idx[i], idx[i + 1], idx[i + 2]);
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', g.attributes.position);
    sg.setIndex(keep);
    sg.computeBoundingSphere();
    return new THREE.Mesh(sg, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
  }

  /** Make Amble let out a long, deep sigh (the shell rises and settles). */
  sigh() { this.sighT = this.time; this.next.sigh = this.time + 25 + this.rng() * 20; }

  private time = 0;
  update(dt: number, t: number) {
    this.time = t;
    const r = this.rng, I = this.rig.idle;
    // ---- breathing: slow, a beat between body and shell; a deep sigh every half minute or so
    if (t > this.next.sigh) this.sigh();
    const st = t - this.sighT;
    const sighK = st >= 0 && st < 9 ? Math.sin(Math.PI * Math.min(1, st / 9)) ** 1.5 : 0;
    const ph = (t / 7.5) * Math.PI * 2;
    this.rig.breath = Math.sin(ph) * (1 - sighK * 0.6) + sighK * 2.2;
    this.rig.shellBreath = Math.sin(ph - 0.5) * (1 - sighK * 0.6) + sighK * 2.6;
    // ---- head: a slow wander
    I.headYaw = 0.07 * Math.sin(t * 0.11) + 0.035 * Math.sin(t * 0.27 + 1.3);
    I.headPitch = 0.03 * Math.sin(t * 0.17 + 0.4) - sighK * 0.05;
    // ---- ears: drift, and now and then a quick flick
    if (t > this.next.earL) { this.flick.L = t; this.next.earL = t + 3 + r() * 7; }
    if (t > this.next.earR) { this.flick.R = t; this.next.earR = t + 3 + r() * 7; }
    const fl = (t0: number) => { const k = (t - t0) / 0.9; return k >= 0 && k < 1 ? Math.sin(Math.PI * k) * (1 - k * 0.3) : 0; };
    I.earL = 0.12 + 0.08 * Math.sin(t * 0.23); I.earR = 0.12 + 0.08 * Math.sin(t * 0.19 + 2);
    I.earFlickL = fl(this.flick.L); I.earFlickR = fl(this.flick.R);
    // ---- eyes: look somewhere new every few seconds, the eyes easing slowly there; slow blinks
    if (t > this.next.look) { this.look.tx = (r() - 0.5) * 0.35; this.look.ty = (r() - 0.5) * 0.18; this.next.look = t + 2.5 + r() * 4; }
    this.look.x += (this.look.tx - this.look.x) * (1 - Math.exp(-dt * 2.5));
    this.look.y += (this.look.ty - this.look.y) * (1 - Math.exp(-dt * 2.5));
    I.lookX = this.look.x; I.lookY = this.look.y;
    if (t > this.next.blink) { this.blinkT = t; this.next.blink = t + 4 + r() * 5; }
    const bk = (t - this.blinkT) / 0.75;
    I.blink = bk >= 0 && bk < 1 ? (bk < 0.35 ? bk / 0.35 : bk < 0.45 ? 1 : 1 - (bk - 0.45) / 0.55) : 0;
    I.blink = I.blink * I.blink * (3 - 2 * I.blink);
    I.tail = 0.08 * Math.sin(t * 0.3);
    this.rig.update(dt);
    this.root.updateMatrixWorld(true);
    this.birds.update(dt, t);
    this.flock.update(t);
  }

  /** Planted ground height under each foot (creature-space y), so the feet follow uneven ground. */
  setGround(l: Leg, y: number) { this.rig.groundY[l] = y; }
  static legs = LEGS;
}

import * as THREE from 'three';
import { AmbleRig, BONE, REST, SHELL, LEGS, type AmblePose, type Leg } from './ambleRig';
import { buildAmbleBody, type AmbleBodyBuild } from './ambleBody';
import { buildAmbleGrowth } from './ambleGrowth';
import { ambleBodyMaterial, ambleCardMaterial, ambleCardDepth } from './ambleMaterials';
import { AmbleBirds, type Perch } from './ambleBirds';
import { SkyBirds } from '../skyIsles/skyBirds';
import { townRng } from './rand';

const _lp = new THREE.Vector3();

/**
 * Old Amble: the huge, gentle creature the Walking Town lives on. Part tortoise, part elk and moose, with an
 * elephant's legs: a domed, plated shell covered in moss with terraces on top for the village, four massive legs in
 * wrinkled, cracked hide on round feet with thick toenails, a long, strong neck with a shaggy throat mane, an
 * elk's head on a real skull (brow, sockets, cheekbones, a moose's heavy nose and overhanging lip, a dewlap) and
 * huge pale antlers like driftwood hung with vines. Awake the whole time: it breathes (the flanks swell, the
 * shell lifts a beat later, the nostrils open; a deep sigh now and then), shifts its weight from leg to leg, its
 * neck sways in a slow S, its eyes find things and the head turns after them, it blinks (the lids squash
 * together), squints, chews a little, its ears flick, the dewlap swings on after the head, and white birds land
 * on its antlers and lift off again.
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
 *   - `lookAt`: a world point for the eyes to find (the head follows them); `gaze` takes the eyes over in scenes.
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
  /** A frame riding the neck (on the second neck bone, at its rest position) for the lookout on the neck. */
  neckRide = new THREE.Object3D();
  stoneSlot = new THREE.Object3D();
  mouth = new THREE.Object3D();
  eyeL = new THREE.Object3D(); eyeR = new THREE.Object3D();
  build: AmbleBodyBuild;
  /** The shell alone in rest pose (not added to the scene): for raycasting when placing the village. */
  shellRest: THREE.Mesh;
  stats = { triangles: 0, cards: 0, bones: 0 };
  private perches: Perch[] = [];
  private rng = townRng(17);
  private next = { blink: 2, earL: 3, earR: 5, look: 1, sigh: 14, chew: 9, squint: 16 };
  private chewT = -100; private chewLen = 5; private squintT = -100;
  /** Where the eyes are aimed and where the head has turned to (creature-frame yaw and pitch): the eyes get there
   * first, the head follows slowly after them. */
  private aim = { ex: 0, ey: 0, hx: 0, hy: 0 };
  /** A point in the world for Amble to look at (Nilo, say): the eyes find it, then the head turns after them. */
  lookAt: THREE.Vector3 | null = null;
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
    const bs = new THREE.Sphere(new THREE.Vector3(0, 18, 3), 52);
    this.body.boundingSphere = bs.clone(); this.growth.boundingSphere = bs.clone();
    bodyGeo.boundingSphere = bs.clone(); growth.geometry.boundingSphere = bs.clone();
    this.stats = { triangles: this.build.triangles + growth.quads * 2, cards: growth.quads, bones: this.rig.bones.length };

    // frames for the game
    const B = (n: number) => this.rig.bones[n];
    const at = (o: THREE.Object3D, bone: number, p: THREE.Vector3) => { o.position.copy(p).sub(REST[bone]); B(bone).add(o); };
    at(this.shellTop, BONE.shell, new THREE.Vector3(0, SHELL.yTop, SHELL.cz));
    at(this.neckRide, BONE.neck1, REST[BONE.neck1]);
    at(this.stoneSlot, BONE.footFL, this.build.stoneSlot);
    at(this.mouth, BONE.head, this.build.mouth);
    at(this.eyeL, BONE.head, REST[BONE.eyeL]); at(this.eyeR, BONE.head, REST[BONE.eyeR]);

    // the shell in rest pose, for raycasting (shell-bone vertices only)
    this.shellRest = this.restShell(bodyGeo);

    // birds: perched on the upward antler tips; a flock wheeling high over the shell
    const tips = this.build.antlerTips.filter(t => t.up && t.p.y > 31);
    tips.forEach((tp, i) => this.perches.push({ bone: B(BONE.head), local: tp.p.clone().sub(REST[BONE.head]).add(new THREE.Vector3(0, 0.05, 0)), yaw: (i * 1.7) % (Math.PI * 2) }));
    this.birds = new AmbleBirds(this.root, this.perches, opts.birds ?? 5);
    this.birds.centres = [new THREE.Vector3(0, 40, 31), new THREE.Vector3(0, 38, -4), new THREE.Vector3(8, 39, 14)];
    this.flock = new SkyBirds([
      { center: new THREE.Vector3(-4, 48, -2), radius: 26, speed: 0.11, birds: opts.flock ?? 6, span: 1.4 },
      { center: new THREE.Vector3(10, 43, 20), radius: 15, speed: -0.16, birds: 3, span: 1.3 },
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

  /** Set by a scene: the eyes' look (radians), a blink and the lids, blended in by k (0 leaves them to Amble). */
  gaze: { x: number; y: number; blink: number; lid: number; k: number } | null = null;

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
    // ---- weight: shifting slowly from leg to leg (the feet stay planted, the knees take it)
    I.shiftX = 0.75 * Math.sin(t * 0.37 + 0.5) + 0.25 * Math.sin(t * 0.83 + 2.1);
    I.shiftZ = 0.5 * Math.sin(t * 0.27 + 1.7);
    // ---- the neck: a slow S-curve travelling up it, in pitch and in yaw
    for (let i = 0; i < 5; i++) {
      I.neckPitch[i] = 0.018 * Math.sin(t * 0.55 - i * 0.95) + (i === 4 ? 0.01 * Math.sin(t * 0.31) : 0);
      I.neckYaw[i] = 0.016 * Math.sin(t * 0.41 - i * 0.85 + 1.0);
    }
    // ---- the nostrils open on each in-breath and wide on a sigh; now and then Amble chews a little, or
    // squints softly
    I.nostril = Math.max(0, Math.sin(ph + 0.4)) ** 2 * 0.7 + sighK * 1.2;
    if (t > this.next.chew) { this.chewT = t; this.chewLen = 3.5 + r() * 4; this.next.chew = t + 14 + r() * 18; }
    const ct = t - this.chewT;
    const chewEnv = ct >= 0 && ct < this.chewLen ? Math.sin(Math.PI * ct / this.chewLen) ** 0.5 : 0;
    I.jaw = chewEnv * (0.55 + 0.45 * Math.sin(ct * 5.2));
    I.chew = chewEnv * Math.cos(ct * 5.2) * 0.9;
    if (t > this.next.squint) { this.squintT = t; this.next.squint = t + 18 + r() * 20; }
    const qt = (t - this.squintT) / 2.6;
    I.squint = qt >= 0 && qt < 1 ? Math.sin(Math.PI * qt) ** 1.5 * 0.8 : 0;
    // ---- ears: drift, and now and then a quick flick
    if (t > this.next.earL) { this.flick.L = t; this.next.earL = t + 3 + r() * 7; }
    if (t > this.next.earR) { this.flick.R = t; this.next.earR = t + 3 + r() * 7; }
    const fl = (t0: number) => { const k = (t - t0) / 0.9; return k >= 0 && k < 1 ? Math.sin(Math.PI * k) * (1 - k * 0.3) : 0; };
    I.earL = 0.12 + 0.08 * Math.sin(t * 0.23); I.earR = 0.12 + 0.08 * Math.sin(t * 0.19 + 2);
    I.earFlickL = fl(this.flick.L); I.earFlickR = fl(this.flick.R);
    // ---- the gaze: somewhere new every few seconds (or the look-at point). The eyes lead, quick; the head turns
    // after them, slow and heavy, and as it comes round the eyes ease back towards its middle
    if (t > this.next.look) { this.look.tx = (r() - 0.5) * 0.7; this.look.ty = (r() - 0.5) * 0.24; this.next.look = t + 3 + r() * 5; }
    let tx = this.look.tx, ty = this.look.ty;
    if (this.lookAt) {
      const lp = this.root.worldToLocal(_lp.copy(this.lookAt)).sub(REST[BONE.head]);
      tx = Math.max(-0.9, Math.min(0.9, Math.atan2(lp.x, lp.z)));
      ty = Math.max(-0.5, Math.min(0.4, Math.atan2(lp.y, Math.hypot(lp.x, lp.z)) + 0.29));
    }
    const A = this.aim, k1 = 1 - Math.exp(-dt * 5), k2 = 1 - Math.exp(-dt * 0.8);
    A.ex += (tx - A.ex) * k1; A.ey += (ty - A.ey) * k1;
    A.hx += (tx * 0.75 - A.hx) * k2; A.hy += (ty * 0.5 - A.hy) * k2;
    I.headYaw = A.hx + 0.04 * Math.sin(t * 0.11) + 0.02 * Math.sin(t * 0.27 + 1.3);
    I.headPitch = A.hy * 1.4 + 0.025 * Math.sin(t * 0.17 + 0.4) - sighK * 0.05;
    I.lookX = Math.max(-0.45, Math.min(0.45, A.ex - A.hx * 0.95));
    I.lookY = Math.max(-0.25, Math.min(0.25, A.ey - A.hy * 0.9));
    // (a big turn of the eyes often brings a blink with it, as it does in animals)
    if (t > this.next.blink || (Math.abs(tx - A.ex) > 0.3 && t - this.blinkT > 2.5)) { this.blinkT = t; this.next.blink = t + 4 + r() * 5; }
    const bk = (t - this.blinkT) / 0.85;
    I.blink = bk >= 0 && bk < 1 ? (bk < 0.35 ? bk / 0.35 : bk < 0.45 ? 1 : 1 - (bk - 0.45) / 0.55) : 0;
    I.blink = I.blink * I.blink * (3 - 2 * I.blink);
    I.tail = 0.08 * Math.sin(t * 0.3);
    // a scene can take the eyes over: where they look, a blink, how far the lids are down (k blends it in)
    const gz = this.gaze;
    if (gz && gz.k > 0) {
      I.lookX += (gz.x - I.lookX) * gz.k; I.lookY += (gz.y - I.lookY) * gz.k;
      I.blink = I.blink * (1 - gz.k) + gz.blink * gz.k;
      I.lid = 0.22 + (gz.lid - 0.22) * gz.k;
      I.squint *= 1 - gz.k;
    } else I.lid = 0.22;
    this.rig.update(dt);
    this.root.updateMatrixWorld(true);
    this.birds.update(dt, t);
    this.flock.update(t);
  }

  /** Planted ground height under each foot (creature-space y), so the feet follow uneven ground. */
  setGround(l: Leg, y: number) { this.rig.groundY[l] = y; }
  static legs = LEGS;
}

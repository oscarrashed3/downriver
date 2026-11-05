import * as THREE from 'three';
import { toon } from '../world/props';
import { addOutlines } from '../render/paint';
import { clamp, lerp } from '../world/noise';

/** How someone looks. Every person in the game is built from this, so they share one style. */
export interface PersonLook {
  height?: number;      // overall scale; 1 = Rill (about 1.75 m)
  build?: number;       // width
  head?: number;        // head size multiplier (children have bigger heads)
  skin: string;
  hair: string;
  hairStyle: 'messy' | 'bun' | 'pigtails' | 'short' | 'bald' | 'long';
  top: string;          // shirt / sleeves under the coat
  coat?: string;        // long coat or robe color
  coatLen?: number;     // 0.4 (short jacket) .. 1 (to the ankle)
  dress?: boolean;      // the coat is a skirt/dress, no visible trousers
  trousers: string;
  boots: string;
  scarf?: string;
  shawl?: string;
  apron?: string;
  satchel?: boolean;
  hat?: 'wide' | 'cap' | 'paper' | 'none';
  hatColor?: string;
  beard?: string;
  glasses?: boolean;
  hunch?: number;       // 0..1, older people stoop a little
}

export type IdleKind = 'weave' | 'tinker' | 'count' | 'fold' | 'point' | 'none';

export interface PoseInput {
  speed: number;
  grounded: boolean;
  climbing?: boolean;
  vUp?: number;
  sit?: number;
  lie?: number;
  wave?: number;
  listen?: number;
  surprise?: number;
  shiver?: number;
  shield?: number;
  touchChest?: number;
  smile?: number;
  talking?: boolean;
  idle?: IdleKind;
  lookAt?: THREE.Vector3 | null;
  /** Wind in this person's local space (for scarf, hair and coat). */
  windLocal?: THREE.Vector3;
}

const cap = (r: number, len: number) => new THREE.CapsuleGeometry(r, len, 4, 10);
const sph = (r: number, w = 14, h = 10) => new THREE.SphereGeometry(r, w, h);
function mk(g: THREE.BufferGeometry, color: string, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(g, toon(color)); m.position.set(x, y, z); m.castShadow = true; return m;
}

export class Person {
  root = new THREE.Group();
  body = new THREE.Group();
  hips = new THREE.Group();
  torso = new THREE.Group();
  neck = new THREE.Group();
  head = new THREE.Group();
  hair = new THREE.Group();
  coat: THREE.Mesh | null = null;
  legs: { thigh: THREE.Group; knee: THREE.Group }[] = [];
  arms: { sh: THREE.Group; el: THREE.Group; hand: THREE.Mesh }[] = [];
  eyes: THREE.Group[] = [];
  brows: THREE.Mesh[] = [];
  mouthFlat: THREE.Mesh;
  mouthSmile: THREE.Mesh;
  mouthO: THREE.Mesh;
  scarfTail: THREE.Group[] = [];
  satchel: THREE.Group | null = null;
  hipR = new THREE.Group();
  hairClumps: THREE.Object3D[] = [];
  private phase = 0;
  private t = Math.random() * 10;
  private blinkT = 2;
  private headYaw = 0;
  private headPitch = 0;
  private hipY: number;
  private glanceT = 3;
  private glance = 0;
  private sm: Record<string, number> = {};
  H: number;

  constructor(public look: PersonLook) {
    const H = this.H = look.height ?? 1;
    const B = look.build ?? 1;
    const HS = look.head ?? 1;
    this.hipY = 0.88;
    this.root.add(this.body);
    this.body.add(this.hips);
    this.hips.position.y = this.hipY;
    this.body.scale.setScalar(H);

    // Legs
    for (const s of [-1, 1]) {
      const thigh = new THREE.Group(); thigh.position.set(0.1 * s * B, -0.02, 0);
      thigh.add(mk(cap(0.075 * B, 0.27), look.dress ? look.coat ?? look.trousers : look.trousers, 0, -0.2, 0));
      const knee = new THREE.Group(); knee.position.y = -0.4;
      knee.add(mk(cap(0.064 * B, 0.26), look.trousers, 0, -0.18, 0));
      const boot = mk(sph(0.085, 10, 8), look.boots, 0, -0.39, 0.04); boot.scale.set(0.95, 0.75, 1.45);
      knee.add(boot);
      thigh.add(knee);
      this.hips.add(thigh);
      this.legs.push({ thigh, knee });
    }

    // Torso
    this.hips.add(this.torso);
    const chest = mk(cap(0.17 * B, 0.26), look.top, 0, 0.27, 0); chest.scale.set(1, 1, 0.78);
    this.torso.add(chest);
    const pelvis = mk(sph(0.16 * B, 12, 8), look.trousers, 0, 0.03, 0); pelvis.scale.set(1.05, 0.7, 0.85);
    this.torso.add(pelvis);
    if (look.coat) {
      const len = look.coatLen ?? 0.85;
      const bottom = 0.5 - 1.15 * len;
      const prof = [
        new THREE.Vector2(0.0, 0.5), new THREE.Vector2(0.15 * B, 0.5), new THREE.Vector2(0.2 * B, 0.44), new THREE.Vector2(0.2 * B, 0.2),
        new THREE.Vector2(0.21 * B, 0.0), new THREE.Vector2((0.24 + len * 0.1) * B, bottom * 0.5), new THREE.Vector2((0.27 + len * 0.12) * B, bottom),
        new THREE.Vector2((0.25 + len * 0.12) * B, bottom - 0.01),
      ];
      const coat = mk(new THREE.LatheGeometry(prof, 16), look.coat);
      coat.scale.set(1, 1, 0.82);
      (coat.material as THREE.Material).side = THREE.DoubleSide;
      this.coat = coat;
      this.torso.add(coat);
      if (!look.dress) {
        // open coat front: a strip of shirt down the chest
        const strip = mk(new THREE.BoxGeometry(0.1 * B, 0.36, 0.02), look.top, 0, 0.27, 0.155);
        this.torso.add(strip);
      }
    }
    if (look.apron) { const ap = mk(new THREE.BoxGeometry(0.28 * B, 0.5, 0.02), look.apron, 0, -0.05, 0.2); ap.rotation.x = 0.12; this.torso.add(ap); }
    if (look.shawl) { const sh = mk(new THREE.ConeGeometry(0.3 * B, 0.3, 14, 1, true), look.shawl, 0, 0.42, 0); sh.scale.set(1, 1, 0.85); (sh.material as THREE.Material).side = THREE.DoubleSide; this.torso.add(sh); }

    // Arms
    for (const s of [-1, 1]) {
      const sh = new THREE.Group(); sh.position.set(0.215 * s * B, 0.42, 0);
      const sleeve = look.coat && !look.dress ? look.coat : look.top;
      sh.add(mk(cap(0.052 * B, 0.2), sleeve, 0, -0.13, 0));
      const el = new THREE.Group(); el.position.y = -0.27;
      el.add(mk(cap(0.045 * B, 0.15), look.skin, 0, -0.1, 0));
      el.add(mk(new THREE.TorusGeometry(0.048 * B, 0.02, 6, 12), sleeve, 0, -0.02, 0).rotateX(Math.PI / 2));
      const hand = mk(sph(0.058, 10, 8), look.skin, 0, -0.24, 0.01); hand.scale.set(0.9, 1.1, 0.8);
      el.add(hand);
      sh.add(el);
      sh.rotation.z = 0.08 * s;
      this.torso.add(sh);
      this.arms.push({ sh, el, hand });
    }

    // Neck and head
    this.neck.position.y = 0.5;
    this.torso.add(this.neck);
    this.neck.add(mk(new THREE.CylinderGeometry(0.05, 0.06, 0.1, 8), look.skin, 0, 0.02, 0));
    this.head.position.y = 0.07;
    this.head.scale.setScalar(HS);
    this.neck.add(this.head);
    const skull = mk(sph(0.165), look.skin, 0, 0.17, 0); skull.scale.set(1, 1.05, 0.98);
    this.head.add(skull);
    const jaw = mk(sph(0.12, 12, 8), look.skin, 0, 0.1, 0.035); jaw.scale.set(1.1, 0.8, 1); this.head.add(jaw);
    for (const s of [-1, 1]) {
      const eye = new THREE.Group(); eye.position.set(0.062 * s, 0.185, 0.148);
      const iris = new THREE.Mesh(sph(0.026, 10, 8), toon('#2a2230')); iris.scale.set(0.85, 1.35, 0.5); iris.userData.noOutline = true;
      const glint = new THREE.Mesh(sph(0.008, 6, 4), new THREE.MeshBasicMaterial({ color: '#ffffff' })); glint.position.set(0.008 * s, 0.012, 0.012); glint.userData.noOutline = true;
      eye.add(iris, glint);
      this.head.add(eye); this.eyes.push(eye);
      const brow = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.013, 0.012), toon(look.hair === '#f2f0ea' ? '#bdb8ae' : look.hair));
      brow.position.set(0.062 * s, 0.238, 0.152); brow.rotation.z = -0.12 * s; brow.userData.noOutline = true;
      this.head.add(brow); this.brows.push(brow);
      const ear = mk(sph(0.032, 8, 6), look.skin, 0.162 * s, 0.16, 0); ear.scale.set(0.6, 1, 0.9); this.head.add(ear);
      const blush = new THREE.Mesh(new THREE.CircleGeometry(0.024, 12), toon('#f0a39a')); blush.position.set(0.09 * s, 0.135, 0.142); blush.rotation.y = 0.5 * s; blush.userData.noOutline = true;
      this.head.add(blush);
    }
    const nose = mk(sph(0.02, 8, 6), look.skin, 0, 0.15, 0.163); nose.userData.noOutline = true; this.head.add(nose);
    this.mouthFlat = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.008, 0.01), toon('#6a3a3a')); this.mouthFlat.position.set(0, 0.105, 0.152); this.mouthFlat.userData.noOutline = true;
    this.mouthSmile = new THREE.Mesh(new THREE.TorusGeometry(0.024, 0.006, 4, 12, Math.PI), toon('#6a3a3a')); this.mouthSmile.position.set(0, 0.115, 0.15); this.mouthSmile.rotation.z = Math.PI; this.mouthSmile.userData.noOutline = true;
    this.mouthO = new THREE.Mesh(sph(0.014, 8, 6), toon('#5a2a30')); this.mouthO.position.set(0, 0.1, 0.152); this.mouthO.scale.set(1, 1.3, 0.4); this.mouthO.userData.noOutline = true;
    this.head.add(this.mouthFlat, this.mouthSmile, this.mouthO);
    if (look.glasses) {
      for (const s of [-1, 1]) { const g = new THREE.Mesh(new THREE.TorusGeometry(0.034, 0.006, 4, 14), toon('#3a3030')); g.position.set(0.062 * s, 0.185, 0.165); g.userData.noOutline = true; this.head.add(g); }
    }
    if (look.beard) {
      const bd = mk(sph(0.13, 12, 8), look.beard, 0, 0.06, 0.06); bd.scale.set(1.0, 1.15, 0.8); this.head.add(bd);
      const ms = mk(sph(0.05, 8, 6), look.beard, 0, 0.125, 0.15); ms.scale.set(1.5, 0.5, 0.6); this.head.add(ms);
    }
    this.buildHair(look);
    if (look.hat && look.hat !== 'none') {
      const hc = look.hatColor ?? '#7a5a3a';
      const hat = new THREE.Group(); hat.position.y = 0.3;
      if (look.hat === 'wide') { hat.add(mk(new THREE.CylinderGeometry(0.32, 0.33, 0.025, 20), hc)); hat.add(mk(new THREE.CylinderGeometry(0.13, 0.16, 0.14, 16), hc, 0, 0.07, 0)); }
      if (look.hat === 'cap') { const c = mk(sph(0.17, 14, 8), hc, 0, -0.02, 0); c.scale.set(1.05, 0.55, 1.05); hat.add(c); hat.add(mk(new THREE.BoxGeometry(0.16, 0.015, 0.12), hc, 0, -0.06, 0.16)); }
      if (look.hat === 'paper') { const c = mk(new THREE.ConeGeometry(0.17, 0.2, 3), '#f2ead6', 0, 0.02, 0); c.rotation.y = Math.PI / 6; c.scale.set(1.3, 1, 0.6); hat.add(c); }
      this.head.add(hat);
    }

    // Scarf
    if (look.scarf) {
      const ring = mk(new THREE.TorusGeometry(0.11 * B, 0.05, 8, 16), look.scarf, 0, 0.47, 0); ring.rotation.x = Math.PI / 2; this.torso.add(ring);
      let parent: THREE.Object3D = this.torso;
      let y = 0.46;
      for (let i = 0; i < 4; i++) {
        const seg = new THREE.Group(); seg.position.set(i === 0 ? 0.06 : 0, i === 0 ? y : -0.11, i === 0 ? -0.11 : 0);
        const m = mk(new THREE.BoxGeometry(0.085, 0.12, 0.022), look.scarf, 0, -0.055, 0);
        seg.add(m); parent.add(seg); parent = seg; this.scarfTail.push(seg);
        y = 0;
      }
    }
    // Satchel and strap
    if (look.satchel) {
      const strap = mk(new THREE.TorusGeometry(0.24, 0.016, 6, 24), '#6a4428', 0, 0.22, 0);
      strap.rotation.set(0, Math.PI / 2, 0.75); strap.scale.set(1, 1.15, 0.85); this.torso.add(strap);
      const bag = new THREE.Group(); bag.position.set(-0.2, -0.02, 0.06);
      const body = mk(new THREE.BoxGeometry(0.07, 0.17, 0.2), '#8a5a34'); body.position.y = 0;
      const flap = mk(new THREE.BoxGeometry(0.075, 0.07, 0.21), '#7a4a2a', 0.002, 0.07, 0);
      const buckle = mk(new THREE.BoxGeometry(0.08, 0.025, 0.03), '#d8b060', 0.004, 0.04, 0); buckle.userData.noOutline = true;
      bag.add(body, flap, buckle);
      this.torso.add(bag); this.satchel = bag;
    }
    this.hipR.position.set(0.2, -0.02, 0.05);
    this.torso.add(this.hipR);
    if (look.hunch) this.torso.rotation.x = look.hunch * 0.3;

    addOutlines(this.root, '#3a2a2e', 0.012);
  }

  private buildHair(look: PersonLook) {
    const c = look.hair;
    this.head.add(this.hair);
    const clump = (x: number, y: number, z: number, r: number, sx = 1, sy = 1, sz = 1) => {
      const m = mk(sph(r, 10, 8), c, x, y, z); m.scale.set(sx, sy, sz); this.hair.add(m); this.hairClumps.push(m); return m;
    };
    switch (look.hairStyle) {
      case 'messy': {
        clump(0, 0.27, -0.02, 0.15, 1.15, 0.7, 1.1);
        clump(0, 0.2, -0.09, 0.15, 1.1, 1.0, 0.9);
        for (let i = 0; i < 5; i++) { const a = -0.9 + i * 0.45; const m = clump(Math.sin(a) * 0.11, 0.27, Math.cos(a) * 0.1, 0.06, 1, 0.8, 1.6); m.rotation.x = 0.9; m.rotation.z = -a * 0.5; }
        for (const s of [-1, 1]) { const m = clump(0.15 * s, 0.2, -0.02, 0.05, 0.6, 1.4, 1); m.rotation.z = 0.3 * s; }
        const tuft = clump(0.03, 0.36, -0.02, 0.04, 0.6, 1.8, 0.6); tuft.rotation.z = -0.5;
        break;
      }
      case 'short': clump(0, 0.24, -0.03, 0.17, 1.03, 0.75, 1.03); break;
      case 'bun': clump(0, 0.24, -0.03, 0.17, 1.04, 0.78, 1.04); clump(0, 0.33, -0.12, 0.08); break;
      case 'pigtails':
        clump(0, 0.24, -0.03, 0.17, 1.05, 0.8, 1.05);
        for (const s of [-1, 1]) { const m = clump(0.17 * s, 0.12, -0.05, 0.055, 0.8, 1.6, 0.8); m.rotation.z = 0.4 * s; }
        clump(0, 0.27, 0.11, 0.07, 1.6, 0.5, 0.6);
        break;
      case 'long': clump(0, 0.24, -0.03, 0.17, 1.05, 0.8, 1.05); clump(0, 0.08, -0.1, 0.15, 1.05, 1.5, 0.6); break;
      case 'bald': clump(0, 0.15, -0.12, 0.12, 1.2, 0.6, 0.5); break;
    }
  }

  private s(key: string, target: number, dt: number, rate = 8) {
    const v = this.sm[key] ?? target;
    const n = lerp(v, target, 1 - Math.exp(-rate * dt));
    this.sm[key] = n;
    return n;
  }

  animate(dt: number, p: PoseInput) {
    this.t += dt;
    const t = this.t;
    const sp = p.speed;
    const moving = clamp(sp / 5.5);
    const run = clamp((sp - 5.5) / 4);
    this.phase += dt * (sp > 0.2 ? 3.2 + sp * 1.05 : 0);
    const ph = this.phase;
    const sit = this.s('sit', p.sit ?? 0, dt, 5);
    const lie = this.s('lie', p.lie ?? 0, dt, 4);
    const wave = this.s('wave', p.wave ?? 0, dt, 6);
    const listen = this.s('listen', p.listen ?? 0, dt, 5);
    const surprise = this.s('surprise', p.surprise ?? 0, dt, 10);
    const shiver = this.s('shiver', p.shiver ?? 0, dt, 3);
    const shield = this.s('shield', p.shield ?? 0, dt, 5);
    const chest = this.s('chest', p.touchChest ?? 0, dt, 5);
    const smile = this.s('smile', p.smile ?? 0, dt, 4);
    const air = this.s('air', p.grounded ? 0 : 1, dt, 10);
    const climb = this.s('climb', p.climbing ? 1 : 0, dt, 8);
    const idle = p.idle ?? 'none';

    // Legs: stride when walking, tuck in the air, fold when sitting.
    const amp = moving * (0.55 + run * 0.35) * (1 - sit) * (1 - lie);
    for (let i = 0; i < 2; i++) {
      const L = this.legs[i];
      const o = i === 0 ? 0 : Math.PI;
      const sw = Math.sin(ph + o);
      let thigh = sw * amp;
      let knee = Math.max(0, -Math.cos(ph + o)) * amp * 1.2 + 0.05;
      thigh = lerp(thigh, -0.45 + (i ? 0.2 : -0.1), air);
      knee = lerp(knee, 0.9, air);
      thigh = lerp(thigh, Math.sin(t * 6 + o) * 0.5 - 0.3, climb);
      knee = lerp(knee, 0.7 + Math.sin(t * 6 + o) * 0.4, climb);
      thigh = lerp(thigh, -1.5, sit); knee = lerp(knee, 1.45, sit);
      L.thigh.rotation.x = thigh; L.knee.rotation.x = knee;
      L.thigh.rotation.z = lerp(0, (i ? 1 : -1) * 0.08, sit);
    }
    // Body bob and lean.
    const bob = Math.abs(Math.sin(ph)) * moving * (0.035 + run * 0.03) * (1 - air);
    this.hips.position.y = lerp(this.hipY + bob - moving * 0.02, 0.2, sit);
    const breath = Math.sin(t * 1.7) * 0.012;
    let lean = moving * 0.06 + run * 0.16 - air * 0.05 + climb * 0.35 + listen * 0.08 + (this.look.hunch ?? 0) * 0.3;
    lean = lerp(lean, -0.12, sit);
    this.torso.rotation.x = lean + breath * 0.3 + Math.sin(t * 34) * shiver * 0.02;
    this.torso.rotation.z = Math.sin(t * 41) * shiver * 0.03 + Math.sin(ph) * moving * 0.035;
    this.torso.rotation.y = Math.sin(ph) * moving * 0.1;
    this.torso.scale.set(1, 1 + breath, 1);
    // Lying down: rotate the whole body onto its back.
    this.body.rotation.x = -lie * Math.PI / 2;
    this.body.position.y = lie * 0.18 * this.H;
    this.body.position.z = -lie * 0.6 * this.H;

    // Arms
    for (let i = 0; i < 2; i++) {
      const A = this.arms[i];
      const s = i === 0 ? -1 : 1;
      const o = i === 0 ? Math.PI : 0;
      let x = Math.sin(ph + o) * amp * 0.9, z = 0.08 * s + air * 0.5 * s, el = -0.25 - run * 0.9;
      // climbing: reach up alternately
      x = lerp(x, -2.5 + Math.sin(t * 6 + o) * 0.4, climb); el = lerp(el, -0.3, climb);
      // idle activities
      if (sp < 0.3 && sit < 0.5) {
        if (idle === 'weave') { x = lerp(x, -0.9 + Math.sin(t * 3 + o) * 0.12, 1); el = -1.3 + Math.sin(t * 3 + o) * 0.15; z = -0.25 * s; }
        if (idle === 'fold') { x = -0.8 + Math.sin(t * 2.2 + i) * 0.1; el = -1.6 + Math.sin(t * 4.4 + o) * 0.25; z = -0.3 * s; }
        if (idle === 'tinker' && i === 1) { x = -0.9; el = -1.0 + Math.abs(Math.sin(t * 5)) * 0.5; z = -0.2; }
        if (idle === 'count' && i === 1) { x = -1.3 + Math.sin(t * 0.8) * 0.2; el = -0.2; z = 0.2; }
        if (idle === 'point' && i === 1) { x = -2.6; el = 0; z = 0.1; }
      }
      if (p.talking && sp < 0.3) { x += Math.sin(t * 2.3 + i * 1.7) * 0.12 - 0.2; el += Math.sin(t * 3.1 + i) * 0.15 - 0.3; }
      // listening: hands together in front
      x = lerp(x, -0.45, listen); el = lerp(el, -1.2, listen); z = lerp(z, -0.35 * s, listen);
      // shiver: hug yourself
      x = lerp(x, -0.6, shiver * 0.8); el = lerp(el, -1.9, shiver * 0.8); z = lerp(z, -0.5 * s, shiver * 0.8);
      // sitting: hands on knees
      x = lerp(x, -0.9, sit); el = lerp(el, -0.4, sit);
      if (i === 1) {
        // right arm: wave, shield eyes, touch chest
        x = lerp(x, -0.3, wave); z = lerp(z, 2.6 + Math.sin(t * 9) * 0.25 * 0, wave); el = lerp(el, -0.6 + Math.sin(t * 9) * 0.45, wave);
        x = lerp(x, -2.3, shield); z = lerp(z, -0.35, shield); el = lerp(el, -1.9, shield);
        x = lerp(x, -0.8, chest); z = lerp(z, -0.6, chest); el = lerp(el, -1.85, chest);
      }
      x = lerp(x, -0.2, surprise); z = lerp(z, 0.7 * s, surprise); el = lerp(el, -0.6, surprise);
      A.sh.rotation.set(x, 0, z);
      A.el.rotation.set(el, 0, 0);
    }

    // Head: look at something, glance around when idle.
    this.glanceT -= dt;
    if (this.glanceT < 0) { this.glanceT = 2.5 + Math.random() * 4; this.glance = sp < 0.3 && !p.lookAt ? (Math.random() - 0.5) * 1.4 : 0; }
    let yaw = this.glance * (1 - moving), pitch = 0;
    if (p.lookAt) {
      const local = this.neck.worldToLocal(p.lookAt.clone());
      yaw = clamp(Math.atan2(local.x, local.z), -1.1, 1.1);
      pitch = clamp(-Math.atan2(local.y - 0.2, Math.hypot(local.x, local.z)), -0.6, 0.5);
      if (Math.abs(Math.atan2(local.x, local.z)) > 2.2) { yaw = 0; pitch = 0; }
    }
    if (idle === 'point' && sp < 0.3) pitch = -0.6;
    if (idle === 'count' && sp < 0.3) yaw = Math.sin(t * 0.6) * 0.7;
    pitch = lerp(pitch, -0.35, shield * 0.6);
    pitch = lerp(pitch, 0.25, chest * 0.5);
    this.headYaw = lerp(this.headYaw, yaw, 1 - Math.exp(-5 * dt));
    this.headPitch = lerp(this.headPitch, pitch, 1 - Math.exp(-5 * dt));
    this.head.rotation.set(this.headPitch, this.headYaw, listen * 0.18 + Math.sin(t * 0.9) * 0.02);

    // Face: blink, brows, mouth.
    this.blinkT -= dt;
    let open = 1;
    if (this.blinkT < 0.12) open = Math.abs(this.blinkT - 0.06) / 0.06;
    if (this.blinkT < 0) this.blinkT = 2 + Math.random() * 3.5;
    open = Math.max(open, surprise);
    if (lie > 0.9 && (p.lie ?? 0) > 0.9) open = 0.05;
    for (const e of this.eyes) e.scale.set(1 + surprise * 0.2, Math.max(0.08, open) * (1 + surprise * 0.25), 1);
    for (let i = 0; i < 2; i++) {
      const b = this.brows[i], s = i === 0 ? -1 : 1;
      b.position.y = 0.238 + surprise * 0.02 + smile * 0.006 - shiver * 0.006;
      b.rotation.z = -0.12 * s + shiver * 0.25 * s - surprise * 0.1 * s;
    }
    this.mouthSmile.visible = smile > 0.5 && surprise < 0.5;
    this.mouthO.visible = surprise >= 0.5 || (p.talking === true && Math.sin(t * 14) > 0.3);
    this.mouthFlat.visible = !this.mouthSmile.visible && !this.mouthO.visible;

    // Secondary motion: scarf, hair, coat follow the wind and the stride.
    const w = p.windLocal ?? new THREE.Vector3(0.3, 0, -0.5);
    const flutter = Math.sin(t * 7) * 0.15 + Math.sin(t * 11.3) * 0.08;
    const trail = clamp(sp / 8) * 0.9;
    this.scarfTail.forEach((seg, i) => {
      seg.rotation.x = -(trail + Math.max(0, -w.z) * 0.6) * (i === 0 ? 0.9 : 0.35) + flutter * (0.4 + i * 0.25) * (0.4 + trail);
      seg.rotation.z = w.x * 0.5 * (i === 0 ? 1 : 0.3) + Math.sin(t * 5 + i) * 0.06;
    });
    this.hairClumps.forEach((h, i) => { h.rotation.y = Math.sin(t * 4 + i) * 0.05 * (0.5 + trail); });
    if (this.coat) this.coat.rotation.x = -(trail * 0.12) + Math.sin(ph * 2) * moving * 0.02 - air * 0.08 + lerp(0, 0.25, sit);
  }
}

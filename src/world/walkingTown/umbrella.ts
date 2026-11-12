import * as THREE from 'three';
import type { Player } from '../../player/player';
import { paint, softRamp } from '../../render/paint';

// Fold as a paper umbrella (World 3): cream paper with a faint pattern of leaves, eight bamboo ribs, a thin shaft
// and a crook handle in Nilo's raised hand. It opens with a soft pop when he drops off Old Amble's back, sways a
// little as he drifts down, and folds back up into Fold when his feet touch the grass.

let paperTex: THREE.CanvasTexture | null = null;
function leafPaper() {
  if (paperTex) return paperTex;
  const S = 256, c = document.createElement('canvas'); c.width = c.height = S;
  const x = c.getContext('2d')!;
  x.fillStyle = '#f4ecd8'; x.fillRect(0, 0, S, S);
  // the paper's own fibres
  let s = 7; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 500; i++) { x.fillStyle = `rgba(${200 + r() * 40},${190 + r() * 40},${160 + r() * 30},0.12)`; x.fillRect(r() * S, r() * S, 1 + r() * 6, 1); }
  // faint leaves, pressed into it
  for (let i = 0; i < 16; i++) {
    const cx = r() * S, cy = r() * S, len = 26 + r() * 30, w = len * 0.32, a = r() * Math.PI * 2;
    x.save(); x.translate(cx, cy); x.rotate(a);
    x.fillStyle = 'rgba(150,172,112,0.20)';
    x.beginPath(); x.moveTo(0, 0); x.bezierCurveTo(w, len * 0.25, w * 0.8, len * 0.75, 0, len); x.bezierCurveTo(-w * 0.8, len * 0.75, -w, len * 0.25, 0, 0); x.fill();
    x.strokeStyle = 'rgba(130,150,96,0.25)'; x.lineWidth = 1.2;
    x.beginPath(); x.moveTo(0, 2); x.lineTo(0, len * 0.95); x.stroke();
    for (let k = 1; k < 5; k++) { const y = len * k / 5.5; x.beginPath(); x.moveTo(0, y); x.lineTo(w * 0.6, y + len * 0.12); x.moveTo(0, y); x.lineTo(-w * 0.6, y + len * 0.12); x.stroke(); }
    x.restore();
  }
  paperTex = new THREE.CanvasTexture(c);
  paperTex.colorSpace = THREE.SRGBColorSpace;
  paperTex.wrapS = paperTex.wrapT = THREE.RepeatWrapping;
  return paperTex;
}

const RIBS = 8;

export class PaperUmbrella {
  readonly root = new THREE.Group();
  private canopy: THREE.Mesh;
  private ribs: THREE.Group;
  /** Open amount 0..1 (eased). */
  k = 0;
  open = false;
  private sway = new THREE.Vector3();
  private up = new THREE.Vector3(0, 1, 0);

  constructor() {
    this.root.name = 'paperUmbrella';
    this.root.visible = false;
    const R = 0.95, H = 0.34;
    // the canopy: eight panels, each sagging a little between its ribs, with a scalloped rim
    const pos: number[] = [], uv: number[] = [], idx: number[] = [];
    const NS = 6, NR = 6;
    for (let p = 0; p < RIBS; p++) {
      const base = pos.length / 3;
      for (let i = 0; i <= NR; i++) {
        const t = i / NR;
        for (let j = 0; j <= NS; j++) {
          const u = j / NS, a = ((p + u) / RIBS) * Math.PI * 2;
          const sag = Math.sin(u * Math.PI) * 0.06 * t;
          const rr = R * t * (1 - sag * 0.6) + (i === NR ? Math.sin(u * Math.PI) * -0.05 : 0);
          const y = H * (1 - t * t) - sag;
          pos.push(Math.cos(a) * rr, y, Math.sin(a) * rr);
          uv.push(Math.cos(a) * t * 0.9 + 0.5, Math.sin(a) * t * 0.9 + 0.5);
        }
      }
      for (let i = 0; i < NR; i++) for (let j = 0; j < NS; j++) {
        const a0 = base + i * (NS + 1) + j, a1 = a0 + 1, b0 = a0 + NS + 1, b1 = b0 + 1;
        idx.push(a0, b0, a1, a1, b0, b1);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx); g.computeVertexNormals();
    const paper = paint(new THREE.MeshToonMaterial({ color: '#ffffff', map: leafPaper(), gradientMap: softRamp(), side: THREE.DoubleSide }), { variation: 0.15, rim: 0.9 });
    this.canopy = new THREE.Mesh(g, paper);
    this.canopy.castShadow = true;
    this.canopy.userData.noOutline = true;
    // the ribs, the shaft, the crook and the little top knob
    this.ribs = new THREE.Group();
    const bamboo = paint(new THREE.MeshToonMaterial({ color: '#b48a56', gradientMap: softRamp() }), { variation: 0.2 });
    for (let p = 0; p < RIBS; p++) {
      const a = (p / RIBS) * Math.PI * 2;
      const pts = [0, 0.33, 0.66, 1].map(t => new THREE.Vector3(Math.cos(a) * R * t, H * (1 - t * t) - 0.012, Math.sin(a) * R * t));
      const rib = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 6, 0.012, 4), bamboo);
      this.ribs.add(rib);
    }
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 1.05, 6), bamboo); shaft.position.y = -0.52;
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), bamboo); knob.position.y = H + 0.02;
    const crook = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.016, 5, 12, Math.PI), bamboo); crook.position.set(0.06, -1.05, 0); crook.rotation.z = Math.PI;
    this.root.add(this.canopy, this.ribs, shaft, knob, crook);
  }

  get shown() { return this.root.visible; }

  /** Pop open over Nilo's head. */
  openAt(pl: Player) {
    this.open = true;
    this.root.visible = true;
    this.k = Math.max(this.k, 0.05);
    this.up.copy(pl.up);
    this.sway.set(0, 0, 0);
  }

  /** Fold away (now: at once, leaving the world). */
  close(now = false) {
    this.open = false;
    if (now) { this.k = 0; this.root.visible = false; }
  }

  update(dt: number, t: number, pl: Player) {
    if (!this.root.visible) return;
    this.k += ((this.open ? 1 : 0) - this.k) * (1 - Math.exp(-(this.open ? 9 : 6) * dt));
    if (!this.open && this.k < 0.03) { this.root.visible = false; this.k = 0; return; }
    // the canopy opens out from closed (a slim cone) to a wide shallow dome
    const k = this.k;
    this.canopy.scale.set(0.15 + 0.85 * k, 1 + (1 - k) * 1.6, 0.15 + 0.85 * k);
    this.ribs.scale.copy(this.canopy.scale);
    // held up in the right hand; the canopy leans back against the drift and sways
    const hand = pl.person.arms[1].hand.getWorldPosition(new THREE.Vector3());
    const drift = pl.vel.clone().projectOnPlane(pl.up);
    this.sway.lerp(drift.multiplyScalar(-0.05), 1 - Math.exp(-3 * dt));
    this.up.copy(pl.up).add(this.sway).addScaledVector(pl.facing, Math.sin(t * 1.7) * 0.03).normalize();
    this.root.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), this.up);
    this.root.position.copy(hand).addScaledVector(this.up, 1.0);
  }
}

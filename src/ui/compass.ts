import * as THREE from 'three';

/** What the compass needs each frame. Positions are world positions; the custom pin is planet-local. */
export interface CompassInfo {
  show: boolean;
  center: THREE.Vector3;
  radius: number;
  worldId: string;
  pos: THREE.Vector3;
  camera: THREE.Camera;
  task: THREE.Vector3 | null;
  taskLabel: string | null;
  pins: { customPin(worldId: string): THREE.Vector3 | null; clearPin(worldId: string): void; pinVersion: number };
  /** Someone big to keep track of (World 3: Old Amble, when you are off its back), world position. */
  friend?: { pos: THREE.Vector3; label: string } | null;
}

/** Half the angle the strip spans, in degrees. */
const SPAN = 80;
const ARRIVE = 4;

/**
 * A thin compass strip along the top of the screen. N, E, S and W slide past as the view turns; the task pin
 * (gold) and your own pin show as markers with their distance, and an arrow at the edge points the shortest
 * way round when one is behind you.
 */
export class Compass {
  el: HTMLElement;
  private track: HTMLElement;
  private task: { mk: HTMLElement; arrow: HTMLElement; dist: HTMLElement };
  private mine: { mk: HTMLElement; arrow: HTMLElement; dist: HTMLElement };
  private friend: { mk: HTMLElement; arrow: HTMLElement; dist: HTMLElement };
  private ticks: { el: HTMLElement; deg: number }[] = [];
  private lastLabel: string | null = null;
  private pinArmed = false;
  private pinVer = -1;
  private pinClearT = 0;
  /** Last values, for playtests. */
  state = { heading: 0, taskRel: 0, taskDist: 0, pinRel: 0, pinDist: 0, taskBehind: 0, pinBehind: 0, taskGone: false };

  constructor() {
    this.el = document.createElement('div');
    this.el.className = 'compass';
    this.el.innerHTML = `<div class="ctrack"></div>`;
    this.track = this.el.querySelector('.ctrack')!;
    for (let d = 0; d < 360; d += 15) {
      const t = document.createElement('div');
      const main = d % 90 === 0;
      t.className = main ? 'ctick main' : d % 45 === 0 ? 'ctick mid' : 'ctick';
      if (main) t.innerHTML = `<b>${['N', 'E', 'S', 'W'][d / 90]}</b>`;
      this.track.append(t); this.ticks.push({ el: t, deg: d });
    }
    const mk = (cls: string) => {
      const m = document.createElement('div'); m.className = 'cmark ' + cls; m.innerHTML = `<i></i><span></span>`;
      const a = document.createElement('div'); a.className = 'carrow ' + cls;
      this.el.append(m, a);
      return { mk: m, arrow: a, dist: m.querySelector('span') as HTMLElement };
    };
    this.task = mk('task'); this.mine = mk('mine'); this.friend = mk('friend');
  }

  update(_dt: number, c: CompassInfo) {
    this.el.classList.toggle('on', c.show);
    if (!c.show) return;
    const up = c.pos.clone().sub(c.center).normalize();
    // north is the spring: the planet's +Y pole
    const north = new THREE.Vector3(0, 1, 0).projectOnPlane(up);
    if (north.lengthSq() < 1e-6) north.set(0, 0, -1).projectOnPlane(up);
    north.normalize();
    const east = new THREE.Vector3().crossVectors(north, up).normalize();
    const f = c.camera.getWorldDirection(new THREE.Vector3()).projectOnPlane(up);
    if (f.lengthSq() < 1e-6) f.copy(north);
    const heading = Math.atan2(f.dot(east), f.dot(north)) / Math.PI * 180;
    this.state.heading = heading;
    for (const t of this.ticks) {
      const rel = wrap(t.deg - heading);
      const vis = Math.abs(rel) <= SPAN;
      t.el.style.display = vis ? '' : 'none';
      if (vis) { t.el.style.left = `${50 + rel / SPAN * 50}%`; t.el.style.opacity = String(1 - Math.pow(Math.abs(rel) / SPAN, 3)); }
    }
    const place = (dir: THREE.Vector3) => {
      const t = dir.clone().projectOnPlane(up);
      const rel = t.lengthSq() < 1e-8 ? 0 : wrap(Math.atan2(t.dot(east), t.dot(north)) / Math.PI * 180 - heading);
      const dist = Math.acos(Math.max(-1, Math.min(1, dir.dot(up)))) * c.radius;
      return { rel, dist };
    };
    // the task pin
    if (c.task && c.taskLabel) {
      const { rel, dist } = place(c.task.clone().sub(c.center).normalize());
      if (c.taskLabel !== this.lastLabel) { this.lastLabel = c.taskLabel; this.task.mk.classList.remove('pulse'); void this.task.mk.offsetWidth; this.task.mk.classList.add('pulse'); }
      this.state.taskRel = rel; this.state.taskDist = dist; this.state.taskGone = dist < ARRIVE;
      this.state.taskBehind = this.setMarker(this.task, rel, dist, dist >= ARRIVE);
    } else { this.lastLabel = null; this.state.taskGone = true; this.setMarker(this.task, 0, 0, false); }
    // your own pin: it clears once you reach it (after having been away from it)
    const pin = c.pins.customPin(c.worldId);
    if (c.pins.pinVersion !== this.pinVer) { this.pinVer = c.pins.pinVersion; this.pinArmed = false; this.pinClearT = 0; }
    if (pin) {
      const { rel, dist } = place(pin);
      if (dist > ARRIVE * 2) this.pinArmed = true;
      if (this.pinArmed && dist < ARRIVE) {
        this.pinClearT += _dt;
        if (this.pinClearT > 0.8) { c.pins.clearPin(c.worldId); this.pinClearT = 0; }
      }
      this.state.pinRel = rel; this.state.pinDist = dist;
      this.state.pinBehind = this.setMarker(this.mine, rel, dist, !(this.pinArmed && dist < ARRIVE));
    } else this.setMarker(this.mine, 0, 0, false);
    // a friend to keep track of: a green mark with their name
    if (c.friend) {
      const { rel, dist } = place(c.friend.pos.clone().sub(c.center).normalize());
      this.setMarker(this.friend, rel, dist, dist > 12, c.friend.label);
    } else this.setMarker(this.friend, 0, 0, false);
  }

  /** Returns -1 / 1 when the marker is off the strip and the arrow points left / right, else 0. */
  private setMarker(m: { mk: HTMLElement; arrow: HTMLElement; dist: HTMLElement }, rel: number, dist: number, on: boolean, label = ''): number {
    const inside = Math.abs(rel) <= SPAN;
    m.mk.classList.toggle('on', on && inside);
    const side = on && !inside ? Math.sign(rel) : 0;
    m.arrow.classList.toggle('on', side !== 0);
    m.arrow.classList.toggle('left', side < 0);
    m.arrow.classList.toggle('right', side > 0);
    if (on && inside) {
      m.mk.style.left = `${50 + rel / SPAN * 50}%`;
      const txt = `${label ? label + ' ' : ''}${Math.round(dist)} m`;
      if (m.dist.textContent !== txt) m.dist.textContent = txt;
    }
    if (side) m.arrow.textContent = `${side < 0 ? '◀' : ''} ${label ? label + ' ' : ''}${Math.round(dist)} m ${side > 0 ? '▶' : ''}`;
    return side;
  }
}

function wrap(d: number) { return ((d + 540) % 360) - 180; }

import * as THREE from 'three';
import { PAINT } from './paint';
import { LIGHT } from './palette';
import { clamp, smoothstep } from '../world/noise';

export interface DayPalette { fog: string; skyTop: string; skyHorizon: string; light: string; ambient: string }

/**
 * A full day passes in about twelve minutes. On a world this small, time also depends on where you
 * stand: walk far enough and you can chase the sunset.
 */
export class DayCycle {
  /** 0..1 around the day. 0 = sunrise over the north pole. */
  t = 0.03;
  length = 720;
  sun = new THREE.Vector3();
  private L: THREE.Vector3;
  private Y = new THREE.Vector3(0.12, 0.99, 0.0).normalize();
  /** Local values for the traveler, updated each frame. */
  elevation = 0.5;
  day = 1;
  dusk = 0;
  frozen = false;

  constructor(riverLonDeg: number) {
    const a = riverLonDeg * Math.PI / 180;
    this.L = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
    this.computeSun();
  }

  computeSun() {
    const th = this.t * Math.PI * 2;
    this.sun.copy(this.L).multiplyScalar(Math.cos(th)).addScaledVector(this.Y, Math.sin(th)).normalize();
    return this.sun;
  }

  /** Set the clock so that the sun stands at `elev` (-1..1) above the horizon seen from `up`, rising or setting. */
  setLocal(up: THREE.Vector3, elev: number, rising = true) {
    let best = 0, bestErr = 9;
    for (let i = 0; i < 720; i++) {
      this.t = i / 720;
      const s = this.computeSun();
      const e = s.dot(up);
      this.t = (i + 2) / 720;
      const goingUp = this.computeSun().dot(up) > e;
      const err = Math.abs(e - elev) + (goingUp === rising ? 0 : 1);
      if (err < bestErr) { bestErr = err; best = i / 720; }
    }
    this.t = best; this.computeSun();
  }

  /**
   * A world that keeps one hour (all but the first): the sun's height above the traveller's own horizon, held
   * wherever he walks, so a sunset world is sunset everywhere and a night world is night everywhere. null = the clock.
   */
  pin: number | null = null;
  private pinDir = new THREE.Vector3();

  update(dt: number, up: THREE.Vector3) {
    if (!this.frozen) this.t = (this.t + dt / this.length) % 1;
    if (this.pin !== null) {
      // keep the sun's bearing from frame to frame (carried along as he walks), and set its height
      const h = this.pinDir.copy(this.sun).addScaledVector(up, -this.sun.dot(up));
      if (h.lengthSq() < 1e-6) h.copy(this.L).addScaledVector(up, -this.L.dot(up));
      if (h.lengthSq() < 1e-6) h.set(1, 0, 0).addScaledVector(up, -up.x);
      h.normalize();
      const e = this.pin;
      this.sun.copy(up).multiplyScalar(e).addScaledVector(h, Math.sqrt(Math.max(0, 1 - e * e))).normalize();
    } else this.computeSun();
    this.elevation = this.sun.dot(up);
    this.day = smoothstep(-0.22, 0.22, this.elevation);
    this.dusk = smoothstep(0.42, 0.04, Math.abs(this.elevation - 0.06));
  }

  /** Apply to lights, fog, sky and the painted ambient. */
  apply(p: DayPalette, sunLight: THREE.DirectionalLight, moonLight: THREE.DirectionalLight, fog: THREE.FogExp2, center: THREE.Vector3) {
    const e = this.elevation, day = this.day, dusk = this.dusk;
    const sunUp = smoothstep(-0.1, 0.18, e);
    sunLight.position.copy(this.sun).multiplyScalar(400).add(center);
    sunLight.target.position.copy(center);
    sunLight.intensity = sunUp * 2.6;
    const warm = new THREE.Color(LIGHT.sunsetSun);
    sunLight.color.set(p.light).lerp(warm, clamp(dusk * 0.85));
    moonLight.position.copy(this.sun).multiplyScalar(-400).add(center);
    moonLight.target.position.copy(center);
    moonLight.intensity = smoothstep(0.08, -0.25, e) * 0.9;

    const ambDay = new THREE.Color(p.ambient);
    const ambNight = new THREE.Color(LIGHT.nightAmbient);
    const ambDusk = new THREE.Color(LIGHT.duskAmbient);
    const sky = ambNight.clone().lerp(ambDay, day).lerp(ambDusk, dusk * 0.45);
    PAINT.uAmbSky.value.copy(sky).multiplyScalar(0.62);
    PAINT.uAmbGround.value.copy(sky).lerp(new THREE.Color(LIGHT.groundBounce), 0.55).multiplyScalar(0.36);
    PAINT.uRimCol.value.set(LIGHT.rimDay).lerp(new THREE.Color(LIGHT.rimDusk), dusk).lerp(new THREE.Color(LIGHT.rimNight), 1 - day);
    PAINT.uSun.value.copy(this.sun);
    PAINT.uSunCol.value.copy(sunLight.color).multiplyScalar(sunLight.intensity / 2.6);
    PAINT.uCenter.value.copy(center);

    const fogDay = new THREE.Color(p.fog);
    fog.color.set(LIGHT.nightFog).lerp(fogDay, day).lerp(new THREE.Color(LIGHT.duskFog), dusk * 0.4);
  }
}

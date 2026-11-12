import type * as THREE from 'three';

/** What the Sky Isles lab page hands each piece. */
export interface LabCtx {
  THREE: typeof THREE;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  sun: THREE.DirectionalLight;
  sunDir: THREE.Vector3;
  params: URLSearchParams;
  golden: boolean;
}
export interface LabView { pos: [number, number, number]; look: [number, number, number]; fov?: number }
export interface LabPiece {
  update(dt: number, t: number): void;
  /** Named camera views for screenshots. */
  views: Record<string, LabView>;
  /** Optional: drive the camera every step (overrides the view). */
  camera?(cam: THREE.PerspectiveCamera, t: number): void;
  /** Optional: called after a named view is applied (a piece can carry the view on a moving part). */
  onView?(name: string, cam: THREE.PerspectiveCamera): void;
}

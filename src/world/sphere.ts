import * as THREE from 'three';

const D2R = Math.PI / 180;

/** Direction on a unit sphere from latitude measured from the north pole (0..180) and longitude. */
export function dirLatLon(latDeg: number, lonDeg: number, out = new THREE.Vector3()): THREE.Vector3 {
  const th = latDeg * D2R, ph = lonDeg * D2R;
  return out.set(Math.sin(th) * Math.cos(ph), Math.cos(th), Math.sin(th) * Math.sin(ph));
}

export function latLonOf(dir: THREE.Vector3): { lat: number; lon: number } {
  const lat = Math.acos(THREE.MathUtils.clamp(dir.y, -1, 1)) / D2R;
  const lon = Math.atan2(dir.z, dir.x) / D2R;
  return { lat, lon };
}

/** Angle in radians between two unit vectors. */
export function angleBetween(a: THREE.Vector3, b: THREE.Vector3): number {
  return Math.acos(THREE.MathUtils.clamp(a.dot(b), -1, 1));
}

/** Any tangent perpendicular to `up`, stable. */
export function anyTangent(up: THREE.Vector3, out = new THREE.Vector3()): THREE.Vector3 {
  const ref = Math.abs(up.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
  return out.crossVectors(up, ref).normalize();
}

/** Orient an object so its local +Y is `up` and its local +Z faces `forward` (projected). */
export function orientTo(obj: THREE.Object3D, up: THREE.Vector3, forward?: THREE.Vector3) {
  const f = (forward ? forward.clone() : anyTangent(up)).projectOnPlane(up);
  if (f.lengthSq() < 1e-6) anyTangent(up, f);
  f.normalize();
  const r = new THREE.Vector3().crossVectors(up, f).normalize();
  const m = new THREE.Matrix4().makeBasis(r, up, f);
  obj.quaternion.setFromRotationMatrix(m);
}

export function wrapDeg(d: number): number {
  return ((d + 540) % 360) - 180;
}

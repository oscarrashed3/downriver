// Setting things built in an island's flat frame onto the little planet. Big things (the island's own body, its
// grass and flowers, lanes and meadows) are BENT: every vertex (or instance) goes through the island's bend
// (terrain.ts Isle.toPlanet), so a 50 m island follows the curve of the world exactly and its top meets
// planet.height. Small things (a cottage, a windmill, a kite) are set RIGID: one transform at their foot, so
// their animated parts keep working.
import * as THREE from 'three';
import type { Isle } from './terrain';
import { islandRockMaterial } from './islandMaterials';

const _p = new THREE.Vector3(), _n = new THREE.Vector3(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion();
const _m = new THREE.Matrix4(), _m2 = new THREE.Matrix4(), _s = new THREE.Vector3(), _t = new THREE.Vector3();

/** Set an object (built with +Y up at island-local (x, y, z), turned yaw about its up) rigidly on the planet. */
export function placeRigid(obj: THREE.Object3D, isle: Isle, x: number, y: number, z: number, yaw = 0) {
  isle.toPlanet(x, y, z, obj.position);
  isle.frameAt(x, z, obj.quaternion).multiply(_q.setFromAxisAngle(_t.set(0, 1, 0), yaw));
  return obj;
}

/** Re-set an object already placed in island-local space (position, rotation, scale) rigidly on the planet. */
export function rigidFromLocal(obj: THREE.Object3D, isle: Isle) {
  const { x, y, z } = obj.position;
  const q = obj.quaternion.clone();
  isle.toPlanet(x, y, z, obj.position);
  isle.frameAt(x, z, obj.quaternion).multiply(q);
  return obj;
}

/** Map one local point (in place) through the bend. */
function bendPoint(isle: Isle, v: THREE.Vector3) {
  return isle.toPlanet(v.x, v.y, v.z, v);
}
/** Turn one local direction (in place) as the frame turns at local (x, z). */
function bendDir(isle: Isle, x: number, z: number, v: THREE.Vector3) {
  return v.applyQuaternion(isle.frameAt(x, z, _q2));
}

function bendGeometry(isle: Isle, src: THREE.BufferGeometry, M: THREE.Matrix4, keepLoc: boolean): THREE.BufferGeometry {
  const g = src.clone();
  g.applyMatrix4(M);
  const pos = g.attributes.position as THREE.BufferAttribute;
  const nor = g.attributes.normal as THREE.BufferAttribute | undefined;
  if (keepLoc) g.setAttribute('aLoc', new THREE.BufferAttribute(Float32Array.from(pos.array as Float32Array), 3));
  for (let i = 0; i < pos.count; i++) {
    _p.fromBufferAttribute(pos, i);
    const x = _p.x, z = _p.z;
    if (nor) { _n.fromBufferAttribute(nor, i); bendDir(isle, x, z, _n); nor.setXYZ(i, _n.x, _n.y, _n.z); }
    bendPoint(isle, _p);
    pos.setXYZ(i, _p.x, _p.y, _p.z);
  }
  pos.needsUpdate = true;
  g.computeBoundingSphere(); g.computeBoundingBox();
  return g;
}

function bendInstanced(isle: Isle, src: THREE.InstancedBufferGeometry, M: THREE.Matrix4): THREE.InstancedBufferGeometry {
  const g = new THREE.InstancedBufferGeometry();
  g.index = src.index;
  for (const k of Object.keys(src.attributes)) g.setAttribute(k, src.attributes[k]);
  g.instanceCount = src.instanceCount;
  const P = src.attributes.iPos as THREE.InstancedBufferAttribute;
  const U = src.attributes.iUp as THREE.InstancedBufferAttribute | undefined;
  const nP = new Float32Array(P.count * 3), nU = U ? new Float32Array(U.count * 3) : null;
  const rot = new THREE.Matrix3().setFromMatrix4(M);
  const box = new THREE.Box3();
  for (let i = 0; i < P.count; i++) {
    _p.fromBufferAttribute(P, i).applyMatrix4(M);
    const x = _p.x, z = _p.z;
    if (U && nU) { _n.fromBufferAttribute(U, i).applyMatrix3(rot).normalize(); bendDir(isle, x, z, _n); nU.set([_n.x, _n.y, _n.z], i * 3); }
    bendPoint(isle, _p);
    nP.set([_p.x, _p.y, _p.z], i * 3);
    box.expandByPoint(_p);
  }
  g.setAttribute('iPos', new THREE.InstancedBufferAttribute(nP, 3));
  if (nU) g.setAttribute('iUp', new THREE.InstancedBufferAttribute(nU, 3));
  const r0 = src.boundingSphere ? Math.max(2, src.boundingSphere.radius - (src.boundingBox ? src.boundingBox.getSize(_s).length() / 2 : 0)) : 3;
  g.boundingSphere = box.getBoundingSphere(new THREE.Sphere()); g.boundingSphere.radius += Math.min(30, r0 + 2);
  g.boundingBox = box.clone().expandByScalar(3);
  g.userData = { ...src.userData };
  return g;
}

function copyMeshFlags(from: THREE.Mesh, to: THREE.Mesh) {
  to.castShadow = from.castShadow; to.receiveShadow = from.receiveShadow; to.renderOrder = from.renderOrder;
  to.userData = { ...from.userData }; to.name = from.name; to.frustumCulled = from.frustumCulled;
  to.customDepthMaterial = from.customDepthMaterial; to.customDistanceMaterial = from.customDistanceMaterial;
  to.visible = from.visible;
}

/**
 * Bend a whole group built in an island's local frame (root at identity) onto the planet. Returns a new group of
 * meshes in planet-local space (add it under something placed at the planet's centre). Meshes marked
 * userData.rigid, and InstancedMesh instances, are set rigidly at their own origin.
 */
export function bendGroup(src: THREE.Object3D, isle: Isle): THREE.Group {
  const out = new THREE.Group();
  out.name = (src.name || 'bent') + ':bent';
  src.updateMatrixWorld(true);
  const done = new Map<THREE.BufferGeometry, { M: THREE.Matrix4; g: THREE.BufferGeometry }>();
  const rockFlat = islandRockMaterial(false), rockBent = islandRockMaterial(true);
  src.traverse(o => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || !o.visible) return;
    const M = o.matrixWorld;
    if (m.userData.rigid) {
      const c = new THREE.Mesh(m.geometry, m.material);
      copyMeshFlags(m, c);
      M.decompose(_t, _q, _s);
      const lq = _q.clone(), ls = _s.clone(), lp = _t.clone();
      isle.toPlanet(lp.x, lp.y, lp.z, c.position);
      isle.frameAt(lp.x, lp.z, c.quaternion).multiply(lq);
      c.scale.copy(ls);
      out.add(c);
      return;
    }
    if ((m as THREE.InstancedMesh).isInstancedMesh) {
      const im = m as THREE.InstancedMesh;
      const c = new THREE.InstancedMesh(im.geometry, im.material, im.count);
      copyMeshFlags(m, c);
      for (let i = 0; i < im.count; i++) {
        im.getMatrixAt(i, _m);
        _m2.multiplyMatrices(M, _m).decompose(_t, _q, _s);
        const x = _t.x, y = _t.y, z = _t.z;
        isle.toPlanet(x, y, z, _p);
        isle.frameAt(x, z, _q2).multiply(_q);
        _m.compose(_p, _q2, _s);
        c.setMatrixAt(i, _m);
      }
      if (im.instanceColor) c.instanceColor = im.instanceColor;
      c.instanceMatrix.needsUpdate = true;
      c.computeBoundingSphere();
      out.add(c);
      return;
    }
    const geo = m.geometry as THREE.BufferGeometry;
    let bent = done.get(geo);
    if (!bent || !bent.M.equals(M)) {
      const inst = (geo as THREE.InstancedBufferGeometry).isInstancedBufferGeometry && geo.attributes.iPos;
      const isRock = m.material === rockFlat;
      const g = inst ? bendInstanced(isle, geo as THREE.InstancedBufferGeometry, M) : bendGeometry(isle, geo, M, isRock);
      bent = { M: M.clone(), g };
      done.set(geo, bent);
    }
    const mat = m.material === rockFlat ? rockBent : m.material;
    const c = new THREE.Mesh(bent.g, mat);
    copyMeshFlags(m, c);
    out.add(c);
  });
  return out;
}

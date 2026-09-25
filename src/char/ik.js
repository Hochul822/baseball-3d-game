import * as THREE from 'three';

const _s = new THREE.Vector3();
const _e = new THREE.Vector3();
const _w = new THREE.Vector3();
const _t = new THREE.Vector3();
const _d = new THREE.Vector3();
const _p = new THREE.Vector3();
const _x = new THREE.Vector3();
const _y = new THREE.Vector3();
const _z = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _qw = new THREE.Quaternion();
const _qp = new THREE.Quaternion();
const _ql = new THREE.Quaternion();

/**
 * Orient a bone (whose limb extends along local -Y) so that it points along
 * `dir` in world space, using `side` to resolve the twist (local +Z toward side).
 * Blends the result with the current local rotation by `w`.
 */
function orientBone(bone, dir, side, w) {
  _y.copy(dir).negate().normalize(); // local +Y points back toward the parent
  _z.copy(side).addScaledVector(_y, -side.dot(_y));
  if (_z.lengthSq() < 1e-8) _z.set(0, 0, 1).addScaledVector(_y, -_y.z);
  _z.normalize();
  _x.crossVectors(_y, _z).normalize();
  _m.makeBasis(_x, _y, _z);
  _qw.setFromRotationMatrix(_m);
  bone.parent.getWorldQuaternion(_qp);
  _ql.copy(_qp).invert().multiply(_qw);
  if (w >= 0.999) bone.quaternion.copy(_ql);
  else bone.quaternion.slerp(_ql, w);
  bone.updateMatrixWorld(true);
}

/**
 * Analytic two-bone IK (shoulder -> elbow -> wrist).
 * target: world position for the wrist.
 * pole: world position the elbow should bend toward.
 * handDir: optional { axis: Vector3 (bat direction), fwd: Vector3 } to orient the hand for a grip.
 */
export function solveTwoBone(upper, lower, hand, target, pole, weight = 1, handDir = null, sideName = 'R') {
  upper.updateMatrixWorld(true);
  _s.setFromMatrixPosition(upper.matrixWorld);
  _e.setFromMatrixPosition(lower.matrixWorld);
  _w.setFromMatrixPosition(hand.matrixWorld);
  const a = _s.distanceTo(_e);
  const b = _e.distanceTo(_w);
  _t.copy(target);
  _d.subVectors(_t, _s);
  let dist = _d.length();
  const maxR = (a + b) * 0.999;
  const minR = Math.abs(a - b) + 1e-3;
  dist = THREE.MathUtils.clamp(dist, minR, maxR);
  _d.normalize();
  // elbow position
  const cosA = THREE.MathUtils.clamp((a * a + dist * dist - b * b) / (2 * a * dist), -1, 1);
  const sinA = Math.sqrt(1 - cosA * cosA);
  _p.subVectors(pole, _s);
  _p.addScaledVector(_d, -_p.dot(_d));
  if (_p.lengthSq() < 1e-8) _p.set(0, -1, 0);
  _p.normalize();
  const elbow = new THREE.Vector3().copy(_s).addScaledVector(_d, a * cosA).addScaledVector(_p, a * sinA);
  const wrist = new THREE.Vector3().copy(_s).addScaledVector(_d, dist);

  // upper arm: points shoulder->elbow, twist so the bend plane faces the pole
  const dirU = new THREE.Vector3().subVectors(elbow, _s);
  const bendAxisSide = new THREE.Vector3().copy(_p).negate(); // elbow crease faces away from pole
  // local +Z of the upper arm should face the side where the forearm folds (anterior)
  const fwdU = new THREE.Vector3().subVectors(wrist, elbow);
  orientBone(upper, dirU, fwdU.lengthSq() > 1e-8 ? fwdU : bendAxisSide, weight);
  // forearm
  lower.updateMatrixWorld(true);
  const eNow = new THREE.Vector3().setFromMatrixPosition(lower.matrixWorld);
  const dirL = new THREE.Vector3().subVectors(wrist, eNow);
  const sideL = new THREE.Vector3().subVectors(eNow, _s).negate();
  // keep forearm twist continuous with the hand direction if supplied
  if (handDir && handDir.axis) sideL.copy(handDir.axis);
  orientBone(lower, dirL, sideL, weight);

  if (handDir && handDir.axis) {
    // hand: fingers (-Y) continue from forearm but wrap around the bat axis (+Z = axis)
    const fore = new THREE.Vector3().copy(dirL).normalize();
    const yv = handDir.fingers ? handDir.fingers.clone() : fore.clone();
    orientBone(hand, yv, handDir.axis, weight);
  } else {
    hand.updateMatrixWorld(true);
  }
}

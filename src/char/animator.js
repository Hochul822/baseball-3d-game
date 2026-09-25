import * as THREE from 'three';
import { CLIPS } from './poses.js';

// Joints driven by the pose system (fingers are procedural).
export const JOINTS = [
  'hips', 'spine', 'chest', 'neck', 'head',
  'shoulderL', 'upperArmL', 'foreArmL', 'handL',
  'shoulderR', 'upperArmR', 'foreArmR', 'handR',
  'thighL', 'shinL', 'footL', 'thighR', 'shinR', 'footR',
];
const NJ = JOINTS.length;
// Pose vector layout: [joint euler xyz]*NJ + hips offset xyz + grip L,R
const PV = NJ * 3 + 5;
const HP = NJ * 3;
const GL = HP + 3;

export function poseToVec(pose, out = new Float32Array(PV)) {
  out.fill(0);
  out[GL] = out[GL + 1] = NaN;
  for (let j = 0; j < NJ; j++) {
    const v = pose[JOINTS[j]];
    if (v) {
      out[j * 3] = v[0] || 0;
      out[j * 3 + 1] = v[1] || 0;
      out[j * 3 + 2] = v[2] || 0;
    }
  }
  if (pose.hp) {
    out[HP] = pose.hp[0] || 0;
    out[HP + 1] = pose.hp[1] || 0;
    out[HP + 2] = pose.hp[2] || 0;
  }
  if (pose.grip) {
    out[GL] = pose.grip[0];
    out[GL + 1] = pose.grip[1];
  }
  return out;
}

// Pre-compile clips into vector keyframes
const compiled = new Map();
function compile(name) {
  if (compiled.has(name)) return compiled.get(name);
  const src = CLIPS[name];
  if (!src) throw new Error('unknown clip ' + name);
  const base = src.base || {};
  const keys = src.keys.map((k) => {
    const merged = { ...base, ...k.pose };
    return { t: k.t, v: poseToVec(merged), ease: k.ease };
  });
  const ik = src.ik
    ? src.ik.map((k) => ({ t: k.t, L: k.L || [0, 1, 0], R: k.R || [0, 1, 0], w: k.w || [k.L ? 1 : 0, k.R ? 1 : 0] }))
    : null;
  const poles = src.poles ? src.poles.map((k) => ({ t: k.t, L: k.L, R: k.R })) : null;
  const c = { name, duration: src.duration, loop: !!src.loop, keys, events: src.events || [], ik, poles };
  compiled.set(name, c);
  return c;
}

function catmull(p0, p1, p2, p3, t) {
  const t2 = t * t;
  const t3 = t2 * t;
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}

function sampleClip(clip, time, out) {
  const keys = clip.keys;
  const n = keys.length;
  if (n === 1) {
    out.set(keys[0].v);
    return out;
  }
  let t = time;
  if (clip.loop) t = ((t % clip.duration) + clip.duration) % clip.duration;
  else t = Math.min(Math.max(t, 0), clip.duration);
  const nt = t / clip.duration;
  let i = 0;
  while (i < n - 1 && keys[i + 1].t <= nt) i++;
  if (!clip.loop && i >= n - 1) {
    out.set(keys[n - 1].v);
    return out;
  }
  const k1 = keys[i];
  let k2, t2;
  if (i + 1 < n) {
    k2 = keys[i + 1];
    t2 = k2.t;
  } else {
    k2 = keys[0];
    t2 = 1 + k2.t;
  }
  let u = (nt - k1.t) / Math.max(1e-5, t2 - k1.t);
  const ease = k2.ease;
  if (ease === 'in') u = u * u;
  else if (ease === 'out') u = 1 - (1 - u) * (1 - u);
  else if (ease === 'inout') u = u * u * (3 - 2 * u);
  else if (ease === 'snap') u = 1 - Math.pow(1 - u, 3);
  const k0 = i > 0 ? keys[i - 1] : clip.loop ? keys[n - 1] : k1;
  const k3 = i + 2 < n ? keys[i + 2] : clip.loop ? keys[(i + 2) % n] : k2;
  const a = k0.v, b = k1.v, c = k2.v, d = k3.v;
  for (let j = 0; j < PV; j++) {
    if (j >= GL) {
      out[j] = isNaN(b[j]) || isNaN(c[j]) ? NaN : b[j] + (c[j] - b[j]) * u;
    } else out[j] = catmull(a[j], b[j], c[j], d[j], u);
  }
  return out;
}

const _e = new THREE.Euler();
const _q = new THREE.Quaternion();
const _qi = new THREE.Quaternion();

function segIndex(keys, nt, loop) {
  const n = keys.length;
  let i = 0;
  while (i < n - 1 && keys[i + 1].t <= nt) i++;
  return i;
}

/** Sample an IK track -> {L:[x,y,z], R:[x,y,z], w:[wl,wr]} in root space */
function sampleTrack(keys, nt, out, withW) {
  const n = keys.length;
  const i = segIndex(keys, nt);
  const k1 = keys[i];
  const k2 = keys[Math.min(i + 1, n - 1)];
  const k0 = keys[Math.max(i - 1, 0)];
  const k3 = keys[Math.min(i + 2, n - 1)];
  let u = k2 === k1 ? 0 : (nt - k1.t) / Math.max(1e-5, k2.t - k1.t);
  u = Math.min(Math.max(u, 0), 1);
  for (const s of ['L', 'R']) {
    const o = out[s];
    for (let j = 0; j < 3; j++) o[j] = catmull(k0[s][j], k1[s][j], k2[s][j], k3[s][j], u);
  }
  if (withW) {
    out.w[0] = k1.w[0] + (k2.w[0] - k1.w[0]) * u;
    out.w[1] = k1.w[1] + (k2.w[1] - k1.w[1]) * u;
  }
  return out;
}

export class Animator {
  constructor(char) {
    this.char = char;
    this.clip = compile('idle');
    this.time = 0;
    this.speed = 1;
    this.cur = new Float32Array(PV);
    this.from = new Float32Array(PV);
    this.tmp = new Float32Array(PV);
    this.fade = 0;
    this.fadeDur = 0;
    this.onEvent = null;
    this.firedEvents = new Set();
    this.additive = null; // optional function(vec, time) for procedural tweaks
    this.override = null; // optional full Float32Array pose provider
    this.ikOut = { L: [0, 0, 0], R: [0, 0, 0], w: [0, 0] };
    this.poleOut = { L: [0, 0, 0], R: [0, 0, 0] };
    this._t = new THREE.Vector3();
    this._p = new THREE.Vector3();
    this.ikFade = 1;
    sampleClip(this.clip, 0, this.cur);
  }

  get clipName() {
    return this.clip.name;
  }

  get normTime() {
    return this.clip.duration ? this.time / this.clip.duration : 0;
  }

  get done() {
    return !this.clip.loop && this.time >= this.clip.duration;
  }

  play(name, { fade = 0.18, speed = 1, time = 0, restart = false } = {}) {
    if (!restart && this.clip.name === name) {
      this.speed = speed;
      return;
    }
    this.captureFrom();
    this.clip = compile(name);
    this.time = time;
    this.speed = speed;
    this.fade = fade;
    this.fadeDur = fade;
    this.firedEvents.clear();
  }

  update(dt) {
    const prev = this.time;
    this.time += dt * this.speed;
    if (this.onEvent) {
      for (const ev of this.clip.events) {
        const et = ev.t * this.clip.duration;
        if (!this.firedEvents.has(ev.name) && prev <= et && this.time >= et) {
          this.firedEvents.add(ev.name);
          this.onEvent(ev.name, this.clip.name);
        }
      }
    }
    if (this.clip.loop && this.time > this.clip.duration) {
      this.time %= this.clip.duration;
      this.firedEvents.clear();
    }

    if (this.override) this.override(this.tmp, dt);
    else sampleClip(this.clip, this.time, this.tmp);
    this.cur.set(this.tmp);
    if (this.additive) this.additive(this.cur, dt);
    let w = 1;
    if (this.fade > 0) {
      this.fade = Math.max(0, this.fade - dt);
      w = 1 - this.fade / this.fadeDur;
      w = w * w * (3 - 2 * w);
    }
    this.apply(w);
    this.applyIK();
  }

  applyIK() {
    const clip = this.clip;
    if (!clip.ik) return;
    const ch = this.char;
    let nt = clip.duration ? this.time / clip.duration : 0;
    if (clip.loop) nt = ((nt % 1) + 1) % 1;
    else nt = Math.min(Math.max(nt, 0), 1);
    sampleTrack(clip.ik, nt, this.ikOut, true);
    if (clip.poles) sampleTrack(clip.poles, nt, this.poleOut, false);
    let fw = 1;
    if (this.fade > 0) {
      fw = 1 - this.fade / this.fadeDur;
      fw = fw * fw * (3 - 2 * fw);
    }
    ch.root.updateMatrixWorld(true);
    for (let k = 0; k < 2; k++) {
      const s = k === 0 ? 'L' : 'R';
      if (ch.ik[s]) continue; // game-level request wins
      const w = this.ikOut.w[k] * fw;
      if (w <= 0.001) continue;
      const t = new THREE.Vector3().fromArray(this.ikOut[s]).applyMatrix4(ch.root.matrixWorld);
      let pole = null;
      if (clip.poles) pole = new THREE.Vector3().fromArray(this.poleOut[s]).applyMatrix4(ch.root.matrixWorld);
      ch.ik[s] = { target: t, weight: w, pole };
    }
  }

  /** Snapshot the current (post-IK) bone state as the crossfade source. */
  captureFrom() {
    const ch = this.char;
    if (!this.fromQ) this.fromQ = JOINTS.map(() => new THREE.Quaternion());
    for (let j = 0; j < NJ; j++) this.fromQ[j].copy(ch.bones[JOINTS[j]].quaternion);
    const hips = ch.bones.hips;
    const v = this.from;
    v[HP] = hips.position.x - ch.rest.hips.p.x;
    v[HP + 1] = hips.position.y - ch.rest.hips.p.y;
    v[HP + 2] = hips.position.z - ch.rest.hips.p.z;
    v[GL] = ch.gripTarget.L;
    v[GL + 1] = ch.gripTarget.R;
  }

  apply(w = 1) {
    const ch = this.char;
    const v = this.cur;
    const blending = w < 1 && this.fromQ;
    for (let j = 0; j < NJ; j++) {
      const bone = ch.bones[JOINTS[j]];
      const rest = ch.rest[JOINTS[j]];
      _e.set(v[j * 3], v[j * 3 + 1], v[j * 3 + 2], 'YXZ');
      bone.quaternion.copy(rest.q).multiply(_q.setFromEuler(_e));
      if (blending) bone.quaternion.slerpQuaternions(this.fromQ[j], _qi.copy(bone.quaternion), w);
    }
    const hips = ch.bones.hips;
    const f = blending ? this.from : null;
    const hx = f ? f[HP] + (v[HP] - f[HP]) * w : v[HP];
    const hy = f ? f[HP + 1] + (v[HP + 1] - f[HP + 1]) * w : v[HP + 1];
    const hz = f ? f[HP + 2] + (v[HP + 2] - f[HP + 2]) * w : v[HP + 2];
    hips.position.copy(ch.rest.hips.p);
    hips.position.x += hx;
    hips.position.y += hy;
    hips.position.z += hz;
    if (!isNaN(v[GL])) ch.gripTarget.L = v[GL];
    if (!isNaN(v[GL + 1])) ch.gripTarget.R = v[GL + 1];
  }
}

function unwrap(a, ref) {
  while (a - ref > Math.PI) a -= Math.PI * 2;
  while (a - ref < -Math.PI) a += Math.PI * 2;
  return a;
}

export const POSE_LAYOUT = { JOINTS, NJ, PV, HP, GL, index: Object.fromEntries(JOINTS.map((j, i) => [j, i * 3])) };
export { sampleClip, compile };

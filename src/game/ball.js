import * as THREE from 'three';
import { GRAVITY, BALL_R, fenceDistance, WALL_H, sprayAngle } from '../constants.js';
import { addOutline, toonMat } from '../core/toon.js';

function ballTexture() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 128;
  const x = c.getContext('2d');
  x.fillStyle = '#fbfaf5';
  x.fillRect(0, 0, 256, 128);
  x.strokeStyle = '#d8232a';
  x.lineWidth = 3;
  for (const off of [0, 128]) {
    x.beginPath();
    for (let i = 0; i <= 64; i++) {
      const u = off + i * 2;
      const v = 64 + Math.sin((i / 64) * Math.PI * 2) * 34 * (off ? -1 : 1);
      i ? x.lineTo(u, v) : x.moveTo(u, v);
    }
    x.stroke();
    for (let i = 0; i <= 64; i += 3) {
      const u = off + i * 2;
      const v = 64 + Math.sin((i / 64) * Math.PI * 2) * 34 * (off ? -1 : 1);
      x.beginPath();
      x.moveTo(u - 3, v - 4);
      x.lineTo(u + 3, v + 4);
      x.stroke();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const DRAG = 0.0052; // 0.5*rho*Cd*A/m (approx)
const LIFT = 0.0011;

/** Simple ballistic integrator shared by the live ball and the predictor. */
export function stepBall(s, dt, opts = {}) {
  const v = s.v;
  const sp = v.length();
  // drag
  const drag = DRAG * sp * (opts.dragMul ?? 1);
  s.v.x -= v.x * drag * dt;
  s.v.z -= v.z * drag * dt;
  s.v.y -= v.y * drag * dt;
  // backspin lift (only while airborne), proportional to horizontal speed
  if (s.p.y > 0.05 && opts.lift !== 0) {
    const h = Math.hypot(v.x, v.z);
    s.v.y += LIFT * h * h * (opts.liftMul ?? 1) * dt * (s.spin ?? 1);
  }
  s.v.y -= GRAVITY * dt;
  s.p.addScaledVector(s.v, dt);
  let event = null;
  // ground
  if (s.p.y < BALL_R) {
    s.p.y = BALL_R;
    if (s.v.y < -1.2) {
      s.v.y = -s.v.y * 0.42;
      s.v.x *= 0.72;
      s.v.z *= 0.72;
      event = 'bounce';
      s.bounces = (s.bounces || 0) + 1;
    } else {
      s.v.y = 0;
      // rolling friction
      const hs = Math.hypot(s.v.x, s.v.z);
      const dec = Math.min(hs, (opts.grass ? 5.0 : 3.5) * dt);
      if (hs > 0) {
        s.v.x -= (s.v.x / hs) * dec;
        s.v.z -= (s.v.z / hs) * dec;
      }
      s.rolling = true;
    }
  }
  // fence / home run
  const r = Math.hypot(s.p.x, s.p.z);
  if (s.p.z > 0 && Math.abs(s.p.x) <= s.p.z + 3) {
    const phi = sprayAngle(s.p.x, s.p.z);
    const fr = fenceDistance(phi);
    if (r >= fr - BALL_R && !s.overWall) {
      if (s.p.y > WALL_H + 0.05) {
        s.overWall = true;
        event = 'homerun';
      } else {
        // bounce off the wall
        const nx = s.p.x / r;
        const nz = s.p.z / r;
        const vn = s.v.x * nx + s.v.z * nz;
        if (vn > 0) {
          s.v.x -= 1.5 * vn * nx;
          s.v.z -= 1.5 * vn * nz;
          s.v.x *= 0.7;
          s.v.z *= 0.7;
          event = 'wall';
        }
        s.p.x = nx * (fr - BALL_R - 0.01);
        s.p.z = nz * (fr - BALL_R - 0.01);
      }
    }
  }
  return event;
}

/** Predict a batted ball path. Returns samples [{t, p, air, bounces}] */
export function predictPath(p0, v0, spin = 1, maxT = 12, dt = 1 / 60) {
  const s = { p: p0.clone(), v: v0.clone(), spin, bounces: 0 };
  const out = [];
  let t = 0;
  let firstBounce = null;
  let homerun = false;
  while (t < maxT) {
    const ev = stepBall(s, dt, { grass: true });
    t += dt;
    if (ev === 'bounce' && firstBounce === null) firstBounce = { t, p: s.p.clone() };
    if (ev === 'homerun') homerun = true;
    out.push({ t, p: s.p.clone(), air: s.bounces === 0 && !s.rolling, h: s.p.y });
    if (s.overWall && s.p.y < 0.5) break;
    if (Math.hypot(s.v.x, s.v.z) < 0.3 && s.p.y <= BALL_R + 0.01) break;
  }
  return { samples: out, firstBounce, homerun, last: s.p.clone() };
}

export class Ball {
  constructor(scene) {
    const geo = new THREE.SphereGeometry(BALL_R, 20, 14);
    this.mesh = new THREE.Mesh(geo, toonMat(0xffffff, { map: ballTexture(), rim: 0.6 }));
    this.mesh.castShadow = true;
    addOutline(this.mesh, 0.004);
    scene.add(this.mesh);
    // soft glow shell to make the ball readable at speed
    this.glow = new THREE.Mesh(
      new THREE.SphereGeometry(BALL_R * 2.2, 12, 8),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    this.mesh.add(this.glow);
    this.p = new THREE.Vector3();
    this.v = new THREE.Vector3();
    this.mode = 'hidden';
    this.spin = 1;
    this.holder = null; // {char, side}
    this.ghosts = [];
    this.mesh.visible = false;
  }

  hide() {
    this.mode = 'hidden';
    this.mesh.visible = false;
    this.holder = null;
  }

  hold(char, side = 'R') {
    this.mode = 'held';
    this.holder = { char, side };
    this.mesh.visible = true;
    this.mesh.scale.setScalar(1);
  }

  launch(p, v, spin = 1) {
    this.mode = 'flight';
    this.holder = null;
    this.p.copy(p);
    this.v.copy(v);
    this.spin = spin;
    this.state = { p: this.p, v: this.v, spin, bounces: 0 };
    this.mesh.visible = true;
  }

  /** Scripted pitch: p(t) = p0 + v0 t + 0.5 a t^2 + break(t) */
  startPitch(pitch) {
    this.mode = 'pitch';
    this.holder = null;
    this.pitch = pitch;
    this.pt = 0;
    this.mesh.visible = true;
    this.p.copy(pitch.p0);
  }

  pitchPos(t, out = new THREE.Vector3()) {
    const pc = this.pitch;
    out.copy(pc.p0).addScaledVector(pc.v0, t);
    out.y -= 0.5 * (pc.g ?? GRAVITY) * t * t;
    // break shaped by 'late' exponent: displacement = 0.5*a*T^2 * (t/T)^(late+1) ... normalised
    const u = Math.min(t / pc.T, 1.4);
    const shape = Math.pow(Math.max(u, 0), pc.late + 1) * 0.5 * pc.T * pc.T;
    out.addScaledVector(pc.brk, shape);
    if (pc.knuckle) {
      const w = 0.42 / pc.T;
      out.x += Math.sin(t * 17 * w + pc.seed) * 0.05 * u;
      out.y += Math.sin(t * 13 * w + pc.seed * 2) * 0.04 * u;
    }
    return out;
  }

  update(dt) {
    if (this.mode === 'held' && this.holder) {
      const h = this.holder;
      h.char.handWorld(h.side, this.mesh.position);
      this.p.copy(this.mesh.position);
      return null;
    }
    let ev = null;
    if (this.mode === 'pitch') {
      const prev = this.p.clone();
      this.pt += dt;
      this.pitchPos(this.pt, this.p);
      this.v.subVectors(this.p, prev).divideScalar(Math.max(dt, 1e-4));
      this.mesh.rotation.x += dt * 60;
    } else if (this.mode === 'flight') {
      const sub = 4;
      for (let i = 0; i < sub; i++) {
        const e = stepBall(this.state, dt / sub, { grass: true });
        if (e && !ev) ev = e;
        if (e === 'homerun') ev = e;
      }
      this.mesh.rotation.x += dt * this.v.length() * 3;
      this.mesh.rotation.z += dt * 7;
    } else if (this.mode === 'kinematic') {
      // straight-ish throws with an arc, driven by t in [0,1]
      this.kt += dt / this.kDur;
      const u = Math.min(this.kt, 1);
      this.p.lerpVectors(this.kFrom, this.kTo, u);
      this.p.y += Math.sin(u * Math.PI) * this.kArc;
      if (this.kt >= 1) {
        this.mode = 'arrived';
        ev = 'arrived';
      }
      this.mesh.rotation.x += dt * 40;
    }
    this.mesh.position.copy(this.p);
    return ev;
  }

  throwTo(from, to, speed = 32) {
    const d = from.distanceTo(to);
    this.mode = 'kinematic';
    this.kFrom = from.clone();
    this.kTo = to.clone();
    this.kDur = Math.max(0.15, d / speed);
    this.kArc = Math.min(6, d * d * 0.0009 + 0.2);
    this.kt = 0;
    this.holder = null;
    this.p.copy(from);
    this.mesh.visible = true;
    return this.kDur;
  }
}

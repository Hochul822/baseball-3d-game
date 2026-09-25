import * as THREE from 'three';

// Drives the batter: stance, procedural bat path through the swing (both hands
// solved with IK onto the handle), bunts and the bat toss.
const SWING_DUR = 0.62;
const BOX = new THREE.Vector3(0.98, 0, 0.02);

const KNOB_KEYS = [
  [0.0, [-0.12, 1.3, 0.28]],
  [0.18, [-0.2, 1.22, 0.2]],
  [0.33, null], // contact (computed)
  [0.45, [0.4, 1.0, 0.3]],
  [0.62, [0.28, 1.28, 0.0]],
  [1.0, [0.14, 1.42, -0.1]],
];
const DIR_KEYS = [
  [0.0, [-0.35, 0.85, -0.4]],
  [0.18, [-0.93, 0.3, -0.18]],
  [0.33, null],
  [0.45, [0.95, 0.05, 0.35]],
  [0.62, [0.32, 0.42, -0.85]],
  [1.0, [-0.35, 0.5, -0.8]],
];

function cr(p0, p1, p2, p3, t) {
  const t2 = t * t, t3 = t2 * t;
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}
function sampleKeys(keys, s, out) {
  let i = 0;
  while (i < keys.length - 2 && keys[i + 1][0] <= s) i++;
  const k1 = keys[i], k2 = keys[i + 1];
  const k0 = keys[Math.max(0, i - 1)], k3 = keys[Math.min(keys.length - 1, i + 2)];
  const u = THREE.MathUtils.clamp((s - k1[0]) / (k2[0] - k1[0]), 0, 1);
  for (let j = 0; j < 3; j++) out[j] = cr(k0[1][j], k1[1][j], k2[1][j], k3[1][j], u);
  return out;
}

export class BatterRig {
  constructor(game) {
    this.game = game;
    this.char = null;
    this.mode = 'stance';
    this.t = 0;
    this.knob = new THREE.Vector3();
    this.dir = new THREE.Vector3(0, 1, 0);
    this.aimLocal = new THREE.Vector3(0.25, 0.85, 0.9);
    this.bunt = false;
    this.batFree = null;
    this.ikWeight = 1;
  }

  attach(ch) {
    this.char = ch;
    ch.root.position.copy(BOX);
    ch.root.rotation.set(0, -Math.PI / 2, 0);
    ch.tilt = 0;
    ch.root.visible = true;
    this.batFree = null;
    this.game.bat.visible = true;
    this.ikWeight = 1;
    this.stance();
  }

  /** Walking to the plate: bat hangs from the right hand, no IK. */
  carry(ch) {
    this.char = ch;
    this.mode = 'carry';
    this.batFree = null;
    this.game.bat.visible = true;
    this.bunt = false;
    ch.gripTarget.R = 1;
  }

  /** Let go of the batter (e.g. after a strikeout) without tossing the bat. */
  release() {
    if (!this.char) return;
    this.mode = 'none';
    this.returnTimer = 0;
    this.char.ik.L = this.char.ik.R = null;
    this.game.bat.visible = false;
  }

  stance() {
    if (!this.char) return;
    this.mode = this.bunt ? 'bunt' : 'stance';
    this.t = 0;
    this.ikWeight = 1;
    this.char.play(this.bunt ? 'buntPose' : 'batStance', { fade: 0.3 });
    this.char.lookAt(new THREE.Vector3(0, 1.8, 18.4), 0.9);
  }

  setBunt(on) {
    if (this.mode === 'swing') return;
    this.bunt = on;
    this.stance();
  }

  aim(pci) {
    if (!this.char) return;
    const w = new THREE.Vector3(pci.x, pci.y, 0.3);
    this.char.root.updateMatrixWorld(true);
    this.aimLocal.copy(this.char.root.worldToLocal(w));
  }

  swingTo(pci, mode) {
    this.aim(pci);
    this.mode = 'swing';
    this.swingMode = mode;
    this.t = 0;
    this.char.play('swing', { fade: 0.06, restart: true });
    this.char.lookAt(new THREE.Vector3(pci.x, pci.y, 0.6), 0.8);
  }

  buntTo(pci) {
    this.aim(pci);
    this.mode = 'bunt';
    this.buntTarget = true;
  }

  afterPitch(call) {
    if (this.mode === 'swing') {
      this.returnTimer = 1.0;
    } else {
      this.returnTimer = 0.6;
    }
    this.bunt = false;
  }

  dropBat() {
    if (!this.char || this.batFree) return;
    const bat = this.game.bat;
    const v = new THREE.Vector3(-1.5 - Math.random(), 3.5, -2 + Math.random()).applyAxisAngle(new THREE.Vector3(0, 1, 0), 0);
    this.batFree = { v, w: new THREE.Vector3(Math.random() * 8, 10 + Math.random() * 6, Math.random() * 4), t: 0 };
    this.char.ik.L = this.char.ik.R = null;
    this.ikWeight = 0;
    this.mode = 'none';
  }

  contactPoint() {
    return this.knob.clone().addScaledVector(this.dir, 0.66);
  }

  update(dt) {
    const ch = this.char;
    const bat = this.game.bat;
    if (this.batFree) {
      const f = this.batFree;
      f.t += dt;
      if (bat.position.y > 0.04 || f.v.y > 0) {
        f.v.y -= 9.8 * dt;
        bat.position.addScaledVector(f.v, dt);
        bat.rotation.x += f.w.x * dt;
        bat.rotation.y += f.w.y * dt;
        bat.rotation.z += f.w.z * dt;
        if (bat.position.y < 0.04) {
          bat.position.y = 0.04;
          f.v.set(f.v.x * 0.3, Math.abs(f.v.y) * 0.25, f.v.z * 0.3);
          f.w.multiplyScalar(0.3);
          if (Math.abs(f.v.y) < 0.4) {
            f.v.set(0, 0, 0);
            bat.rotation.x = Math.PI / 2;
            bat.rotation.z = bat.rotation.y;
          }
        }
      }
      return;
    }
    if (!ch || !ch.root.visible) return;
    if (this.returnTimer > 0) {
      this.returnTimer -= dt;
      if (this.returnTimer <= 0 && (this.game.state === 'afterPitch' || this.game.state === 'prePitch')) this.stance();
    }
    const K = this.knob;
    const D = this.dir;
    const tmp = [0, 0, 0];
    const a = this.aimLocal;
    if (this.mode === 'swing') {
      this.t += dt;
      const s = Math.min(1, this.t / SWING_DUR);
      const yL = THREE.MathUtils.clamp(a.y, 0.35, 1.45);
      const dc = new THREE.Vector3(0.14, -0.04 - (0.9 - yL) * 0.75, 1).normalize();
      const target = new THREE.Vector3(Math.min(a.x, 0.55), yL, a.z);
      const kc = target.clone().addScaledVector(dc, -0.66);
      kc.y = THREE.MathUtils.clamp(kc.y, 0.62, 1.32);
      KNOB_KEYS[2][1] = [kc.x, kc.y, kc.z];
      DIR_KEYS[2][1] = [dc.x, dc.y, dc.z];
      KNOB_KEYS[3][1] = [0.4, 0.95 + (yL - 0.85) * 0.5, 0.3];
      sampleKeys(KNOB_KEYS, s, tmp);
      K.fromArray(tmp);
      sampleKeys(DIR_KEYS, s, tmp);
      D.fromArray(tmp).normalize();
      // release the top hand on the follow-through for a one-handed finish
      this.topHand = s > 0.62 ? Math.max(0, 1 - (s - 0.62) * 4) : 1;
    } else if (this.mode === 'bunt') {
      const yL = THREE.MathUtils.clamp(a.y, 0.4, 1.35);
      const d = new THREE.Vector3(0.05, 0.12, 1).normalize();
      const k = new THREE.Vector3(0.36, yL - d.y * 0.55, Math.max(0.2, a.z - 0.55));
      K.lerp(k, Math.min(1, dt * 10));
      D.lerp(d, Math.min(1, dt * 10)).normalize();
      this.topHand = 1;
    } else if (this.mode === 'carry') {
      ch.root.updateMatrixWorld(true);
      const hand = ch.bones.handR;
      const grip = new THREE.Vector3(0, -0.075, 0.01).applyMatrix4(hand.matrixWorld);
      const fwd = new THREE.Vector3(0.05, -0.45, 1).normalize().transformDirection(ch.root.matrixWorld);
      bat.position.copy(grip).addScaledVector(fwd, -0.1);
      bat.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), fwd);
      ch.gripTarget.R = 1;
      return;
    } else if (this.mode === 'stance') {
      const tt = this.game.time;
      const wag = Math.sin(tt * 2.2) * 0.04;
      const k = new THREE.Vector3(-0.12 + wag * 0.3, 1.3 + Math.sin(tt * 1.3) * 0.01, 0.28);
      const d = new THREE.Vector3(-0.35 + wag, 0.85, -0.4 + wag * 0.5).normalize();
      K.lerp(k, Math.min(1, dt * 8));
      D.lerp(d, Math.min(1, dt * 8)).normalize();
      this.topHand = 1;
    } else {
      return;
    }
    // world transforms
    ch.root.updateMatrixWorld(true);
    const kw = K.clone().applyMatrix4(ch.root.matrixWorld);
    const dw = D.clone().transformDirection(ch.root.matrixWorld);
    bat.position.copy(kw);
    bat.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dw);
    const bunting = this.mode === 'bunt';
    const gl = kw.clone().addScaledVector(dw, 0.05);
    const gr = kw.clone().addScaledVector(dw, bunting ? 0.42 : 0.135);
    const offs = (g, side) => {
      const sh = new THREE.Vector3().setFromMatrixPosition(ch.bones['upperArm' + side].matrixWorld);
      return g.clone().addScaledVector(g.clone().sub(sh).normalize(), -0.07);
    };
    // lead elbow points down, back elbow up and out ("elbow up" stance); both relax during the swing
    const sw = this.mode === 'swing' ? Math.min(1, this.t / 0.2) : 0;
    const poleL = new THREE.Vector3(0.55, 0.7, 0.45).applyMatrix4(ch.root.matrixWorld);
    const poleR = new THREE.Vector3(-0.75, 1.35 - sw * 0.55, -0.25 + sw * 0.2).applyMatrix4(ch.root.matrixWorld);
    ch.reach('L', offs(gl, 'L'), this.ikWeight, poleL, { axis: dw });
    ch.reach('R', offs(gr, 'R'), this.ikWeight * (this.topHand ?? 1), poleR, { axis: dw });
  }
}

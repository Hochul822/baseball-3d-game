import * as THREE from 'three';

// Smoothly damped camera with named shots.
export class CameraRig {
  constructor(camera) {
    this.camera = camera;
    this.pos = new THREE.Vector3(0, 2, -5);
    this.look = new THREE.Vector3(0, 1, 10);
    this.tPos = this.pos.clone();
    this.tLook = this.look.clone();
    this.fov = 50;
    this.tFov = 50;
    this.stiff = 6;
    this.follow = null; // function returning {pos, look}
    this.cut = false;
    this.orbit = null;
  }

  shot(pos, look, { fov = 50, stiff = 6, cut = false } = {}) {
    this.follow = null;
    this.orbit = null;
    this.tPos.copy(pos);
    this.tLook.copy(look);
    this.tFov = fov;
    this.stiff = stiff;
    if (cut) {
      this.pos.copy(pos);
      this.look.copy(look);
      this.fov = fov;
    }
  }

  track(fn, { stiff = 4, fov = 50, cut = false } = {}) {
    this.follow = fn;
    this.orbit = null;
    this.stiff = stiff;
    this.tFov = fov;
    if (cut) {
      const r = fn();
      this.pos.copy(r.pos);
      this.look.copy(r.look);
      this.fov = fov;
    }
  }

  orbitAround(center, radius, height, speed, { fov = 45, start = 0, stiff = 3, swing = 0 } = {}) {
    this.orbit = { center: center.clone(), radius, height, speed, a: start, start, swing, t: 0 };
    this.follow = null;
    this.tFov = fov;
    this.stiff = stiff;
  }

  update(dt) {
    if (this.follow) {
      const r = this.follow();
      this.tPos.copy(r.pos);
      this.tLook.copy(r.look);
      if (r.fov) this.tFov = r.fov;
    }
    if (this.orbit) {
      const o = this.orbit;
      o.t += dt;
      o.a = o.swing ? o.start + Math.sin(o.t * o.speed) * o.swing : o.a + o.speed * dt;
      this.tPos.set(o.center.x + Math.sin(o.a) * o.radius, o.center.y + o.height, o.center.z + Math.cos(o.a) * o.radius);
      this.tLook.copy(o.center).add(new THREE.Vector3(0, 1.2, 0));
    }
    const k = 1 - Math.exp(-this.stiff * dt);
    this.pos.lerp(this.tPos, k);
    this.look.lerp(this.tLook, Math.min(1, k * 1.4));
    this.fov += (this.tFov - this.fov) * k;
    this.camera.position.copy(this.pos);
    this.camera.lookAt(this.look);
    if (Math.abs(this.camera.fov - this.fov) > 0.01) {
      this.camera.fov = this.fov;
      this.camera.updateProjectionMatrix();
    }
  }
}

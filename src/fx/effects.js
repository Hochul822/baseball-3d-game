import * as THREE from 'three';

// ---------------------------------------------------------------------------
// GPU-light particle system: one big Points buffer, CPU simulated, additive.
// ---------------------------------------------------------------------------
const MAX_P = 6000;

function softTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.3, 'rgba(255,255,255,0.8)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  return t;
}
function starTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d');
  x.translate(32, 32);
  const g = x.createRadialGradient(0, 0, 0, 0, 0, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g;
  for (let i = 0; i < 4; i++) {
    x.rotate(Math.PI / 4);
    x.beginPath();
    x.moveTo(0, -32);
    x.lineTo(3, 0);
    x.lineTo(0, 32);
    x.lineTo(-3, 0);
    x.fill();
  }
  x.beginPath();
  x.arc(0, 0, 8, 0, Math.PI * 2);
  x.fill();
  return new THREE.CanvasTexture(c);
}

class ParticleSystem {
  constructor(scene, tex, blending = THREE.AdditiveBlending) {
    this.pos = new Float32Array(MAX_P * 3);
    this.col = new Float32Array(MAX_P * 4);
    this.size = new Float32Array(MAX_P);
    this.vel = new Float32Array(MAX_P * 3);
    this.life = new Float32Array(MAX_P);
    this.maxLife = new Float32Array(MAX_P);
    this.base = new Float32Array(MAX_P * 4);
    this.s0 = new Float32Array(MAX_P);
    this.s1 = new Float32Array(MAX_P);
    this.drag = new Float32Array(MAX_P);
    this.grav = new Float32Array(MAX_P);
    this.cursor = 0;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo = g;
    const mat = new THREE.ShaderMaterial({
      uniforms: { uTex: { value: tex }, uScale: { value: 600 } },
      vertexShader: `
        attribute float size; attribute vec4 color; varying vec4 vColor; uniform float uScale;
        void main(){ vColor = color; vec4 mv = modelViewMatrix * vec4(position,1.0);
          gl_PointSize = size * uScale / max(0.1, -mv.z); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `
        uniform sampler2D uTex; varying vec4 vColor;
        void main(){ vec4 t = texture2D(uTex, gl_PointCoord); gl_FragColor = vec4(vColor.rgb * t.rgb, vColor.a * t.a); }`,
      transparent: true,
      depthWrite: false,
      blending,
    });
    this.points = new THREE.Points(g, mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
  }

  emit(p, v, color, { life = 1, size = 0.3, size1 = 0, drag = 0.5, grav = 0, alpha = 1, intensity = 1 } = {}) {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % MAX_P;
    this.pos[i * 3] = p.x;
    this.pos[i * 3 + 1] = p.y;
    this.pos[i * 3 + 2] = p.z;
    this.vel[i * 3] = v.x;
    this.vel[i * 3 + 1] = v.y;
    this.vel[i * 3 + 2] = v.z;
    this.base[i * 4] = color.r * intensity;
    this.base[i * 4 + 1] = color.g * intensity;
    this.base[i * 4 + 2] = color.b * intensity;
    this.base[i * 4 + 3] = alpha;
    this.life[i] = life;
    this.maxLife[i] = life;
    this.s0[i] = size;
    this.s1[i] = size1;
    this.drag[i] = drag;
    this.grav[i] = grav;
  }

  update(dt) {
    for (let i = 0; i < MAX_P; i++) {
      if (this.life[i] <= 0) {
        this.size[i] = 0;
        continue;
      }
      this.life[i] -= dt;
      const k = Math.max(0, this.life[i] / this.maxLife[i]);
      const d = Math.max(0, 1 - this.drag[i] * dt);
      this.vel[i * 3] *= d;
      this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * d - this.grav[i] * dt;
      this.vel[i * 3 + 2] *= d;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      this.size[i] = this.s1[i] + (this.s0[i] - this.s1[i]) * k;
      const fade = Math.min(1, k * 3) * this.base[i * 4 + 3];
      this.col[i * 4] = this.base[i * 4];
      this.col[i * 4 + 1] = this.base[i * 4 + 1];
      this.col[i * 4 + 2] = this.base[i * 4 + 2];
      this.col[i * 4 + 3] = fade;
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.color.needsUpdate = true;
    this.geo.attributes.size.needsUpdate = true;
  }
}

// ---------------------------------------------------------------------------
// Ribbon trail that follows a moving point (camera-facing strip)
// ---------------------------------------------------------------------------
export class Trail {
  constructor(scene, { length = 40, width = 0.08, color = 0xffffff, intensity = 1.5, opacity = 0.8 } = {}) {
    this.n = length;
    this.points = [];
    this.width = width;
    const g = new THREE.BufferGeometry();
    this.posArr = new Float32Array(this.n * 2 * 3);
    this.alphaArr = new Float32Array(this.n * 2);
    const idx = [];
    for (let i = 0; i < this.n - 1; i++) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    g.setIndex(idx);
    g.setAttribute('position', new THREE.BufferAttribute(this.posArr, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('alpha', new THREE.BufferAttribute(this.alphaArr, 1).setUsage(THREE.DynamicDrawUsage));
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(color).multiplyScalar(intensity) }, uOpacity: { value: opacity } },
      vertexShader: `attribute float alpha; varying float vA; void main(){ vA = alpha; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);} `,
      fragmentShader: `uniform vec3 uColor; uniform float uOpacity; varying float vA; void main(){ gl_FragColor = vec4(uColor, vA * uOpacity);} `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
    this.active = false;
    this.fade = 0;
  }

  setColor(c, intensity = 1.5) {
    this.mat.uniforms.uColor.value.set(c).multiplyScalar(intensity);
  }

  reset() {
    this.points.length = 0;
    this.fade = 1;
  }

  push(p) {
    this.points.unshift(p.clone());
    if (this.points.length > this.n) this.points.pop();
  }

  update(camera, dt) {
    const pts = this.points;
    if (!this.active) {
      this.fade = Math.max(0, this.fade - dt * 2.5);
      if (pts.length > 1 && this.fade <= 0) pts.pop();
    } else this.fade = 1;
    const cam = camera.position;
    const tmp = new THREE.Vector3();
    const side = new THREE.Vector3();
    for (let i = 0; i < this.n; i++) {
      const p = pts[Math.min(i, pts.length - 1)] || cam;
      const q = pts[Math.min(i + 1, pts.length - 1)] || p;
      tmp.subVectors(p, q);
      if (tmp.lengthSq() < 1e-8) tmp.set(0, 0, 1);
      const view = new THREE.Vector3().subVectors(cam, p);
      side.crossVectors(tmp, view).normalize();
      const k = 1 - i / (this.n - 1);
      const w = this.width * (0.2 + 0.8 * k);
      this.posArr[i * 6] = p.x + side.x * w;
      this.posArr[i * 6 + 1] = p.y + side.y * w;
      this.posArr[i * 6 + 2] = p.z + side.z * w;
      this.posArr[i * 6 + 3] = p.x - side.x * w;
      this.posArr[i * 6 + 4] = p.y - side.y * w;
      this.posArr[i * 6 + 5] = p.z - side.z * w;
      const a = i < pts.length - 1 ? k * k * this.fade : 0;
      this.alphaArr[i * 2] = a;
      this.alphaArr[i * 2 + 1] = a;
    }
    this.mesh.geometry.attributes.position.needsUpdate = true;
    this.mesh.geometry.attributes.alpha.needsUpdate = true;
  }
}

// ---------------------------------------------------------------------------
// Expanding ring / shockwave meshes
// ---------------------------------------------------------------------------
function ringMaterial(color) {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uT: { value: 0 }, uAlpha: { value: 1 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);} `,
    fragmentShader: `uniform vec3 uColor; uniform float uT; uniform float uAlpha; varying vec2 vUv;
      void main(){ float r = length(vUv - 0.5) * 2.0; float band = smoothstep(0.62, 0.9, r) * (1.0 - smoothstep(0.9, 1.0, r));
        float inner = smoothstep(0.0, 0.9, r) * 0.15; float m = 1.0 - step(1.0, r); gl_FragColor = vec4(uColor * 2.0, (band + inner) * uAlpha * m); }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
}

// Lightning bolt as a jagged line strip made of camera-facing quads
class Bolt {
  constructor(scene, from, to, color, life = 0.25, width = 0.06, jag = 0.5) {
    const segs = 14;
    const pts = [];
    const dir = new THREE.Vector3().subVectors(to, from);
    const len = dir.length();
    const perp1 = new THREE.Vector3(0, 1, 0).cross(dir).normalize();
    if (perp1.lengthSq() < 0.1) perp1.set(1, 0, 0);
    const perp2 = new THREE.Vector3().crossVectors(dir, perp1).normalize();
    for (let i = 0; i <= segs; i++) {
      const t = i / segs;
      const p = from.clone().addScaledVector(dir, t);
      if (i > 0 && i < segs) {
        const j = Math.sin(t * Math.PI) * jag * len * 0.12;
        p.addScaledVector(perp1, (Math.random() - 0.5) * j).addScaledVector(perp2, (Math.random() - 0.5) * j);
      }
      pts.push(p);
    }
    const geo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.0), segs * 3, width, 4);
    const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(4), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    this.mesh = new THREE.Mesh(geo, mat);
    const core = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.0), segs * 3, width * 0.35, 4), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }));
    this.mesh.add(core);
    scene.add(this.mesh);
    this.life = life;
    this.max = life;
  }
  update(dt) {
    this.life -= dt;
    const k = Math.max(0, this.life / this.max);
    this.mesh.material.opacity = k * (0.6 + Math.random() * 0.4);
    this.mesh.visible = Math.random() < 0.85 || k > 0.7;
    return this.life > 0;
  }
  dispose() {
    this.mesh.parent?.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.mesh.children[0].geometry.dispose();
  }
}

// ---------------------------------------------------------------------------
// FX manager
// ---------------------------------------------------------------------------
export class FX {
  constructor(scene, camera, grade, bloom) {
    this.scene = scene;
    this.camera = camera;
    this.grade = grade;
    this.bloom = bloom;
    this.soft = new ParticleSystem(scene, softTexture());
    this.stars = new ParticleSystem(scene, starTexture());
    this.smoke = new ParticleSystem(scene, softTexture(), THREE.NormalBlending);
    this.rings = [];
    this.bolts = [];
    this.timers = [];
    this.shake = 0;
    this.timeScale = 1;
    this.slowmo = null;
    this.flash = 0;
    this.radial = 0;
    this.aberr = 0;
    this.invert = 0;
    this.bloomBoost = 0;
    this.auras = [];
    this._v = new THREE.Vector3();
    this._c = new THREE.Color();
  }

  rand(s = 1) {
    return (Math.random() - 0.5) * 2 * s;
  }

  burst(p, { count = 30, color = 0xffffff, speed = 6, life = 0.6, size = 0.25, size1 = 0, grav = 0, drag = 2, spread = 1, dir = null, star = false, intensity = 2, smoke = false, alpha = 1 } = {}) {
    const sys = smoke ? this.smoke : star ? this.stars : this.soft;
    const c = this._c.set(color);
    // shrink sprites that spawn right in front of the lens
    const dk = THREE.MathUtils.clamp(this.camera.position.distanceTo(p) / 9, 0.3, 1.4);
    size *= dk;
    size1 *= dk;
    for (let i = 0; i < count; i++) {
      const v = new THREE.Vector3(this.rand(), this.rand(), this.rand()).normalize().multiplyScalar(speed * (0.35 + Math.random() * 0.65));
      if (dir) v.multiplyScalar(spread).addScaledVector(dir, speed * (0.5 + Math.random()));
      sys.emit(p, v, c, { life: life * (0.6 + Math.random() * 0.6), size: size * (0.6 + Math.random() * 0.8), size1, drag, grav, intensity, alpha });
    }
  }

  dust(p, amount = 1) {
    this.burst(p.clone().setY(0.1), { count: Math.round(14 * amount), color: 0xc8a07a, speed: 2.2 * amount, life: 1.1, size: 0.55, size1: 1.2, grav: -0.2, drag: 2.5, smoke: true, alpha: 0.55, intensity: 1 });
  }

  impact(p, color = 0xffffff, power = 1) {
    // keep the flash readable when it happens right in front of the camera
    const d = this.camera.position.distanceTo(p);
    const k = THREE.MathUtils.clamp(d / 12, 0.35, 1.5);
    this.burst(p, { count: Math.round(40 * power), color, speed: 9 * power, life: 0.45, size: 0.12 * k, star: true, intensity: 3 });
    this.burst(p, { count: 8, color: 0xffffff, speed: 2, life: 0.18, size: 0.3 * power * k, intensity: 2 });
    this.ring(p, { color, size: 2.0 * power * k, life: 0.35, face: 'camera' });
  }

  ring(p, { color = 0xffffff, size = 3, life = 0.5, face = 'camera', normal = null, start = 0.1 } = {}) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), ringMaterial(color));
    m.position.copy(p);
    if (face === 'up') m.rotation.x = -Math.PI / 2;
    else if (normal) m.lookAt(p.clone().add(normal));
    m.userData = { life, max: life, size, start, face };
    this.scene.add(m);
    this.rings.push(m);
  }

  bolt(from, to, color = 0x7fd8ff, life = 0.25, width = 0.05, jag = 0.6) {
    this.bolts.push(new Bolt(this.scene, from, to, color, life, width, jag));
  }

  lightningStrike(p, color = 0x7fd8ff) {
    const top = p.clone().add(new THREE.Vector3(this.rand(3), 25, this.rand(3)));
    this.bolt(top, p, color, 0.35, 0.12, 1.0);
    this.bolt(top, p.clone().add(new THREE.Vector3(this.rand(2), 0, this.rand(2))), color, 0.25, 0.06, 1.3);
    this.impact(p, color, 1.4);
    this.flashScreen(0.35, color);
    this.addShake(0.5);
  }

  fireworks(center, n = 6) {
    const cols = [0xff3b5c, 0xffcf3b, 0x3bd6ff, 0x9d5cff, 0x5cff9d, 0xffffff];
    for (let i = 0; i < n; i++) {
      this.after(i * 0.28 + Math.random() * 0.2, () => {
        const p = center.clone().add(new THREE.Vector3(this.rand(40), 30 + Math.random() * 25, this.rand(20)));
        const c = cols[Math.floor(Math.random() * cols.length)];
        this.burst(p, { count: 160, color: c, speed: 16, life: 1.8, size: 0.9, grav: 3, drag: 1.2, star: true, intensity: 3 });
        this.burst(p, { count: 40, color: 0xffffff, speed: 6, life: 0.6, size: 1.4, intensity: 3 });
      });
    }
  }

  confetti(center, n = 300) {
    const cols = [0xff3b5c, 0xffcf3b, 0x3bd6ff, 0xffffff, 0x5cff9d];
    for (let i = 0; i < n; i++) {
      const p = center.clone().add(new THREE.Vector3(this.rand(30), 20 + Math.random() * 12, this.rand(30)));
      this._c.set(cols[i % cols.length]);
      this.soft.emit(p, new THREE.Vector3(this.rand(2), -2 - Math.random() * 2, this.rand(2)), this._c, { life: 4, size: 0.35, size1: 0.3, drag: 0.4, grav: 0.3, intensity: 1.2 });
    }
  }

  /** Continuous aura around a character (fire, electric, gold, wind) */
  aura(char, type, duration = 2) {
    this.auras.push({ char, type, t: 0, duration });
  }

  after(t, fn) {
    this.timers.push({ t, fn });
  }

  addShake(a) {
    this.shake = Math.min(1.5, this.shake + a);
  }

  flashScreen(a = 0.6, color = 0xffffff) {
    this.flash = Math.max(this.flash, a);
    this.grade.uniforms.uFlashColor.value.set(color);
  }

  slowMotion(scale = 0.2, dur = 1.0) {
    this.slowmo = { scale, t: 0, dur };
  }

  hitStop(dur = 0.08) {
    this.slowmo = { scale: 0.02, t: 0, dur };
  }

  emitTrail(p, type, vel) {
    const v = vel ? vel.clone().multiplyScalar(-0.05) : new THREE.Vector3();
    if (type === 'fire') {
      for (let i = 0; i < 4; i++) {
        this._c.setHSL(0.03 + Math.random() * 0.08, 1, 0.55);
        this.soft.emit(p.clone().add(new THREE.Vector3(this.rand(0.08), this.rand(0.08), this.rand(0.08))), v.clone().add(new THREE.Vector3(this.rand(1), 1.5 + Math.random() * 2, this.rand(1))), this._c, { life: 0.3 + Math.random() * 0.25, size: 0.2, size1: 0.03, drag: 2, intensity: 2.2, alpha: 0.8 });
      }
      if (Math.random() < 0.5) this.smoke.emit(p, new THREE.Vector3(this.rand(0.5), 1.2, this.rand(0.5)), this._c.set(0x332222), { life: 0.8, size: 0.3, size1: 0.8, alpha: 0.4, intensity: 1 });
    } else if (type === 'phantom') {
      for (let i = 0; i < 3; i++) {
        this._c.setHSL(0.75 + Math.random() * 0.05, 0.9, 0.6);
        this.soft.emit(p.clone().add(new THREE.Vector3(this.rand(0.15), this.rand(0.15), this.rand(0.15))), new THREE.Vector3(this.rand(0.6), this.rand(0.6), this.rand(0.6)), this._c, { life: 0.6, size: 0.3, size1: 0.6, drag: 1, intensity: 1.6, alpha: 0.6 });
      }
    } else if (type === 'thunder') {
      this._c.set(0x9fe8ff);
      for (let i = 0; i < 3; i++) this.stars.emit(p, new THREE.Vector3(this.rand(4), this.rand(4), this.rand(4)), this._c, { life: 0.25, size: 0.25, drag: 3, intensity: 3 });
      if (Math.random() < 0.35) this.bolt(p, p.clone().add(new THREE.Vector3(this.rand(1.2), this.rand(1.2), this.rand(1.2))), 0x7fd8ff, 0.12, 0.02, 1.5);
    } else if (type === 'gold') {
      for (let i = 0; i < 5; i++) {
        this._c.setHSL(0.11 + Math.random() * 0.04, 1, 0.6);
        this.stars.emit(p.clone().add(new THREE.Vector3(this.rand(0.2), this.rand(0.2), this.rand(0.2))), new THREE.Vector3(this.rand(1.5), this.rand(1.5), this.rand(1.5)), this._c, { life: 0.7, size: 0.4, size1: 0.05, drag: 1.5, intensity: 3 });
      }
    } else if (type === 'dragon') {
      // spiralling helix of gold + red embers around the ball path
      const tt = performance.now() * 0.02;
      for (let k = 0; k < 2; k++) {
        const a = tt + k * Math.PI;
        const off = new THREE.Vector3(Math.cos(a) * 0.5, Math.sin(a) * 0.5, 0);
        this._c.setHSL(k ? 0.02 : 0.12, 1, 0.6);
        this.soft.emit(p.clone().add(off), new THREE.Vector3(), this._c, { life: 0.8, size: 0.45, size1: 0.08, drag: 1, intensity: 2.6 });
      }
      this.emitTrail(p, 'gold', vel);
    } else if (type === 'wind') {
      this._c.set(0xbff6ff);
      for (let i = 0; i < 2; i++) this.soft.emit(p.clone().add(new THREE.Vector3(this.rand(0.5), Math.random() * 1.6, this.rand(0.5))), v.clone().multiplyScalar(8).add(new THREE.Vector3(0, 0.3, 0)), this._c, { life: 0.4, size: 0.25, size1: 0.02, drag: 1, intensity: 1.8, alpha: 0.7 });
    }
  }

  update(realDt) {
    realDt = Math.max(0, realDt || 0);
    // time scale management
    let scale = 1;
    if (this.slowmo) {
      this.slowmo.t += realDt;
      const s = this.slowmo;
      const k = s.t / s.dur;
      if (k >= 1) this.slowmo = null;
      else scale = s.scale + (1 - s.scale) * Math.pow(k, 4);
    }
    this.timeScale = scale;
    const dt = realDt * scale;

    for (let i = this.timers.length - 1; i >= 0; i--) {
      this.timers[i].t -= realDt;
      if (this.timers[i].t <= 0) {
        const fn = this.timers[i].fn;
        this.timers.splice(i, 1);
        fn();
      }
    }
    this.soft.update(dt);
    this.stars.update(dt);
    this.smoke.update(dt);
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      const u = r.userData;
      u.life -= dt;
      const k = 1 - Math.max(0, u.life / u.max);
      const s = u.size * (u.start + (1 - u.start) * (1 - Math.pow(1 - k, 3)));
      r.scale.setScalar(s);
      r.material.uniforms.uAlpha.value = 1 - k;
      if (u.face === 'camera') r.quaternion.copy(this.camera.quaternion);
      if (u.life <= 0) {
        this.scene.remove(r);
        r.geometry.dispose();
        r.material.dispose();
        this.rings.splice(i, 1);
      }
    }
    for (let i = this.bolts.length - 1; i >= 0; i--) {
      if (!this.bolts[i].update(dt)) {
        this.bolts[i].dispose();
        this.bolts.splice(i, 1);
      }
    }
    // auras
    for (let i = this.auras.length - 1; i >= 0; i--) {
      const a = this.auras[i];
      a.t += dt;
      const ch = a.char;
      const base = new THREE.Vector3().setFromMatrixPosition(ch.bones.hips.matrixWorld);
      const n = a.type === 'wind' ? 2 : 3;
      for (let k = 0; k < n; k++) {
        const p = base.clone().add(new THREE.Vector3(this.rand(0.45), this.rand(0.9) + 0.1, this.rand(0.45)));
        if (a.type === 'fire') {
          this._c.setHSL(0.03 + Math.random() * 0.07, 1, 0.55);
          this.soft.emit(p, new THREE.Vector3(this.rand(0.3), 2.5 + Math.random() * 2, this.rand(0.3)), this._c, { life: 0.45, size: 0.2, size1: 0.03, drag: 1, intensity: 1.8, alpha: 0.7 });
        } else if (a.type === 'gold') {
          this._c.setHSL(0.12, 1, 0.6);
          this.stars.emit(p, new THREE.Vector3(this.rand(0.4), 1.8 + Math.random() * 1.5, this.rand(0.4)), this._c, { life: 0.6, size: 0.18, size1: 0.03, drag: 1, intensity: 2.4 });
          if (k === 0) this.soft.emit(p, new THREE.Vector3(0, 2.5, 0), this._c.setHSL(0.1, 1, 0.5), { life: 0.5, size: 0.4, size1: 0.05, intensity: 1.0, alpha: 0.35 });
        } else if (a.type === 'electric') {
          this._c.set(0x8fe3ff);
          this.stars.emit(p, new THREE.Vector3(this.rand(2), this.rand(2), this.rand(2)), this._c, { life: 0.2, size: 0.2, drag: 3, intensity: 3 });
          if (k === 0 && Math.random() < 0.4) this.bolt(p, p.clone().add(new THREE.Vector3(this.rand(0.8), this.rand(0.8), this.rand(0.8))), 0x7fd8ff, 0.1, 0.015, 1.5);
        } else if (a.type === 'phantom') {
          this._c.setHSL(0.76, 0.9, 0.55);
          this.soft.emit(p, new THREE.Vector3(this.rand(0.3), 1.2, this.rand(0.3)), this._c, { life: 0.8, size: 0.25, size1: 0.5, drag: 1, intensity: 1.0, alpha: 0.35 });
        } else if (a.type === 'wind') {
          const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(ch.root.quaternion);
          this.emitTrail(p, 'wind', fwd.multiplyScalar(-8));
        }
      }
      if (a.t > a.duration) this.auras.splice(i, 1);
    }

    // screen effects
    this.flash = Math.max(0, this.flash - realDt * 2.2);
    this.radial = Math.max(0, this.radial - realDt * 1.2);
    this.aberr = Math.max(0, this.aberr - realDt * 2);
    this.invert = Math.max(0, this.invert - realDt * 6);
    this.bloomBoost = Math.max(0, this.bloomBoost - realDt * 0.8);
    this.shake = Math.max(0, this.shake - realDt * 2.2);
    const u = this.grade.uniforms;
    u.uFlash.value = this.flash;
    u.uRadial.value = this.radial;
    u.uAberration.value = this.aberr + this.shake * 0.4;
    u.uInvert.value = this.invert > 0.5 ? 1 : 0;
    this.bloom.strength = 0.5 + this.bloomBoost;
    return dt;
  }

  applyShake(camera) {
    if (this.shake <= 0) return;
    const s = this.shake * this.shake * 0.25;
    camera.position.x += this.rand(s);
    camera.position.y += this.rand(s);
    camera.position.z += this.rand(s);
  }
}

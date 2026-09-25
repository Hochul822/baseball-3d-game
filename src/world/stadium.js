import * as THREE from 'three';
import { toonMat, addOutline, RAMP3, RAMP4, RAMP_SOFT } from '../core/toon.js';
import { BASES, MOUND, fenceDistance, WALL_H, BASE_DIST, TEAMS } from '../constants.js';
import { Crowd } from './crowd.js';

const FIELD_SIZE = 280; // metres covered by the ground texture
const TEX = 4096;

function fieldTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = TEX;
  const x = c.getContext('2d');
  const S = TEX / FIELD_SIZE; // px per metre
  // world (wx, wz) -> canvas px. canvas centre = world (0, 100)
  const cx = TEX / 2;
  const cz = TEX / 2;
  const OZ = 100;
  const P = (wx, wz) => [cx - wx * S, cz - (wz - OZ) * S];
  x.save();

  // outside grass (dark)
  x.fillStyle = '#2d6b2a';
  x.fillRect(0, 0, TEX, TEX);

  // fair territory + foul grass mowing stripes
  const [hx, hz] = P(0, 0);
  // diagonal checker mowing pattern
  x.save();
  x.beginPath();
  x.arc(hx, hz, 135 * S, 0, Math.PI * 2);
  x.clip();
  const band = 7 * S;
  for (let i = -40; i < 40; i++) {
    for (let j = -40; j < 40; j++) {
      const light = (i + j) % 2 === 0;
      x.fillStyle = light ? '#4c9a3b' : '#428a34';
      x.save();
      x.translate(hx, hz);
      x.rotate(Math.PI / 4);
      x.fillRect(i * band, j * band, band, band);
      x.restore();
    }
  }
  x.restore();

  // warning track: ring around the fence
  x.save();
  x.beginPath();
  for (let a = -Math.PI / 2; a <= Math.PI / 2; a += 0.01) {
    const r = fenceDistance(a) + 0.3;
    const [px, pz] = P(Math.sin(a) * r, Math.cos(a) * r);
    x.lineTo(px, pz);
  }
  for (let a = Math.PI / 2; a >= -Math.PI / 2; a -= 0.01) {
    const r = fenceDistance(a) - 4.8;
    const [px, pz] = P(Math.sin(a) * r, Math.cos(a) * r);
    x.lineTo(px, pz);
  }
  x.closePath();
  x.fillStyle = '#a9714a';
  x.fill();
  x.restore();
  // outside fence (beyond) dark
  x.save();
  x.beginPath();
  for (let a = -Math.PI; a <= Math.PI; a += 0.01) {
    const aa = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, a));
    const r = Math.abs(a) > Math.PI / 2 ? 0 : fenceDistance(aa) + 0.3;
    const [px, pz] = P(Math.sin(a) * r, Math.cos(a) * r);
    x.lineTo(px, pz);
  }
  x.closePath();
  x.rect(TEX, 0, -TEX, TEX);
  x.fillStyle = '#1f4a22';
  x.fill('evenodd');
  x.restore();

  const dirt = '#b97a4f';
  const dirtDark = '#a86a42';
  // infield dirt arc (radius 29m from rubber) clipped to fair-ish region
  const [mx, mz] = P(MOUND.x, MOUND.z);
  x.save();
  x.beginPath();
  [[0, -3.2], [-90, 86.8], [90, 86.8]].forEach(([wx, wz], i) => (i ? x.lineTo(...P(wx, wz)) : x.moveTo(...P(wx, wz))));
  x.closePath();
  x.clip();
  x.fillStyle = dirt;
  x.beginPath();
  x.arc(mx, mz, 29 * S, 0, Math.PI * 2);
  x.fill();
  x.restore();
  // cut foul side of the arc back to grass: fill the region behind the base lines with grass stripes? simpler: grass wedge
  // infield grass (diamond inset)
  const inset = 1.0;
  const d = BASE_DIST / Math.SQRT2;
  x.fillStyle = '#4a9739';
  x.beginPath();
  const pts = [
    [0, 4.0],
    [-d + 4.2, d],
    [0, 2 * d - 4.2],
    [d - 4.2, d],
  ];
  pts.forEach(([wx, wz], i) => {
    const [px, pz] = P(wx, wz);
    i ? x.lineTo(px, pz) : x.moveTo(px, pz);
  });
  x.closePath();
  x.fill();
  // stripes on the infield grass
  x.save();
  x.clip();
  for (let i = -20; i < 20; i++) {
    x.fillStyle = i % 2 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)';
    x.save();
    x.translate(hx, hz);
    x.rotate(Math.PI / 4);
    x.fillRect(i * 3 * S, -60 * S, 3 * S, 120 * S);
    x.restore();
  }
  x.restore();
  // grass beyond the base paths in foul territory
  // base path lanes (dirt)
  x.strokeStyle = dirt;
  x.lineCap = 'round';
  x.lineWidth = 1.8 * S;
  x.beginPath();
  x.moveTo(...P(0, 0));
  x.lineTo(...P(-d, d));
  x.moveTo(...P(0, 0));
  x.lineTo(...P(d, d));
  x.stroke();
  // mound
  x.fillStyle = dirtDark;
  x.beginPath();
  x.arc(mx, mz, 2.9 * S, 0, Math.PI * 2);
  x.fill();
  x.fillStyle = dirt;
  x.beginPath();
  x.arc(mx, mz, 2.6 * S, 0, Math.PI * 2);
  x.fill();
  // home plate circle
  x.fillStyle = dirt;
  x.beginPath();
  x.arc(hx, hz, 4.1 * S, 0, Math.PI * 2);
  x.fill();
  // base cutouts
  for (let i = 1; i < 4; i++) {
    const [bx, bz] = P(BASES[i].x, BASES[i].z);
    x.beginPath();
    x.arc(bx, bz, 3.2 * S, 0, Math.PI * 2);
    x.fill();
  }
  // dirt texture noise
  const img = x.getImageData(0, 0, TEX, TEX);
  const data = img.data;
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < data.length; i += 4) {
    const n = (rnd() - 0.5) * 14;
    data[i] += n;
    data[i + 1] += n;
    data[i + 2] += n * 0.8;
  }
  x.putImageData(img, 0, 0);

  // chalk lines
  x.strokeStyle = '#f7f5ee';
  x.lineWidth = Math.max(2, 0.1 * S);
  x.beginPath();
  x.moveTo(...P(0, 0));
  x.lineTo(...P(-fenceDistance(Math.PI / 4) / Math.SQRT2, fenceDistance(Math.PI / 4) / Math.SQRT2));
  x.moveTo(...P(0, 0));
  x.lineTo(...P(fenceDistance(Math.PI / 4) / Math.SQRT2, fenceDistance(Math.PI / 4) / Math.SQRT2));
  x.stroke();
  // batter boxes
  x.lineWidth = Math.max(2, 0.08 * S);
  for (const s of [1, -1]) {
    const bx0 = s * 0.35;
    const bx1 = s * 1.57;
    x.beginPath();
    const a = P(bx0, -0.9);
    const b = P(bx1, 0.95);
    x.rect(Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1]));
    x.stroke();
  }
  // catcher box
  x.beginPath();
  x.moveTo(...P(-0.55, -0.9));
  x.lineTo(...P(-0.55, -3.0));
  x.lineTo(...P(0.55, -3.0));
  x.lineTo(...P(0.55, -0.9));
  x.stroke();
  // coach boxes & on-deck circles
  for (const s of [1, -1]) {
    x.beginPath();
    x.arc(...P(s * 11, -6), 0.8 * S, 0, Math.PI * 2);
    x.fillStyle = 'rgba(60,120,50,0.9)';
    x.fill();
    x.stroke();
  }
  // team logo painted behind home plate
  x.save();
  x.translate(...P(0, -9));
  x.rotate(Math.PI);
  x.font = `bold ${3.2 * S}px "Black Han Sans", sans-serif`;
  x.textAlign = 'center';
  x.fillStyle = 'rgba(255,255,255,0.75)';
  x.fillText('K-MAJOR', 0, 0);
  x.restore();
  x.restore();

  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

function adTexture() {
  const c = document.createElement('canvas');
  c.width = 4096;
  c.height = 128;
  const x = c.getContext('2d');
  const ads = [
    ['#0e2a47', '#ffcc00', 'K-MAJOR LEAGUE'],
    ['#d81e3a', '#ffffff', '피닉스 라면'],
    ['#1f4fd1', '#ffffff', 'COMET AIR'],
    ['#111111', '#4cff9a', 'NEON BANK'],
    ['#ffcc00', '#111111', '치킨은 역시 바삭'],
    ['#2e7d32', '#ffffff', 'GREEN MOBILE'],
    ['#6a1b9a', '#ffffff', 'STAR TELECOM'],
    ['#ff6d00', '#ffffff', 'HOMERUN COLA'],
  ];
  const w = c.width / ads.length;
  ads.forEach(([bg, fg, t], i) => {
    x.fillStyle = bg;
    x.fillRect(i * w, 0, w, 128);
    x.fillStyle = fg;
    x.font = 'bold 64px "Black Han Sans", "Arial Black", sans-serif';
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.fillText(t, i * w + w / 2, 68);
    x.fillStyle = 'rgba(255,255,255,0.25)';
    x.fillRect(i * w, 0, 4, 128);
  });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

export class Stadium {
  constructor(scene, opts = {}) {
    this.scene = scene;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.time = 0;
    this.flags = [];
    this.lights = [];
    this.buildSky();
    this.buildGround();
    this.buildInfieldProps();
    this.buildWall();
    this.buildStands();
    this.buildLights();
    this.buildScoreboard();
    this.buildSkyline();
    this.crowd = new Crowd(this.group, this.seatSpots, opts.homeTeam ?? TEAMS[0], opts.awayTeam ?? TEAMS[1]);
  }

  buildSky() {
    const geo = new THREE.SphereGeometry(900, 32, 16);
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        uTop: { value: new THREE.Color(0x1d2b64) },
        uMid: { value: new THREE.Color(0x7a5ea8) },
        uHorizon: { value: new THREE.Color(0xff9a62) },
        uSunDir: { value: new THREE.Vector3(-0.35, 0.12, 1).normalize() },
        uTime: { value: 0 },
      },
      vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `
        uniform vec3 uTop, uMid, uHorizon, uSunDir; uniform float uTime; varying vec3 vDir;
        float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
        float noise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
          return mix(mix(hash(i),hash(i+vec2(1,0)),f.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x), f.y); }
        void main(){
          float h = vDir.y;
          vec3 col = mix(uHorizon, uMid, smoothstep(0.0, 0.25, h));
          col = mix(col, uTop, smoothstep(0.22, 0.75, h));
          float s = max(dot(vDir, uSunDir), 0.0);
          col += vec3(1.0,0.6,0.3) * pow(s, 8.0) * 0.6;
          col += vec3(1.0,0.85,0.6) * smoothstep(0.9975, 0.999, s) * 3.0;
          // toon clouds (banded)
          vec2 uv = vDir.xz / (h + 0.25) * 2.0 + vec2(uTime*0.004, 0.0);
          float n = noise(uv*1.3)*0.6 + noise(uv*3.1)*0.3 + noise(uv*7.0)*0.1;
          float cl = smoothstep(0.58, 0.6, n) * smoothstep(0.02, 0.2, h) * (1.0 - smoothstep(0.5, 0.8, h));
          vec3 cloudCol = mix(vec3(1.0,0.72,0.6), vec3(0.55,0.45,0.75), smoothstep(0.6,0.75,n));
          col = mix(col, cloudCol, cl*0.85);
          // stars at the top
          float st = step(0.9985, hash(floor(vDir.xz*400.0))) * smoothstep(0.45, 0.8, h);
          col += st * 0.8;
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
    this.sky = new THREE.Mesh(geo, mat);
    this.sky.frustumCulled = false;
    this.group.add(this.sky);
  }

  buildGround() {
    const tex = fieldTexture();
    const geo = new THREE.PlaneGeometry(FIELD_SIZE, FIELD_SIZE, 1, 1);
    geo.rotateX(-Math.PI / 2);
    // plane uv: u along +x world? map so that canvas x = centre - wx
    geo.rotateY(Math.PI);
    geo.translate(0, 0, 100);
    const mat = toonMat(0xffffff, { map: tex, ramp: RAMP_SOFT, rim: 0 });
    const ground = new THREE.Mesh(geo, mat);
    ground.receiveShadow = true;
    this.group.add(ground);
    this.ground = ground;
    // big dark ground beyond
    const outer = new THREE.Mesh(new THREE.CircleGeometry(700, 48).rotateX(-Math.PI / 2), toonMat(0x1c2a1c, { rim: 0 }));
    outer.position.y = -0.05;
    this.group.add(outer);
  }

  buildInfieldProps() {
    // mound
    const mound = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 2.75, MOUND.y, 40), toonMat(0xb57750, { ramp: RAMP_SOFT, rim: 0 }));
    mound.position.set(MOUND.x, MOUND.y / 2, MOUND.z);
    mound.receiveShadow = true;
    this.group.add(mound);
    const rubber = new THREE.Mesh(new THREE.BoxGeometry(0.61, 0.03, 0.15), toonMat(0xffffff));
    rubber.position.set(0, MOUND.y + 0.012, MOUND.z);
    this.group.add(rubber);
    // bases
    for (let i = 1; i < 4; i++) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.08, 0.38), toonMat(0xffffff));
      b.position.copy(BASES[i]).setY(0.04);
      b.rotation.y = Math.PI / 4;
      b.castShadow = true;
      addOutline(b, 0.01);
      this.group.add(b);
    }
    // home plate pentagon
    const s = new THREE.Shape();
    s.moveTo(-0.216, 0.216);
    s.lineTo(0.216, 0.216);
    s.lineTo(0.216, 0);
    s.lineTo(0, -0.216);
    s.lineTo(-0.216, 0);
    s.closePath();
    const hp = new THREE.Mesh(new THREE.ExtrudeGeometry(s, { depth: 0.02, bevelEnabled: false }), toonMat(0xffffff));
    hp.rotation.x = -Math.PI / 2;
    hp.position.set(0, 0.001, 0.0);
    // flip so the point faces the catcher (-Z)
    hp.scale.set(1, 1, 1);
    this.group.add(hp);
  }

  buildWall() {
    const segs = 160;
    const pos = [];
    const uvs = [];
    const idx = [];
    const topPos = [];
    const pad = [];
    const a0 = -Math.PI / 4 - 0.004;
    const a1 = Math.PI / 4 + 0.004;
    let len = 0;
    let prev = null;
    for (let i = 0; i <= segs; i++) {
      const a = a0 + (a1 - a0) * (i / segs);
      const r = fenceDistance(a);
      const x = Math.sin(a) * r;
      const z = Math.cos(a) * r;
      if (prev) len += Math.hypot(x - prev[0], z - prev[1]);
      prev = [x, z];
      pos.push(x, 0, z, x, WALL_H, z);
      uvs.push(-len / 30, 0, -len / 30, 1);
      topPos.push([x, z]);
      if (i < segs) {
        const k = i * 2;
        idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    // wall padding texture: dark green pad with ads in the middle band
    const ad = adTexture();
    ad.repeat.set(1, 1);
    const wall = new THREE.Mesh(g, toonMat(0xffffff, { map: ad, side: THREE.DoubleSide, rim: 0 }));
    wall.receiveShadow = true;
    this.group.add(wall);
    this.wall = wall;
    // yellow top rail (home run line)
    const railPts = topPos.map(([x, z]) => new THREE.Vector3(x, WALL_H + 0.06, z));
    const rail = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(railPts), 200, 0.08, 6), toonMat(0xffd400, { emissive: 0x332200 }));
    this.group.add(rail);
    // foul poles
    for (const s of [-1, 1]) {
      const a = (s * Math.PI) / 4;
      const r = fenceDistance(a);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.2, 26, 10), toonMat(0xffd400, { emissive: 0x442200 }));
      pole.position.set(Math.sin(a) * r, 13, Math.cos(a) * r);
      addOutline(pole, 0.03);
      this.group.add(pole);
      const net = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 20), new THREE.MeshBasicMaterial({ color: 0xffd400, transparent: true, opacity: 0.35, side: THREE.DoubleSide }));
      net.position.set(Math.sin(a) * r - s * 0.7, 14, Math.cos(a) * r);
      net.rotation.y = a + Math.PI / 2;
      this.group.add(net);
    }
    // batter's eye (dark block in CF)
    const eye = new THREE.Mesh(new THREE.BoxGeometry(24, 9, 2), toonMat(0x0f2a1a, { rim: 0 }));
    eye.position.set(0, 4.5, fenceDistance(0) + 2);
    this.group.add(eye);
    // backstop behind home
    const bs = new THREE.Mesh(new THREE.CylinderGeometry(19, 19, 3.2, 40, 1, true, Math.PI * 0.72, Math.PI * 0.56), toonMat(0x1b2a44, { side: THREE.DoubleSide, rim: 0 }));
    bs.position.set(0, 1.6, 4);
    this.group.add(bs);
    // protective net behind home
    const netMat = new THREE.MeshBasicMaterial({ color: 0x223344, transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthWrite: false });
    const net = new THREE.Mesh(new THREE.CylinderGeometry(19.1, 19.1, 9, 40, 1, true, Math.PI * 0.72, Math.PI * 0.56), netMat);
    net.position.set(0, 7.7, 4);
    this.group.add(net);
  }

  /** Stepped seating bowl. Returns seat spots for the crowd. */
  buildStands() {
    this.seatSpots = [];
    const seatMatA = toonMat(0xffffff, { vertexColors: true, ramp: RAMP4, rim: 0.4 });
    const pos = [];
    const col = [];
    const idx = [];
    const addQuad = (a, b, c, d, color) => {
      const base = pos.length / 3;
      pos.push(...a, ...b, ...c, ...d);
      for (let i = 0; i < 4; i++) col.push(color.r, color.g, color.b);
      idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    };
    const concrete = new THREE.Color(0x3b4459);
    const seatCols = [new THREE.Color(TEAMS[0].primary), new THREE.Color(0x1d3557), new THREE.Color(TEAMS[1].primary)];
    // Infield stands curve from behind home around the foul lines. Use a custom path:
    const pathInfield = (t, side) => {
      // t in [0,1]: 0 = behind home plate, 1 = down the foul line toward the pole
      const a = side * (Math.PI - t * (Math.PI - Math.PI / 4 - 0.14));
      const r = t < 0.3 ? 21 + t * 6 : 22.8 + (t - 0.3) * 115;
      return new THREE.Vector3(Math.sin(a) * r, 0, Math.cos(a) * r);
    };
    const fieldC = new THREE.Vector3(0, 0, 40);
    const normalAt = (pathFn, t) => {
      const a = pathFn(Math.max(0, t - 0.01));
      const b = pathFn(Math.min(1, t + 0.01));
      const tg = b.sub(a).normalize();
      const n = new THREE.Vector3(tg.z, 0, -tg.x);
      const p = pathFn(t);
      if (n.dot(p.sub(fieldC)) < 0) n.negate();
      return n;
    };
    const buildBowl = (pathFn, n, rows, depth, rise, h0, colorA, colorB, filter) => {
      for (let i = 0; i < n; i++) {
        const t0 = i / n;
        const t1 = (i + 1) / n;
        const p0 = pathFn(t0);
        const p1 = pathFn(t1);
        const out0 = normalAt(pathFn, t0);
        const out1 = normalAt(pathFn, t1);
        for (let r = 0; r < rows; r++) {
          const y = h0 + r * rise;
          const d0 = r * depth;
          const d1 = (r + 1) * depth;
          const a = p0.clone().addScaledVector(out0, d0).setY(y);
          const b = p1.clone().addScaledVector(out1, d0).setY(y);
          const c = p1.clone().addScaledVector(out1, d1).setY(y);
          const d = p0.clone().addScaledVector(out0, d1).setY(y);
          const upperDeck = r > rows * 0.55;
          const color = (upperDeck ? colorB : colorA).clone().multiplyScalar(0.85 + (r % 2) * 0.1);
          addQuad(a, b, c, d, color);
          addQuad(d, c, c.clone().setY(y + rise), d.clone().setY(y + rise), concrete);
          const count = Math.max(1, Math.round(a.distanceTo(b) / 0.62));
          const face = Math.atan2(-out0.x, -out0.z);
          for (let k = 0; k < count; k++) {
            const pp = a.clone().lerp(b, (k + 0.5) / count).addScaledVector(out0, depth * 0.55);
            if (filter && !filter(pp)) continue;
            this.seatSpots.push({ p: pp, face, side: pp.x > 0 ? 1 : -1 });
          }
        }
        const fa = p0.clone().setY(0);
        const fb = p1.clone().setY(0);
        addQuad(fa, fb, fb.clone().setY(h0), fa.clone().setY(h0), new THREE.Color(0x14213d));
        const ba = p0.clone().addScaledVector(out0, rows * depth).setY(h0 + rows * rise);
        const bb = p1.clone().addScaledVector(out1, rows * depth).setY(h0 + rows * rise);
        addQuad(ba, bb, bb.clone().setY(h0 + rows * rise + 4), ba.clone().setY(h0 + rows * rise + 4), concrete);
      }
    };
    buildBowl((t) => pathInfield(t, 1), 48, 30, 0.85, 0.46, 1.4, seatCols[1], new THREE.Color(0x8a1f2e));
    buildBowl((t) => pathInfield(t, -1), 48, 30, 0.85, 0.46, 1.4, seatCols[1], new THREE.Color(0x8a1f2e));
    const pathOut = (t) => {
      const a = -0.8 + t * 1.6;
      const r = fenceDistance(Math.max(-0.785, Math.min(0.785, a))) + 3;
      return new THREE.Vector3(Math.sin(a) * r, 0, Math.cos(a) * r);
    };
    buildBowl(pathOut, 64, 16, 0.95, 0.55, 3.4, new THREE.Color(0x1f5d3a), new THREE.Color(0x1f5d3a), (p) => !(Math.abs(p.x) < 13));

    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    const stands = new THREE.Mesh(g, seatMatA);
    stands.receiveShadow = true;
    this.group.add(stands);

    // upper deck roof ring behind home
    const roof = new THREE.Mesh(new THREE.CylinderGeometry(52, 50, 1.2, 64, 1, true, Math.PI * 0.62, Math.PI * 0.76), toonMat(0xd9dde6, { side: THREE.DoubleSide }));
    roof.position.set(0, 21, 4);
    this.group.add(roof);
    const roofTop = new THREE.Mesh(new THREE.RingGeometry(38, 52, 64, 1, Math.PI * 0.62 + Math.PI / 2, Math.PI * 0.76), toonMat(0xe8ecf2, { side: THREE.DoubleSide, rim: 0 }));
    roofTop.rotation.x = -Math.PI / 2;
    roofTop.rotation.z = Math.PI;
    roofTop.position.set(0, 21.6, 4);
    this.group.add(roofTop);
    // cheer stage on the first base side (KBO style)
    const stage = new THREE.Group();
    const plat = new THREE.Mesh(new THREE.BoxGeometry(7, 1.4, 3), toonMat(0x14213d));
    plat.position.y = 0.7;
    addOutline(plat, 0.04);
    stage.add(plat);
    const top = new THREE.Mesh(new THREE.BoxGeometry(7.2, 0.15, 3.2), toonMat(TEAMS[0].primary, { emissive: 0x220000 }));
    top.position.y = 1.45;
    stage.add(top);
    const banner = new THREE.Mesh(new THREE.PlaneGeometry(7, 1.2), new THREE.MeshBasicMaterial({ map: bannerTexture('서울 피닉스 응원단 ★ PHOENIX CHEER'), toneMapped: false }));
    banner.position.set(0, 0.7, 1.52);
    stage.add(banner);
    const sp = pathInfield(0.42, -1);
    const sn = normalAt((t) => pathInfield(t, -1), 0.42);
    stage.position.copy(sp).addScaledVector(sn, -2.2).setY(0);
    stage.lookAt(stage.position.clone().sub(sn));
    this.stageNormal = sn;
    this.group.add(stage);
    this.cheerStage = stage;
    // big hanging banners on the first-base upper deck
    for (let i = 0; i < 3; i++) {
      const p = pathInfield(0.3 + i * 0.12, -1);
      const out = normalAt((t) => pathInfield(t, -1), 0.3 + i * 0.12);
      const b = new THREE.Mesh(new THREE.PlaneGeometry(5, 2.2), new THREE.MeshBasicMaterial({ map: bannerTexture(['최강 피닉스', '가을야구 가자!', '우리가 챔피언'][i], TEAMS[0].primary), side: THREE.DoubleSide, toneMapped: false }));
      b.position.copy(p).addScaledVector(out, 13).setY(8.8);
      b.lookAt(0, 8.8, 20);
      this.group.add(b);
    }
  }

  buildLights() {
    const poleMat = toonMat(0x9aa3b5);
    const panelMat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
    panelMat.color.setRGB(6, 5.6, 4.8);
    const spots = [
      [-58, 45],
      [58, 45],
      [-95, 110],
      [95, 110],
      [-40, -18],
      [40, -18],
    ];
    for (const [x, z] of spots) {
      const g = new THREE.Group();
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.9, 46, 8), poleMat);
      pole.position.y = 23;
      g.add(pole);
      const frame = new THREE.Mesh(new THREE.BoxGeometry(12, 7, 0.6), toonMat(0x2b3040));
      frame.position.set(0, 47, 0);
      g.add(frame);
      for (let i = 0; i < 4; i++)
        for (let j = 0; j < 3; j++) {
          const p = new THREE.Mesh(new THREE.CircleGeometry(0.9, 12), panelMat);
          p.position.set(-4.5 + i * 3, 45 + j * 2.2, 0.35);
          g.add(p);
        }
      // glow sprite
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xfff1d0, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.55 }));
      glow.scale.set(40, 30, 1);
      glow.position.set(0, 47, 1.5);
      g.add(glow);
      g.position.set(x, 0, z);
      g.lookAt(0, 0, 40);
      this.group.add(g);
      this.lights.push(g);
    }
  }

  buildScoreboard() {
    const c = document.createElement('canvas');
    c.width = 2048;
    c.height = 768;
    this.sbCanvas = c;
    this.sbCtx = c.getContext('2d');
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    this.sbTex = tex;
    const g = new THREE.Group();
    const frame = new THREE.Mesh(new THREE.BoxGeometry(44, 19, 2), toonMat(0x1a1f2e));
    frame.position.y = 21;
    addOutline(frame, 0.08);
    g.add(frame);
    const screenMat = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false });
    screenMat.color.setScalar(1.25);
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(42, 15.75), screenMat);
    screen.position.set(0, 21, -1.05);
    screen.rotation.y = Math.PI;
    g.add(screen);
    for (const s of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(2, 14, 2), toonMat(0x2b3040));
      leg.position.set(s * 16, 5, 0);
      g.add(leg);
    }
    // crown lettering
    const crown = new THREE.Mesh(new THREE.PlaneGeometry(30, 4), new THREE.MeshBasicMaterial({ map: bannerTexture('K-MAJOR BASEBALL', 0x0e2a47, '#ffcc00'), toneMapped: false }));
    crown.position.set(0, 32.8, -1.05);
    crown.rotation.y = Math.PI;
    g.add(crown);
    g.position.set(0, 12, fenceDistance(0) + 30);
    this.group.add(g);
    this.scoreboard = g;
    // flags on top
    for (let i = 0; i < 5; i++) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 8, 6), toonMat(0xdddddd));
      pole.position.set(-18 + i * 9, 35 + 4 + 12, fenceDistance(0) + 30);
      this.group.add(pole);
      const cols = [TEAMS[0].primary, 0xffffff, 0x1d3557, 0xffffff, TEAMS[1].primary];
      const flagGeo = new THREE.PlaneGeometry(3.2, 1.9, 16, 4);
      flagGeo.translate(1.6, 0, 0);
      const flag = new THREE.Mesh(flagGeo, toonMat(cols[i], { side: THREE.DoubleSide }));
      flag.position.set(pole.position.x, pole.position.y + 2.8, pole.position.z);
      flag.userData.base = flagGeo.attributes.position.array.slice();
      this.group.add(flag);
      this.flags.push(flag);
    }
    this.drawScoreboard({ inning: 1, half: 0, score: [0, 0], line: [[], []], balls: 0, strikes: 0, outs: 0, batter: '', message: 'PLAY BALL!' });
  }

  drawScoreboard(s) {
    const x = this.sbCtx;
    const W = 2048;
    const H = 768;
    x.fillStyle = '#05070d';
    x.fillRect(0, 0, W, H);
    // LED dot texture
    x.fillStyle = '#0b1020';
    for (let i = 0; i < W; i += 8) x.fillRect(i, 0, 2, H);
    x.font = 'bold 60px "Black Han Sans", "Arial Black", sans-serif';
    x.textBaseline = 'middle';
    const teams = [TEAMS[1], TEAMS[0]];
    // header
    x.fillStyle = '#ffcc00';
    x.textAlign = 'left';
    x.fillText('TEAM', 40, 70);
    x.textAlign = 'center';
    for (let i = 0; i < 9; i++) x.fillText(String(i + 1), 520 + i * 110, 70);
    x.fillText('R', 1560, 70);
    x.fillText('H', 1680, 70);
    for (let t = 0; t < 2; t++) {
      const y = 180 + t * 120;
      x.fillStyle = '#' + teams[t].primary.toString(16).padStart(6, '0');
      x.fillRect(30, y - 50, 420, 100);
      x.fillStyle = '#fff';
      x.textAlign = 'left';
      x.fillText(teams[t].short + '  ' + (t === 0 ? 'AWAY' : 'HOME'), 50, y);
      x.textAlign = 'center';
      const line = s.line?.[t] ?? [];
      for (let i = 0; i < 9; i++) {
        x.fillStyle = '#f2f2f2';
        const v = line[i];
        x.fillText(v === undefined ? '' : String(v), 520 + i * 110, y);
      }
      x.fillStyle = '#ffcc00';
      x.fillText(String(s.score?.[t] ?? 0), 1560, y);
      x.fillStyle = '#f2f2f2';
      x.fillText(String(s.hits?.[t] ?? 0), 1680, y);
    }
    // BSO
    x.textAlign = 'left';
    const bso = [
      ['B', s.balls, 3, '#3cff7a'],
      ['S', s.strikes, 2, '#ffcc00'],
      ['O', s.outs, 2, '#ff3b3b'],
    ];
    bso.forEach(([l, n, max, c], i) => {
      const y = 460 + i * 80;
      x.fillStyle = '#fff';
      x.fillText(l, 60, y);
      for (let k = 0; k < max; k++) {
        x.beginPath();
        x.arc(160 + k * 70, y, 26, 0, Math.PI * 2);
        x.fillStyle = k < n ? c : '#1b2233';
        x.fill();
      }
    });
    // message
    x.textAlign = 'center';
    x.font = 'bold 120px "Black Han Sans", "Arial Black", sans-serif';
    x.fillStyle = '#ffffff';
    x.shadowColor = '#ff3b6b';
    x.shadowBlur = 30;
    x.fillText(s.message || '', 1250, 560);
    x.shadowBlur = 0;
    x.font = 'bold 54px "Black Han Sans", "Arial Black", sans-serif';
    x.fillStyle = '#9fd3ff';
    x.fillText(s.batter || '', 1250, 690);
    this.sbTex.needsUpdate = true;
  }

  buildSkyline() {
    let seed = 3;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const N = 70;
    const bld = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), toonMat(0x2a2450, { rim: 0 }), N);
    const wins = [];
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    for (let i = 0; i < N; i++) {
      const a = -1.3 + (i / N) * 2.6 + rnd() * 0.02;
      const r = 250 + rnd() * 120;
      const h = 20 + rnd() * 70;
      const w = 12 + rnd() * 18;
      const pos = new THREE.Vector3(Math.sin(a) * r, h / 2 - 2, Math.cos(a) * r + 20);
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(-pos.x, -pos.z));
      m.compose(pos, q, new THREE.Vector3(w, h, w));
      bld.setMatrixAt(i, m);
      const n = Math.floor(h / 8);
      for (let k = 0; k < n; k++) {
        if (rnd() < 0.5) continue;
        const lp = new THREE.Vector3(0, -h / 2 + 5 + k * 7, w / 2 + 0.05).applyQuaternion(q).add(pos);
        wins.push(new THREE.Matrix4().compose(lp, q, new THREE.Vector3(w * 0.7, 1.2, 1)));
      }
    }
    this.group.add(bld);
    const wm = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: 0xffd58a, toneMapped: false }), wins.length);
    wins.forEach((mm, i) => wm.setMatrixAt(i, mm));
    this.group.add(wm);
  }

  update(dt, hype = 0) {
    this.time += dt;
    this.sky.material.uniforms.uTime.value = this.time;
    for (const f of this.flags) {
      const p = f.geometry.attributes.position;
      const base = f.userData.base;
      for (let i = 0; i < p.count; i++) {
        const x = base[i * 3];
        const y = base[i * 3 + 1];
        p.setZ(i, Math.sin(x * 2.2 - this.time * 5 + y * 0.6) * 0.25 * (x / 3.2));
      }
      p.needsUpdate = true;
      f.geometry.computeVertexNormals();
    }
    this.crowd.update(dt, hype);
  }
}

let _glow;
export function glowTexture() {
  if (_glow) return _glow;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,255,255,0.5)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 128, 128);
  _glow = new THREE.CanvasTexture(c);
  return _glow;
}

function bannerTexture(text, bg = 0xd81e3a, fg = '#ffffff') {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 176;
  const x = c.getContext('2d');
  x.fillStyle = '#' + bg.toString(16).padStart(6, '0');
  x.fillRect(0, 0, 1024, 176);
  x.strokeStyle = 'rgba(255,255,255,0.6)';
  x.lineWidth = 8;
  x.strokeRect(10, 10, 1004, 156);
  x.font = 'bold 96px "Black Han Sans", "Arial Black", sans-serif';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.fillStyle = fg;
  x.fillText(text, 512, 92, 980);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

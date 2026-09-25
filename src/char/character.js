import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { toonMat, addOutline, RAMP3 } from '../core/toon.js';
import { Animator } from './animator.js';
import { solveTwoBone } from './ik.js';

// Colour slots stored per vertex so uniforms can be swapped at runtime.
export const SLOT = {
  SKIN: 0, JERSEY: 1, TRIM: 2, PANTS: 3, SOCKS: 4, SHOES: 5, BELT: 6, HAIR: 7, EYE: 8, EYEW: 9, MOUTH: 10, SOLE: 11, UNDER: 12, BROW: 13, CHEEK: 14,
};

// ---------------------------------------------------------------------------
// Skeleton definition (rest pose). Limbs extend along -Y from their joint.
// Proportions are deliberately long-limbed / tall.
// ---------------------------------------------------------------------------
const SKELETON = [
  ['root', null, [0, 0, 0]],
  ['hips', 'root', [0, 1.06, 0]],
  ['spine', 'hips', [0, 0.1, 0]],
  ['chest', 'spine', [0, 0.21, 0]],
  ['neck', 'chest', [0, 0.235, 0.005]],
  ['head', 'neck', [0, 0.085, 0.01]],
  ['shoulderL', 'chest', [0.055, 0.18, 0]],
  ['upperArmL', 'shoulderL', [0.135, 0.0, 0]],
  ['foreArmL', 'upperArmL', [0, -0.315, 0]],
  ['handL', 'foreArmL', [0, -0.29, 0]],
  ['shoulderR', 'chest', [-0.055, 0.18, 0]],
  ['upperArmR', 'shoulderR', [-0.135, 0.0, 0]],
  ['foreArmR', 'upperArmR', [0, -0.315, 0]],
  ['handR', 'foreArmR', [0, -0.29, 0]],
  ['thighL', 'hips', [0.098, -0.05, 0]],
  ['shinL', 'thighL', [0, -0.475, 0]],
  ['footL', 'shinL', [0, -0.455, 0]],
  ['thighR', 'hips', [-0.098, -0.05, 0]],
  ['shinR', 'thighR', [0, -0.475, 0]],
  ['footR', 'shinR', [0, -0.455, 0]],
];
const FINGER_Z = [0.027, 0.009, -0.009, -0.026];
const FINGER_L = [0.034, 0.037, 0.034, 0.028];

function addFingerBones(list, side) {
  const s = side === 'L' ? 1 : -1;
  FINGER_Z.forEach((z, i) => {
    list.push([`f${side}${i}a`, `hand${side}`, [s * 0.002, -0.088, z]]);
    list.push([`f${side}${i}b`, `f${side}${i}a`, [0, -FINGER_L[i], 0]]);
  });
  list.push([`t${side}a`, `hand${side}`, [-s * 0.008, -0.026, 0.034]]);
  list.push([`t${side}b`, `t${side}a`, [0, -0.04, 0]]);
}
const FULL_SKELETON = [...SKELETON];
addFingerBones(FULL_SKELETON, 'L');
addFingerBones(FULL_SKELETON, 'R');

// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------
/** Tapered rounded limb from y=0 (radius r1) down to y=-len (radius r2). */
function limbGeo(r1, r2, len, bulge = 0, radial = 14, bulgeAt = 0.3) {
  const pts = [];
  const N = 5;
  for (let i = 0; i <= N; i++) {
    const a = -Math.PI / 2 + (i / N) * (Math.PI / 2);
    pts.push(new THREE.Vector2(r2 * Math.cos(a) + 1e-4, -len + r2 * Math.sin(a)));
  }
  const M = 8;
  for (let i = 1; i < M; i++) {
    const t = i / M; // 0 bottom .. 1 top
    let r = r2 + (r1 - r2) * t;
    r += bulge * Math.exp(-Math.pow((1 - t - bulgeAt) / 0.22, 2));
    pts.push(new THREE.Vector2(r, -len + t * len));
  }
  for (let i = 0; i <= N; i++) {
    const a = (i / N) * (Math.PI / 2);
    pts.push(new THREE.Vector2(r1 * Math.cos(a) + 1e-4, r1 * Math.sin(a)));
  }
  const g = new THREE.LatheGeometry(pts, radial);
  g.computeVertexNormals();
  return g;
}

function sphereGeo(r, sx = 1, sy = 1, sz = 1, w = 16, h = 12) {
  const g = new THREE.SphereGeometry(r, w, h);
  g.scale(sx, sy, sz);
  return g;
}

function part(geo, bone, slot, opts = {}) {
  return { geo, bone, slot, blend: opts.blend ?? 0, parentBone: opts.parent ?? null };
}

function tf(geo, { p = [0, 0, 0], r = [0, 0, 0], s } = {}) {
  if (s) geo.scale(...s);
  if (r[0] || r[1] || r[2]) geo.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(...r)));
  geo.translate(...p);
  return geo;
}

// Build the body part list for a given build
function buildParts(build) {
  const P = [];
  const bw = build.width; // bulk multiplier
  // --- pelvis / belt
  P.push(part(tf(sphereGeo(0.165 * bw, 1, 0.8, 0.72), { p: [0, -0.01, 0] }), 'hips', SLOT.PANTS));
  P.push(part(tf(new THREE.CylinderGeometry(0.158 * bw, 0.16 * bw, 0.05, 20), { p: [0, 0.07, 0], s: [1, 1, 0.74] }), 'hips', SLOT.BELT));
  // buckle
  P.push(part(tf(new THREE.BoxGeometry(0.05, 0.035, 0.02), { p: [0, 0.07, 0.117] }), 'hips', SLOT.TRIM));
  // --- abdomen
  P.push(part(tf(limbGeo(0.158 * bw, 0.15 * bw, 0.2, 0, 18), { r: [Math.PI, 0, 0], p: [0, -0.02, 0], s: [1.08, 1, 0.74] }), 'spine', SLOT.JERSEY, { blend: 0.07, parent: 'hips' }));
  // --- chest (V taper)
  P.push(part(tf(limbGeo(0.19 * bw, 0.152 * bw, 0.22, 0.012, 20, 0.5), { r: [Math.PI, 0, 0], p: [0, -0.01, 0], s: [1.05, 1, 0.66] }), 'chest', SLOT.JERSEY, { blend: 0.06, parent: 'spine' }));
  // jersey placket / trim stripe down the front
  P.push(part(tf(new THREE.BoxGeometry(0.025, 0.36, 0.01), { p: [0, 0.03, 0.128] }), 'chest', SLOT.TRIM));
  // collar
  P.push(part(tf(new THREE.TorusGeometry(0.062, 0.012, 8, 20), { r: [Math.PI / 2, 0, 0], p: [0, 0.215, 0.0], s: [1.1, 1, 0.9] }), 'chest', SLOT.TRIM));
  // shoulder caps (deltoids in jersey)
  for (const [side, s] of [['L', 1], ['R', -1]]) {
    P.push(part(tf(sphereGeo(0.068 * bw, 1, 0.9, 0.95), { p: [0, -0.02, 0] }), `upperArm${side}`, SLOT.JERSEY, { blend: 0.08, parent: 'chest' }));
    // sleeve
    P.push(part(tf(limbGeo(0.072 * bw, 0.063 * bw, 0.14), { p: [0, -0.01, 0] }), `upperArm${side}`, SLOT.JERSEY));
    P.push(part(tf(new THREE.TorusGeometry(0.062 * bw, 0.008, 6, 16), { r: [Math.PI / 2, 0, 0], p: [0, -0.15, 0] }), `upperArm${side}`, SLOT.TRIM));
    // arm (undershirt colour in the upper half, skin below)
    P.push(part(tf(limbGeo(0.056 * bw, 0.046, 0.31, 0.006), {}), `upperArm${side}`, SLOT.UNDER, { blend: 0.05, parent: `shoulder${side}` }));
    P.push(part(tf(limbGeo(0.047, 0.034, 0.285, 0.01, 12, 0.25), {}), `foreArm${side}`, SLOT.SKIN, { blend: 0.045, parent: `upperArm${side}` }));
    // wristband
    P.push(part(tf(new THREE.CylinderGeometry(0.039, 0.039, 0.045, 12), { p: [0, -0.24, 0] }), `foreArm${side}`, SLOT.TRIM));
    // palm
    P.push(part(tf(sphereGeo(0.03, 0.8, 1.6, 1.25, 12, 10), { p: [0, -0.05, 0] }), `hand${side}`, SLOT.SKIN, { blend: 0.02, parent: `foreArm${side}` }));
    // fingers
    FINGER_Z.forEach((z, i) => {
      const r = i === 3 ? 0.0078 : 0.0092;
      P.push(part(limbGeo(r, r * 0.95, FINGER_L[i], 0, 8), `f${side}${i}a`, SLOT.SKIN));
      P.push(part(limbGeo(r * 0.95, r * 0.85, FINGER_L[i] * 0.85, 0, 8), `f${side}${i}b`, SLOT.SKIN));
    });
    P.push(part(limbGeo(0.0115, 0.01, 0.04, 0, 8), `t${side}a`, SLOT.SKIN));
    P.push(part(limbGeo(0.01, 0.009, 0.032, 0, 8), `t${side}b`, SLOT.SKIN));
    // legs
    P.push(part(tf(limbGeo(0.092 * bw, 0.062, 0.475, 0.012, 16, 0.25), {}), `thigh${side}`, SLOT.PANTS, { blend: 0.08, parent: 'hips' }));
    P.push(part(tf(limbGeo(0.064, 0.054, 0.2, 0.004), {}), `shin${side}`, SLOT.PANTS, { blend: 0.05, parent: `thigh${side}` }));
    P.push(part(tf(limbGeo(0.057, 0.037, 0.3, 0.012, 14, 0.2), { p: [0, -0.16, 0] }), `shin${side}`, SLOT.SOCKS));
    // shoe
    P.push(part(tf(sphereGeo(0.05, 0.95, 0.72, 2.45), { p: [0, -0.042, 0.055] }), `foot${side}`, SLOT.SHOES, { blend: 0.03, parent: `shin${side}` }));
    P.push(part(tf(new THREE.BoxGeometry(0.075, 0.016, 0.225), { p: [0, -0.074, 0.058] }), `foot${side}`, SLOT.SOLE));
    // shoe swoosh stripe
    P.push(part(tf(new THREE.BoxGeometry(0.096, 0.012, 0.1), { p: [0, -0.035, 0.05], r: [0.25, 0, 0] }), `foot${side}`, SLOT.TRIM));
  }
  // --- neck & head
  P.push(part(tf(limbGeo(0.048, 0.052, 0.12, 0, 12), { r: [Math.PI, 0, 0], p: [0, -0.03, 0] }), 'neck', SLOT.SKIN, { blend: 0.04, parent: 'chest' }));
  const H = 'head';
  P.push(part(tf(sphereGeo(0.1, 0.94, 1.1, 1.02, 22, 18), { p: [0, 0.105, 0.008] }), H, SLOT.SKIN));
  // jaw / chin — slightly pointed anime chin
  P.push(part(tf(sphereGeo(0.064, 1.1, 0.8, 1.05, 14, 10), { p: [0, 0.045, 0.036] }), H, SLOT.SKIN));
  // ears
  P.push(part(tf(sphereGeo(0.022, 0.55, 1, 0.8), { p: [0.093, 0.1, 0.0] }), H, SLOT.SKIN));
  P.push(part(tf(sphereGeo(0.022, 0.55, 1, 0.8), { p: [-0.093, 0.1, 0.0] }), H, SLOT.SKIN));
  // nose
  P.push(part(tf(new THREE.ConeGeometry(0.011, 0.03, 6), { r: [Math.PI / 2 + 0.35, 0, 0], p: [0, 0.088, 0.108] }), H, SLOT.SKIN));
  // hair (back and sides, peeking out below the cap)
  P.push(part(tf(sphereGeo(0.106, 1.0, 0.9, 1.02, 18, 12, ), { p: [0, 0.135, -0.012] }), H, SLOT.HAIR));
  P.push(part(tf(new THREE.BoxGeometry(0.02, 0.05, 0.035), { p: [0.088, 0.1, 0.04] }), H, SLOT.HAIR));
  P.push(part(tf(new THREE.BoxGeometry(0.02, 0.05, 0.035), { p: [-0.088, 0.1, 0.04] }), H, SLOT.HAIR));
  // eyes: tall anime-style, with highlight
  for (const s of [1, -1]) {
    P.push(part(tf(sphereGeo(0.019, 0.85, 1.25, 0.45, 12, 10), { p: [s * 0.037, 0.113, 0.092], r: [0, s * 0.35, 0] }), H, SLOT.EYEW));
    P.push(part(tf(sphereGeo(0.0135, 0.8, 1.2, 0.45, 12, 10), { p: [s * 0.036, 0.111, 0.0985], r: [0, s * 0.35, 0] }), H, SLOT.EYE));
    P.push(part(tf(sphereGeo(0.0045, 1, 1, 0.5, 6, 6), { p: [s * 0.032, 0.12, 0.104] }), H, SLOT.EYEW));
    P.push(part(tf(new THREE.BoxGeometry(0.036, 0.0065, 0.01), { p: [s * 0.038, 0.143, 0.098], r: [0, s * 0.35, s * -0.12] }), H, SLOT.BROW));
    P.push(part(tf(sphereGeo(0.014, 1.3, 0.6, 0.3, 8, 6), { p: [s * 0.052, 0.078, 0.088], r: [0, s * 0.5, 0] }), H, SLOT.CHEEK));
  }
  P.push(part(tf(new THREE.BoxGeometry(0.03, 0.005, 0.01), { p: [0, 0.056, 0.098] }), H, SLOT.MOUTH));
  return P;
}

// ---------------------------------------------------------------------------
// Shared geometry cache per build
// ---------------------------------------------------------------------------
const geoCache = new Map();

function buildSkinnedGeometry(build, boneIndex, restWorld) {
  const key = build.width.toFixed(2);
  if (geoCache.has(key)) return geoCache.get(key);
  const parts = buildParts(build);
  const geos = [];
  const v = new THREE.Vector3();
  for (const p of parts) {
    let g = p.geo;
    if (g.index === null) g = g; // keep
    g.deleteAttribute('uv');
    const pos = g.attributes.position;
    const n = pos.count;
    const si = new Uint16Array(n * 4);
    const sw = new Float32Array(n * 4);
    const slot = new Float32Array(n);
    const bi = boneIndex[p.bone];
    const pi = p.parentBone ? boneIndex[p.parentBone] : bi;
    for (let i = 0; i < n; i++) {
      slot[i] = p.slot;
      let wOwn = 1;
      if (p.blend > 0) {
        const y = pos.getY(i);
        const t = THREE.MathUtils.clamp((-y + p.blend) / (2 * p.blend), 0, 1);
        wOwn = t * t * (3 - 2 * t);
      }
      si[i * 4] = bi;
      si[i * 4 + 1] = pi;
      sw[i * 4] = wOwn;
      sw[i * 4 + 1] = 1 - wOwn;
    }
    // move into rest-pose world space
    g.applyMatrix4(restWorld[p.bone]);
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
    g.setAttribute('slot', new THREE.Float32BufferAttribute(slot, 1));
    g.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(n * 3), 3));
    geos.push(g);
  }
  const merged = mergeGeometries(geos, false);
  merged.computeBoundingSphere();
  geoCache.set(key, merged);
  return merged;
}

// ---------------------------------------------------------------------------
// Accessory meshes (caps, helmets, gloves, bats, masks)
// ---------------------------------------------------------------------------
export function makeCap(color, brimColor, logoColor) {
  const g = new THREE.Group();
  const dome = new THREE.Mesh(tf(new THREE.SphereGeometry(0.112, 22, 12, 0, Math.PI * 2, 0, Math.PI / 2), { s: [1, 0.78, 1.08] }), toonMat(color));
  dome.position.set(0, 0.14, 0.004);
  const brim = new THREE.Mesh(tf(new THREE.CylinderGeometry(0.105, 0.105, 0.012, 22, 1, false, -Math.PI / 2, Math.PI), { s: [0.95, 1, 1] }), toonMat(brimColor));
  brim.position.set(0, 0.145, 0.07);
  brim.rotation.x = 0.16;
  const button = new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 6), toonMat(brimColor));
  button.position.set(0, 0.228, 0.004);
  const logo = new THREE.Mesh(new THREE.CircleGeometry(0.028, 16), toonMat(logoColor, { rim: 0 }));
  logo.position.set(0, 0.185, 0.108);
  logo.rotation.x = -0.45;
  for (const m of [dome, brim, button]) {
    m.castShadow = false;
    addOutline(m, 0.006);
    g.add(m);
  }
  g.add(logo);
  return g;
}

export function makeHelmet(color, logoColor) {
  const g = new THREE.Group();
  const mat = toonMat(color, { ramp: RAMP3 });
  const dome = new THREE.Mesh(tf(new THREE.SphereGeometry(0.122, 24, 14, 0, Math.PI * 2, 0, Math.PI * 0.58), { s: [1, 0.92, 1.1] }), mat);
  dome.position.set(0, 0.125, -0.002);
  const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.108, 0.108, 0.012, 20, 1, false, -Math.PI / 2 + 0.35, Math.PI - 0.7), mat);
  brim.position.set(0, 0.14, 0.065);
  brim.rotation.x = 0.12;
  // ear flap (left side for a right-handed batter -> faces the pitcher)
  const flap = new THREE.Mesh(tf(new THREE.SphereGeometry(0.06, 14, 10), { s: [0.6, 1.1, 1.0] }), mat);
  flap.position.set(0.098, 0.085, 0.0);
  const logo = new THREE.Mesh(new THREE.CircleGeometry(0.03, 16), toonMat(logoColor, { rim: 0 }));
  logo.position.set(0, 0.2, 0.11);
  logo.rotation.x = -0.6;
  for (const m of [dome, brim, flap]) {
    m.castShadow = false;
    addOutline(m, 0.006);
    g.add(m);
  }
  g.add(logo);
  // specular-ish glossy highlight strip
  const shine = new THREE.Mesh(tf(new THREE.SphereGeometry(0.02, 8, 6), { s: [2.2, 0.35, 1] }), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55 }));
  shine.position.set(0.02, 0.225, 0.05);
  shine.rotation.z = -0.3;
  g.add(shine);
  return g;
}

export function makeMask() {
  const g = new THREE.Group();
  const mat = toonMat(0x2a2a30);
  const cage = new THREE.Group();
  for (let i = 0; i < 4; i++) {
    const bar = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.006, 5, 16, Math.PI * 0.9), mat);
    bar.rotation.z = Math.PI * 0.05 + Math.PI;
    bar.rotation.y = 0;
    bar.position.set(0, 0.06 + i * 0.035, 0.03);
    bar.scale.set(0.9, 0.6, 1);
    bar.rotation.x = Math.PI / 2;
    cage.add(bar);
  }
  const v = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.15, 0.012), mat);
  v.position.set(0, 0.11, 0.125);
  cage.add(v);
  g.add(cage);
  const pad = new THREE.Mesh(tf(new THREE.SphereGeometry(0.118, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.55), { s: [1, 1, 1.05] }), toonMat(0x1d1d24));
  pad.position.set(0, 0.11, -0.01);
  addOutline(pad, 0.006);
  g.add(pad);
  return g;
}

export function makeGlove(color = 0x8a4b22, laceColor = 0x3b1f0e) {
  const g = new THREE.Group();
  const mat = toonMat(color, { ramp: RAMP3 });
  const body = new THREE.Mesh(tf(new THREE.SphereGeometry(0.06, 16, 12), { s: [0.7, 1.75, 1.45] }), mat);
  body.position.set(0, -0.09, 0.01);
  const thumb = new THREE.Mesh(tf(new THREE.SphereGeometry(0.03, 10, 8), { s: [0.8, 2.0, 1] }), mat);
  thumb.position.set(0, -0.06, 0.085);
  thumb.rotation.x = -0.5;
  const web = new THREE.Mesh(tf(new THREE.SphereGeometry(0.03, 10, 8), { s: [0.35, 1.3, 1.4] }), toonMat(laceColor));
  web.position.set(0, -0.15, 0.07);
  const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.05, 14), toonMat(laceColor));
  cuff.position.set(0, -0.015, 0);
  for (const m of [body, thumb, web, cuff]) {
    m.castShadow = true;
    addOutline(m, 0.007);
    g.add(m);
  }
  // pocket (lighter) facing palm side
  const pocket = new THREE.Mesh(tf(new THREE.CircleGeometry(0.05, 14), { s: [1, 1.6, 1] }), toonMat(0xc88a55, { side: THREE.DoubleSide }));
  g.add(pocket);
  g.userData.pocket = pocket;
  return g;
}

export function makeBat(woodColor = 0xe0b073, tapeColor = 0x1a1a22) {
  // Bat lies along +Y from the knob (origin) to the barrel end.
  const pts = [];
  const prof = [
    [0, 0.0], [0.024, 0.0], [0.026, 0.012], [0.015, 0.03], [0.0145, 0.2], [0.016, 0.33], [0.022, 0.46], [0.03, 0.58], [0.0335, 0.7], [0.0335, 0.83], [0.03, 0.855], [0.0, 0.862],
  ];
  for (const [r, y] of prof) pts.push(new THREE.Vector2(r + 1e-4, y));
  const geo = new THREE.LatheGeometry(pts, 18);
  geo.computeVertexNormals();
  const bat = new THREE.Mesh(geo, toonMat(woodColor, { ramp: RAMP3 }));
  bat.castShadow = true;
  addOutline(bat, 0.005);
  const tape = new THREE.Mesh(new THREE.CylinderGeometry(0.0158, 0.0158, 0.16, 12), toonMat(tapeColor));
  tape.position.y = 0.11;
  bat.add(tape);
  const label = new THREE.Mesh(new THREE.CylinderGeometry(0.0305, 0.034, 0.05, 16, 1, true), toonMat(0x222222));
  label.position.y = 0.66;
  bat.add(label);
  return bat;
}

// ---------------------------------------------------------------------------
// Number / name decal
// ---------------------------------------------------------------------------
function numberTexture(num, name, fg, outline) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const x = c.getContext('2d');
  x.clearRect(0, 0, 256, 256);
  x.textAlign = 'center';
  x.font = 'bold 34px "Black Han Sans", "Arial Black", sans-serif';
  x.lineWidth = 7;
  x.strokeStyle = outline;
  x.fillStyle = fg;
  x.strokeText(name, 128, 52);
  x.fillText(name, 128, 52);
  x.font = 'bold 150px "Black Han Sans", "Arial Black", sans-serif';
  x.lineWidth = 14;
  x.strokeText(String(num), 128, 212);
  x.fillText(String(num), 128, 212);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function chestTexture(text, fg, outline) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 96;
  const x = c.getContext('2d');
  x.textAlign = 'center';
  x.font = 'italic bold 62px "Black Han Sans", "Arial Black", sans-serif';
  x.lineWidth = 10;
  x.strokeStyle = outline;
  x.fillStyle = fg;
  x.strokeText(text, 128, 70);
  x.fillText(text, 128, 70);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const hex = (n) => '#' + n.toString(16).padStart(6, '0');

// ---------------------------------------------------------------------------
// Character
// ---------------------------------------------------------------------------
export class Character {
  constructor(opts = {}) {
    this.opts = opts;
    this.root = new THREE.Group();
    this.root.name = opts.name || 'char';
    this.bones = {};
    this.rest = {};
    this.handed = 'R';
    this.grip = { L: 0.25, R: 0.25 };
    this.gripTarget = { L: 0.25, R: 0.25 };
    this.ik = { L: null, R: null };
    this.lookTarget = null;
    this.lookWeight = 0;
    this._lookQ = new THREE.Quaternion();
    this.width = opts.width ?? 1;
    this.moveSpeed = 0;
    this.heightScale = opts.scale ?? 1;

    // bones
    const boneList = [];
    const boneIndex = {};
    for (const [name, parent, pos] of FULL_SKELETON) {
      const b = new THREE.Bone();
      b.name = name;
      b.position.set(...pos);
      if (/^t[LR][ab]$/.test(name)) {
        // thumbs point down/forward and slightly across the palm
        b.rotation.set(-0.55, 0, name.includes('L') ? -0.25 : 0.25);
        if (name.endsWith('b')) b.rotation.set(0, 0, 0);
      }
      if (parent) this.bones[parent].add(b);
      this.bones[name] = b;
      boneIndex[name] = boneList.length;
      boneList.push(b);
    }
    for (const b of boneList) this.rest[b.name] = { q: b.quaternion.clone(), p: b.position.clone() };

    this.bones.root.updateMatrixWorld(true);
    const restWorld = {};
    for (const b of boneList) restWorld[b.name] = b.matrixWorld.clone();

    const geo = buildSkinnedGeometry({ width: this.width }, boneIndex, restWorld).clone();
    this.geometry = geo;
    this.material = toonMat(0xffffff, { vertexColors: true });
    const mesh = new THREE.SkinnedMesh(geo, this.material);
    mesh.add(this.bones.root);
    mesh.bind(new THREE.Skeleton(boneList));
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    this.mesh = mesh;
    this.outline = addOutline(mesh, opts.outline ?? 0.0085);
    this.root.add(mesh);
    this.root.scale.setScalar(this.heightScale);

    this.animator = new Animator(this);
    this.accessories = {};
    this.palette = null;
    if (opts.palette) this.applyPalette(opts.palette);
  }

  /** palette: { skin, jersey, trim, pants, socks, shoes, belt, hair, under } */
  applyPalette(p) {
    this.palette = { ...this.palette, ...p };
    const pal = this.palette;
    const cols = [];
    cols[SLOT.SKIN] = pal.skin ?? 0xf0c8a0;
    cols[SLOT.JERSEY] = pal.jersey ?? 0xffffff;
    cols[SLOT.TRIM] = pal.trim ?? 0x223355;
    cols[SLOT.PANTS] = pal.pants ?? 0xeeeeee;
    cols[SLOT.SOCKS] = pal.socks ?? 0x223355;
    cols[SLOT.SHOES] = pal.shoes ?? 0x1a1a1f;
    cols[SLOT.BELT] = pal.belt ?? 0x1a1a1f;
    cols[SLOT.HAIR] = pal.hair ?? 0x1c1410;
    cols[SLOT.EYE] = pal.eye ?? 0x1a1420;
    cols[SLOT.EYEW] = 0xffffff;
    cols[SLOT.MOUTH] = 0x7a3b3b;
    cols[SLOT.SOLE] = pal.sole ?? 0xf2f2f2;
    cols[SLOT.UNDER] = pal.under ?? pal.trim ?? 0x223355;
    cols[SLOT.BROW] = pal.hair ?? 0x1c1410;
    cols[SLOT.CHEEK] = new THREE.Color(pal.skin ?? 0xf0c8a0).lerp(new THREE.Color(0xff7777), 0.35).getHex();
    const C = cols.map((c) => new THREE.Color(c));
    const slot = this.geometry.attributes.slot.array;
    const col = this.geometry.attributes.color;
    for (let i = 0; i < slot.length; i++) {
      const c = C[slot[i]];
      col.setXYZ(i, c.r, c.g, c.b);
    }
    col.needsUpdate = true;
  }

  setNumber(num, name, fg, outline) {
    if (this.accessories.number) {
      this.bones.chest.remove(this.accessories.number);
      this.accessories.number.material.map.dispose();
    }
    const tex = numberTexture(num, name, hex(fg), hex(outline));
    const plane = new THREE.Mesh(
      new THREE.PlaneGeometry(0.27, 0.27),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: true })
    );
    plane.position.set(0, 0.06, -0.126);
    plane.rotation.y = Math.PI;
    plane.rotation.x = 0.06;
    this.bones.chest.add(plane);
    this.accessories.number = plane;
  }

  setChestText(text, fg, outline) {
    if (this.accessories.chestText) this.bones.chest.remove(this.accessories.chestText);
    const tex = chestTexture(text, hex(fg), hex(outline));
    const plane = new THREE.Mesh(
      new THREE.PlaneGeometry(0.24, 0.09),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false })
    );
    plane.position.set(0, 0.09, 0.131);
    plane.rotation.x = -0.1;
    this.bones.chest.add(plane);
    this.accessories.chestText = plane;
  }

  setHeadwear(obj) {
    if (this.accessories.head) this.bones.head.remove(this.accessories.head);
    this.accessories.head = obj;
    if (obj) this.bones.head.add(obj);
  }

  setGlove(obj, side = 'L') {
    if (this.accessories.glove) this.accessories.glove.parent?.remove(this.accessories.glove);
    this.accessories.glove = obj;
    this.gloveSide = side;
    if (obj) {
      const hand = this.bones['hand' + side];
      hand.add(obj);
      obj.rotation.set(0, 0, side === 'L' ? 0.0 : 0.0);
      obj.position.set(side === 'L' ? -0.01 : 0.01, 0, 0);
      obj.scale.set(side === 'L' ? 1 : -1, 1, 1);
      if (obj.userData.pocket) {
        obj.userData.pocket.position.set(side === 'L' ? -0.045 : -0.045, -0.1, 0.015);
        obj.userData.pocket.rotation.set(0, -Math.PI / 2, 0);
      }
    }
  }

  /** world position of the glove pocket (or hand) */
  gloveWorld(out = new THREE.Vector3()) {
    const side = this.gloveSide || 'L';
    const hand = this.bones['hand' + side];
    return out.set(side === 'L' ? -0.04 : 0.04, -0.1, 0.02).applyMatrix4(hand.matrixWorld);
  }

  handWorld(side, out = new THREE.Vector3()) {
    return out.set(0, -0.08, 0.01).applyMatrix4(this.bones['hand' + side].matrixWorld);
  }

  play(name, opts) {
    this.animator.play(name, opts);
  }

  /** IK request, re-armed every frame by game code (cleared after use). */
  reach(side, target, weight = 1, pole = null, handDir = null) {
    this.ik[side] = { target, weight, pole, handDir };
  }

  lookAt(target, w = 1) {
    this.lookTarget = target;
    this.lookWeight = w;
  }

  update(dt) {
    this.animator.update(dt);
    // finger grip smoothing
    for (const s of ['L', 'R']) {
      this.grip[s] += (this.gripTarget[s] - this.grip[s]) * Math.min(1, dt * 14);
      const g = this.grip[s];
      const sign = s === 'L' ? -1 : 1;
      for (let i = 0; i < 4; i++) {
        const a = this.bones[`f${s}${i}a`];
        const b = this.bones[`f${s}${i}b`];
        a.quaternion.setFromEuler(_e.set(0, 0, sign * (0.15 + g * 1.35 + i * 0.04 * g)));
        b.quaternion.setFromEuler(_e.set(0, 0, sign * (0.1 + g * 1.5)));
      }
      const ta = this.bones[`t${s}a`];
      ta.quaternion.copy(this.rest[`t${s}a`].q).multiply(_q.setFromEuler(_e.set(0, g * 0.4, sign * g * 0.7)));
      this.bones[`t${s}b`].quaternion.setFromEuler(_e.set(0, 0, sign * g * 0.8));
    }
    this.root.updateMatrixWorld(true);

    // head look
    if (this.lookTarget && this.lookWeight > 0) {
      const head = this.bones.head;
      const neck = this.bones.neck;
      const hp = _v1.setFromMatrixPosition(head.matrixWorld);
      const dir = _v2.copy(this.lookTarget).sub(hp).normalize();
      // limit neck twist: fade out when the target is behind the chest
      const chestFwd = _v4.set(0, 0, 1).transformDirection(this.bones.chest.matrixWorld);
      const facing = chestFwd.dot(dir);
      const lim = THREE.MathUtils.smoothstep(facing, -0.25, 0.35);
      // desired world rotation: +Z toward dir
      _m.lookAt(_v3.set(0, 0, 0), dir.negate(), _up);
      const want = _q.setFromRotationMatrix(_m);
      const parentQ = neck.getWorldQuaternion(_q2);
      const local = parentQ.invert().multiply(want);
      // clamp through slerp from animated
      _q3.copy(head.quaternion).slerp(local, this.lookWeight * 0.75 * lim);
      head.quaternion.copy(_q3);
      head.updateMatrixWorld(true);
    }

    // IK arms
    for (const s of ['L', 'R']) {
      const req = this.ik[s];
      if (!req || req.weight <= 0) continue;
      const pole = req.pole ?? _v4.set(s === 'L' ? 1.2 : -1.2, -0.6, -0.6).applyMatrix4(this.bones.chest.matrixWorld);
      solveTwoBone(this.bones['upperArm' + s], this.bones['foreArm' + s], this.bones['hand' + s], req.target, pole, req.weight, req.handDir, s);
      this.ik[s] = null;
    }
  }
}

const _e = new THREE.Euler();
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _q3 = new THREE.Quaternion();
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _v4 = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _up = new THREE.Vector3(0, 1, 0);

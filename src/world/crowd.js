import * as THREE from 'three';
import { toonMat, RAMP3 } from '../core/toon.js';

const uniforms = {
  uTime: { value: 0 },
  uHype: { value: 0 },
  uWave: { value: -10 },
};

function crowdMaterial(color, opts = {}) {
  const m = toonMat(color, { ramp: RAMP3, rim: 0.3, emissive: opts.emissive ?? 0x000000 });
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (shader) => {
    prev(shader);
    shader.uniforms.uTime = uniforms.uTime;
    shader.uniforms.uHype = uniforms.uHype;
    shader.uniforms.uWave = uniforms.uWave;
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
attribute vec2 aPhase; uniform float uTime; uniform float uHype; uniform float uWave;`
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
{
  float ph = aPhase.x;
  float idle = sin(uTime * 1.6 + ph * 6.28) * 0.02;
  float jump = max(0.0, sin(uTime * (7.0 + aPhase.y * 3.0) + ph * 6.28)) * 0.35 * uHype;
  // stadium wave travelling around the bowl (aPhase.y encodes angle)
  float wv = exp(-pow((aPhase.y * 6.28 - uWave), 2.0) * 3.0) * 0.6;
  transformed.y += idle + jump + wv;
  ${opts.stick ? 'transformed.x += sin(uTime * 9.0 + ph * 20.0) * 0.12 * (0.3 + uHype) * position.y;' : ''}
}`
      );
  };
  m.customProgramCacheKey = () => 'crowd' + (opts.stick ? 's' : '');
  return m;
}

export class Crowd {
  constructor(parent, spots, homeTeam, awayTeam) {
    this.group = new THREE.Group();
    parent.add(this.group);
    let seed = 11;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const chosen = spots.filter(() => rnd() < 0.78);
    const n = chosen.length;
    this.count = n;

    const bodyGeo = new THREE.CylinderGeometry(0.17, 0.22, 0.62, 6, 1);
    bodyGeo.translate(0, 0.31, 0);
    const headGeo = new THREE.SphereGeometry(0.11, 7, 5);
    headGeo.translate(0, 0.78, 0.01);
    const hairGeo = new THREE.SphereGeometry(0.115, 7, 3, 0, Math.PI * 2, 0, Math.PI * 0.5);
    hairGeo.translate(0, 0.8, -0.01);
    // pair of thunder sticks held overhead
    const stickA = new THREE.CylinderGeometry(0.035, 0.035, 0.55, 5, 1, true);
    stickA.rotateZ(0.25);
    stickA.translate(0.14, 1.12, 0.05);
    const stickB = new THREE.CylinderGeometry(0.035, 0.035, 0.55, 5, 1, true);
    stickB.rotateZ(-0.25);
    stickB.translate(-0.14, 1.12, 0.05);
    const stickGeo = mergeSimple([stickA, stickB]);

    const phase = new Float32Array(n * 2);
    const bodies = new THREE.InstancedMesh(bodyGeo, crowdMaterial(0xffffff), n);
    const heads = new THREE.InstancedMesh(headGeo, crowdMaterial(0xffffff), n);
    const hair = new THREE.InstancedMesh(hairGeo, crowdMaterial(0xffffff), n);
    const stickIdx = [];
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const col = new THREE.Color();
    const skins = [0xf1c8a5, 0xe0b08a, 0xc68e62, 0x8d5a3b, 0xf6d7bd];
    const hairs = [0x1a1410, 0x2d1e14, 0x4a3020, 0x111111, 0x6b4a2a, 0xd9b36b];
    const homeC = [homeTeam.primary, homeTeam.primary, homeTeam.primary, 0xffffff, homeTeam.secondary];
    const awayC = [awayTeam.primary, awayTeam.primary, awayTeam.secondary, 0xffffff, awayTeam.accent];
    const misc = [0xffffff, 0x333333, 0xe8d44d, 0x6aa3ff, 0xff6a6a, 0x7bd67b];
    chosen.forEach((sp, i) => {
      const scale = 0.9 + rnd() * 0.25;
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), sp.face + (rnd() - 0.5) * 0.3);
      s.set(scale, scale * (0.92 + rnd() * 0.16), scale);
      m.compose(sp.p, q, s);
      bodies.setMatrixAt(i, m);
      heads.setMatrixAt(i, m);
      hair.setMatrixAt(i, m);
      // colour by side: 1B side (x<0) home team (KBO style colour wall), 3B side away
      let palette = misc;
      const home = sp.p.x < 0;
      const r = rnd();
      if (home ? r < 0.85 : r < 0.6) palette = home ? homeC : awayC;
      col.setHex(palette[Math.floor(rnd() * palette.length)]);
      bodies.setColorAt(i, col);
      col.setHex(skins[Math.floor(rnd() * skins.length)]);
      heads.setColorAt(i, col);
      col.setHex(hairs[Math.floor(rnd() * hairs.length)]);
      hair.setColorAt(i, col);
      const ang = Math.atan2(sp.p.x, sp.p.z) / (Math.PI * 2) + 0.5;
      phase[i * 2] = rnd();
      phase[i * 2 + 1] = ang;
      if (home && rnd() < 0.55) stickIdx.push(i);
    });
    for (const g of [bodyGeo, headGeo, hairGeo]) g.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phase, 2));
    for (const im of [bodies, heads, hair]) {
      im.instanceMatrix.needsUpdate = true;
      im.instanceColor.needsUpdate = true;
      im.frustumCulled = false;
      this.group.add(im);
    }
    bodies.receiveShadow = true;

    // thunder sticks for home fans
    const sn = stickIdx.length;
    const sticks = new THREE.InstancedMesh(stickGeo, crowdMaterial(0xffffff, { stick: true, emissive: 0x220000 }), sn);
    const sphase = new Float32Array(sn * 2);
    stickIdx.forEach((idx, k) => {
      bodies.getMatrixAt(idx, m);
      sticks.setMatrixAt(k, m);
      col.setHex(rnd() < 0.7 ? homeTeam.primary : homeTeam.accent);
      sticks.setColorAt(k, col);
      sphase[k * 2] = phase[idx * 2];
      sphase[k * 2 + 1] = phase[idx * 2 + 1];
    });
    stickGeo.setAttribute('aPhase', new THREE.InstancedBufferAttribute(sphase, 2));
    sticks.frustumCulled = false;
    this.group.add(sticks);

    this.hype = 0;
    this.hypeTarget = 0.1;
    this.wave = -10;
    this.time = 0;
  }

  cheer(level = 1, dur = 3) {
    this.hypeTarget = Math.max(this.hypeTarget, level);
    this.hypeHold = dur;
  }

  startWave() {
    this.wave = -1;
  }

  update(dt) {
    this.time += dt;
    if (this.hypeHold > 0) this.hypeHold -= dt;
    else this.hypeTarget = 0.12;
    this.hype += (this.hypeTarget - this.hype) * Math.min(1, dt * 3);
    uniforms.uTime.value = this.time;
    uniforms.uHype.value = this.hype;
    if (this.wave > -5) {
      this.wave += dt * 2.2;
      if (this.wave > 8) this.wave = -10;
    }
    uniforms.uWave.value = this.wave;
  }
}

function mergeSimple(geos) {
  const pos = [];
  const nor = [];
  const idx = [];
  let off = 0;
  for (const g of geos) {
    const p = g.attributes.position.array;
    const n = g.attributes.normal.array;
    pos.push(...p);
    nor.push(...n);
    const ix = g.index.array;
    for (let i = 0; i < ix.length; i++) idx.push(ix[i] + off);
    off += p.length / 3;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setIndex(idx);
  return g;
}

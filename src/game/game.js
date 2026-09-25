import * as THREE from 'three';
import {
  BASES, MOUND, MOUND_H, RUBBER_Z, ZONE, FIELD_POS, POS_ORDER, TEAMS, PITCHES, SPECIAL_PITCHES, GRAVITY, BALL_R, isFair,
} from '../constants.js';
import { Character, makeCap, makeHelmet, makeGlove, makeBat, makeMask } from '../char/character.js';
import { Ball } from './ball.js';
import { Trail } from '../fx/effects.js';
import { CameraRig } from './cameraRig.js';
import { buildRoster } from './roster.js';
import { Play } from './play.js';
import { BatterRig } from './batterRig.js';

const hex = (n) => '#' + n.toString(16).padStart(6, '0');
const gauss = () => {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
};
const clamp = THREE.MathUtils.clamp;
const ALL_PITCHES = [...PITCHES, ...SPECIAL_PITCHES];
const CONTACT_Z = 0.3; // plane where bat meets ball
const CATCH_Z = -0.82;
const SWING_CONTACT = 0.205; // seconds from swing start to contact frame
const SWING_DUR = 0.62;
const PITCH_CAM = { pos: new THREE.Vector3(2.3, 2.6, 26.8), look: new THREE.Vector3(-0.15, 1.0, 0), fov: 17 };
const BAT_CAM = { pos: new THREE.Vector3(-0.42, 2.2, -4.9), look: new THREE.Vector3(0.1, 1.05, 14), fov: 40 };

export function teamPalette(team, p = {}) {
  return {
    jersey: team.primary,
    trim: team.secondary,
    pants: team.pants,
    socks: team.dark ?? team.secondary,
    under: team.dark ?? team.secondary,
    skin: p.skin ?? 0xf0c8a0,
    hair: p.hair ?? 0x1a1410,
    shoes: 0x15151b,
    belt: team.dark ?? 0x15151b,
  };
}

export class Game {
  constructor(env) {
    this.env = env;
    const { scene, camera } = env;
    this.scene = scene;
    this.camera = camera;
    this.fx = env.fx;
    this.hud = env.hud;
    this.audio = env.audio;
    this.rig = new CameraRig(camera);
    this.ball = new Ball(scene);
    this.pitchTrail = new Trail(scene, { length: 22, width: 0.03, color: 0xffffff, intensity: 1.0, opacity: 0.4 });
    this.hitTrail = new Trail(scene, { length: 40, width: 0.06, color: 0xffffff, intensity: 1.0, opacity: 0.45 });
    this.ghosts = [];
    for (let i = 0; i < 2; i++) {
      const g = this.ball.mesh.clone();
      g.traverse((o) => {
        if (o.material) {
          o.material = o.material.clone();
          o.material.transparent = true;
          o.material.opacity = 0.5;
        }
      });
      g.visible = false;
      scene.add(g);
      this.ghosts.push(g);
    }
    this.state = 'title';
    this.stateT = 0;
    this.time = 0;
    this.createCast();
    this.titleCam();
  }

  // ======================================================================
  // Cast
  // ======================================================================
  createCast() {
    const scene = this.scene;
    this.fielders = {};
    for (const pos of POS_ORDER) {
      const ch = new Character({ width: pos === 'C' ? 1.12 : pos === '1B' ? 1.08 : 1 });
      ch.pos = pos;
      ch.home = FIELD_POS[pos].clone();
      ch.root.position.copy(ch.home);
      scene.add(ch.root);
      this.fielders[pos] = ch;
    }
    this.offense = [];
    for (let i = 0; i < 5; i++) {
      const ch = new Character({});
      ch.role = 'free';
      ch.root.visible = false;
      scene.add(ch.root);
      this.offense.push(ch);
    }
    this.bat = makeBat();
    scene.add(this.bat);
    this.umpire = new Character({ width: 1.12 });
    this.umpire.applyPalette({ jersey: 0x1c1f2a, trim: 0x3a3f52, pants: 0x6b6f7a, socks: 0x1c1f2a, under: 0x1c1f2a, skin: 0xe9b894, hair: 0x2a2a2a, belt: 0x111111 });
    this.umpire.setHeadwear(makeMask());
    this.umpire.root.position.set(0.38, 0, -1.9);
    this.umpire.play('umpire', { fade: 0 });
    scene.add(this.umpire.root);

    // cheer squad on the stage
    this.cheer = [];
    const stage = this.env.stadium.cheerStage;
    for (let i = 0; i < 3; i++) {
      const ch = new Character({ width: 0.9, scale: 0.97 });
      ch.applyPalette({ jersey: 0xffffff, trim: 0xd81e3a, pants: 0xd81e3a, socks: 0xffffff, under: 0xffffff, skin: 0xf3cfb3, hair: i === 1 ? 0x5a3a22 : 0x1a1410, shoes: 0xffffff });
      for (const s of ['L', 'R']) {
        const pom = new THREE.Mesh(new THREE.IcosahedronGeometry(0.11, 1), new THREE.MeshToonMaterial({ color: i === 1 ? 0xffcc33 : 0xd81e3a, emissive: i === 1 ? 0x332200 : 0x220000 }));
        pom.position.set(0, -0.1, 0);
        ch.bones['hand' + s].add(pom);
      }
      ch.gripTarget.L = ch.gripTarget.R = 1;
      const lp = new THREE.Vector3(-2 + i * 2, 1.52, 0);
      stage.localToWorld(lp);
      ch.root.position.copy(lp);
      ch.root.rotation.y = stage.rotation.y + Math.PI;
      ch.play('cheer', { fade: 0, speed: 0.9 + i * 0.05 });
      ch.animator.time = i * 0.3;
      scene.add(ch.root);
      this.cheer.push(ch);
    }
    // cheer leader (응원단장) facing the crowd
    const lead = new Character({ width: 1.05 });
    lead.applyPalette({ jersey: 0xd81e3a, trim: 0xffffff, pants: 0x14213d, socks: 0x14213d, under: 0xffffff, skin: 0xe9b894, hair: 0x111111 });
    const lp = new THREE.Vector3(0, 1.52, 1.0);
    stage.localToWorld(lp);
    lead.root.position.copy(lp);
    lead.root.rotation.y = stage.rotation.y;
    lead.play('cheer', { fade: 0, speed: 1.1 });
    scene.add(lead.root);
    this.cheer.push(lead);
    this.batterRig = new BatterRig(this);
  }

  dressDefense(roster) {
    const team = roster.def;
    POS_ORDER.forEach((pos, i) => {
      const ch = this.fielders[pos];
      const p = pos === 'P' ? roster.pitcher : { skin: team.skin[i % team.skin.length], hair: [0x1a1410, 0x2d1e14, 0x3b2616, 0x111111][i % 4] };
      ch.applyPalette(teamPalette(team, p));
      const name = pos === 'P' ? roster.pitcher.name : roster.fielderNames[i];
      const num = pos === 'P' ? roster.pitcher.number : [99, 12, 3, 4, 6, 5, 27, 8, 21][i] + roster.idx;
      ch.setNumber(num, shortName(name), 0xffffff, team.dark ?? team.secondary);
      ch.setChestText(team.short, 0xffffff, team.dark ?? team.secondary);
      if (pos === 'C') ch.setHeadwear(makeMask());
      else ch.setHeadwear(makeCap(team.dark ?? team.secondary, team.dark ?? team.secondary, team.primary));
      ch.setGlove(makeGlove(pos === 'C' ? 0x5a2d16 : pos === '1B' ? 0x2b1a10 : 0x8a4b22), 'L');
      ch.info = { name, number: num };
    });
  }

  dressOffense(ch, roster, player) {
    const team = roster.def;
    ch.applyPalette(teamPalette(team, player));
    ch.setNumber(player.number, shortName(player.name), 0xffffff, team.dark ?? team.secondary);
    ch.setChestText(team.short, 0xffffff, team.dark ?? team.secondary);
    ch.setHeadwear(makeHelmet(team.dark ?? team.secondary, team.primary));
    ch.setGlove(null);
    ch.player = player;
  }

  // ======================================================================
  // Game flow
  // ======================================================================
  start(opts) {
    this.opts = opts;
    this.diff = opts.diff;
    this.userTeam = opts.team; // user team index (plays at home)
    const awayIdx = 1 - opts.team;
    // teams[0] = away (bats top), teams[1] = home (user)
    this.rosters = [buildRoster(awayIdx), buildRoster(opts.team)];
    this.teams = [TEAMS[awayIdx], TEAMS[opts.team]];
    this.innings = opts.innings;
    this.inning = 1;
    this.half = 0;
    this.score = [0, 0];
    this.hits = [0, 0];
    this.line = [[], []];
    this.outs = 0;
    this.balls = 0;
    this.strikes = 0;
    this.bases = [null, null, null, null];
    this.gauge = [0, 0]; // [cpu, user]
    this.hud.buildGame(this.teams);
    this.hud.layers.mute.onclick = () => {
      this.audio.enabled = !this.audio.enabled;
      if (this.audio.master) this.audio.master.gain.value = this.audio.enabled ? 0.7 : 0;
      this.hud.layers.mute.textContent = this.audio.enabled ? '🔊' : '🔇';
    };
    this.selectedPitch = 'FF';
    this.aim = new THREE.Vector2(0, 0.8);
    this.pci = new THREE.Vector2(0, 0.8);
    this.batMode = 'normal';
    this.beginHalf(true);
  }

  get userBatting() {
    return this.half === 1;
  }
  get offRoster() {
    return this.rosters[this.half];
  }
  get defRoster() {
    return this.rosters[1 - this.half];
  }
  get userGauge() {
    return this.gauge[1];
  }

  addGauge(user, v) {
    const i = user ? 1 : 0;
    this.gauge[i] = clamp(this.gauge[i] + v, 0, 100);
    this.hud.setGauge(this.gauge[1], this.userBatting ? '필살 게이지' : '필살 게이지');
  }

  beginHalf(first = false) {
    this.outs = 0;
    this.balls = 0;
    this.strikes = 0;
    for (const r of this.bases) if (r) this.releaseOffense(r.char);
    this.bases = [null, null, null, null];
    this.dressDefense(this.defRoster);
    for (const ch of this.offense) this.releaseOffense(ch);
    for (const pos of POS_ORDER) {
      const f = this.fielders[pos];
      f.root.position.copy(f.home);
      f.root.rotation.set(0, Math.atan2(-f.home.x, -f.home.z), 0);
      f.play(pos === 'C' ? 'catcher' : pos === 'P' ? 'pitcherSet' : 'ready', { fade: 0 });
      f.animator.time = Math.random();
    }
    this.fielders.P.root.rotation.y = Math.PI;
    this.fielders.C.root.rotation.y = 0;
    if (!this.line[this.half][this.inning - 1]) this.line[this.half][this.inning - 1] = 0;
    this.pushScore();
    const t = this.teams[this.half];
    this.hud.message(`${this.inning}회${this.half ? '말' : '초'}`, `${t.name} 공격`, this.half ? 'gold' : 'blue', 1.8);
    this.hud.log(`<b>${this.inning}회${this.half ? '말' : '초'}</b> ${t.name} 공격`);
    this.newBatter();
    this.env.stadium.crowd.cheer(0.6, 2);
    if (first) this.audio.whistle();
  }

  newBatter() {
    const ro = this.offRoster;
    const player = ro.batters[ro.next % 9];
    ro.next++;
    this.balls = 0;
    this.strikes = 0;
    this.batMode = 'normal';
    this.specialArmed = null;
    const ch = this.takeOffense();
    this.dressOffense(ch, ro, player);
    ch.role = 'batter';
    this.batter = { char: ch, player };
    this.batterRig.attach(ch);
    ch.root.visible = true;
    this.hud.setMatchup(player, this.defRoster.pitcher, ro.def, this.defRoster.def);
    this.pushScore();
    this.enterPrePitch();
  }

  takeOffense() {
    let ch = this.offense.find((c) => c.role === 'free');
    if (!ch) {
      ch = new Character({});
      this.scene.add(ch.root);
      this.offense.push(ch);
    }
    return ch;
  }

  releaseOffense(ch) {
    if (!ch) return;
    ch.role = 'free';
    ch.root.visible = false;
    ch.root.rotation.set(0, 0, 0);
    ch.root.position.set(0, 0, -30);
    ch.tilt = 0;
  }

  pushScore() {
    this.hud.setScore({ score: this.score, inning: this.inning, half: this.half, bases: this.bases, balls: this.balls, strikes: this.strikes, outs: this.outs });
    this.env.stadium.drawScoreboard({
      inning: this.inning,
      half: this.half,
      score: this.score,
      hits: this.hits,
      line: this.line,
      balls: this.balls,
      strikes: this.strikes,
      outs: this.outs,
      batter: this.batter ? `${this.batter.player.order}. ${this.batter.player.name}  #${this.batter.player.number}` : '',
      message: this.boardMsg || (this.teams ? `${this.teams[this.half].short} 공격` : ''),
    });
  }

  setState(s) {
    this.state = s;
    this.stateT = 0;
  }

  // ----------------------------------------------------------------------
  enterPrePitch() {
    this.setState('prePitch');
    this.pitch = null;
    this.swing = null;
    this.resolved = false;
    this.stealing = null;
    this.meter = null;
    this.cpuSwing = null;
    this.ball.hold(this.fielders.P, 'R');
    this.hitTrail.active = false;
    this.pitchTrail.active = false;
    for (const g of this.ghosts) g.visible = false;
    const P = this.fielders.P;
    P.root.position.set(0, MOUND_H, RUBBER_Z);
    P.root.rotation.y = Math.PI;
    P.play('pitcherSet', { fade: 0.35 });
    const C = this.fielders.C;
    C.root.position.copy(C.home);
    C.root.rotation.y = 0;
    C.play('catcher', { fade: 0.3 });
    this.umpire.play('umpire', { fade: 0.3 });
    // fielders back to positions (they walk back if they're away)
    for (const pos of POS_ORDER) {
      const f = this.fielders[pos];
      f.tilt = 0;
      f.root.position.y = pos === 'P' ? MOUND_H : 0;
      f.coverTarget = null;
      f.hasBall = false;
      f.st = 'idle';
      f.animator.onEvent = null;
      f.ik.L = f.ik.R = null;
    }
    this.walkers = [];
    this.batterRig.stance();
    this.placeRunnersForPitch();
    this.pushScore();
    this.hud.pitchInfo(null);
    this.hud.hintMark(0, 0, false);
    if (this.userBatting) {
      this.rig.shot(BAT_CAM.pos, BAT_CAM.look, { fov: BAT_CAM.fov, stiff: 5 });
      this.refreshActionBar();
      this.hud.hint('마우스로 커서 이동 · <b>클릭/Space</b> 스윙 · Shift 파워 · C 컨택 · B 번트');
      this.cpuPitchDelay = 1.1 + Math.random() * 0.9;
    } else {
      this.rig.shot(PITCH_CAM.pos, PITCH_CAM.look, { fov: PITCH_CAM.fov, stiff: 5 });
      this.refreshPitchMenu();
      this.hud.hint('구종 선택 · 마우스로 코스 조준 · <b>클릭</b>으로 투구 게이지 시작');
    }
  }

  placeRunnersForPitch() {
    for (let b = 1; b <= 3; b++) {
      const r = this.bases[b];
      if (!r) continue;
      const ch = r.char;
      ch.root.visible = true;
      const next = BASES[b % 4];
      const from = BASES[b];
      const dir = new THREE.Vector3().subVectors(next, from).normalize();
      const lead = b === 1 ? 3.2 : b === 2 ? 4.0 : 2.2;
      ch.root.position.copy(from).addScaledVector(dir, lead);
      ch.root.position.y = 0;
      ch.tilt = 0;
      const toMound = new THREE.Vector3().subVectors(MOUND, ch.root.position);
      ch.root.rotation.set(0, Math.atan2(toMound.x, toMound.z), 0);
      ch.play('lead', { fade: 0.3 });
      r.leadDir = dir;
    }
  }

  refreshPitchMenu() {
    this.hud.pitchMenu(this.selectedPitch, this.userGauge, (id) => this.selectPitch(id));
  }

  refreshActionBar() {
    const canSteal = this.stealCandidate() !== null;
    this.hud.actionBar({ mode: this.batMode, canSteal }, this.userGauge, (a) => this.onAction(a));
  }

  selectPitch(id) {
    if (this.state !== 'prePitch' || this.userBatting || this.meter) return;
    const p = ALL_PITCHES.find((x) => x.id === id);
    if (!p) return;
    if (p.special && this.userGauge < p.cost) {
      this.hud.hint('필살 게이지가 부족합니다!');
      return;
    }
    this.selectedPitch = id;
    this.refreshPitchMenu();
    this.audio.tone(p.special ? 660 : 520, 0.08, { type: 'triangle', gain: 0.1 });
  }

  // ======================================================================
  // Input
  // ======================================================================
  onKey(code, shift) {
    if (this.state === 'title' || this.state === 'over') return;
    if (!this.userBatting) {
      const p = ALL_PITCHES.find((x) => 'Key' + x.key === code || 'Digit' + x.key === code);
      if (p) this.selectPitch(p.id);
      if (code === 'Space' || code === 'Enter') this.pitchClick();
      if (code === 'KeyP') this.pickoff();
    } else {
      if (code === 'Space' || code === 'Enter') this.userSwing(shift);
      else if (code === 'KeyC') this.onAction('contact');
      else if (code === 'KeyB') this.onAction('bunt');
      else if (code === 'KeyS') this.onAction('steal');
      else if (code === 'KeyE') this.onAction('dragon');
      else if (code === 'KeyT') this.onAction('flash');
      else if (code === 'KeyG') this.onAction('gale');
    }
  }

  onMouseDown(button, shift) {
    if (this.state === 'title' || this.state === 'over') return;
    const hit = this.env.input.planeHit(this.camera, CONTACT_Z);
    if (this.userBatting) {
      if (hit && !this.autoplay) this.pci.set(clamp(hit.x, -0.62, 0.62), clamp(hit.y, 0.2, 1.5));
      this.userSwing(shift || button === 2);
    } else {
      if (hit && !this.meter && this.state === 'prePitch') this.aim.set(clamp(hit.x, -0.75, 0.75), clamp(hit.y, 0.1, 1.6));
      this.pitchClick();
    }
  }

  onAction(a) {
    if (!this.userBatting) return;
    const pre = this.state === 'prePitch' || this.state === 'windup';
    if (a === 'swing') return this.userSwing(false);
    if (a === 'power') this.batMode = this.batMode === 'power' ? 'normal' : 'power';
    if (a === 'contact') this.batMode = this.batMode === 'contact' ? 'normal' : 'contact';
    if (a === 'bunt' && pre) {
      this.batMode = this.batMode === 'bunt' ? 'normal' : 'bunt';
      this.batterRig.setBunt(this.batMode === 'bunt');
    }
    if (a === 'steal' && pre) this.startSteal(false);
    if (a === 'gale' && pre && this.userGauge >= 100 && this.stealCandidate() !== null) this.startSteal(true);
    if ((a === 'dragon' || a === 'flash') && pre && this.userGauge >= 100 && !this.specialArmed) this.armBatSpecial(a, true);
    if (a !== 'bunt' && this.batMode !== 'bunt') this.batterRig.setBunt(false);
    this.refreshActionBar();
  }

  // ======================================================================
  // Pitching (user)
  // ======================================================================
  pitchClick() {
    if (this.state !== 'prePitch' || this.userBatting) return;
    if (!this.meter) {
      this.meter = { pos: 0, dir: 1, center: 0.8, good: 0.13, perfect: 0.045, speed: this.diff === 'easy' ? 0.85 : this.diff === 'hard' ? 1.35 : 1.1 };
      this.audio.tone(440, 0.06, { type: 'square', gain: 0.05 });
      return;
    }
    const m = this.meter;
    const err = Math.abs(m.pos - m.center);
    let grade = 'bad';
    if (err <= m.perfect) grade = 'perfect';
    else if (err <= m.good) grade = 'good';
    this.meter = null;
    this.hud.meter(null);
    const p = ALL_PITCHES.find((x) => x.id === this.selectedPitch);
    if (p.special) this.gauge[1] = 0;
    this.addGauge(true, 0);
    this.throwPitch(p, this.aim.clone(), grade, true);
  }

  pickoff() {
    if (this.state !== 'prePitch' || this.userBatting || !this.bases[1] || this.meter) return;
    this.setState('pickoff');
    const P = this.fielders.P;
    P.play('pickoff', { fade: 0.1 });
    this.hud.hint('견제!');
    P.animator.onEvent = (ev) => {
      if (ev !== 'release') return;
      P.animator.onEvent = null;
      const r = this.bases[1];
      const to = this.fielders['1B'];
      to.root.position.copy(BASES[1]).add(new THREE.Vector3(0.6, 0, 0.6));
      const from = new THREE.Vector3();
      P.handWorld('R', from);
      const dur = this.ball.throwTo(from, BASES[1].clone().setY(1.0), 30);
      this.audio.whoosh(0.3);
      // runner dives back
      const ch = r.char;
      const dist = ch.root.position.distanceTo(BASES[1]);
      const tReturn = 0.25 + dist / 6.5;
      const back = new THREE.Vector3().subVectors(BASES[1], ch.root.position).normalize();
      ch.root.rotation.y = Math.atan2(back.x, back.z);
      ch.play('dive', { fade: 0.1 });
      this.pickoffAnim = { ch, from: ch.root.position.clone(), t: 0, dur: tReturn };
      const out = dur + 0.5 < tReturn && Math.random() < 0.6;
      this.fx.after(Math.max(dur, tReturn) + 0.1, () => {
        this.fx.dust(BASES[1], 1.2);
        this.audio.mitt();
        if (out) {
          this.hud.message('견제 아웃!', '', 'red', 1.4);
          this.bases[1] = null;
          this.releaseOffense(ch);
          this.recordOut(1);
          this.addGauge(true, 12);
        } else {
          this.hud.message('SAFE', '', 'green', 0.9);
        }
        this.pickoffAnim = null;
        this.fx.after(1.0, () => {
          if (this.state === 'pickoff') {
            if (this.outs >= 3) this.endHalf();
            else this.enterPrePitch();
          }
        });
      });
    };
  }

  // ======================================================================
  // CPU pitching choice
  // ======================================================================
  cpuChoosePitch() {
    const pr = this.defRoster.pitcher;
    let p;
    const useSpecial = this.gauge[0] >= 100 && (this.strikes === 2 || Math.random() < 0.35);
    if (useSpecial) {
      p = SPECIAL_PITCHES[Math.floor(Math.random() * SPECIAL_PITCHES.length)];
      this.gauge[0] = 0;
    } else {
      const ars = pr.arsenal;
      const weights = ars.map((id, i) => (i === 0 ? 3 : 1.4));
      let r = Math.random() * weights.reduce((a, b) => a + b, 0);
      let k = 0;
      while (r > weights[k]) r -= weights[k++];
      p = ALL_PITCHES.find((x) => x.id === ars[Math.min(k, ars.length - 1)]);
    }
    // location strategy
    let tx, ty;
    const behind = this.balls >= 3 || (this.balls === 2 && this.strikes === 0);
    const ahead = this.strikes === 2 && this.balls < 3;
    if (behind) {
      tx = gauss() * 0.13;
      ty = 0.82 + gauss() * 0.13;
    } else if (ahead) {
      tx = (Math.random() < 0.5 ? -1 : 1) * (0.26 + Math.random() * 0.15);
      ty = Math.random() < 0.6 ? 0.42 + Math.random() * 0.12 : 1.05 + Math.random() * 0.15;
    } else {
      tx = (Math.random() - 0.5) * 0.6;
      ty = 0.52 + Math.random() * 0.62;
    }
    if (p.id === 'FS' || p.id === 'CU' || p.id === 'SP_PHANTOM') ty += 0.12;
    const r = Math.random();
    const grade = this.diff === 'easy' ? (r < 0.3 ? 'perfect' : r < 0.75 ? 'good' : 'bad') : this.diff === 'hard' ? (r < 0.55 ? 'perfect' : r < 0.93 ? 'good' : 'bad') : r < 0.42 ? 'perfect' : r < 0.86 ? 'good' : 'bad';
    return { p, target: new THREE.Vector2(tx, ty), grade };
  }

  // ======================================================================
  // Delivery
  // ======================================================================
  throwPitch(p, target, grade, byUser) {
    this.hud.clearBottom();
    this.hud.hint('');
    this.hud.cursor(this.userBatting ? 'pci' : 'none');
    const pr = this.defRoster.pitcher;
    pr.pitchCount++;
    pr.stamina = Math.max(30, pr.stamina - 1.2);
    const scatter = grade === 'perfect' ? 0.02 : grade === 'good' ? 0.055 : 0.13;
    const ctl = (100 - pr.control) / 100;
    const tgt = new THREE.Vector2(target.x + gauss() * scatter * (1 + ctl), target.y + gauss() * scatter * (1 + ctl));
    const hang = grade === 'bad' && !p.special;
    const velo = p.speed * (pr.velo / 150) * (grade === 'perfect' ? 1.015 : grade === 'bad' ? 0.97 : 1) * (0.99 + Math.random() * 0.02) * (p.special ? 1 : 0.94 + pr.stamina * 0.0006);
    this.pitch = { def: p, target: tgt, velo, hang, grade, byUser, special: p.special || null };
    if (p.special) this.specialPitchIntro(p, byUser);
    else this.startWindup();
  }

  specialPitchIntro(p, byUser) {
    this.setState('special');
    const P = this.fielders.P;
    const colors = { fire: ['#ff5a1f', '#ffcc33'], phantom: ['#8a2bff', '#ff4bd8'], thunder: ['#1fb6ff', '#ffffff'] }[p.special];
    this.rig.shot(new THREE.Vector3(1.0, 1.95, RUBBER_Z - 2.6), new THREE.Vector3(0, 1.55, RUBBER_Z), { fov: 38, stiff: 8, cut: true });
    this.rig.shot(new THREE.Vector3(0.6, 1.8, RUBBER_Z - 2.0), new THREE.Vector3(0, 1.6, RUBBER_Z), { fov: 34, stiff: 1.2 });
    this.hud.cutin({ ko: p.name, en: p.en, c1: colors[0], c2: colors[1], side: byUser ? 'l' : 'r', portrait: this.portrait(P), dur: 1.6 });
    this.audio.specialStinger();
    this.fx.slowMotion(0.35, 1.4);
    const aura = { fire: 'fire', phantom: 'phantom', thunder: 'electric' }[p.special];
    this.fx.aura(P, aura, 3.2);
    this.fx.flashScreen(0.4, p.special === 'fire' ? 0xff7a2a : p.special === 'phantom' ? 0xa050ff : 0x9fe8ff);
    this.fx.bloomBoost = 0.5;
    const base = P.root.position.clone();
    this.fx.ring(base.clone().setY(MOUND_H + 0.05), { color: p.color, size: 8, life: 0.9, face: 'up' });
    if (p.special === 'thunder') {
      this.fx.after(0.3, () => this.fx.lightningStrike(base.clone().add(new THREE.Vector3(2.5, 0.3, 1)), 0x7fd8ff));
      this.fx.after(0.7, () => this.fx.lightningStrike(base.clone().add(new THREE.Vector3(-2.5, 0.3, 0.5)), 0x7fd8ff));
      this.audio.zap();
    } else if (p.special === 'fire') {
      this.audio.fire();
      this.fx.burst(base.clone().setY(1.2), { count: 70, color: 0xff6a00, speed: 6, life: 1, size: 0.22, grav: -3, intensity: 2.2 });
    } else {
      this.fx.burst(base.clone().setY(1.2), { count: 60, color: 0xa050ff, speed: 4, life: 1.2, size: 0.35, intensity: 1.4, smoke: false });
    }
    this.fx.after(1.6, () => {
      if (this.state !== 'special') return;
      this.rig.shot(this.userBatting ? BAT_CAM.pos : PITCH_CAM.pos, this.userBatting ? BAT_CAM.look : PITCH_CAM.look, { fov: this.userBatting ? BAT_CAM.fov : PITCH_CAM.fov, cut: true });
      this.startWindup();
    });
  }

  startWindup() {
    this.setState('windup');
    const P = this.fielders.P;
    P.play('pitch', { fade: 0.15, speed: this.pitch.special ? 0.95 : 1 });
    P.animator.onEvent = (ev) => {
      if (ev === 'legLift' && this.stealing) this.runnerGo();
      if (ev === 'release') this.releasePitch();
    };
    // CPU batter may bunt in sacrifice situations / use special
    if (!this.userBatting) {
      const b = this.batter.player;
      const bunt = this.bases[1] && !this.bases[2] && this.outs === 0 && b.power < 70 && Math.random() < 0.35;
      this.cpuBunt = bunt;
      if (bunt) this.batterRig.setBunt(true);
      if (!bunt && this.gauge[0] >= 100 && Math.random() < 0.5) {
        this.gauge[0] = 0;
        this.armBatSpecial('dragon', false);
      }
      // CPU steals
      const c = this.stealCandidate();
      if (c !== null && !this.stealing && this.strikes < 2 && Math.random() < 0.12 + this.bases[c].player.speed / 900) this.startSteal(false, true);
    }
  }

  releasePitch() {
    const P = this.fielders.P;
    P.animator.onEvent = null;
    const pc = this.pitch;
    const def = pc.def;
    const p0 = new THREE.Vector3();
    P.handWorld('R', p0);
    p0.z = Math.min(p0.z, RUBBER_Z - 1.3);
    const speed = (pc.velo / 3.6) * 0.965;
    const target = new THREE.Vector3(pc.target.x, pc.target.y, CONTACT_Z);
    const dist = p0.z - target.z;
    const T = dist / speed;
    const scale = def.special ? 0.5 : 0.35;
    const brk = new THREE.Vector3(def.brk[0] * scale * (pc.hang ? 0.45 : 1), def.brk[1] * scale * (pc.hang ? 0.45 : 1), 0);
    const late = def.late;
    // break displacement at T = 0.5*brk*T^2
    const v0 = new THREE.Vector3()
      .copy(target)
      .sub(p0)
      .addScaledVector(brk, -0.5 * T * T)
      .add(new THREE.Vector3(0, 0.5 * GRAVITY * T * T, 0))
      .divideScalar(T);
    this.ball.startPitch({ p0, v0, brk, T, late, knuckle: !!def.knuckle, seed: Math.random() * 10 });
    pc.T = T;
    pc.cross = target.clone();
    pc.tCatch = this.findCatchTime();
    pc.catchPos = this.ball.pitchPos(pc.tCatch);
    this.setState('pitchFlight');
    this.pitchTrail.reset();
    this.pitchTrail.setColor(def.color, def.special ? 3 : 1.2);
    this.pitchTrail.width = def.special ? 0.09 : 0.035;
    this.pitchTrail.active = true;
    this.audio.whoosh(0.25, 1.3);
    this.hud.pitchInfo(pc.velo, def.name);
    if (def.special === 'fire') {
      this.fx.impact(p0, 0xff6a00, 1.6);
      this.fx.addShake(0.35);
      this.audio.explosion(0.5);
    } else if (def.special === 'thunder') {
      this.fx.bolt(p0.clone().add(new THREE.Vector3(0, 12, 0)), p0, 0x7fd8ff, 0.25, 0.08);
      this.audio.zap();
    } else if (def.special === 'phantom') {
      for (const g of this.ghosts) g.visible = true;
    }
    // CPU batter decides now
    if (!this.userBatting || this.autoplay) this.cpuDecideSwing();
    // easy-mode assist marker
    this.hintShown = false;
  }

  findCatchTime() {
    const tmp = new THREE.Vector3();
    let t = this.pitch.T;
    for (let i = 0; i < 200; i++) {
      this.ball.pitchPos(t, tmp);
      if (tmp.z <= CATCH_Z) break;
      t += 0.004;
    }
    return t;
  }

  // ======================================================================
  // Swinging
  // ======================================================================
  userSwing(power) {
    if (!(this.state === 'pitchFlight' || this.state === 'windup' || this.state === 'prePitch')) return;
    if (this.swing) return;
    if (this.state !== 'pitchFlight') {
      // swinging before the pitch is released counts as a (wasted) early swing only once released
      if (this.state === 'prePitch') return;
    }
    let mode = this.batMode;
    if (power && mode === 'normal') mode = 'power';
    if (this.specialArmed) mode = this.specialArmed;
    this.startSwing(mode, this.pci.clone());
  }

  startSwing(mode, pci) {
    const t0 = this.state === 'pitchFlight' ? this.ball.pt : -0.05;
    this.swing = { mode, pci, t0, contactT: t0 + (mode === 'bunt' ? 0.0 : SWING_CONTACT) };
    if (mode === 'bunt') {
      this.swing.contactT = this.pitch ? this.pitch.T : t0;
      this.batterRig.buntTo(pci);
    } else {
      this.batterRig.swingTo(pci, mode);
      this.audio.whoosh(0.2, 0.8);
    }
  }

  cpuDecideSwing() {
    const pc = this.pitch;
    const b = this.batter.player;
    const cross = pc.cross;
    const inZone = cross.x > ZONE.x0 - BALL_R && cross.x < ZONE.x1 + BALL_R && cross.y > ZONE.y0 - BALL_R && cross.y < ZONE.y1 + BALL_R;
    const breaking = ['SL', 'SW', 'CU', 'CH', 'FS', 'KN'].includes(pc.def.id);
    const sp = !!pc.special;
    const diffMul = this.diff === 'easy' ? 1.35 : this.diff === 'hard' ? 0.75 : 1;
    if (this.cpuBunt) {
      this.cpuSwing = { at: 0.02, mode: 'bunt', pci: new THREE.Vector2(cross.x + gauss() * 0.04, cross.y + gauss() * 0.04) };
      return;
    }
    let pSwing = inZone ? 0.66 + (this.strikes === 2 ? 0.2 : 0) : 0.18 + (this.strikes === 2 ? 0.22 : 0) + (breaking ? 0.12 : 0);
    if (this.balls === 3 && this.strikes < 2) pSwing *= inZone ? 0.8 : 0.4;
    if (pc.hang) pSwing = Math.min(0.95, pSwing + 0.2);
    if (sp) pSwing = inZone ? 0.8 : 0.5;
    if (Math.random() > pSwing) return;
    const skill = (b.contact - 50) / 50; // 0..1
    const sig = (0.075 - skill * 0.03) * diffMul * (sp ? 2.0 : 1) * (breaking ? 1.25 : 1) * (pc.hang ? 0.6 : 1);
    const tsig = (0.042 - skill * 0.012) * diffMul * (sp ? 1.7 : 1);
    let bias = 0;
    if (pc.def.id === 'CH' || pc.def.id === 'CU' || pc.def.id === 'KN') bias = -0.025;
    if (pc.def.special === 'fire') bias = 0.03;
    const delta = bias + gauss() * tsig;
    const mode = this.specialArmed || (this.balls > this.strikes && b.power > 75 ? 'power' : this.strikes === 2 ? 'contact' : 'normal');
    // CPU aims at where it *perceives* the ball — early break reading
    const perceived = new THREE.Vector2(cross.x + gauss() * sig, cross.y + gauss() * sig * 1.1);
    this.cpuSwing = { at: pc.T - SWING_CONTACT + delta, mode, pci: perceived };
  }

  armBatSpecial(kind, byUser) {
    this.specialArmed = kind;
    if (byUser) this.gauge[1] = 0;
    this.addGauge(true, 0);
    const ch = this.batter.char;
    const isDragon = kind === 'dragon';
    this.hud.cutin({
      ko: isDragon ? '드래곤 드라이브' : '섬광 일섬',
      en: isDragon ? 'DRAGON DRIVE' : 'FLASH STRIKE',
      c1: isDragon ? '#ffb300' : '#20e0ff',
      c2: isDragon ? '#ff2a2a' : '#ffffff',
      side: byUser ? 'l' : 'r',
      portrait: this.portrait(ch),
      dur: 1.5,
    });
    this.audio.specialStinger();
    this.fx.aura(ch, isDragon ? 'gold' : 'electric', 6);
    this.fx.flashScreen(0.4, isDragon ? 0xffcc33 : 0x9fe8ff);
    this.fx.bloomBoost = 0.8;
    this.fx.ring(ch.root.position.clone().setY(0.05), { color: isDragon ? 0xffcc33 : 0x7fe0ff, size: 6, life: 0.8, face: 'up' });
    this.fx.burst(ch.root.position.clone().setY(1.0), { count: 90, color: isDragon ? 0xffcc33 : 0x7fe0ff, speed: 5, life: 0.9, size: 0.3, star: true, intensity: 3 });
    this.batMode = kind;
    if (this.state === 'prePitch' && this.userBatting) {
      const keep = this.rig.tPos.clone();
      const keepL = this.rig.tLook.clone();
      this.rig.shot(new THREE.Vector3(0.1, 1.55, 2.6), new THREE.Vector3(0.95, 1.35, 0), { fov: 40, stiff: 7, cut: true });
      this.fx.after(1.3, () => {
        if (this.state === 'prePitch') this.rig.shot(keep, keepL, { fov: BAT_CAM.fov, cut: true });
      });
    }
  }

  // ======================================================================
  // Steals
  // ======================================================================
  stealCandidate() {
    // lead runner with an open base ahead (no stealing home)
    for (let b = 2; b >= 1; b--) if (this.bases[b] && !this.bases[b + 1]) return b;
    return null;
  }

  startSteal(gale, cpu = false) {
    const b = this.stealCandidate();
    if (b === null || this.stealing) return;
    this.stealing = { base: b, runner: this.bases[b], gale, started: false };
    if (gale) {
      this.gauge[1] = 0;
      this.addGauge(true, 0);
      this.hud.cutin({ ko: '질풍 도루', en: 'GALE STEAL', c1: '#3cffd0', c2: '#1f7aff', side: 'l', portrait: this.portrait(this.bases[b].char), dur: 1.3 });
      this.audio.specialStinger();
      this.fx.aura(this.bases[b].char, 'wind', 5);
    }
    if (!cpu) this.hud.hint(gale ? '질풍 도루 준비!' : '도루 사인!');
    if (this.state === 'windup' || this.state === 'pitchFlight') this.runnerGo();
  }

  runnerGo() {
    const s = this.stealing;
    if (!s || s.started) return;
    s.started = true;
    s.t = 0;
    const ch = s.runner.char;
    const from = ch.root.position.clone();
    const to = BASES[s.base + 1].clone();
    s.from = from;
    s.to = to;
    const pl = s.runner.player;
    s.speed = (6.9 + pl.speed * 0.022) * (s.gale ? 1.55 : 1);
    s.dist = from.distanceTo(to);
    const d = new THREE.Vector3().subVectors(to, from);
    ch.root.rotation.y = Math.atan2(d.x, d.z);
    ch.play('run', { fade: 0.12, speed: s.speed / 7.5 });
    s.progress = 0;
    s.slid = false;
  }

  updateSteal(dt) {
    const s = this.stealing;
    if (!s || !s.started || s.done) return;
    const ch = s.runner.char;
    s.progress = Math.min(s.dist, s.progress + s.speed * dt);
    const remain = s.dist - s.progress;
    if (remain < 3.2 && !s.slid) {
      s.slid = true;
      ch.play('slide', { fade: 0.08 });
      this.audio.slide();
      this.fx.dust(ch.root.position, 1.2);
    }
    if (s.slid) {
      ch.tilt = Math.max(-1.15, (ch.tilt || 0) - dt * 7);
      if (Math.random() < 0.5) this.fx.dust(ch.root.position, 0.4);
    }
    ch.root.position.lerpVectors(s.from, s.to, s.progress / s.dist);
    if (s.gale) this.fx.emitTrail(ch.root.position.clone().setY(1), 'wind', new THREE.Vector3().subVectors(s.to, s.from).normalize().multiplyScalar(8));
    if (remain <= 0.01) s.arrived = this.time;
  }

  // ======================================================================
  // Per-frame
  // ======================================================================
  update(dt, realDt) {
    this.time += dt;
    this.stateT += dt;
    const st = this.state;

    if (st === 'prePitch') this.updatePrePitch(dt, realDt);
    if (st === 'windup' || st === 'pitchFlight' || st === 'special') this.updateBattingInput(realDt);
    if (st === 'windup' && !this.userBatting && this.cpuSwing && false) {
      // placeholder
    }
    if (st === 'pitchFlight') this.updatePitchFlight(dt);
    if (st === 'afterPitch') this.updateAfterPitch(dt);
    if (st === 'inPlay' && this.play) {
      const res = this.play.update(dt);
      if (res === 'done') this.finishPlay();
    }
    if (st === 'result' && this.stateT > this.resultWait) this.afterResult();
    if (this.pickoffAnim) {
      const a = this.pickoffAnim;
      a.t += dt;
      const k = Math.min(1, a.t / a.dur);
      a.ch.root.position.lerpVectors(a.from, BASES[1], k);
      a.ch.tilt = Math.min(1.35, k * 3) * (k < 1 ? 1 : 1);
    }
    this.updateSteal(dt);

    // ball
    const ev = this.ball.update(dt);
    if (this.ball.mode === 'pitch') {
      this.pitchTrail.push(this.ball.p);
      const sp = this.pitch?.special;
      if (sp) this.fx.emitTrail(this.ball.p, sp, this.ball.v);
      if (sp === 'phantom') {
        const k = this.ball.pt / this.pitch.T;
        // ghost afterimages that split off and fade, while the real ball flickers
        this.ghosts.forEach((g, i) => {
          const off = (i ? 1 : -1) * Math.min(0.5, Math.max(0, k - 0.25) * 1.3);
          g.position.copy(this.ball.p).add(new THREE.Vector3(off, Math.abs(off) * 0.4, 0));
          g.visible = k > 0.2 && k < 0.95;
          g.scale.setScalar(1 + k * 0.4);
        });
        this.ball.mesh.visible = !(k > 0.45 && k < 0.8 && Math.sin(this.time * 70) > -0.2);
      }
      if (sp === 'fire') this.ball.glow.material.color.setRGB(3, 1.2, 0.2);
      else if (sp === 'thunder') this.ball.glow.material.color.setRGB(0.8, 2, 3);
      else this.ball.glow.material.color.setRGB(1, 1, 1);
    } else if (this.ball.mode === 'flight' || this.ball.mode === 'kinematic') {
      if (this.hitTrail.active) this.hitTrail.push(this.ball.p);
      if (this.hitFx && this.ball.mode === 'flight') this.fx.emitTrail(this.ball.p, this.hitFx, this.ball.v);
    }
    if (ev && this.play) this.play.onBallEvent(ev);
    else if (ev === 'arrived' && !this.play && (this.state === 'afterPitch' || this.state === 'prePitch')) this.ball.hold(this.fielders.P, 'L');

    // characters
    this.updateCharacters(dt);
    this.pitchTrail.update(this.camera, realDt);
    this.hitTrail.update(this.camera, realDt);
    this.rig.update(realDt * (this.fx.timeScale < 0.5 ? 0.6 : 1));
    this.env.lighting.follow(this.rig.look.clone().lerp(new THREE.Vector3(0, 0, 18), 0.4));
    this.updateHUDOverlay();

    // crowd audio/visual
    const hype = this.env.stadium.crowd.hype;
    this.audio.crowd(hype);
    this.audio.cheerBeat(this.time, dt, this.userBatting && (st === 'prePitch' || st === 'windup'));
  }

  updatePrePitch(dt, realDt) {
    if (this.userBatting) {
      this.updateBattingInput(realDt);
      this.cpuPitchDelay -= dt;
      if (this.cpuPitchDelay <= 0) {
        const c = this.cpuChoosePitch();
        this.throwPitch(c.p, c.target, c.grade, false);
      }
    } else if (this.autoplay) {
      if (this.stateT > 1.0) {
        const c = this.cpuChoosePitch();
        this.throwPitch(c.p, c.target, c.grade, true);
      }
    } else {
      // aim
      const inp = this.env.input;
      const hit = inp.planeHit(this.camera, CONTACT_Z);
      if (hit && inp.mouseActive) this.aim.set(clamp(hit.x, -0.75, 0.75), clamp(hit.y, 0.1, 1.6));
      const kv = inp.axis();
      this.aim.x = clamp(this.aim.x - kv.x * realDt * 0.9, -0.75, 0.75);
      this.aim.y = clamp(this.aim.y + kv.y * realDt * 0.9, 0.1, 1.6);
      if (this.meter) {
        const m = this.meter;
        m.pos += m.dir * realDt * m.speed;
        if (m.pos >= 1) {
          m.pos = 1;
          m.dir = -1;
        }
        if (m.pos <= 0) {
          // missed entirely -> automatic bad release
          m.pos = 0;
          this.pitchClick();
        }
        this.hud.meter(m);
      }
      // catcher sets up at the target
      const C = this.fielders.C;
      C.reach('L', new THREE.Vector3(this.aim.x, this.aim.y + 0.05, -0.62), 0.9);
    }
    // runners bounce in lead
  }

  updateBattingInput(realDt) {
    if (!this.userBatting || this.autoplay) return;
    const inp = this.env.input;
    const hit = inp.planeHit(this.camera, CONTACT_Z);
    if (hit && inp.mouseActive) this.pci.set(clamp(hit.x, -0.62, 0.62), clamp(hit.y, 0.2, 1.5));
    const kv = inp.axis();
    this.pci.x = clamp(this.pci.x - kv.x * realDt * 1.2, -0.62, 0.62);
    this.pci.y = clamp(this.pci.y + kv.y * realDt * 1.2, 0.2, 1.5);
    this.batterRig.aim(this.pci);
  }

  pciRadius(mode) {
    const base = { normal: 0.105, power: 0.08, contact: 0.135, bunt: 0.16, dragon: 0.24, flash: 0.26 }[mode] ?? 0.1;
    const d = this.diff === 'easy' ? 1.25 : this.diff === 'hard' ? 0.85 : 1;
    return base * d;
  }

  updatePitchFlight(dt) {
    const pc = this.pitch;
    const t = this.ball.pt;
    // CPU swing trigger
    if (this.cpuSwing && !this.swing && t >= this.cpuSwing.at) {
      this.startSwing(this.cpuSwing.mode, this.cpuSwing.pci);
    }
    // easy mode: reveal location late in flight
    if (this.userBatting && this.diff === 'easy' && t > pc.T * 0.45 && !this.hintShown) this.hintShown = true;
    // catcher glove tracks
    const C = this.fielders.C;
    const k = Math.min(1, t / pc.tCatch);
    const gp = pc.catchPos.clone();
    const aimP = new THREE.Vector3(pc.target.x, pc.target.y, -0.62);
    C.reach('L', aimP.lerp(gp, Math.pow(k, 2)), 1);
    // contact resolution at the crossing
    if (!this.resolved && t >= pc.T) {
      this.resolved = true;
      this.resolveCrossing();
      if (this.state !== 'pitchFlight') return;
    }
    if (t >= pc.tCatch) this.catchPitch();
  }

  resolveCrossing() {
    const pc = this.pitch;
    const cross = this.ball.pitchPos(pc.T);
    pc.crossActual = cross.clone();
    const sw = this.swing;
    if (!sw) return;
    const delta = sw.contactT - pc.T; // + = late
    const userSide = this.userBatting;
    const diffMul = userSide ? (this.diff === 'easy' ? 1.35 : this.diff === 'hard' ? 0.8 : 1) : 1;
    const special = sw.mode === 'dragon' || sw.mode === 'flash';
    const window = (sw.mode === 'bunt' ? 0.5 : 0.1) * diffMul * (special ? 1.8 : 1);
    if (Math.abs(delta) > window || (sw.mode !== 'bunt' && sw.t0 > pc.T)) {
      sw.miss = true;
      return;
    }
    const r = this.pciRadius(sw.mode) * (userSide ? 1 : 1.05);
    let dx = cross.x - sw.pci.x;
    let dy = cross.y - sw.pci.y;
    if (special) {
      dx *= 0.35;
      dy *= 0.35;
    }
    const d = Math.hypot(dx, dy * 1.05);
    if (d > r) {
      sw.miss = true;
      if (d < r * 1.35 && Math.random() < 0.5) {
        // foul tip straight back
        this.batContact({ ev: 20, la: 60 + Math.random() * 30, spray: Math.PI + (Math.random() - 0.5) * 0.8, q: 0.1, foulTip: true });
        return;
      }
      return;
    }
    // quality
    const q = 1 - Math.pow(d / r, 1.6);
    const tq = Math.exp(-Math.pow(delta / (0.05 * diffMul * (special ? 1.8 : 1)), 2));
    const b = this.batter.player;
    let Q = q * (0.35 + 0.65 * tq);
    let ev, la, spray;
    if (sw.mode === 'bunt') {
      ev = 6 + q * 7;
      la = -18 + (dy / r) * 30 + gauss() * 4;
      spray = gauss() * 0.3 + (cross.x > 0 ? 0.25 : -0.25);
    } else {
      const modeMul = sw.mode === 'power' ? 1.09 : sw.mode === 'contact' ? 0.9 : 1;
      ev = 17 + 31 * Math.pow(Q, 0.8) * (0.82 + (b.power / 100) * 0.33) * modeMul;
      la = 11 + (dy / r) * 40 + gauss() * 5 + (sw.mode === 'power' ? 5 : 0) - (sw.mode === 'contact' ? 3 : 0);
      spray = -delta * 7.5 + cross.x * 0.8 + gauss() * 0.1;
      if (sw.mode === 'dragon') {
        Q = Math.max(Q, 0.92);
        ev = 54 + Math.random() * 4;
        la = 27 + gauss() * 3;
        spray = clamp(spray, -0.5, 0.5);
      } else if (sw.mode === 'flash') {
        Q = Math.max(Q, 0.9);
        ev = 46 + Math.random() * 3;
        la = 11 + gauss() * 2;
        const gaps = [-0.42, -0.2, 0.2, 0.42];
        spray = gaps[Math.floor(Math.random() * gaps.length)] + gauss() * 0.03;
      }
      if (Math.abs(delta) > 0.075 * diffMul && !special) spray = Math.sign(spray || 1) * (0.85 + Math.random() * 0.6);
    }
    this.batContact({ ev, la, spray, q: Q, delta });
  }

  batContact({ ev, la, spray, q, foulTip = false }) {
    const sw = this.swing;
    sw.contact = true;
    const p = this.ball.p.clone();
    const dir = new THREE.Vector3(Math.sin(spray), 0, Math.cos(spray));
    const lar = THREE.MathUtils.degToRad(la);
    const v = dir.multiplyScalar(ev * Math.cos(lar)).add(new THREE.Vector3(0, ev * Math.sin(lar), 0));
    const spin = la > 5 && la < 50 ? 1.0 : la >= 50 ? 0.6 : 0.2;
    this.ball.launch(p, v, spin);
    this.pitchTrail.active = false;
    for (const g of this.ghosts) g.visible = false;
    this.ball.mesh.visible = true;
    const power = clamp((ev - 15) / 35, 0.2, 1.3);
    this.audio.bat(foulTip ? 0.4 : 0.5 + power * 0.6);
    const special = sw.mode === 'dragon' || sw.mode === 'flash';
    this.fx.impact(p, special ? (sw.mode === 'dragon' ? 0xffcc33 : 0x7fe0ff) : 0xfff2c0, foulTip ? 0.4 : 0.6 + power * 0.7);
    if (q > 0.85 && !foulTip) {
      this.fx.hitStop(0.07);
      this.fx.addShake(0.3);
    }
    this.hitFx = null;
    this.hitTrail.reset();
    this.hitTrail.setColor(0xffffff, 1.2);
    this.hitTrail.width = 0.06;
    this.hitTrail.active = !foulTip;
    if (special) {
      const dragon = sw.mode === 'dragon';
      this.hitFx = dragon ? 'dragon' : 'thunder';
      this.hitTrail.setColor(dragon ? 0xffb000 : 0x7fe0ff, 3);
      this.hitTrail.width = 0.22;
      this.fx.hitStop(0.16);
      this.fx.after(0.16, () => this.fx.slowMotion(0.18, 1.3));
      this.fx.flashScreen(0.85, dragon ? 0xffe08a : 0xffffff);
      this.fx.invert = dragon ? 0 : 0.6;
      this.fx.radial = 1.2;
      this.fx.aberr = 1.5;
      this.fx.bloomBoost = 1.4;
      this.fx.addShake(1.1);
      for (let i = 0; i < 3; i++) this.fx.after(i * 0.08, () => this.fx.ring(p, { color: dragon ? 0xffcc33 : 0x9fe8ff, size: 5 + i * 4, life: 0.7, face: 'camera' }));
      this.fx.burst(p, { count: 260, color: dragon ? 0xffc040 : 0x9fe8ff, speed: 18, life: 0.9, size: 0.3, star: true, intensity: 4 });
      if (!dragon) {
        for (let i = 0; i < 4; i++) this.fx.bolt(p, p.clone().add(new THREE.Vector3(gauss() * 3, gauss() * 2 + 1, gauss() * 3 + 3)), 0x9fe8ff, 0.3, 0.05);
        this.audio.zap();
      } else {
        this.fx.lightningStrike(p.clone().setY(0.1), 0xffcc33);
      }
      this.audio.explosion(1.2);
      this.env.stadium.crowd.cheer(1.2, 5);
      this.specialArmed = null;
    }
    if (foulTip) {
      this.hud.message('파울', '', '', 0.8);
    }
    this.hud.pitchInfo(null);
    this.startPlay({ ev, la, spray, foulTip, special: sw.mode, q });
  }

  catchPitch() {
    const pc = this.pitch;
    const C = this.fielders.C;
    this.ball.hold(C, 'L');
    this.ball.mode = 'held';
    this.pitchTrail.active = false;
    for (const g of this.ghosts) g.visible = false;
    this.ball.mesh.visible = true;
    this.audio.mitt();
    const gp = new THREE.Vector3();
    C.gloveWorld(gp);
    this.fx.burst(gp, { count: 12, color: 0xffffff, speed: 2, life: 0.3, size: 0.2, intensity: 1.5 });
    if (pc.special) this.fx.impact(gp, pc.def.color, 0.8);
    const cross = pc.crossActual || this.ball.pitchPos(pc.T);
    const sw = this.swing;
    const inZone = cross.x > ZONE.x0 - BALL_R && cross.x < ZONE.x1 + BALL_R && cross.y > ZONE.y0 - BALL_R && cross.y < ZONE.y1 + BALL_R;
    let call;
    if (sw && !sw.contact && sw.mode !== 'bunt') call = 'swingStrike';
    else if (sw && sw.mode === 'bunt' && !sw.contact && (inZone || sw.t0 < pc.T)) call = 'strike';
    else if (!sw && cross.x > 0.55 && cross.y > 0.35 && cross.y < 1.6) call = 'hbp';
    else call = inZone ? 'strike' : 'ball';
    this.callPitch(call, cross);
  }

  callPitch(call, cross) {
    this.setState('afterPitch');
    this.afterWait = 1.3;
    const pc = this.pitch;
    this.hud.pitchInfo(pc.velo, pc.def.name);
    const userPitching = !this.userBatting;
    this.lastMark = { cross, call };
    if (call === 'strike' || call === 'swingStrike') {
      this.strikes++;
      if (call === 'strike') this.umpire.play('umpStrike', { fade: 0.1 });
      this.audio.umpire('strike');
      if (userPitching) this.addGauge(true, 6);
      else this.addGauge(false, 5);
      if (this.strikes >= 3) {
        this.hud.message('삼진!', call === 'swingStrike' ? '헛스윙 삼진' : '루킹 삼진', 'red', 1.6);
        this.hud.log(`${this.batter.player.name} — 삼진`);
        this.boardMsg = 'STRIKE OUT!';
        this.batter.player.ab++;
        if (userPitching) {
          this.addGauge(true, 22);
          this.env.stadium.crowd.cheer(0.5, 2);
        } else {
          this.addGauge(false, 18);
        }
        this.fx.impact(this.fielders.C.gloveWorld(new THREE.Vector3()), 0xff4a5e, 0.8);
        this.recordOut(1);
        this.afterPitchNext = 'nextBatter';
      } else {
        this.hud.message(call === 'swingStrike' ? '헛스윙!' : 'STRIKE!', '', 'gold', 0.9);
        this.afterPitchNext = 'pitch';
      }
    } else if (call === 'ball' || call === 'hbp') {
      this.balls++;
      if (call === 'hbp' || this.balls >= 4) {
        this.hud.message(call === 'hbp' ? '몸에 맞는 공' : '볼넷', '1루 진루', 'green', 1.4);
        this.hud.log(`${this.batter.player.name} — ${call === 'hbp' ? '사구' : '볼넷'}`);
        if (!userPitching) this.addGauge(true, 10);
        this.walkBatter();
        this.afterPitchNext = 'nextBatter';
        this.afterWait = 1.8;
      } else {
        this.hud.message('BALL', '', 'green', 0.8);
        this.afterPitchNext = 'pitch';
      }
    }
    this.pushScore();
    // steal throw
    if (this.stealing && this.stealing.started && this.outs < 3) {
      this.catcherStealThrow();
      this.afterWait = Math.max(this.afterWait, 2.4);
    }
    this.batterRig.afterPitch(call);
    // catcher throws the ball back to the pitcher
    if (!this.stealing || !this.stealing.started) {
      this.fx.after(0.7, () => {
        if (this.state !== 'afterPitch') return;
        const C = this.fielders.C;
        C.play('toss', { fade: 0.15 });
        this.ball.hold(C, 'R');
        C.animator.onEvent = (ev) => {
          if (ev !== 'release') return;
          C.animator.onEvent = null;
          const from = new THREE.Vector3();
          C.handWorld('R', from);
          this.ball.throwTo(from, new THREE.Vector3(0, 1.5, RUBBER_Z - 0.3), 16);
        };
      });
    }
  }

  catcherStealThrow() {
    const s = this.stealing;
    const C = this.fielders.C;
    const target = s.base + 1;
    const coverer = target === 2 ? (Math.random() < 0.5 ? this.fielders.SS : this.fielders['2B']) : this.fielders['3B'];
    s.coverer = coverer;
    coverer.coverTarget = BASES[target].clone().add(new THREE.Vector3(target === 2 ? 0.5 : -0.3, 0, target === 2 ? -0.6 : -0.5));
    C.play('catcherThrow', { fade: 0.08 });
    this.fx.after(0.15, () => this.ball.mode === 'held' && this.ball.hold(C, 'R'));
    C.animator.onEvent = (ev) => {
      if (ev !== 'release') return;
      C.animator.onEvent = null;
      const from = new THREE.Vector3();
      C.handWorld('R', from);
      const to = BASES[target].clone().setY(0.6);
      const dur = this.ball.throwTo(from, to, 36);
      this.hitTrail.reset();
      this.hitTrail.setColor(0xffffff, 1.0);
      this.hitTrail.active = true;
      this.audio.whoosh(0.3);
      s.ballArrive = this.time + dur;
      const runner = s.runner.char;
      const base = BASES[target].clone();
      this.rig.track(() => {
        const mid = runner.root.position.clone().lerp(base, 0.5);
        const off = base.clone().sub(new THREE.Vector3(0, 0, 0)).setY(0).normalize();
        return { pos: mid.clone().add(new THREE.Vector3(-off.z * 9, 4.5, off.x * 9)).add(off.clone().multiplyScalar(-4)), look: mid.clone().setY(1.0), fov: 42 };
      }, { stiff: 4 });
      this.fx.after(dur, () => {
        this.hitTrail.active = false;
        this.ball.hold(coverer, 'L');
        this.audio.mitt();
        coverer.play('tagDown', { fade: 0.1 });
        // runner arrival time
        const remain = s.dist - s.progress;
        const runnerArrive = s.arrived ?? this.time + remain / s.speed;
        const out = !s.gale && runnerArrive > this.time + 0.02;
        this.fx.dust(BASES[target], 1.4);
        s.done = true;
        const ch = s.runner.char;
        if (out) {
          this.hud.message('도루 실패!', 'OUT', 'red', 1.4);
          this.hud.log(`${s.runner.player.name} 도루 실패`);
          this.bases[s.base] = null;
          this.releaseOffense(ch);
          this.recordOut(1);
          if (!this.userBatting) this.addGauge(true, 12);
        } else {
          this.hud.message('도루 성공!', s.gale ? '질풍처럼!' : 'SAFE', 'green', 1.4);
          this.hud.log(`${s.runner.player.name} ${target}루 도루 성공`);
          this.bases[target] = s.runner;
          this.bases[s.base] = null;
          ch.root.position.copy(BASES[target]);
          if (this.userBatting) this.addGauge(true, 10);
          this.env.stadium.crowd.cheer(0.8, 2);
        }
        this.pushScore();
      });
    };
  }

  walkBatter() {
    // force advance
    const runner = { char: this.batter.char, player: this.batter.player };
    this.batter.char.role = 'runner';
    this.batterRig.dropBat();
    const moves = [];
    let carry = runner;
    for (let b = 1; b <= 4; b++) {
      if (b === 4) {
        if (carry) this.scoreRun(carry);
        break;
      }
      const occ = this.bases[b];
      this.bases[b] = carry;
      moves.push([carry, b]);
      if (!occ) break;
      carry = occ;
    }
    for (const [r, b] of moves) {
      const ch = r.char;
      this.walkers = this.walkers || [];
      this.walkers.push({ ch, to: BASES[b].clone() });
      ch.play('jog', { fade: 0.2, speed: 0.9 });
    }
  }

  scoreRun(r) {
    this.score[this.half]++;
    this.line[this.half][this.inning - 1] = (this.line[this.half][this.inning - 1] || 0) + 1;
    this.hud.log(`<b>득점!</b> ${r.player.name}`);
    this.env.stadium.crowd.cheer(1, 3);
    if (this.userBatting) this.addGauge(true, 8);
    this.pushScore();
    if (r.char) {
      const ch = r.char;
      ch.role = 'scored';
      this.fx.after(1.2, () => {
        if (ch.role === 'scored') this.releaseOffense(ch);
      });
    }
  }

  recordOut(n = 1) {
    this.outs = Math.min(3, this.outs + n);
    this.pushScore();
  }

  updateAfterPitch(dt) {
    if (this.stateT < this.afterWait) return;
    if (this.stealing && this.stealing.started && !this.stealing.done) return;
    if (this.walkers && this.walkers.length) return;
    this.stealing = null;
    if (this.outs >= 3) return this.endHalf();
    if (this.checkWalkoff()) return;
    if (this.afterPitchNext === 'nextBatter') {
      if (this.batter.char.role === 'batter') this.releaseOffense(this.batter.char);
      this.newBatter();
    } else this.enterPrePitch();
  }

  // ======================================================================
  // Ball in play
  // ======================================================================
  startPlay(info) {
    this.setState('inPlay');
    this.hud.cursor('none');
    this.hud.drawZone(null, false);
    this.hud.hintMark(0, 0, false);
    this.hud.hint('');
    this.play = new Play(this, info);
  }

  finishPlay() {
    const res = this.play.result;
    this.play = null;
    this.hitFx = null;
    this.hitTrail.active = false;
    this.setState('result');
    this.resultWait = res.wait ?? 1.0;
    this.pendingNext = res.next;
  }

  afterResult() {
    if (this.outs >= 3) return this.endHalf();
    if (this.checkWalkoff()) return;
    if (this.pendingNext === 'pitch') {
      this.batterRig.attach(this.batter.char);
      this.enterPrePitch();
    } else {
      if (this.batter.char.role === 'batter') this.releaseOffense(this.batter.char);
      this.newBatter();
    }
  }

  checkWalkoff() {
    if (this.half === 1 && this.inning >= this.innings && this.score[1] > this.score[0]) {
      this.gameOver(true);
      return true;
    }
    return false;
  }

  endHalf() {
    this.setState('change');
    this.hud.message('공수교대', `${this.score[0]} : ${this.score[1]}`, 'blue', 1.5);
    this.hud.clearBottom();
    this.hud.cursor('none');
    this.hud.drawZone(null, false);
    this.hud.meter(null);
    this.fx.after(1.3, () => this.hud.fade(true));
    this.fx.after(2.0, () => {
      this.hud.fade(false);
      // game end checks
      if (this.half === 0 && this.inning >= this.innings && this.score[1] > this.score[0]) return this.gameOver(false);
      if (this.half === 1 && this.inning >= this.innings && this.score[0] !== this.score[1]) return this.gameOver(false);
      if (this.half === 1 && this.inning >= this.innings + 3) return this.gameOver(false);
      if (this.half === 1) {
        this.inning++;
        this.half = 0;
      } else this.half = 1;
      this.beginHalf();
    });
  }

  gameOver(walkoff) {
    this.setState('over');
    this.hud.hint('');
    this.hud.meter(null);
    this.hud.pitchInfo(null);
    this.hud.clearBottom();
    this.hud.cursor('none');
    this.hud.drawZone(null, false);
    const userWin = this.score[1] > this.score[0];
    if (walkoff) this.hud.message('끝내기!!', 'WALK-OFF WIN', 'gold', 3);
    if (userWin) {
      this.fx.fireworks(new THREE.Vector3(0, 0, 60), 14);
      this.fx.confetti(new THREE.Vector3(0, 0, 10), 500);
      this.env.stadium.crowd.cheer(1.3, 10);
      this.env.stadium.crowd.startWave();
      for (let i = 0; i < 8; i++) this.fx.after(i * 0.35, () => this.audio.firework());
    }
    this.rig.orbitAround(new THREE.Vector3(0, 0, 18), 34, 16, 0.12, { fov: 50 });
    this.fx.after(walkoff ? 3.2 : 1.5, () => this.hud.gameOver(this.score, this.teams, 1, () => this.env.restart()));
  }

  // ======================================================================
  // Characters
  // ======================================================================
  updateCharacters(dt) {
    const all = [...Object.values(this.fielders), ...this.offense, this.umpire, ...this.cheer];
    // walkers (walks / trots)
    if (this.walkers) {
      for (let i = this.walkers.length - 1; i >= 0; i--) {
        const w = this.walkers[i];
        const p = w.ch.root.position;
        const d = new THREE.Vector3().subVectors(w.to, p);
        d.y = 0;
        const L = d.length();
        if (L < 0.1) {
          w.ch.play('idle', { fade: 0.3 });
          this.walkers.splice(i, 1);
          continue;
        }
        d.normalize();
        p.addScaledVector(d, Math.min(L, 4.5 * dt));
        w.ch.root.rotation.y = Math.atan2(d.x, d.z);
      }
    }
    // fielders returning to their positions between pitches
    if (this.state === 'prePitch' || this.state === 'afterPitch' || this.state === 'windup' || this.state === 'pitchFlight' || this.state === 'special') {
      for (const pos of POS_ORDER) {
        if (pos === 'P' || pos === 'C') continue;
        const f = this.fielders[pos];
        const tgt = f.coverTarget || f.home;
        const d = new THREE.Vector3().subVectors(tgt, f.root.position);
        d.y = 0;
        const L = d.length();
        if (L > 0.3) {
          d.normalize();
          const sp = Math.min(L * 2, f.coverTarget ? 7 : 5);
          f.root.position.addScaledVector(d, sp * dt);
          f.root.rotation.y = lerpAngle(f.root.rotation.y, Math.atan2(d.x, d.z), dt * 8);
          f.play(sp > 3 ? 'run' : 'jog', { fade: 0.2, speed: sp / 6.5 });
        } else if (f.animator.clipName === 'run' || f.animator.clipName === 'jog') {
          f.play(f.coverTarget ? 'tagDown' : 'ready', { fade: 0.3 });
          if (!f.coverTarget) f.root.rotation.y = Math.atan2(-f.root.position.x, 2 - f.root.position.z);
        }
      }
      // ready pounce as the pitch comes in
      if (this.state === 'pitchFlight' && this.stateT < 0.05) {
        for (const pos of ['1B', '2B', 'SS', '3B', 'LF', 'CF', 'RF']) this.fielders[pos].play('readyPounce', { fade: 0.15 });
      }
    }
    this.batterRig.update(dt);
    // everybody on the field follows the ball with their eyes
    const ballVisible = this.ball.mesh.visible && this.state !== 'title';
    for (const pos of POS_ORDER) {
      const f = this.fielders[pos];
      if (pos === 'P' && (this.state === 'prePitch' || this.state === 'windup')) f.lookAt(new THREE.Vector3(0, 1.0, 0), 0.9);
      else if (ballVisible) f.lookAt(this.ball.p, 0.8);
    }
    for (const ch of this.offense) if (ch.role === 'runner' && ballVisible) ch.lookAt(this.ball.p, 0.7);
    if (ballVisible) this.umpire.lookAt(this.ball.p, 0.6);
    for (const ch of all) {
      if (!ch.root.visible) continue;
      if (ch.tilt !== undefined || ch.lift !== undefined) {
        ch.root.rotation.order = 'YXZ';
        ch.root.rotation.x = ch.tilt || 0;
      }
      ch.update(dt);
    }
  }

  // ======================================================================
  // HUD overlay per frame (zone, cursors)
  // ======================================================================
  project(v) {
    const p = v.clone().project(this.camera);
    return { x: (p.x * 0.5 + 0.5) * window.innerWidth, y: (-p.y * 0.5 + 0.5) * window.innerHeight, z: p.z };
  }

  updateHUDOverlay() {
    const st = this.state;
    const showZone = st === 'prePitch' || st === 'windup' || st === 'pitchFlight' || st === 'afterPitch' || st === 'special';
    if (!showZone || !this.hud.layers.svg) {
      this.hud.drawZone(null, false);
      if (st !== 'inPlay') this.hud.cursor('none');
      return;
    }
    const a = this.project(new THREE.Vector3(ZONE.x0, ZONE.y1, CONTACT_Z));
    const b = this.project(new THREE.Vector3(ZONE.x1, ZONE.y0, CONTACT_Z));
    const rect = { x0: Math.min(a.x, b.x), y0: Math.min(a.y, b.y), x1: Math.max(a.x, b.x), y1: Math.max(a.y, b.y) };
    const marks = [];
    if (st === 'afterPitch' && this.lastMark) {
      const m = this.project(new THREE.Vector3(this.lastMark.cross.x, this.lastMark.cross.y, CONTACT_Z));
      const c = this.lastMark.call === 'ball' ? '#3cff7a' : this.lastMark.call === 'hbp' ? '#ff66cc' : '#ffcc33';
      marks.push({ x: m.x, y: m.y, c, r: 9 });
    }
    this.hud.drawZone(rect, true, { marks });
    if (this.userBatting) {
      if (st === 'afterPitch') {
        this.hud.cursor('none');
      } else {
        const c = this.project(new THREE.Vector3(this.pci.x, this.pci.y, CONTACT_Z));
        const e = this.project(new THREE.Vector3(this.pci.x + this.pciRadius(this.batMode), this.pci.y, CONTACT_Z));
        this.hud.cursor('pci', c.x, c.y, Math.abs(e.x - c.x), this.batMode === 'normal' ? '' : this.batMode === 'dragon' || this.batMode === 'flash' ? 'special' : this.batMode);
      }
      if (st === 'pitchFlight' && this.diff === 'easy' && this.hintShown) {
        const h = this.project(new THREE.Vector3(this.pitch.cross.x, this.pitch.cross.y, CONTACT_Z));
        this.hud.hintMark(h.x, h.y, true);
      } else this.hud.hintMark(0, 0, false);
    } else {
      if (st === 'prePitch') {
        const c = this.project(new THREE.Vector3(this.aim.x, this.aim.y, CONTACT_Z));
        this.hud.cursor('target', c.x, c.y);
      } else this.hud.cursor('none');
    }
  }

  // ======================================================================
  // Misc
  // ======================================================================
  titleCam() {
    // sweep slowly around the home-plate side so the players are front-lit by the sunset
    this.rig.orbitAround(new THREE.Vector3(0, 0, 22), 42, 12, 0.12, { fov: 50, start: Math.PI * 0.8, swing: 0.55 });
  }

  /** Render a quick portrait of a character for cut-ins */
  portrait(ch) {
    const r = this.env.renderer;
    const w = 330, h = 170;
    const cam = new THREE.PerspectiveCamera(22, w / h, 0.05, 50);
    const head = new THREE.Vector3().setFromMatrixPosition(ch.bones.head.matrixWorld).add(new THREE.Vector3(0, 0.08, 0));
    const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(ch.bones.head.getWorldQuaternion(new THREE.Quaternion()));
    fwd.y = 0;
    fwd.normalize();
    cam.position.copy(head).addScaledVector(fwd, 1.25).add(new THREE.Vector3(fwd.z * 0.35, 0.05, -fwd.x * 0.35));
    cam.lookAt(head);
    const rt = new THREE.WebGLRenderTarget(w * 2, h * 2, { samples: 4 });
    const prevBg = this.scene.background;
    r.setRenderTarget(rt);
    r.render(this.scene, cam);
    r.setRenderTarget(null);
    const buf = new Uint8Array(w * 2 * h * 2 * 4);
    r.readRenderTargetPixels(rt, 0, 0, w * 2, h * 2, buf);
    rt.dispose();
    const c = document.createElement('canvas');
    c.width = w * 2;
    c.height = h * 2;
    const x = c.getContext('2d');
    const img = x.createImageData(w * 2, h * 2);
    for (let y = 0; y < h * 2; y++) {
      const src = (h * 2 - 1 - y) * w * 2 * 4;
      img.data.set(buf.subarray(src, src + w * 2 * 4), y * w * 2 * 4);
    }
    // linear -> sRGB-ish boost
    for (let i = 0; i < img.data.length; i += 4) {
      img.data[i] = Math.min(255, Math.pow(img.data[i] / 255, 1 / 2.2) * 255);
      img.data[i + 1] = Math.min(255, Math.pow(img.data[i + 1] / 255, 1 / 2.2) * 255);
      img.data[i + 2] = Math.min(255, Math.pow(img.data[i + 2] / 255, 1 / 2.2) * 255);
      img.data[i + 3] = 255;
    }
    x.putImageData(img, 0, 0);
    // toon posterise overlay + border
    x.globalCompositeOperation = 'overlay';
    x.fillStyle = 'rgba(255,200,120,0.25)';
    x.fillRect(0, 0, c.width, c.height);
    x.globalCompositeOperation = 'source-over';
    x.lineWidth = 10;
    x.strokeStyle = '#fff';
    x.strokeRect(5, 5, c.width - 10, c.height - 10);
    this.scene.background = prevBg;
    return c;
  }
}

function shortName(n) {
  if (/^[A-Z]\. /.test(n)) return n.split(' ').slice(1).join(' ').toUpperCase();
  if (/[가-힣]/.test(n)) return n;
  return n.toUpperCase();
}

export function lerpAngle(a, b, t) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * Math.min(1, t);
}

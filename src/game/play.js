import * as THREE from 'three';
import { BASES, isFair, fenceDistance, sprayAngle, WALL_H, POS_ORDER, MOUND, BASE_DIST } from '../constants.js';
import { predictPath } from './ball.js';
import { lerpAngle } from './game.js';

const INFIELD = ['P', 'C', '1B', '2B', 'SS', '3B'];
const OUTFIELD = ['LF', 'CF', 'RF'];
const REACH_H = 2.35;
const v3 = () => new THREE.Vector3();

function flat(v) {
  return new THREE.Vector3(v.x, 0, v.z);
}

export class Play {
  constructor(game, info) {
    this.g = game;
    this.info = info;
    this.ball = game.ball;
    this.t = 0;
    this.F = game.fielders;
    this.result = null;
    this.outs = 0;
    this.runs = [];
    this.throws = 0;
    this.fair = null;
    this.dead = false;
    this.caughtInAir = false;
    this.homerun = false;
    this.holder = null;
    this.endTimer = 0;
    this.msgShown = false;
    this.bunt = info.special === 'bunt';
    this.startOuts = game.outs;

    // runners
    this.runners = [];
    const br = { ch: game.batter.char, player: game.batter.player, base: 0, target: 1, prog: 0, forced: true, isBatter: true, delay: 0.32, speed: this.runSpeed(game.batter.player) };
    br.from = br.ch.root.position.clone();
    br.dist = br.from.distanceTo(BASES[1]);
    this.runners.push(br);
    for (let b = 3; b >= 1; b--) {
      const r = game.bases[b];
      if (!r) continue;
      let forced = true;
      for (let k = 1; k < b; k++) if (!game.bases[k]) forced = false;
      const run = { ch: r.char, player: r.player, base: b, startBase: b, target: null, prog: 0, forced, delay: 0.05, speed: this.runSpeed(r.player) };
      run.from = r.char.root.position.clone();
      this.runners.push(run);
    }
    game.bases = [null, null, null, null];

    // fielders reset
    for (const pos of POS_ORDER) {
      const f = this.F[pos];
      f.st = 'idle';
      f.goal = null;
      f.v = 0;
      f.hasBall = false;
      f.coverTarget = null;
      f.diving = null;
      f.jumping = null;
    }

    this.plan(true);
    // runner reactions
    const air = this.airCatch && !info.foulTip;
    const twoOuts = game.outs >= 2;
    for (const r of this.runners) {
      if (r.isBatter) continue;
      if (r.forced || twoOuts) this.sendRunner(r, r.base + 1);
      else if (air) {
        if (r.base < 3) this.sendRunner(r, r.base + 1, 0.4);
      }
    }
    // camera
    const g = this.g;
    const delay = g.userBatting ? 0.28 : 0.05;
    g.fx.after(delay, () => {
      if (!this.result && !this.homerunCam) g.rig.track(() => this.camFrame(), { stiff: 3.2, fov: 50, cut: true });
    });
    if (info.foulTip) this.foulBall(true);
    this.lastPlan = 0;
  }

  runSpeed(p) {
    return 6.6 + (p.speed ?? 60) * 0.024;
  }

  // ------------------------------------------------------------------
  // Planning: who chases, who covers
  // ------------------------------------------------------------------
  plan(initial = false) {
    const b = this.ball;
    const pred = predictPath(b.p, b.v, b.spin ?? 1, 10);
    // a ball at rest still needs to be picked up: extend the path with its resting spot
    const lastS = pred.samples[pred.samples.length - 1];
    const t0 = lastS ? lastS.t : 0;
    for (let t = t0 + 0.25; t < 12; t += 0.25) pred.samples.push({ t, p: pred.last.clone(), air: false, h: pred.last.y });
    this.pred = pred;
    let best = null;
    let bestAir = null;
    const reachInfo = {};
    for (const pos of POS_ORDER) {
      const f = this.F[pos];
      if (f.hasBall) continue;
      const fp = flat(f.root.position);
      const react = initial ? (pos === 'P' ? 0.45 : pos === 'C' ? 0.35 : OUTFIELD.includes(pos) ? 0.3 : 0.18) : 0.05;
      const vmax = OUTFIELD.includes(pos) ? 8.2 : pos === 'C' || pos === 'P' ? 6.6 : 7.6;
      let found = null;
      let fallback = null;
      for (let i = 0; i < pred.samples.length; i += 2) {
        const s = pred.samples[i];
        if (s.h > REACH_H + (OUTFIELD.includes(pos) ? 0.9 : 0.3)) continue;
        const r = Math.hypot(s.p.x, s.p.z);
        if (r > fenceDistance(sprayAngle(s.p.x, s.p.z)) + 0.2 && s.p.z > 0) continue;
        if (!isFair(s.p.x, s.p.z) && this.outOfPlayFoul(s.p)) continue;
        const d = Math.max(0, fp.distanceTo(flat(s.p)) - 0.6);
        const need = react + (d > 0 ? d / vmax + 0.25 : 0);
        if (need <= s.t) {
          found = { t: s.t, p: s.p.clone(), air: s.air, i };
          break;
        }
        if (s.t < 0.3) continue;
        const late = need - s.t;
        if (!fallback || late < fallback.late) fallback = { t: need + late * 2, p: s.p.clone(), air: s.air, late, i };
      }
      const pick = found || fallback;
      if (!pick) continue;
      reachInfo[pos] = pick;
      const score = found ? found.t : fallback.t + 0.5;
      if (!best || score < best.score) best = { pos, ...pick, score, clean: !!found };
      if (found && found.air && (!bestAir || found.t < bestAir.t)) bestAir = { pos, ...found };
    }
    if (!best) {
      // nobody can get there (e.g. a no-doubt homer): nearest fielder heads for the landing spot
      const land = flat(pred.last);
      const r = land.length();
      const fr = fenceDistance(sprayAngle(land.x, land.z)) - 0.5;
      if (r > fr && !pred.homerun) land.setLength(fr);
      let bd = Infinity;
      for (const pos of POS_ORDER) {
        const d = flat(this.F[pos].root.position).distanceTo(land);
        if (d < bd) {
          bd = d;
          best = { pos, t: 99, p: land.clone(), air: false, clean: false, score: 99 };
        }
      }
    }
    this.reach = reachInfo;
    this.chaser = best ? best.pos : 'SS';
    this.airCatch = !!bestAir && (!best || bestAir.t <= best.t + 0.4) && bestAir.pos === this.chaser;
    if (bestAir && !this.airCatch && bestAir.t < best.t + 0.6) {
      this.chaser = bestAir.pos;
      this.airCatch = true;
      best = { ...bestAir, clean: true };
    }
    this.intercept = best;
    // assign roles
    const chaser = this.chaser;
    const spray = sprayAngle(b.v.x || 0.001, b.v.z || 0.001);
    const cover = {};
    cover[1] = chaser === '1B' ? (chaser === 'P' ? '2B' : 'P') : '1B';
    cover[2] = spray < 0 ? (chaser === 'SS' ? '2B' : 'SS') : chaser === '2B' ? 'SS' : '2B';
    if (cover[2] === chaser) cover[2] = cover[2] === 'SS' ? '2B' : 'SS';
    cover[3] = chaser === '3B' ? 'SS' : '3B';
    if (cover[3] === cover[2]) cover[3] = 'P';
    cover[4] = chaser === 'C' ? 'P' : 'C';
    if (cover[1] === chaser) cover[1] = '2B';
    this.cover = cover;
    const coverOf = {};
    for (const k of [1, 2, 3, 4]) coverOf[cover[k]] = k;
    for (const pos of POS_ORDER) {
      const f = this.F[pos];
      if (f.hasBall || f.st === 'throwing' || f.st === 'dive' || f.st === 'jump') continue;
      if (pos === chaser) {
        f.st = 'chase';
        f.goal = flat(best.p);
      } else if (coverOf[pos]) {
        const bb = coverOf[pos];
        f.st = 'cover';
        f.coverBase = bb;
        const bp = BASES[bb % 4];
        const off = bb === 4 ? new THREE.Vector3(0, 0, -0.6) : new THREE.Vector3().subVectors(MOUND, bp).setY(0).normalize().multiplyScalar(0.5);
        f.goal = bp.clone().add(off).setY(0);
      } else if (OUTFIELD.includes(pos) && best && best.p.z > 35) {
        // back up the play
        f.st = 'backup';
        const bp = flat(best.p);
        f.goal = bp.clone().add(new THREE.Vector3().subVectors(bp, flat(f.root.position)).setLength(-6)).lerp(bp, 0.5);
      } else if (!initial) {
        // keep
      } else {
        f.st = 'hold';
        f.goal = null;
      }
    }
  }

  outOfPlayFoul(p) {
    // foul territory is bounded by the stands
    const r = Math.hypot(p.x, p.z);
    if (p.z < -17) return true;
    const lineDist = Math.abs(Math.abs(p.x) - p.z) / Math.SQRT2;
    return lineDist > 13 || r > 110;
  }

  // ------------------------------------------------------------------
  sendRunner(r, target, stopFrac = 1) {
    if (target > 4) return;
    r.from = r.ch.root.position.clone().setY(0);
    r.target = target;
    r.prog = 0;
    r.dist = r.from.distanceTo(BASES[target % 4]);
    r.stopFrac = stopFrac;
    r.returning = target <= r.base;
    r.slid = false;
    r.ch.tilt = 0;
  }

  activeRunners() {
    return this.runners.filter((r) => !r.out && !r.scored);
  }

  // ------------------------------------------------------------------
  // Main update
  // ------------------------------------------------------------------
  update(dt) {
    this.t += dt;
    const g = this.g;
    if (this.t - this.lastPlan > 0.45 && !this.holder && this.ball.mode === 'flight' && !this.dead && !this.homerun) {
      this.lastPlan = this.t;
      if (this.t > 0.3) this.replanIfNeeded();
    }
    this.updateFielders(dt);
    this.updateRunners(dt);
    this.checkBall(dt);
    // batter drops the bat
    if (this.t > 0.3 && !this.batDropped) {
      this.batDropped = true;
      if (!this.dead) g.batterRig.dropBat();
    }
    // end conditions
    if (this.result) return 'done';
    const outsNow = g.outs;
    if (outsNow >= 3) {
      this.endTimer += dt;
      if (this.endTimer > 1.4) return this.finish();
      return;
    }
    if (this.dead) {
      this.endTimer += dt;
      if (this.endTimer > (this.deadWait ?? 1.2)) return this.finish();
      return;
    }
    if (this.homerun) {
      if (this.activeRunners().length === 0) {
        this.endTimer += dt;
        if (this.endTimer > 1.2) return this.finish();
      }
      return;
    }
    const moving = this.activeRunners().some((r) => r.target !== null && !r.waiting);
    const ballSettled = (this.holder && !this.throwing && this.ball.mode === 'held') || (this.inFlightThrow && this.inFlightThrow.cutoff);
    if (!moving && ballSettled && this.t > 1.2) {
      this.endTimer += dt;
      if (this.endTimer > 0.55) return this.finish();
    } else this.endTimer = 0;
    if (this.t > 25) return this.finish();
  }

  replanIfNeeded() {
    // re-evaluate chases for balls that got past a fielder
    const c = this.F[this.chaser];
    if (!c) return this.plan();
    const d = flat(c.root.position).distanceTo(flat(this.ball.p));
    const bv = Math.hypot(this.ball.v.x, this.ball.v.z);
    const away = new THREE.Vector3().subVectors(flat(this.ball.p), flat(c.root.position)).dot(new THREE.Vector3(this.ball.v.x, 0, this.ball.v.z)) > 0;
    if ((away && d > 2.5 && bv > 3) || c.st !== 'chase') this.plan();
    else if (this.intercept) {
      // refresh goal for the current chaser
      this.plan();
    }
  }

  // ------------------------------------------------------------------
  // Fielders
  // ------------------------------------------------------------------
  updateFielders(dt) {
    const ball = this.ball;
    for (const pos of POS_ORDER) {
      const f = this.F[pos];
      const p = f.root.position;
      if (f.st === 'dive') {
        this.updateDive(f, dt);
        continue;
      }
      if (f.st === 'jump') {
        this.updateJump(f, dt);
        continue;
      }
      if (f.st === 'throwing') continue;
      let goal = f.goal;
      if (f.hasBall && f.runTo) {
        goal = f.runTo;
        if (flat(p).distanceTo(flat(f.runTo)) < 0.7) {
          const rt = f.runTarget;
          f.runTo = null;
          f.runTarget = null;
          f.goal = null;
          this.baseTouched(f, rt.b);
          this.g.fx.after(0.3, () => this.decideThrow(f));
          goal = null;
        }
      }
      if (goal) {
        const d = new THREE.Vector3().subVectors(goal, p);
        d.y = 0;
        const L = d.length();
        const vmax = (OUTFIELD.includes(pos) ? 8.2 : pos === 'C' || pos === 'P' ? 6.6 : 7.6) * (f.hasBall ? 0.9 : 1);
        if (L > 0.25) {
          f.v = Math.min(vmax, (f.v || 0) + dt * 14);
          const step = Math.min(L, f.v * dt);
          p.addScaledVector(d.normalize(), step);
          f.root.rotation.y = lerpAngle(f.root.rotation.y, Math.atan2(d.x, d.z), dt * 10);
          f.play(f.v > 2.5 ? 'run' : 'jog', { fade: 0.15, speed: Math.max(0.6, f.v / 7) });
        } else {
          f.v = 0;
          if (f.st === 'cover' || f.st === 'chase' || f.st === 'backup' || f.hasBall) {
            // face the ball
            const tb = new THREE.Vector3().subVectors(ball.p, p);
            f.root.rotation.y = lerpAngle(f.root.rotation.y, Math.atan2(tb.x, tb.z), dt * 8);
            const low = ball.p.y < 0.6 && ball.mode === 'flight' && f.st === 'chase' && flat(ball.p).distanceTo(flat(p)) < 6;
            f.play(f.hasBall ? 'ready' : low ? 'scoop' : f.st === 'cover' ? 'ready' : 'ready', { fade: 0.2 });
          } else f.play(f.st === 'hold' ? 'ready' : 'ready', { fade: 0.3 });
        }
      }
      // glove reaching for the incoming ball
      if (!f.hasBall && ball.mode !== 'held' && (f.st === 'chase' || f.receiving)) {
        const bp = ball.p;
        const hd = flat(bp).distanceTo(flat(p));
        if (hd < 4.5 && bp.y < REACH_H + 1.2) {
          const t = bp.clone();
          t.y = Math.max(0.15, Math.min(2.3, t.y));
          f.reach('L', t, THREE.MathUtils.clamp(1.4 - hd / 4.5, 0, 1));
          f.lookAt(bp, 1);
        }
        if (f.st === 'chase' && ball.mode === 'flight') this.tryCatch(f, pos);
      }
      if (f.receiving && ball.mode === 'kinematic') {
        f.lookAt(ball.p, 1);
      }
    }
  }

  tryCatch(f, pos) {
    const ball = this.ball;
    const bp = ball.p;
    const p = f.root.position;
    const hd = flat(bp).distanceTo(flat(p));
    const st = ball.state;
    const air = st && st.bounces === 0 && !st.rolling;
    // wall jump catch
    const r = Math.hypot(bp.x, bp.z);
    const fr = fenceDistance(sprayAngle(bp.x, bp.z));
    if (air && OUTFIELD.includes(pos) && fr - r < 3.5 && bp.y > REACH_H && bp.y < WALL_H + 1.4 && hd < 2.2 && !f.jumping && ball.v.y < 0) {
      this.startJump(f);
      return;
    }
    const slow = Math.hypot(ball.v.x, ball.v.z) < 3 && bp.y < 0.5;
    if ((hd < 0.95 || (slow && hd < 1.4)) && bp.y < REACH_H + 0.15) {
      this.catchBall(f, pos, air);
      return;
    }
    // dive
    const late = !this.intercept || !this.intercept.clean;
    if (!f.diving && late && hd < 3.2 && hd > 1.1 && bp.y < 1.6 && (air || Math.hypot(ball.v.x, ball.v.z) > 9)) {
      const rel = new THREE.Vector3().subVectors(flat(bp), flat(p));
      const vel = new THREE.Vector3(ball.v.x, 0, ball.v.z);
      const closing = -rel.dot(vel) / Math.max(1, rel.length());
      const tti = rel.length() / Math.max(1, closing);
      if (closing > 0 && tti < 0.35 && Math.random() < 0.8) this.startDive(f, rel);
    }
  }

  startDive(f, dir) {
    f.st = 'dive';
    f.diving = { t: 0, dir: dir.clone().setY(0).normalize(), caught: false };
    f.root.rotation.y = Math.atan2(dir.x, dir.z);
    f.play('dive', { fade: 0.08 });
    this.g.audio.whoosh(0.25, 0.7);
  }

  updateDive(f, dt) {
    const d = f.diving;
    d.t += dt;
    const k = d.t;
    const p = f.root.position;
    if (k < 0.45) p.addScaledVector(d.dir, (6.5 - k * 8) * dt);
    f.tilt = Math.min(1.42, k * 5);
    f.root.position.y = Math.max(0, Math.sin(Math.min(k / 0.45, 1) * Math.PI) * 0.35) + (f.tilt > 1.2 ? 0.1 : 0);
    const ball = this.ball;
    const glove = f.gloveWorld(new THREE.Vector3());
    if (!d.caught && ball.mode === 'flight' && glove.distanceTo(ball.p) < 0.85 + (k < 0.4 ? 0.4 : 0)) {
      d.caught = true;
      const st = ball.state;
      const air = st && st.bounces === 0 && !st.rolling;
      this.catchBall(f, f.pos, air, true);
    }
    if (k > 0.45 && !d.landed) {
      d.landed = true;
      this.g.fx.dust(p, 1.5);
      this.g.audio.thud();
    }
    if (k > 1.25) {
      f.tilt = 0;
      f.root.position.y = 0;
      f.diving = null;
      f.st = f.hasBall ? 'hasBall' : 'chase';
      f.play('ready', { fade: 0.25 });
      if (f.hasBall) this.afterCatch(f, 0.1);
      else this.plan();
    }
  }

  startJump(f) {
    f.st = 'jump';
    f.jumping = { t: 0 };
    f.play('jumpCatch', { fade: 0.06 });
  }

  updateJump(f, dt) {
    const j = f.jumping;
    j.t += dt;
    const k = Math.min(1, j.t / 0.8);
    f.root.position.y = Math.sin(k * Math.PI) * 1.0;
    const ball = this.ball;
    const glove = new THREE.Vector3().setFromMatrixPosition(f.bones.handL.matrixWorld);
    f.reach('L', ball.p.clone(), 1);
    if (!j.caught && ball.mode === 'flight' && glove.distanceTo(ball.p) < 1.0) {
      j.caught = true;
      const robbed = ball.state.overWall || ball.p.y > WALL_H - 0.3;
      if (ball.state.overWall) ball.state.overWall = false;
      this.catchBall(f, f.pos, true, false, robbed);
    }
    if (j.t > 0.8) {
      f.root.position.y = 0;
      f.jumping = null;
      f.st = f.hasBall ? 'hasBall' : 'chase';
      if (f.hasBall) this.afterCatch(f, 0.2);
      else this.plan();
    }
  }

  catchBall(f, pos, air, diving = false, robbed = false) {
    const g = this.g;
    const ball = this.ball;
    ball.hold(f, 'L');
    ball.mode = 'held';
    f.hasBall = true;
    this.holder = f;
    g.hitTrail.active = false;
    g.hitFx = null;
    g.audio.mitt();
    const gp = f.gloveWorld(new THREE.Vector3());
    g.fx.burst(gp, { count: 16, color: 0xffffff, speed: 3, life: 0.35, size: 0.25, intensity: 1.6 });
    if (air && !this.dead) {
      this.caughtInAir = true;
      const fairNow = isFair(gp.x, gp.z);
      const batter = this.runners.find((r) => r.isBatter);
      this.markOut(batter, 'fly');
      const txt = robbed ? '홈런 강탈!!' : diving ? '다이빙 캐치!' : fairNow ? (gp.y > 1.2 && Math.hypot(gp.x, gp.z) > 40 ? '플라이 아웃' : this.info.la < 18 ? '라인드라이브 아웃' : '플라이 아웃') : '파울 플라이 아웃';
      g.hud.message(txt, robbed ? 'WALL CATCH!' : diving ? 'NICE PLAY!' : '', robbed || diving ? 'gold' : 'red', robbed ? 2.2 : 1.3);
      g.hud.log(`${this.runners[0].player.name} — ${txt}`);
      if (robbed || diving) {
        g.fx.slowMotion(0.25, 1.0);
        g.fx.impact(gp, 0xffcc33, 1.2);
        g.env.stadium.crowd.cheer(1, 3);
        g.addGauge(!g.userBatting, 15);
      }
      if (!g.userBatting) g.addGauge(true, 8);
      this.msgShown = true;
      // runners go back; tag up from deep flies
      const depth = Math.hypot(gp.x, gp.z);
      for (const r of this.activeRunners()) {
        if (r.isBatter) continue;
        if (g.outs < 3) {
          const tag = (r.base === 3 && depth > 62) || (r.base === 2 && depth > 88);
          if (r.target !== null && r.target > r.base && (r.prog > 0 || r.target !== null)) {
            // must return first
            this.sendRunner(r, r.base);
            r.mustReturn = true;
            if (tag) r.tagAfterReturn = true;
          } else if (tag) {
            r.tagDelay = 0.05;
          }
        }
      }
    } else {
      // ground ball / hit fielded
      if (!this.fair && this.fair !== false) {
        // decide fair/foul at fielding point if not yet decided
        const fairNow = isFair(gp.x, gp.z);
        if (!fairNow && Math.hypot(gp.x, gp.z) < BASE_DIST + 1) return this.foulBall();
        this.fair = true;
      }
      if (diving) {
        g.hud.message('다이빙 스톱!', 'NICE PLAY!', 'gold', 1.1);
        g.fx.slowMotion(0.3, 0.8);
      }
    }
    if (f.st !== 'dive' && f.st !== 'jump') this.afterCatch(f, air ? 0.45 : 0.25);
  }

  afterCatch(f, delay) {
    f.st = 'hasBall';
    f.runTo = null;
    f.goal = null;
    this.g.fx.after(delay, () => this.decideThrow(f));
  }

  // ------------------------------------------------------------------
  // Throw decisions
  // ------------------------------------------------------------------
  decideThrow(f) {
    if (this.result || !f.hasBall || this.homerun) return;
    const g = this.g;
    if (g.outs >= 3) return;
    const P = flat(f.root.position);
    let best = null;
    for (const r of this.activeRunners()) {
      if (r.target === null || r.waiting) continue;
      if (r.isBatter && r.out) continue;
      const b = r.target;
      const needOut = r.forced || r.mustReturn || r.target > r.base; // advancing runners can be tagged
      if (!needOut) continue;
      const bp = BASES[b % 4];
      const remain = Math.max(0, r.dist - r.prog) / r.speed + (r.delay || 0);
      const cov = this.F[this.cover[b]] || f;
      const covTime = cov === f ? 0 : flat(cov.root.position).distanceTo(flat(bp)) / 7.5;
      const dBase = P.distanceTo(flat(bp));
      const runIt = dBase < 7 || cov === f;
      const throwTime = runIt ? dBase / 7 : 0.42 + dBase / (OUTFIELD.includes(f.pos) ? 34 : 31);
      const margin = remain - Math.max(throwTime, covTime * 0.9);
      if (margin > 0.03) {
        const score = b * 10 + (r.forced ? 3 : 0) + margin;
        if (!best || score > best.score) best = { r, b, runIt, score, cov };
      }
    }
    if (best) {
      if (best.runIt) {
        f.runTo = BASES[best.b % 4].clone();
        f.runTarget = best;
        f.st = 'runToBase';
        return;
      }
      return this.throwTo(f, best.b, best.cov);
    }
    // nobody to get — outfielders return the ball to the infield cutoff
    if (OUTFIELD.includes(f.pos) || P.length() > 40) {
      const cut = this.F[this.cover[2]] || this.F.SS;
      if (cut !== f && this.throws < 4) return this.throwTo(f, 2, cut, true);
    }
    // hold; check again shortly in case a runner tries to advance
    f.holdCheck = 0.35;
    this.g.fx.after(0.35, () => {
      if (f.hasBall && !this.result) this.decideThrow(f);
    });
  }

  throwTo(f, base, receiver, cutoff = false) {
    const g = this.g;
    f.st = 'throwing';
    this.throwing = true;
    this.throws++;
    const tgt = receiver.goal ? receiver.goal.clone() : BASES[base % 4].clone();
    const dir = new THREE.Vector3().subVectors(tgt, f.root.position);
    f.root.rotation.y = Math.atan2(dir.x, dir.z);
    f.play('throw', { fade: 0.08, speed: OUTFIELD.includes(f.pos) ? 1.0 : 1.35 });
    receiver.receiving = true;
    // glove-to-hand transfer
    this.g.fx.after(0.08, () => {
      if (this.ball.mode === 'held' && this.ball.holder?.char === f) this.ball.hold(f, 'R');
    });
    f.animator.onEvent = (ev) => {
      if (ev !== 'release') return;
      f.animator.onEvent = null;
      const from = new THREE.Vector3();
      f.handWorld('R', from);
      f.hasBall = false;
      this.holder = null;
      const to = (receiver.root.position.distanceTo(tgt) < 3 ? receiver.root.position.clone() : tgt.clone()).setY(1.25);
      const speed = OUTFIELD.includes(f.pos) ? 36 : f.pos === 'C' ? 34 : 31;
      const dur = this.ball.throwTo(from, to, speed);
      g.hitTrail.reset();
      g.hitTrail.setColor(0xffffff, 1.0);
      g.hitTrail.width = 0.04;
      g.hitTrail.active = true;
      g.audio.whoosh(0.2, 1.2);
      this.inFlightThrow = { base, receiver, cutoff, arrive: this.t + dur };
      g.fx.after(0.4, () => {
        if (f.st === 'throwing') {
          f.st = 'idle';
          f.goal = null;
        }
      });
    };
  }

  onThrowArrive() {
    const th = this.inFlightThrow;
    if (!th) return;
    this.inFlightThrow = null;
    this.throwing = false;
    const g = this.g;
    const rc = th.receiver;
    rc.receiving = false;
    this.ball.hold(rc, 'L');
    this.ball.mode = 'held';
    rc.hasBall = true;
    this.holder = rc;
    g.hitTrail.active = false;
    g.audio.mitt();
    const bp = BASES[th.base % 4];
    const onBase = flat(rc.root.position).distanceTo(flat(bp)) < 2.2;
    if (!th.cutoff && onBase) this.baseTouched(rc, th.base);
    rc.st = 'hasBall';
    g.fx.after(0.25, () => this.decideThrow(rc));
  }

  baseTouched(f, base) {
    // any runner that must reach this base and hasn't -> out
    for (const r of this.activeRunners()) {
      if (r.target !== base || r.waiting) continue;
      const needOut = r.forced || r.mustReturn || r.target > r.base;
      if (!needOut) continue;
      if (r.prog < r.dist - 0.05) {
        this.markOut(r, r.forced ? 'force' : 'tag');
        f.play('tagDown', { fade: 0.08 });
        const g = this.g;
        const bp = BASES[base % 4];
        g.fx.dust(bp, 1.3);
        g.fx.impact(bp.clone().setY(0.8), 0xff5a5a, 0.6);
        g.audio.umpire('out');
        const dp = this.outs >= 2;
        g.hud.message(dp ? '더블 플레이!' : '아웃!', dp ? 'DOUBLE PLAY' : r.isBatter ? '' : `${base === 4 ? '홈' : base + '루'} ${r.forced ? '포스' : '태그'}아웃`, 'red', 1.1);
        if (dp && !g.userBatting) g.addGauge(true, 15);
        this.msgShown = true;
        break;
      }
    }
  }

  // ------------------------------------------------------------------
  // Runners
  // ------------------------------------------------------------------
  updateRunners(dt) {
    const g = this.g;
    for (const r of this.runners) {
      if (r.out || r.scored) continue;
      if (r.delay > 0) {
        r.delay -= dt;
        if (r.isBatter && r.delay <= 0) {
          r.ch.play('run', { fade: 0.2, speed: r.speed / 7.5 });
          r.from = r.ch.root.position.clone().setY(0);
          r.dist = r.from.distanceTo(BASES[1]);
        }
        continue;
      }
      if (r.tagDelay !== undefined) {
        r.tagDelay -= dt;
        if (r.tagDelay <= 0) {
          r.tagDelay = undefined;
          this.sendRunner(r, r.base + 1);
          r.forced = false;
        }
      }
      if (r.target === null) {
        // standing on base
        const tb = new THREE.Vector3().subVectors(this.ball.p, r.ch.root.position);
        r.ch.root.rotation.y = lerpAngle(r.ch.root.rotation.y, Math.atan2(tb.x, tb.z), dt * 5);
        if (r.ch.animator.clipName === 'run' || r.ch.animator.clipName === 'jog') r.ch.play('ready', { fade: 0.25 });
        continue;
      }
      const to = BASES[r.target % 4];
      const stopAt = r.dist * (r.stopFrac ?? 1);
      if (r.prog >= stopAt - 0.01 && (r.stopFrac ?? 1) < 1) {
        r.waiting = true;
        if (r.ch.animator.clipName !== 'lead') r.ch.play('lead', { fade: 0.2 });
        // ball dropped in / not caught -> go
        if (this.fair === true && !this.caughtInAir && this.ball.state?.bounces > 0) {
          r.stopFrac = 1;
          r.waiting = false;
        }
        continue;
      }
      r.waiting = false;
      const speed = this.homerun ? 5.2 : r.speed;
      r.prog = Math.min(stopAt, r.prog + speed * dt);
      const k = r.dist > 0 ? r.prog / r.dist : 1;
      const pos = r.ch.root.position;
      const prevT = pos.clone();
      pos.lerpVectors(r.from, to, k);
      pos.y = 0;
      const dir = new THREE.Vector3().subVectors(to, r.from);
      if (!r.slid) r.ch.root.rotation.y = lerpAngle(r.ch.root.rotation.y, Math.atan2(dir.x, dir.z), dt * 12);
      const remain = r.dist - r.prog;
      // slide on close plays
      const incoming = this.inFlightThrow && this.inFlightThrow.base === r.target;
      const closePlay = incoming || (this.holder && this.holder.runTarget && this.holder.runTarget.b === r.target);
      if (!this.homerun && !r.slid && remain < 3.0 && remain > 0.5 && (closePlay || (r.target === 4 && this.holder)) && !r.returning) {
        r.slid = true;
        r.headfirst = Math.random() < 0.35;
        r.ch.play(r.headfirst ? 'dive' : 'slide', { fade: 0.08 });
        g.audio.slide();
        g.fx.dust(pos, 1.4);
      } else if (r.returning && !r.slid && remain < 2.5 && remain > 0.5 && (this.inFlightThrow || this.holder)) {
        r.slid = true;
        r.headfirst = true;
        r.ch.play('dive', { fade: 0.08 });
        g.fx.dust(pos, 1);
      } else if (!r.slid) {
        const clip = this.homerun ? 'jog' : 'run';
        r.ch.play(clip, { fade: 0.2, speed: speed / 7.5 });
      }
      if (r.slid) {
        r.ch.tilt = r.headfirst ? Math.min(1.35, (r.ch.tilt || 0) + dt * 7) : Math.max(-1.15, (r.ch.tilt || 0) - dt * 7);
        if (Math.random() < 0.6) g.fx.dust(pos, 0.35);
      }
      if (r.prog >= r.dist - 0.01) this.runnerArrived(r);
    }
  }

  runnerArrived(r) {
    const g = this.g;
    const b = r.target;
    r.target = null;
    r.waiting = false;
    const wasReturn = r.returning;
    r.returning = false;
    r.mustReturn = false;
    if (r.slid) {
      r.slid = false;
      g.fx.after(0.5, () => {
        r.ch.tilt = 0;
        if (!r.out && r.target === null) r.ch.play('ready', { fade: 0.35 });
      });
    }
    if (b === 4) {
      r.scored = true;
      if (g.outs < 3) this.scoreRunner(r);
      else g.fx.after(1.0, () => g.releaseOffense(r.ch));
      return;
    }
    r.base = b;
    r.forced = false;
    if (r.tagAfterReturn) {
      r.tagAfterReturn = false;
      r.tagDelay = 0.1;
      return;
    }
    if (this.homerun) {
      this.sendRunner(r, b + 1);
      return;
    }
    if (this.caughtInAir && !r.tagDelay) return;
    // force continues if the runner behind is coming to this base
    const behind = this.runners.find((o) => o !== r && !o.out && !o.scored && o.target === b && o.forced);
    if (behind) {
      this.sendRunner(r, b + 1);
      r.forced = true;
      return;
    }
    if (wasReturn) return;
    if (this.shouldAdvance(r, b)) this.sendRunner(r, b + 1);
  }

  shouldAdvance(r, b) {
    const next = b + 1;
    if (next > 4) return false;
    // don't run into an occupied base
    const occ = this.runners.find((o) => o !== r && !o.out && !o.scored && ((o.target === null && o.base === next) || o.target === next));
    if (occ && next !== 4) return false;
    if (this.g.outs >= 3) return false;
    const bp = BASES[next % 4];
    const runT = BASE_DIST / r.speed + 0.25;
    let defT;
    if (this.holder) {
      defT = 0.45 + flat(this.holder.root.position).distanceTo(flat(bp)) / 32;
    } else if (this.inFlightThrow) {
      defT = this.inFlightThrow.arrive - this.t + 0.4 + 30 / 32;
    } else {
      const ch = this.F[this.chaser];
      const bpos = flat(this.ball.p);
      const reachT = ch ? flat(ch.root.position).distanceTo(bpos) / 7.5 + 0.4 : 1;
      defT = reachT + 0.45 + bpos.distanceTo(flat(bp)) / 33;
    }
    const aggressive = 0.3 + (this.g.outs === 2 ? -0.15 : 0);
    return runT < defT - aggressive;
  }

  scoreRunner(r) {
    const g = this.g;
    this.runs.push({ r, t: this.t });
    g.scoreRun({ char: null, player: r.player });
    g.fx.burst(BASES[0].clone().setY(0.5), { count: 40, color: g.teams[g.half].primary, speed: 5, life: 0.8, size: 0.3, star: true, intensity: 2.5 });
    const ch = r.ch;
    ch.role = 'scored';
    g.fx.after(1.5, () => {
      if (ch.role !== 'batter' && ch.role !== 'runner') g.releaseOffense(ch);
    });
    if (!this.homerun) g.hud.message('득점!', `${r.player.name} 홈인`, 'gold', 1.0);
  }

  markOut(r, how) {
    if (!r || r.out) return;
    r.out = true;
    r.target = null;
    this.outs++;
    const g = this.g;
    g.recordOut(1);
    r.ch.play('dejected', { fade: 0.3 });
    r.ch.tilt = 0;
    if (r.isBatter) {
      r.player.ab++;
      r.ch.role = 'out';
    }
    // third out on a force / batter-runner: runs on this play don't count
    if (g.outs >= 3 && (how === 'force' || r.isBatter)) {
      for (const run of this.runs) {
        g.score[g.half]--;
        g.line[g.half][g.inning - 1]--;
      }
      if (this.runs.length) g.hud.log('3아웃 — 득점 무효');
      this.runs = [];
      g.pushScore();
    }
    const ch = r.ch;
    g.fx.after(1.6, () => {
      if (ch.role !== 'batter') g.releaseOffense(ch);
    });
  }

  // ------------------------------------------------------------------
  // Ball monitoring: fair/foul, home run, throws
  // ------------------------------------------------------------------
  onBallEvent(ev) {
    const g = this.g;
    const b = this.ball;
    if (ev === 'arrived') return this.onThrowArrive();
    if (this.dead || this.result) return;
    if (ev === 'homerun') {
      if (!isFair(b.p.x, b.p.z)) this.foulBall();
      else if (b.state.bounces > 0) this.groundRuleDouble();
      else this.startHomeRun();
      return;
    }
    if (ev === 'bounce' && b.state.bounces === 1) {
      const r = Math.hypot(b.p.x, b.p.z);
      if (this.fair === null) {
        if (r > BASE_DIST * 0.98 || b.p.z > BASE_DIST) {
          if (isFair(b.p.x, b.p.z)) this.setFair(true);
          else this.foulBall();
        } else if (b.p.z < -0.3) this.foulBall();
      }
      g.fx.dust(b.p, 0.6);
    }
    if (ev === 'wall') {
      g.fx.dust(b.p, 0.8);
      g.audio.thud();
      g.fx.addShake(0.15);
    }
  }

  setFair(v) {
    this.fair = v;
    if (v) {
      // hit! runners that were waiting go
      for (const r of this.activeRunners()) {
        if (r.waiting) {
          r.stopFrac = 1;
          r.waiting = false;
        }
      }
      if (!this.hitAnnounced) {
        this.hitAnnounced = true;
        this.g.env.stadium.crowd.cheer(this.g.userBatting ? 0.9 : 0.4, 2.5);
      }
    }
  }

  checkBall(dt) {
    const b = this.ball;
    if (this.dead || this.homerun || this.result) return;
    if (b.mode !== 'flight') return;
    const r = Math.hypot(b.p.x, b.p.z);
    // tentative infield foul decisions
    if (this.fair === null && b.state.bounces > 0) {
      if (r > BASE_DIST * 0.98) {
        if (isFair(b.p.x, b.p.z)) this.setFair(true);
        else this.foulBall();
      } else if (Math.hypot(b.v.x, b.v.z) < 0.5) {
        if (isFair(b.p.x, b.p.z)) this.setFair(true);
        else this.foulBall();
      }
    }
    // foul into the stands
    if (!isFair(b.p.x, b.p.z) && this.outOfPlayFoul(b.p) && b.p.y < 6) {
      this.foulBall();
    }
    // ball resting in the outfield with nobody near: keep chasing (plan handles)
  }

  foulBall(tip = false) {
    if (this.dead) return;
    const g = this.g;
    this.dead = true;
    this.fair = false;
    this.deadWait = tip ? 0.6 : 1.4;
    if (!tip) g.hud.message('파울', '', '', 0.9);
    if (g.strikes < 2) g.strikes++;
    g.pushScore();
    g.hitTrail.active = false;
    g.hitFx = null;
    // everyone back
    for (const r of this.runners) {
      if (r.isBatter) continue;
      r.out = false;
    }
    this.foul = true;
  }

  groundRuleDouble() {
    const g = this.g;
    this.grd = true;
    this.dead = true;
    this.deadWait = 1.6;
    this.fair = true;
    g.hud.message('인정 2루타', 'GROUND RULE DOUBLE', 'gold', 1.5);
    g.hitTrail.active = false;
    this.msgShown = true;
  }

  startHomeRun() {
    const g = this.g;
    this.homerun = true;
    this.setFair(true);
    const special = this.info.special === 'dragon';
    g.hud.message(special ? '드래곤 홈런!!' : '홈런!!', `${this.runners[0].player.name}`, 'gold', 2.6);
    g.hud.log(`<b>홈런!</b> ${this.runners[0].player.name}`);
    g.boardMsg = 'HOME RUN!!';
    g.fx.slowMotion(0.3, 1.2);
    g.fx.flashScreen(0.5, 0xffe08a);
    g.fx.bloomBoost = 1.0;
    const bp = this.ball.p.clone();
    g.fx.impact(bp, 0xffcc33, 2);
    g.fx.fireworks(new THREE.Vector3(0, 0, 105), special ? 14 : 8);
    for (let i = 0; i < (special ? 10 : 5); i++) g.fx.after(0.3 + i * 0.3, () => g.audio.firework());
    g.fx.confetti(new THREE.Vector3(bp.x * 0.8, 0, bp.z * 0.8), 250);
    g.env.stadium.crowd.cheer(1.4, 7);
    g.env.stadium.crowd.startWave();
    g.addGauge(g.userBatting, 30);
    const batter = this.runners.find((r) => r.isBatter);
    batter.player.hr++;
    batter.player.hits++;
    batter.player.ab++;
    g.hits[g.half]++;
    // everyone trots home
    for (const r of this.activeRunners()) {
      r.waiting = false;
      r.stopFrac = 1;
      r.mustReturn = false;
      if (r.target === null) this.sendRunner(r, r.base + 1);
      else r.stopFrac = 1;
      r.forced = false;
    }
    // fielders stop
    for (const pos of POS_ORDER) {
      const f = this.F[pos];
      f.st = 'idle';
      f.goal = null;
      f.play(OUTFIELD.includes(pos) ? 'dejected' : 'idle', { fade: 0.4 });
    }
    this.msgShown = true;
    // cinematic: watch the ball, then the trot
    g.fx.after(2.2, () => {
      if (this.result) return;
      g.rig.track(() => {
        const b = this.runners.find((x) => x.isBatter);
        const p = b.ch.root.position;
        return { pos: new THREE.Vector3(p.x * 0.6 - 6, 4.5, p.z * 0.6 - 9), look: p.clone().setY(1.2), fov: 38 };
      }, { stiff: 2.5 });
    });
  }

  // ------------------------------------------------------------------
  camFrame() {
    const b = this.ball.p;
    const g = this.g;
    const dist = Math.hypot(b.x, b.z);
    let look = b.clone();
    if (this.holder || this.dead) {
      // look between the ball and the lead runner
      const lead = this.activeRunners().filter((r) => r.target !== null).sort((a, c) => (c.target || 0) - (a.target || 0))[0];
      if (lead) look = b.clone().lerp(lead.ch.root.position, 0.5);
    }
    look.y = Math.max(0.8, Math.min(look.y, 25));
    const center = new THREE.Vector3(0, 0, 22);
    const fdist = Math.hypot(look.x, look.z);
    const pos = new THREE.Vector3(look.x * 0.18, 11 + Math.min(18, fdist * 0.12) + look.y * 0.25, -16 + look.z * 0.18);
    const fov = THREE.MathUtils.clamp(62 - fdist * 0.32, 26, 58);
    return { pos, look: look.lerp(center, 0.1), fov };
  }

  finish() {
    if (this.result) return 'done';
    const g = this.g;
    // place surviving runners on bases
    const bases = [null, null, null, null];
    let batterBase = null;
    for (const r of this.runners) {
      if (r.out || r.scored) continue;
      if (this.dead) {
        // foul: restore runners to their original bases
        if (r.isBatter) continue;
        const ob = r.origBase ?? r.base;
        bases[ob] = { char: r.ch, player: r.player };
        continue;
      }
      let b = r.target !== null ? (r.returning ? r.target : Math.max(r.base, r.prog > r.dist * 0.5 ? r.target : r.base)) : r.base;
      if (b === 0) b = 1;
      if (b >= 4) {
        if (g.outs < 3) this.scoreRunner(r);
        continue;
      }
      while (bases[b] && b < 3) b++;
      bases[b] = { char: r.ch, player: r.player };
      r.ch.root.position.copy(BASES[b]);
      r.ch.tilt = 0;
      if (r.isBatter) batterBase = b;
    }
    if (this.grd) {
      g.bases = [null, null, null, null];
      for (const r of this.runners) {
        if (r.out) continue;
        const nb = (r.isBatter ? 0 : r.startBase) + 2;
        if (nb >= 4) {
          r.scored = true;
          this.scoreRunner(r);
        } else {
          g.bases[nb] = { char: r.ch, player: r.player };
          r.ch.root.position.copy(BASES[nb]);
          r.ch.tilt = 0;
        }
      }
      const bt = this.runners.find((r) => r.isBatter);
      bt.player.hits++;
      bt.player.ab++;
      g.hits[g.half]++;
      g.batter.char.role = 'runner';
      g.hud.log(`${bt.player.name} — 인정 2루타`);
      g.pushScore();
      this.result = { next: 'batter', wait: 0.6 };
      return 'done';
    }
    if (this.dead) {
      // foul ball: original runners stay, batter continues
      g.bases = [null, null, null, null];
      for (const r of this.runners) {
        if (r.isBatter) continue;
        g.bases[r.startBase ?? r.base] = { char: r.ch, player: r.player };
      }
      this.result = { next: 'pitch', wait: 0.3 };
      return 'done';
    }
    g.bases = bases;
    const batter = this.runners.find((r) => r.isBatter);
    if (!this.caughtInAir && !this.homerun && batterBase) {
      batter.player.ab++;
      const outsHere = this.outs;
      const kind = outsHere > 0 ? '야수선택' : ['', '안타', '2루타', '3루타'][batterBase];
      if (outsHere === 0) {
        batter.player.hits++;
        g.hits[g.half]++;
        g.addGauge(g.userBatting, 16);
        if (!this.msgShown) g.hud.message(kind + '!', batterBase > 1 ? `${batterBase}루까지!` : '', 'gold', 1.3);
      } else if (!this.msgShown) g.hud.message(kind, '', '', 1.1);
      g.hud.log(`${batter.player.name} — ${kind}`);
      g.boardMsg = kind === '안타' ? 'HIT!' : kind === '2루타' ? 'DOUBLE!' : kind === '3루타' ? 'TRIPLE!' : 'FC';
    } else if (batter.out && !this.caughtInAir) {
      g.hud.log(`${batter.player.name} — ${this.bunt && this.runs.length + this.runners.filter((r) => !r.isBatter && !r.out).length ? '희생번트' : '땅볼 아웃'}`);
      g.boardMsg = 'OUT';
      if (!this.msgShown) g.hud.message('아웃!', '', 'red', 1.0);
    } else if (this.caughtInAir && this.runs.length) {
      g.hud.log('희생플라이!');
      g.hud.message('희생플라이', '1타점', 'gold', 1.2);
    }
    g.batter.char.role = batter.out ? 'free' : 'runner';
    g.pushScore();
    this.result = { next: 'batter', wait: 0.6 };
    return 'done';
  }
}

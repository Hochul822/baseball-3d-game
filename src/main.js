import * as THREE from 'three';
import { createRenderer } from './core/renderer.js';
import { setupLighting } from './core/lighting.js';
import { Stadium } from './world/stadium.js';
import { FX } from './fx/effects.js';
import { HUD } from './ui/hud.js';
import { Audio } from './audio/audio.js';
import { Game } from './game/game.js';
import { TEAMS } from './constants.js';

TEAMS[0].dark = 0x14213d;
TEAMS[1].dark = 0x0c1a44;

class Input {
  constructor(dom) {
    this.ndc = new THREE.Vector2();
    this.keys = new Set();
    this.mouseActive = false;
    this.ray = new THREE.Raycaster();
    const track = (e) => {
      this.ndc.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
      this.mouseActive = true;
    };
    dom.addEventListener('pointermove', track);
    // touch: the tap position doubles as the aim point
    dom.addEventListener('pointerdown', track);
    window.addEventListener('keydown', (e) => {
      if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) this.mouseActive = false;
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
  }
  axis() {
    const k = this.keys;
    // S is also the steal key; arrows are the unambiguous alternative
    const x = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
    const y = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('ArrowDown') ? 1 : 0);
    return { x, y };
  }
  /** Intersect the mouse ray with the vertical plane z = const. */
  planeHit(camera, z) {
    this.ray.setFromCamera(this.ndc, camera);
    const o = this.ray.ray.origin;
    const d = this.ray.ray.direction;
    if (Math.abs(d.z) < 1e-5) return null;
    const t = (z - o.z) / d.z;
    if (t < 0) return null;
    return o.clone().addScaledVector(d, t);
  }
}

const app = document.getElementById('app');
const ui = document.getElementById('ui');
const R = createRenderer(app);
const { renderer, scene, camera, composer, bloom, grade } = R;
scene.background = new THREE.Color(0x1d2b64);
const lighting = setupLighting(scene);
const stadium = new Stadium(scene, { homeTeam: TEAMS[0], awayTeam: TEAMS[1] });
const fx = new FX(scene, camera, grade, bloom);
const hud = new HUD(ui);
const audio = new Audio();
const input = new Input(renderer.domElement);

const env = { scene, camera, renderer, fx, hud, audio, stadium, lighting, input };
const game = new Game(env);
env.restart = () => {
  hud.showTitle(startGame);
  game.setState('title');
  game.titleCam();
};

function startGame(opts) {
  audio.init();
  audio.resume();
  game.start(opts);
}

hud.showTitle(startGame);

function updateParticleScale() {
  const h = renderer.getDrawingBufferSize(new THREE.Vector2()).y;
  const s = h / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
  fx.soft.points.material.uniforms.uScale.value = s;
  fx.stars.points.material.uniforms.uScale.value = s;
  fx.smoke.points.material.uniforms.uScale.value = s;
}

window.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  audio.resume();
  game.onKey(e.code, e.shiftKey);
});
renderer.domElement.addEventListener('pointerdown', (e) => {
  audio.resume();
  game.onMouseDown(e.button, e.shiftKey);
});
renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault());

// debug hooks for automated testing
window.__game = game;
window.__env = env;

const timer = new THREE.Timer();
const TEST = new URLSearchParams(location.search).has('test');
function step(realDt) {
  const dt = fx.update(realDt);
  game.update(dt, realDt);
  stadium.update(dt, stadium.crowd.hype);
  fx.applyShake(camera);
}
function render() {
  updateParticleScale();
  composer.render();
}
function frame(t) {
  timer.update(t);
  step(Math.min(0.05, timer.getDelta()));
  render();
  requestAnimationFrame(frame);
}
if (TEST) {
  // deterministic stepping for automated tests
  window.__advance = (sec, dt = 1 / 60) => {
    for (let i = 0; i < Math.round(sec / dt); i++) step(dt);
    render();
  };
  window.__step = (sec, dt = 1 / 60) => {
    for (let i = 0; i < Math.round(sec / dt); i++) step(dt);
  };
  render();
} else requestAnimationFrame(frame);

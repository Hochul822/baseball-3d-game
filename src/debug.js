import * as THREE from 'three';
import { createRenderer } from './core/renderer.js';
import { Character, makeCap, makeGlove, makeBat, makeHelmet } from './char/character.js';

const q = new URLSearchParams(location.search);
const { renderer, scene, camera, composer } = createRenderer(document.getElementById('app'));
scene.background = new THREE.Color(0x8fb4d8);
scene.add(new THREE.HemisphereLight(0xcfe3ff, 0x4a5a3a, 0.8));
const sun = new THREE.DirectionalLight(0xfff0dd, 2.4);
sun.position.set(4, 8, 5);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -5; sun.shadow.camera.right = 5; sun.shadow.camera.top = 5; sun.shadow.camera.bottom = -5;
scene.add(sun);
const g = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshToonMaterial({ color: 0x4f8a3a }));
g.rotation.x = -Math.PI / 2; g.receiveShadow = true; scene.add(g);

const clips = (q.get('clips') || 'idle,ready,run,pitch').split(',');
const times = (q.get('t') || '0').split(',').map(Number);
const chars = [];
clips.forEach((c, i) => {
  const ch = new Character({ palette: { jersey: 0xd81e3a, trim: 0x14213d, pants: 0xf4f1ea, socks: 0x14213d, skin: 0xf1c8a5 } });
  ch.setNumber(10 + i, 'KIM', 0xffffff, 0x14213d);
  ch.setChestText('SEOUL', 0xffffff, 0x14213d);
  ch.setHeadwear(makeCap(0x14213d, 0x14213d, 0xd81e3a));
  ch.setGlove(makeGlove(), 'L');
  ch.root.position.set((i - (clips.length - 1) / 2) * 1.6, 0, 0);
  ch.root.rotation.y = Number(q.get('ry') || 0);
  scene.add(ch.root);
  ch.play(c, { fade: 0 });
  ch.animator.time = (times[i] ?? times[0]) * ch.animator.clip.duration;
  chars.push(ch);
});
const cp = (q.get('cam') || '0,1.2,5').split(',').map(Number);
camera.position.set(...cp);
const tg = (q.get('look') || '0,1,0').split(',').map(Number);
camera.lookAt(...tg);
let last = performance.now();
const freeze = q.get('freeze') !== '0';
function loop() {
  const now = performance.now();
  const dt = freeze ? 0 : Math.min(0.05, (now - last) / 1000);
  last = now;
  for (const c of chars) c.update(dt);
  composer.render();
  requestAnimationFrame(loop);
}
loop();
window.__ready = true; window.chars = chars;

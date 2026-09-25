import * as THREE from 'three';

export function setupLighting(scene) {
  const hemi = new THREE.HemisphereLight(0xa8b8ff, 0x5a4636, 1.05);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffd6a8, 2.9);
  sun.position.set(60, 48, -70);
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  const sc = sun.shadow.camera;
  sc.left = -48;
  sc.right = 48;
  sc.top = 48;
  sc.bottom = -48;
  sc.near = 1;
  sc.far = 260;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.03;
  scene.add(sun);
  scene.add(sun.target);
  const fill = new THREE.DirectionalLight(0x9fc4ff, 0.7);
  fill.position.set(-50, 60, 80);
  scene.add(fill);
  scene.fog = new THREE.Fog(0x9a78a8, 260, 950);
  const offset = sun.position.clone();
  return {
    hemi,
    sun,
    fill,
    follow(target) {
      // keep the shadow frustum centred on the action, snapped to texels to avoid shimmer
      const t = target.clone();
      const texel = 96 / 4096;
      t.x = Math.round(t.x / texel) * texel;
      t.z = Math.round(t.z / texel) * texel;
      t.y = 0;
      sun.target.position.copy(t);
      sun.position.copy(t).add(offset);
    },
  };
}

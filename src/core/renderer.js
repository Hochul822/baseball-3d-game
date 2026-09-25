import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';

// Final grading pass: vignette, chromatic punch, speed-line/radial blur for special moments.
const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uVignette: { value: 0.32 },
    uAberration: { value: 0.0 },
    uRadial: { value: 0.0 },
    uFlash: { value: 0.0 },
    uFlashColor: { value: new THREE.Color(1, 1, 1) },
    uSaturation: { value: 1.08 },
    uInvert: { value: 0.0 },
    uCenter: { value: new THREE.Vector2(0.5, 0.5) },
    uTime: { value: 0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uVignette, uAberration, uRadial, uFlash, uSaturation, uInvert, uTime;
    uniform vec3 uFlashColor;
    uniform vec2 uCenter;
    varying vec2 vUv;
    void main(){
      vec2 d = vUv - uCenter;
      vec3 col;
      if (uRadial > 0.001) {
        vec3 acc = vec3(0.0);
        float tot = 0.0;
        for (int i = 0; i < 12; i++) {
          float s = 1.0 - float(i) / 12.0 * uRadial * 0.12;
          float wgt = 1.0 - float(i) / 13.0;
          acc += texture2D(tDiffuse, uCenter + d * s).rgb * wgt;
          tot += wgt;
        }
        col = acc / tot;
      } else {
        col = texture2D(tDiffuse, vUv).rgb;
      }
      if (uAberration > 0.0001) {
        vec2 o = d * uAberration * 0.03;
        col.r = texture2D(tDiffuse, vUv + o).r;
        col.b = texture2D(tDiffuse, vUv - o).b;
      }
      float l = dot(col, vec3(0.299, 0.587, 0.114));
      col = mix(vec3(l), col, uSaturation);
      col = mix(col, vec3(1.0) - col, uInvert);
      float v = smoothstep(0.95, 0.25, length(d * vec2(1.25, 1.0)));
      col *= mix(1.0 - uVignette, 1.0, v);
      col = mix(col, uFlashColor, clamp(uFlash, 0.0, 1.0));
      gl_FragColor = vec4(col, 1.0);
    }
  `,
};

export function createRenderer(container) {
  const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', stencil: false });
  const dpr = Math.min(window.devicePixelRatio, 2);
  renderer.setPixelRatio(dpr);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.05, 1200);

  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 4 });
  const composer = new EffectComposer(renderer, rt);
  const renderPass = new RenderPass(scene, camera);
  composer.addPass(renderPass);
  const bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.5, 0.45, 1.25);
  composer.addPass(bloom);
  const output = new OutputPass();
  composer.addPass(output);
  const grade = new ShaderPass(GradeShader);
  composer.addPass(grade);

  function resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.setSize(w, h);
    composer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);

  return { renderer, scene, camera, composer, bloom, grade, resize };
}

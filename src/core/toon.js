import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Toon shading helpers: banded gradient ramp, rim light injection and
// inverted-hull outlines (works for static, instanced and skinned meshes).
// ---------------------------------------------------------------------------

function makeRamp(steps) {
  const data = new Uint8Array(steps.length);
  steps.forEach((v, i) => (data[i] = Math.round(v * 255)));
  const tex = new THREE.DataTexture(data, steps.length, 1, THREE.RedFormat);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

export const RAMP3 = makeRamp([0.38, 0.72, 1.0]);
export const RAMP4 = makeRamp([0.3, 0.55, 0.82, 1.0]);
export const RAMP_SOFT = makeRamp([0.55, 0.75, 0.9, 1.0]);

const rimUniforms = {
  uRimColor: { value: new THREE.Color(0xfff1d6) },
  uRimStrength: { value: 0.55 },
  uShadowTint: { value: new THREE.Color(0x5a4d8f) },
};
export const toonGlobals = rimUniforms;

/**
 * Toon material with a crisp rim light and a cool-tinted shadow band.
 */
export function toonMat(color = 0xffffff, opts = {}) {
  const mat = new THREE.MeshToonMaterial({
    color,
    gradientMap: opts.ramp ?? RAMP3,
    vertexColors: !!opts.vertexColors,
    map: opts.map ?? null,
    transparent: !!opts.transparent,
    opacity: opts.opacity ?? 1,
    emissive: opts.emissive ?? 0x000000,
    emissiveIntensity: opts.emissiveIntensity ?? 1,
    side: opts.side ?? THREE.FrontSide,
  });
  const rim = opts.rim ?? 1;
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uRimColor = rimUniforms.uRimColor;
    shader.uniforms.uRimStrength = rimUniforms.uRimStrength;
    shader.uniforms.uShadowTint = rimUniforms.uShadowTint;
    shader.uniforms.uRimMul = { value: rim };
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
uniform vec3 uRimColor; uniform float uRimStrength; uniform vec3 uShadowTint; uniform float uRimMul;`
      )
      .replace(
        '#include <opaque_fragment>',
        `{
  vec3 vdir = normalize(vViewPosition);
  float ndv = max(dot(normal, vdir), 0.0);
  float rimv = smoothstep(0.62, 0.7, 1.0 - ndv);
  // rim only on the lit side
  float lum = dot(outgoingLight, vec3(0.299,0.587,0.114));
  float base = dot(diffuseColor.rgb, vec3(0.299,0.587,0.114)) + 1e-3;
  float litness = clamp(lum / base, 0.0, 1.5);
  outgoingLight += uRimColor * rimv * uRimStrength * uRimMul * smoothstep(0.25, 0.7, litness) * diffuseColor.rgb * 1.4;
  // cool shadow tint
  float sh = 1.0 - smoothstep(0.35, 0.65, litness);
  outgoingLight = mix(outgoingLight, outgoingLight * uShadowTint * 1.9, sh * 0.35);
}
#include <opaque_fragment>`
      );
  };
  mat.customProgramCacheKey = () => 'toonrim' + (opts.vertexColors ? 'v' : '');
  return mat;
}

const outlineCache = new Map();
/**
 * Inverted hull outline material. Thickness grows a little with distance so
 * far-away players keep a readable silhouette.
 */
export function outlineMat(thickness = 0.012, color = 0x16121f) {
  const key = thickness + ':' + color;
  if (outlineCache.has(key)) return outlineCache.get(key);
  const m = new THREE.ShaderMaterial({
    uniforms: {
      uThickness: { value: thickness },
      uColor: { value: new THREE.Color(color) },
    },
    vertexShader: /* glsl */ `
      uniform float uThickness;
      #include <common>
      #include <skinning_pars_vertex>
      void main() {
        #include <beginnormal_vertex>
        #include <skinbase_vertex>
        #include <skinnormal_vertex>
        #include <begin_vertex>
        #include <skinning_vertex>
        vec4 p = vec4(transformed, 1.0);
        vec3 n = objectNormal;
        #ifdef USE_INSTANCING
          p = instanceMatrix * p;
          n = mat3(instanceMatrix) * n;
        #endif
        vec4 mv = modelViewMatrix * p;
        vec3 vn = normalize(normalMatrix * n);
        float d = -mv.z;
        mv.xyz += vn * uThickness * clamp(d * 0.09, 1.0, 7.0);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      void main() { gl_FragColor = vec4(uColor, 1.0); }
    `,
    side: THREE.BackSide,
  });
  outlineCache.set(key, m);
  return m;
}

/** Adds an outline hull as a child sharing the geometry. */
export function addOutline(mesh, thickness = 0.012, color) {
  let o;
  if (mesh.isSkinnedMesh) {
    o = new THREE.SkinnedMesh(mesh.geometry, outlineMat(thickness, color));
    o.bind(mesh.skeleton, mesh.bindMatrix);
    o.bindMode = mesh.bindMode;
  } else if (mesh.isInstancedMesh) {
    o = new THREE.InstancedMesh(mesh.geometry, outlineMat(thickness, color), mesh.count);
    o.instanceMatrix = mesh.instanceMatrix;
  } else {
    o = new THREE.Mesh(mesh.geometry, outlineMat(thickness, color));
  }
  o.frustumCulled = mesh.frustumCulled;
  o.castShadow = false;
  o.receiveShadow = false;
  o.userData.isOutline = true;
  mesh.add(o);
  if (mesh.isSkinnedMesh) {
    // skinned children must not inherit the parent transform twice
    o.matrixAutoUpdate = false;
  }
  return o;
}

export function toonMesh(geo, color, opts = {}) {
  const m = new THREE.Mesh(geo, toonMat(color, opts));
  m.castShadow = opts.castShadow ?? true;
  m.receiveShadow = opts.receiveShadow ?? true;
  if (opts.outline !== false) addOutline(m, opts.outlineThickness ?? 0.012, opts.outlineColor);
  return m;
}

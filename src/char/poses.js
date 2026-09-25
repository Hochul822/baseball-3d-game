// ---------------------------------------------------------------------------
// Pose & clip library.
// Conventions (bone local, character facing +Z, +X = character's left):
//  limbs hang along -Y.  x<0 swings a limb forward; knee (shin) x>0 bends;
//  spine/chest x>0 bends forward, y>0 turns left, z>0 leans right.
//  left arm z>0 abducts, right arm z<0 abducts. forearm x<0 flexes.
//  foot x>0 points toes down.
// Euler order is YXZ.  `hp` offsets the hips (root space).
// `ik` tracks give wrist targets in root space for arms (L/R) with weights.
// ---------------------------------------------------------------------------

const deg = Math.PI / 180;

export const P = {
  stand: {
    spine: [0.03, 0, 0],
    chest: [-0.02, 0, 0],
    upperArmL: [0.06, 0, 0.14],
    upperArmR: [0.06, 0, -0.14],
    foreArmL: [-0.25, 0, 0],
    foreArmR: [-0.25, 0, 0],
    handL: [-0.1, 0, 0.1],
    handR: [-0.1, 0, -0.1],
    thighL: [-0.03, 0, 0.05],
    thighR: [0.03, 0, -0.05],
    shinL: [0.06, 0, 0],
    shinR: [0.06, 0, 0],
    footL: [-0.03, 0, -0.05],
    footR: [-0.03, 0, 0.05],
    grip: [0.3, 0.3],
  },
  ready: {
    hp: [0, -0.2, -0.04],
    spine: [0.42, 0, 0],
    chest: [0.12, 0, 0],
    neck: [-0.3, 0, 0],
    head: [-0.25, 0, 0],
    upperArmL: [-0.6, -0.1, 0.2],
    upperArmR: [-0.6, 0.1, -0.2],
    foreArmL: [-0.85, 0, 0],
    foreArmR: [-0.85, 0, 0],
    handL: [-0.2, 0, 0],
    handR: [-0.2, 0, 0],
    thighL: [-0.62, 0.15, 0.28],
    thighR: [-0.62, -0.15, -0.28],
    shinL: [0.95, 0, 0],
    shinR: [0.95, 0, 0],
    footL: [-0.3, -0.1, -0.2],
    footR: [-0.3, 0.1, 0.2],
    grip: [0.4, 0.4],
  },
  catcher: {
    hp: [0, -0.64, 0.02],
    spine: [0.32, 0, 0],
    chest: [-0.05, 0, 0],
    neck: [-0.2, 0, 0],
    head: [-0.15, 0, 0],
    upperArmL: [-1.0, 0, 0.35],
    foreArmL: [-0.9, 0, 0],
    upperArmR: [0.25, 0, -0.35],
    foreArmR: [-1.1, 0, 0],
    thighL: [-1.75, 0.35, 0.5],
    thighR: [-1.75, -0.35, -0.5],
    shinL: [2.35, 0, 0],
    shinR: [2.35, 0, 0],
    footL: [-0.55, -0.2, -0.3],
    footR: [-0.55, 0.2, 0.3],
    grip: [0.3, 0.8],
  },
  umpire: {
    hp: [0, -0.33, -0.02],
    spine: [0.55, 0, 0],
    chest: [0.1, 0, 0],
    neck: [-0.45, 0, 0],
    head: [-0.3, 0, 0],
    upperArmL: [-0.45, -0.1, 0.25],
    upperArmR: [-0.45, 0.1, -0.25],
    foreArmL: [-0.35, 0, 0],
    foreArmR: [-0.35, 0, 0],
    thighL: [-0.8, 0.2, 0.33],
    thighR: [-0.8, -0.2, -0.33],
    shinL: [1.05, 0, 0],
    shinR: [1.05, 0, 0],
    footL: [-0.25, -0.2, -0.3],
    footR: [-0.25, 0.2, 0.3],
    grip: [0.6, 0.6],
  },
  batStance: {
    hp: [-0.03, -0.1, -0.02],
    hips: [0, -0.12, 0],
    spine: [0.22, -0.05, 0.04],
    chest: [0.04, -0.2, 0],
    neck: [0, 0.55, 0],
    head: [0.08, 0.62, 0.05],
    thighL: [-0.24, 0.2, 0.3],
    thighR: [-0.28, 0.15, -0.28],
    shinL: [0.45, 0, 0],
    shinR: [0.48, 0, 0],
    footL: [-0.2, 0.25, -0.28],
    footR: [-0.18, 0.2, 0.28],
    grip: [1, 1],
  },
  bunt: {
    hp: [0.02, -0.22, 0],
    hips: [0, 0.95, 0],
    spine: [0.35, 0, 0],
    chest: [0.05, 0.3, 0],
    neck: [-0.1, 0.1, 0],
    head: [-0.1, 0.15, 0],
    thighL: [-0.5, -0.4, 0.2],
    thighR: [-0.55, -0.6, -0.2],
    shinL: [0.95, 0, 0],
    shinR: [0.95, 0, 0],
    footL: [-0.35, 0, -0.1],
    footR: [-0.35, 0, 0.1],
    grip: [1, 1],
  },
  pitcherSet: {
    hips: [0, -1.4, 0],
    spine: [0.06, 0, 0],
    chest: [0, 0.05, 0],
    neck: [0, 0.6, 0],
    head: [0.05, 0.65, 0],
    thighL: [-0.12, 0, 0.1],
    thighR: [-0.08, 0, -0.1],
    shinL: [0.2, 0, 0],
    shinR: [0.16, 0, 0],
    footL: [-0.08, 0, -0.1],
    footR: [-0.08, 0, 0.1],
    grip: [0.9, 0.8],
  },
};

function mirror(p) {
  const out = {};
  for (const [k, v] of Object.entries(p)) {
    if (k === 'hp') out.hp = [-v[0], v[1], v[2]];
    else if (k === 'grip') out.grip = [v[1], v[0]];
    else if (/L$/.test(k)) out[k.replace(/L$/, 'R')] = [v[0], -v[1], -v[2]];
    else if (/R$/.test(k)) out[k.replace(/R$/, 'L')] = [v[0], -v[1], -v[2]];
    else out[k] = [v[0], -v[1], -v[2]];
  }
  return out;
}

// running cycle keys (right leg forward contact first)
const runA = {
  hp: [0, -0.1, 0],
  hips: [0, -0.18, 0],
  spine: [0.3, 0.05, 0],
  chest: [0.05, 0.28, 0],
  neck: [-0.18, -0.1, 0],
  head: [-0.12, -0.1, 0],
  thighR: [-0.8, 0, -0.04],
  shinR: [0.5, 0, 0],
  footR: [-0.1, 0, 0],
  thighL: [0.55, 0, 0.05],
  shinL: [1.45, 0, 0],
  footL: [0.55, 0, 0],
  upperArmL: [-0.85, 0, 0.18],
  foreArmL: [-1.35, 0, 0],
  upperArmR: [0.75, 0, -0.18],
  foreArmR: [-1.05, 0, 0],
  handL: [0, 0, 0],
  handR: [0, 0, 0],
  grip: [0.75, 0.75],
};
const runB = {
  hp: [0, 0.04, 0],
  hips: [0, 0, 0],
  spine: [0.25, 0, 0],
  chest: [0.05, 0, 0],
  neck: [-0.15, 0, 0],
  head: [-0.12, 0, 0],
  thighR: [-0.05, 0, -0.04],
  shinR: [0.25, 0, 0],
  footR: [0.1, 0, 0],
  thighL: [-0.75, 0, 0.05],
  shinL: [2.0, 0, 0],
  footL: [0.35, 0, 0],
  upperArmL: [-0.05, 0, 0.18],
  foreArmL: [-1.3, 0, 0],
  upperArmR: [0.0, 0, -0.18],
  foreArmR: [-1.3, 0, 0],
  grip: [0.75, 0.75],
};

// Pitching delivery (RHP, root faces home plate = +Z)
const pitchSet = P.pitcherSet;

export const CLIPS = {
  tpose: { duration: 1, keys: [{ t: 0, pose: {} }] },
  idle: {
    duration: 3.2,
    loop: true,
    base: P.stand,
    keys: [
      { t: 0, pose: { chest: [-0.03, 0, 0], hp: [0, 0, 0] } },
      { t: 0.5, pose: { chest: [0.0, 0.02, 0], hp: [0, -0.008, 0], upperArmL: [0.08, 0, 0.15], upperArmR: [0.08, 0, -0.15] } },
    ],
  },
  ready: {
    duration: 1.6,
    loop: true,
    base: P.ready,
    keys: [
      { t: 0, pose: {} },
      { t: 0.5, pose: { hp: [0, -0.23, -0.04], spine: [0.45, 0, 0] } },
    ],
  },
  readyPounce: {
    duration: 0.5,
    base: P.ready,
    keys: [
      { t: 0, pose: { hp: [0, -0.1, 0] } },
      { t: 0.5, pose: { hp: [0, -0.26, 0], spine: [0.5, 0, 0] } },
      { t: 1, pose: {} },
    ],
  },
  run: {
    duration: 0.66,
    loop: true,
    keys: [
      { t: 0, pose: runA },
      { t: 0.25, pose: runB },
      { t: 0.5, pose: mirror(runA) },
      { t: 0.75, pose: mirror(runB) },
    ],
  },
  jog: {
    duration: 0.8,
    loop: true,
    keys: [
      { t: 0, pose: { ...runA, spine: [0.1, 0.03, 0], thighR: [-0.6, 0, -0.04], thighL: [0.35, 0, 0.05], shinL: [0.9, 0, 0], upperArmL: [-0.45, 0, 0.15], upperArmR: [0.4, 0, -0.15] } },
      { t: 0.25, pose: { ...runB, spine: [0.1, 0, 0], thighL: [-0.45, 0, 0.05], shinL: [1.3, 0, 0], hp: [0, 0.02, 0] } },
      { t: 0.5, pose: mirror({ ...runA, spine: [0.1, 0.03, 0], thighR: [-0.6, 0, -0.04], thighL: [0.35, 0, 0.05], shinL: [0.9, 0, 0], upperArmL: [-0.45, 0, 0.15], upperArmR: [0.4, 0, -0.15] }) },
      { t: 0.75, pose: mirror({ ...runB, spine: [0.1, 0, 0], thighL: [-0.45, 0, 0.05], shinL: [1.3, 0, 0], hp: [0, 0.02, 0] }) },
    ],
  },
  // side shuffle used by infielders creeping / leading off
  lead: {
    duration: 1.2,
    loop: true,
    base: {
      ...P.ready,
      spine: [0.35, 0, 0],
      thighL: [-0.45, 0.1, 0.4],
      thighR: [-0.45, -0.1, -0.4],
      shinL: [0.75, 0, 0],
      shinR: [0.75, 0, 0],
      footL: [-0.3, 0, -0.4],
      footR: [-0.3, 0, 0.4],
      upperArmL: [-0.2, 0, 0.35],
      upperArmR: [-0.2, 0, -0.35],
      foreArmL: [-0.5, 0, 0],
      foreArmR: [-0.5, 0, 0],
    },
    keys: [
      { t: 0, pose: {} },
      { t: 0.5, pose: { hp: [0, -0.23, 0] } },
    ],
  },
  catcher: {
    duration: 2.4,
    loop: true,
    base: P.catcher,
    keys: [
      { t: 0, pose: {} },
      { t: 0.5, pose: { hp: [0, -0.635, 0.02], chest: [-0.03, 0, 0] } },
    ],
  },
  catcherThrow: {
    duration: 0.8,
    events: [{ t: 0.5, name: 'release' }],
    keys: [
      { t: 0, pose: P.catcher },
      { t: 0.3, pose: { ...P.stand, hp: [0, -0.1, 0], hips: [0, -1.1, 0], chest: [0, -0.2, 0], neck: [0, 0.9, 0], head: [0, 0.4, 0], thighL: [-0.4, 0, 0.35], thighR: [-0.1, 0, -0.35], shinL: [0.4, 0, 0], shinR: [0.4, 0, 0] } },
      { t: 0.5, pose: { ...P.stand, hp: [0, -0.15, 0.25], hips: [0, 0.1, 0], spine: [0.35, 0, 0], chest: [0, 0.3, 0], thighL: [-0.7, 0, 0.1], shinL: [0.5, 0, 0], thighR: [0.4, 0, -0.1], shinR: [0.6, 0, 0], footR: [0.4, 0, 0] } },
      { t: 1, pose: { ...P.stand, hp: [0, -0.05, 0.3], spine: [0.3, 0, 0] } },
    ],
    ik: [
      { t: 0, R: [-0.25, 0.7, 0.35], L: [0.1, 0.75, 0.55], w: [0, 0] },
      { t: 0.2, R: [-0.15, 1.2, 0.3], L: [0.05, 1.2, 0.35], w: [1, 1] },
      { t: 0.35, R: [-0.55, 1.65, -0.25], L: [0.25, 1.35, 0.5], w: [1, 1] },
      { t: 0.5, R: [-0.3, 1.8, 0.75], L: [0.3, 1.2, 0.45], w: [1, 1] },
      { t: 0.7, R: [0.15, 0.95, 0.75], L: [0.3, 1.05, 0.35], w: [1, 1] },
      { t: 1, R: [-0.25, 0.95, 0.3], L: [0.25, 0.95, 0.3], w: [0, 0] },
    ],
  },
  umpire: {
    duration: 3,
    loop: true,
    base: P.umpire,
    keys: [
      { t: 0, pose: {} },
      { t: 0.5, pose: { hp: [0, -0.34, -0.02] } },
    ],
  },
  umpStrike: {
    duration: 1.1,
    keys: [
      { t: 0, pose: P.umpire },
      { t: 0.25, pose: { ...P.stand, hips: [0, -0.5, 0], chest: [0, -0.3, 0], hp: [0, -0.05, 0], thighL: [-0.2, 0, 0.3], thighR: [0.1, 0, -0.3], shinL: [0.3, 0, 0], neck: [0, 0.4, 0] } },
      { t: 0.45, pose: { ...P.stand, hips: [0, -0.7, 0], chest: [0, -0.6, 0], spine: [0.1, 0, -0.1], hp: [0, -0.12, 0], thighL: [-0.3, 0, 0.3], thighR: [0.1, 0, -0.35], shinL: [0.5, 0, 0], shinR: [0.2, 0, 0], neck: [0, 0.8, 0] } },
      { t: 1, pose: { ...P.stand, hips: [0, -0.3, 0] } },
    ],
    ik: [
      { t: 0, R: [-0.25, 0.9, 0.35], w: [0, 0] },
      { t: 0.25, R: [-0.6, 1.2, 0.2], w: [0, 1] },
      { t: 0.45, R: [-0.55, 1.35, -0.25], w: [0, 1] },
      { t: 0.7, R: [-0.55, 1.33, -0.22], w: [0, 1] },
      { t: 1, R: [-0.25, 0.9, 0.1], w: [0, 0] },
    ],
  },
  pitcherSet: {
    duration: 3,
    loop: true,
    base: pitchSet,
    keys: [
      { t: 0, pose: {} },
      { t: 0.5, pose: { chest: [-0.02, 0.05, 0], hp: [0, -0.01, 0] } },
    ],
    ik: [
      { t: 0, R: [-0.26, 1.2, 0.02], L: [-0.23, 1.22, 0.07], w: [1, 1] },
      { t: 0.5, R: [-0.26, 1.19, 0.02], L: [-0.23, 1.21, 0.07], w: [1, 1] },
    ],
  },
  // Full delivery, release event at 0.7
  pitch: {
    duration: 1.55,
    events: [
      { t: 0.25, name: 'legLift' },
      { t: 0.6, name: 'footStrike' },
      { t: 0.7, name: 'release' },
    ],
    keys: [
      { t: 0, pose: pitchSet },
      {
        t: 0.25,
        ease: 'inout',
        pose: {
          ...pitchSet,
          hp: [0, 0.03, -0.05],
          hips: [0, -1.65, 0],
          spine: [-0.05, 0, 0],
          chest: [0, -0.15, 0],
          neck: [0, 0.75, 0],
          head: [0, 0.8, 0],
          thighL: [-1.55, 0.2, 0.1],
          shinL: [1.75, 0, 0],
          footL: [0.5, 0, 0],
          thighR: [-0.12, 0, -0.06],
          shinR: [0.22, 0, 0],
        },
      },
      {
        t: 0.42,
        pose: {
          ...pitchSet,
          hp: [0, -0.08, 0.15],
          hips: [0, -1.35, 0],
          spine: [0.02, 0, 0.12],
          chest: [0, -0.25, 0],
          neck: [0, 0.85, 0],
          head: [0, 0.75, 0],
          thighL: [-0.7, 0, 1.0],
          shinL: [0.9, 0, 0],
          footL: [0.2, 0.3, 0],
          thighR: [-0.25, 0, -0.08],
          shinR: [0.5, 0, 0],
          footR: [-0.2, 0, 0],
        },
      },
      {
        t: 0.6,
        ease: 'in',
        pose: {
          hp: [0, -0.26, 0.55],
          hips: [0, -0.55, 0],
          spine: [0.05, 0, 0.22],
          chest: [-0.05, -0.7, 0],
          neck: [0, 0.65, 0],
          head: [0, 0.55, 0.1],
          thighL: [-1.05, 0.2, 0.6],
          shinL: [0.75, 0, 0],
          footL: [0.2, 0.3, -0.2],
          thighR: [0.35, 0.3, -0.45],
          shinR: [0.55, 0, 0],
          footR: [0.35, 0, 0],
          grip: [0.9, 0.9],
        },
      },
      {
        t: 0.7,
        ease: 'snap',
        pose: {
          hp: [0, -0.34, 0.8],
          hips: [0, 0.2, 0],
          spine: [0.45, 0, -0.05],
          chest: [0.15, 0.45, 0],
          neck: [-0.35, -0.2, 0],
          head: [-0.25, -0.2, 0],
          thighL: [-1.2, 0.0, 0.2],
          shinL: [0.8, 0, 0],
          footL: [0.4, 0, 0],
          thighR: [0.65, 0.2, -0.2],
          shinR: [0.6, 0, 0],
          footR: [0.8, 0, 0],
          grip: [1, 0.3],
        },
      },
      {
        t: 0.82,
        ease: 'out',
        pose: {
          hp: [0, -0.3, 0.9],
          hips: [0, 0.55, 0],
          spine: [0.85, 0, 0],
          chest: [0.15, 0.4, 0],
          neck: [-0.7, -0.2, 0],
          head: [-0.4, -0.3, 0],
          thighL: [-1.25, 0.2, 0.2],
          shinL: [1.0, 0, 0],
          footL: [0.3, 0, 0],
          thighR: [1.1, 0.4, -0.15],
          shinR: [1.3, 0, 0],
          footR: [0.8, 0, 0],
          grip: [1, 0.4],
        },
      },
      {
        t: 1,
        ease: 'inout',
        pose: {
          ...P.ready,
          hp: [0, -0.15, 0.85],
          spine: [0.35, 0, 0],
          thighR: [-0.5, -0.15, -0.35],
          thighL: [-0.5, 0.15, 0.3],
        },
      },
    ],
    ik: [
      { t: 0, R: [-0.26, 1.2, 0.02], L: [-0.23, 1.22, 0.07], w: [1, 1] },
      { t: 0.25, R: [-0.25, 1.33, 0.0], L: [-0.22, 1.35, 0.05], w: [1, 1] },
      { t: 0.42, R: [-0.3, 0.95, -0.35], L: [0.05, 1.3, 0.35], w: [1, 1] },
      { t: 0.6, R: [-0.62, 1.72, 0.05], L: [0.28, 1.4, 1.05], w: [1, 1] },
      { t: 0.7, R: [-0.3, 1.78, 1.4], L: [0.25, 1.2, 0.9], w: [1, 1] },
      { t: 0.82, R: [0.3, 0.72, 1.35], L: [0.32, 1.05, 0.75], w: [1, 1] },
      { t: 1, R: [-0.2, 0.8, 1.2], L: [0.2, 0.85, 1.25], w: [0.3, 0.3] },
    ],
    poles: [
      { t: 0, R: [-0.9, 0.9, -0.3], L: [0.8, 0.9, -0.3] },
      { t: 0.42, R: [-0.9, 1.0, -0.5], L: [0.9, 1.2, -0.2] },
      { t: 0.6, R: [-1.2, 1.0, -0.2], L: [0.9, 0.9, 0.4] },
      { t: 0.7, R: [-1.4, 1.1, 0.6], L: [0.8, 0.8, 0.5] },
      { t: 0.82, R: [-0.6, 0.8, 0.8], L: [0.9, 0.8, 0.4] },
      { t: 1, R: [-0.8, 0.8, 0.8], L: [0.8, 0.8, 0.8] },
    ],
  },
  pickoff: {
    duration: 0.8,
    events: [{ t: 0.45, name: 'release' }],
    keys: [
      { t: 0, pose: pitchSet },
      { t: 0.25, pose: { ...pitchSet, hips: [0, -0.2, 0], chest: [0, 0.4, 0], neck: [0, 0.2, 0], head: [0, 0.2, 0], thighL: [-0.4, 0, 0.5], shinL: [0.5, 0, 0] } },
      { t: 0.45, pose: { ...pitchSet, hp: [0.2, -0.1, 0], hips: [0, 0.2, 0], chest: [0, 1.0, 0], spine: [0.3, 0, 0], neck: [0, 0.2, 0], head: [0, 0, 0], thighL: [-0.5, 0, 0.8], shinL: [0.4, 0, 0] } },
      { t: 1, pose: pitchSet },
    ],
    ik: [
      { t: 0, R: [-0.26, 1.2, 0.02], L: [-0.23, 1.22, 0.07], w: [1, 1] },
      { t: 0.25, R: [-0.35, 1.5, -0.3], L: [0.3, 1.3, 0.1], w: [1, 1] },
      { t: 0.45, R: [0.3, 1.6, 0.6], L: [0.3, 1.1, -0.1], w: [1, 1] },
      { t: 1, R: [-0.26, 1.2, 0.02], L: [-0.23, 1.22, 0.07], w: [1, 1] },
    ],
  },
  throw: {
    duration: 0.75,
    events: [{ t: 0.5, name: 'release' }],
    keys: [
      { t: 0, pose: { ...P.stand, hp: [0, -0.1, 0], spine: [0.2, 0, 0] } },
      { t: 0.3, pose: { ...P.stand, hp: [0, -0.1, -0.05], hips: [0, -1.1, 0], spine: [0.0, 0, 0.1], chest: [0, -0.3, 0], neck: [0, 0.7, 0], head: [0, 0.65, 0], thighL: [-0.4, 0, 0.35], shinL: [0.35, 0, 0], thighR: [-0.1, 0, -0.3], shinR: [0.35, 0, 0] } },
      { t: 0.5, ease: 'snap', pose: { ...P.stand, hp: [0, -0.2, 0.3], hips: [0, 0.15, 0], spine: [0.45, 0, 0], chest: [0.05, 0.35, 0], neck: [-0.3, -0.1, 0], thighL: [-0.9, 0, 0.15], shinL: [0.7, 0, 0], thighR: [0.5, 0, -0.1], shinR: [0.6, 0, 0], footR: [0.6, 0, 0] } },
      { t: 0.7, pose: { ...P.stand, hp: [0, -0.18, 0.35], hips: [0, 0.4, 0], spine: [0.65, 0, 0], chest: [0.1, 0.3, 0], thighL: [-0.9, 0, 0.15], shinL: [0.8, 0, 0], thighR: [0.8, 0, -0.1], shinR: [0.9, 0, 0], footR: [0.6, 0, 0] } },
      { t: 1, pose: { ...P.ready, hp: [0, -0.1, 0.35], spine: [0.3, 0, 0] } },
    ],
    ik: [
      { t: 0, R: [-0.15, 1.1, 0.3], L: [0.05, 1.12, 0.33], w: [0.6, 0.6] },
      { t: 0.3, R: [-0.6, 1.62, -0.35], L: [0.25, 1.4, 0.4], w: [1, 1] },
      { t: 0.5, R: [-0.3, 1.75, 0.95], L: [0.3, 1.15, 0.3], w: [1, 1] },
      { t: 0.7, R: [0.2, 0.9, 0.85], L: [0.32, 1.0, 0.25], w: [1, 1] },
      { t: 1, R: [-0.2, 0.9, 0.6], L: [0.2, 0.9, 0.6], w: [0, 0] },
    ],
  },
  toss: {
    duration: 0.6,
    events: [{ t: 0.45, name: 'release' }],
    keys: [
      { t: 0, pose: P.stand },
      { t: 0.45, pose: { ...P.stand, spine: [0.15, 0, 0] } },
      { t: 1, pose: P.stand },
    ],
    ik: [
      { t: 0, R: [-0.25, 1.0, 0.2], w: [0, 0.6] },
      { t: 0.25, R: [-0.3, 1.1, -0.15], w: [0, 1] },
      { t: 0.45, R: [-0.2, 1.4, 0.45], w: [0, 1] },
      { t: 1, R: [-0.2, 0.9, 0.2], w: [0, 0] },
    ],
  },
  dive: {
    duration: 1.4,
    keys: [
      { t: 0, pose: { ...P.ready, hp: [0, -0.3, 0] } },
      { t: 0.15, pose: { ...P.stand, spine: [0.2, 0, 0], upperArmL: [-2.8, 0, 0.1], upperArmR: [-2.6, 0, -0.1], foreArmL: [-0.1, 0, 0], foreArmR: [-0.2, 0, 0], thighL: [0.3, 0, 0.1], thighR: [0.5, 0, -0.1], shinL: [0.4, 0, 0], shinR: [0.9, 0, 0], footL: [0.8, 0, 0], footR: [0.8, 0, 0], neck: [-0.6, 0, 0], head: [-0.5, 0, 0] } },
      { t: 0.7, pose: { ...P.stand, spine: [-0.1, 0, 0], upperArmL: [-2.9, 0, 0.15], upperArmR: [-2.6, 0, -0.2], foreArmL: [-0.1, 0, 0], foreArmR: [-0.3, 0, 0], thighL: [0.1, 0, 0.1], thighR: [0.5, 0, -0.1], shinL: [0.6, 0, 0], shinR: [1.2, 0, 0], footL: [0.8, 0, 0], footR: [0.8, 0, 0], neck: [-0.8, 0, 0], head: [-0.4, 0, 0] } },
      { t: 1, pose: { ...P.stand, spine: [-0.1, 0, 0], upperArmL: [-2.6, 0, 0.3], upperArmR: [-2.2, 0, -0.4], foreArmL: [-0.4, 0, 0], foreArmR: [-0.6, 0, 0], thighL: [0.0, 0, 0.1], thighR: [0.3, 0, -0.2], shinL: [0.8, 0, 0], shinR: [1.4, 0, 0], neck: [-0.8, 0, 0], head: [-0.4, 0, 0] } },
    ],
  },
  // feet-first slide; the game tilts the root back ~65 degrees while this plays
  slide: {
    duration: 1.1,
    keys: [
      { t: 0, pose: runB },
      { t: 0.18, pose: { ...P.stand, hp: [0, 0.05, 0], spine: [0.15, 0, 0.1], chest: [0.1, 0, 0], neck: [0.7, 0, 0], head: [0.3, 0, 0], thighL: [-0.25, 0, 0.05], shinL: [0.1, 0, 0], footL: [-0.4, 0, 0], thighR: [-0.75, 0.3, -0.15], shinR: [1.9, 0, 0], footR: [0.4, 0, 0], upperArmL: [-2.2, 0, 0.7], upperArmR: [-2.3, 0, -0.6], foreArmL: [-0.6, 0, 0], foreArmR: [-0.5, 0, 0], grip: [0.2, 0.2] } },
      { t: 1, pose: { ...P.stand, hp: [0, 0.05, 0], spine: [0.25, 0, 0.1], chest: [0.1, 0, 0], neck: [0.7, 0, 0], head: [0.3, 0, 0], thighL: [-0.25, 0, 0.05], shinL: [0.1, 0, 0], footL: [-0.4, 0, 0], thighR: [-0.75, 0.3, -0.15], shinR: [1.9, 0, 0], footR: [0.4, 0, 0], upperArmL: [-1.9, 0, 0.9], upperArmR: [-2.0, 0, -0.8], foreArmL: [-0.8, 0, 0], foreArmR: [-0.8, 0, 0], grip: [0.2, 0.2] } },
    ],
  },
  scoop: {
    duration: 1,
    loop: true,
    base: { ...P.ready, hp: [0, -0.42, -0.1], spine: [0.95, 0, 0], chest: [0.15, 0, 0], neck: [-0.8, 0, 0], head: [-0.4, 0, 0], thighL: [-1.2, 0.2, 0.42], thighR: [-1.2, -0.2, -0.42], shinL: [1.55, 0, 0], shinR: [1.55, 0, 0], footL: [-0.35, -0.2, -0.3], footR: [-0.35, 0.2, 0.3] },
    keys: [{ t: 0, pose: {} }],
  },
  jumpCatch: {
    duration: 0.9,
    keys: [
      { t: 0, pose: { ...P.ready, hp: [0, -0.3, 0] } },
      { t: 0.25, pose: { ...P.stand, spine: [-0.1, 0, 0], chest: [-0.15, 0, 0], neck: [0.4, 0, 0], thighL: [-1.2, 0, 0.1], shinL: [1.6, 0, 0], thighR: [-0.2, 0, -0.1], shinR: [0.8, 0, 0], upperArmR: [-0.4, 0, -0.8], footL: [0.5, 0, 0], footR: [0.6, 0, 0] } },
      { t: 0.7, pose: { ...P.stand, spine: [0.05, 0, 0], thighL: [-0.4, 0, 0.1], shinL: [0.7, 0, 0], thighR: [-0.4, 0, -0.1], shinR: [0.7, 0, 0], hp: [0, -0.15, 0] } },
      { t: 1, pose: P.stand },
    ],
  },
  tagDown: {
    duration: 1,
    loop: true,
    base: { ...P.ready, hp: [0, -0.35, 0], spine: [0.75, 0, 0], thighL: [-1.0, 0.2, 0.45], thighR: [-0.6, -0.2, -0.45], shinL: [1.3, 0, 0], shinR: [1.0, 0, 0] },
    keys: [{ t: 0, pose: {} }],
  },
  walk: {
    duration: 1.1,
    loop: true,
    keys: [
      { t: 0, pose: { ...P.stand, thighR: [-0.4, 0, -0.05], shinR: [0.1, 0, 0], thighL: [0.3, 0, 0.05], shinL: [0.3, 0, 0], footL: [0.3, 0, 0], upperArmL: [-0.3, 0, 0.12], upperArmR: [0.3, 0, -0.12], hips: [0, -0.08, 0], chest: [0, 0.1, 0] } },
      { t: 0.25, pose: { ...P.stand, thighL: [-0.3, 0, 0.05], shinL: [0.9, 0, 0], hp: [0, 0.02, 0] } },
      { t: 0.5, pose: { ...P.stand, thighL: [-0.4, 0, 0.05], shinL: [0.1, 0, 0], thighR: [0.3, 0, -0.05], shinR: [0.3, 0, 0], footR: [0.3, 0, 0], upperArmR: [-0.3, 0, -0.12], upperArmL: [0.3, 0, 0.12], hips: [0, 0.08, 0], chest: [0, -0.1, 0] } },
      { t: 0.75, pose: { ...P.stand, thighR: [-0.3, 0, -0.05], shinR: [0.9, 0, 0], hp: [0, 0.02, 0] } },
    ],
  },
  celebrate: {
    duration: 1.2,
    loop: true,
    base: P.stand,
    keys: [
      { t: 0, pose: { upperArmL: [-0.2, 0, 2.6], upperArmR: [-0.2, 0, -2.6], foreArmL: [-0.4, 0, 0], foreArmR: [-0.4, 0, 0], grip: [1, 1], chest: [-0.15, 0, 0], neck: [0.25, 0, 0], hp: [0, 0.02, 0] } },
      { t: 0.5, pose: { upperArmL: [-0.4, 0, 2.2], upperArmR: [-0.4, 0, -2.2], foreArmL: [-1.4, 0, 0], foreArmR: [-1.4, 0, 0], grip: [1, 1], chest: [-0.05, 0, 0], neck: [0.1, 0, 0], hp: [0, -0.06, 0], thighL: [-0.3, 0, 0.05], shinL: [0.5, 0, 0] } },
    ],
  },
  fistPump: {
    duration: 0.9,
    base: P.stand,
    keys: [
      { t: 0, pose: {} },
      { t: 0.35, pose: { upperArmR: [-0.3, 0, -1.2], foreArmR: [-2.2, 0, 0], grip: [0.3, 1], chest: [-0.15, 0.2, 0], hp: [0, -0.05, 0], thighR: [-0.35, 0, -0.05], shinR: [0.6, 0, 0] } },
      { t: 0.6, pose: { upperArmR: [-0.1, 0, -0.6], foreArmR: [-2.4, 0, 0], grip: [0.3, 1], chest: [0.15, 0.1, 0], hp: [0, -0.1, 0], thighR: [-0.5, 0, -0.05], shinR: [0.9, 0, 0], spine: [0.25, 0, 0] } },
      { t: 1, pose: {} },
    ],
  },
  dejected: {
    duration: 2.0,
    loop: true,
    base: { ...P.stand, spine: [0.25, 0, 0], neck: [0.35, 0, 0], head: [0.3, 0, 0], upperArmL: [0.1, 0, 0.05], upperArmR: [0.1, 0, -0.05], foreArmL: [-0.05, 0, 0], foreArmR: [-0.05, 0, 0] },
    keys: [{ t: 0, pose: {} }, { t: 0.5, pose: { head: [0.4, 0.2, 0] } }],
  },
  cheer: {
    duration: 0.9,
    loop: true,
    base: P.stand,
    keys: [
      { t: 0, pose: { upperArmL: [-0.2, 0, 2.7], upperArmR: [0.1, 0, -0.6], foreArmL: [-0.2, 0, 0], foreArmR: [-1.4, 0, 0], hips: [0, 0.2, 0.08], chest: [0, -0.15, -0.08], thighL: [-0.4, 0, 0.15], shinL: [0.7, 0, 0], hp: [0.03, -0.03, 0] } },
      { t: 0.25, pose: { upperArmL: [-0.6, 0, 1.6], upperArmR: [-0.6, 0, -1.6], foreArmL: [-0.5, 0, 0], foreArmR: [-0.5, 0, 0], hp: [0, -0.1, 0], thighL: [-0.3, 0, 0.2], thighR: [-0.3, 0, -0.2], shinL: [0.6, 0, 0], shinR: [0.6, 0, 0] } },
      { t: 0.5, pose: { upperArmR: [-0.2, 0, -2.7], upperArmL: [0.1, 0, 0.6], foreArmR: [-0.2, 0, 0], foreArmL: [-1.4, 0, 0], hips: [0, -0.2, -0.08], chest: [0, 0.15, 0.08], thighR: [-0.4, 0, -0.15], shinR: [0.7, 0, 0], hp: [-0.03, -0.03, 0] } },
      { t: 0.75, pose: { upperArmL: [-2.8, 0, 0.3], upperArmR: [-2.8, 0, -0.3], foreArmL: [-0.2, 0, 0], foreArmR: [-0.2, 0, 0], hp: [0, 0.05, 0], chest: [-0.15, 0, 0] } },
    ],
  },
  batStance: {
    duration: 2.2,
    loop: true,
    base: P.batStance,
    keys: [
      { t: 0, pose: {} },
      { t: 0.5, pose: { hp: [-0.035, -0.11, -0.02], chest: [0.05, -0.23, 0] } },
    ],
  },
  // body motion for a swing; the bat & hands are driven procedurally
  swing: {
    duration: 0.62,
    keys: [
      { t: 0, pose: { ...P.batStance, hp: [-0.08, -0.08, -0.02], hips: [0, -0.3, 0], chest: [0.04, -0.35, 0], thighL: [-0.55, 0.2, 0.18], shinL: [0.85, 0, 0], footL: [0.1, 0.2, -0.1] } },
      { t: 0.18, ease: 'in', pose: { ...P.batStance, hp: [0.02, -0.14, 0], hips: [0, 0.1, 0], chest: [0.05, -0.35, 0], thighL: [-0.2, 0.2, 0.42], shinL: [0.2, 0, 0], footL: [-0.1, 0.3, -0.35], thighR: [-0.3, 0.2, -0.28], shinR: [0.6, 0, 0], footR: [-0.1, 0.1, 0.25] } },
      { t: 0.33, ease: 'snap', pose: { ...P.batStance, hp: [0.08, -0.14, 0], hips: [0, 0.95, 0], spine: [0.3, 0, -0.1], chest: [0.02, 0.35, 0], neck: [0, -0.2, 0], head: [0.05, -0.3, 0], thighL: [-0.1, -0.5, 0.4], shinL: [0.1, 0, 0], footL: [-0.1, -0.4, -0.3], thighR: [-0.35, -0.5, -0.15], shinR: [0.85, 0, 0], footR: [0.45, -0.5, 0.1] } },
      { t: 0.55, ease: 'out', pose: { ...P.batStance, hp: [0.1, -0.1, 0], hips: [0, 1.35, 0], spine: [0.18, 0, -0.1], chest: [-0.05, 0.55, 0], neck: [0, -0.5, 0], head: [0.05, -0.4, 0], thighL: [-0.05, -0.9, 0.35], shinL: [0.1, 0, 0], footL: [-0.1, -0.7, -0.2], thighR: [-0.2, -1.0, -0.05], shinR: [0.7, 0, 0], footR: [0.9, -0.3, 0] } },
      { t: 1, pose: { ...P.batStance, hp: [0.1, -0.06, 0], hips: [0, 1.45, 0], spine: [0.08, 0, -0.05], chest: [-0.05, 0.55, 0], neck: [0, -0.5, 0], head: [0, -0.4, 0], thighL: [-0.05, -1.0, 0.3], shinL: [0.1, 0, 0], footL: [-0.1, -0.8, -0.2], thighR: [-0.15, -1.1, -0.05], shinR: [0.6, 0, 0], footR: [1.0, -0.3, 0] } },
    ],
  },
  buntPose: {
    duration: 2,
    loop: true,
    base: P.bunt,
    keys: [{ t: 0, pose: {} }, { t: 0.5, pose: { hp: [0.02, -0.23, 0] } }],
  },
};

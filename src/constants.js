import * as THREE from 'three';

// World units are metres. Home plate at the origin, pitcher toward +Z.
// First base is on the -X side, third base on the +X side.
export const BASE_DIST = 27.43;
const D = BASE_DIST / Math.SQRT2;

export const BASES = [
  new THREE.Vector3(0, 0, 0), // home
  new THREE.Vector3(-D, 0, D), // 1B
  new THREE.Vector3(0, 0, 2 * D), // 2B
  new THREE.Vector3(D, 0, D), // 3B
];

export const MOUND = new THREE.Vector3(0, 0.25, 18.44);
export const MOUND_H = 0.25;
export const RUBBER_Z = 18.44;

export const GRAVITY = 9.8;
export const BALL_R = 0.037;

// Strike zone (world, at the front of the plate)
export const ZONE = {
  x0: -0.25,
  x1: 0.25,
  y0: 0.5,
  y1: 1.12,
  z: 0.3,
};

// Fence: distance from home as function of spray angle (0 = centre field)
export function fenceDistance(phi) {
  const a = Math.abs(phi);
  return 99 + 23 * Math.pow(Math.cos(Math.min(a, Math.PI / 4) * 2), 1.3);
}
export const WALL_H = 3.2;

export function sprayAngle(x, z) {
  return Math.atan2(x, z);
}

export function isFair(x, z) {
  return z >= -0.2 && Math.abs(x) <= z + 0.2;
}

export const FIELD_POS = {
  P: new THREE.Vector3(0, MOUND_H, 18.2),
  C: new THREE.Vector3(0, 0, -1.05),
  '1B': new THREE.Vector3(-19.5, 0, 24.5),
  '2B': new THREE.Vector3(-9.5, 0, 35.5),
  SS: new THREE.Vector3(9.0, 0, 35.5),
  '3B': new THREE.Vector3(19.5, 0, 24.5),
  LF: new THREE.Vector3(29, 0, 74),
  CF: new THREE.Vector3(0, 0, 87),
  RF: new THREE.Vector3(-29, 0, 74),
};
export const POS_ORDER = ['P', 'C', '1B', '2B', 'SS', '3B', 'LF', 'CF', 'RF'];
export const POS_KO = {
  P: '투수', C: '포수', '1B': '1루수', '2B': '2루수', SS: '유격수', '3B': '3루수', LF: '좌익수', CF: '중견수', RF: '우익수',
};

export const TEAMS = [
  {
    id: 'phoenix',
    name: '서울 피닉스',
    en: 'SEOUL PHOENIX',
    short: 'SEO',
    primary: 0xd81e3a,
    secondary: 0x14213d,
    accent: 0xffc93c,
    pants: 0xf4f1ea,
    skin: [0xf1c8a5, 0xe9b894, 0xd9a47c],
    cheer: '가자 피닉스! 승리를 향해!',
    players: ['김태양', '이도윤', '박한결', '최민재', '정우진', '강서준', '윤지호', '한승우', '오세훈'],
  },
  {
    id: 'comets',
    name: '뉴욕 코메츠',
    en: 'NEW YORK COMETS',
    short: 'NYC',
    primary: 0x1f4fd1,
    secondary: 0xf2f2f2,
    accent: 0xff8a1f,
    pants: 0xdfe4ee,
    skin: [0xf3cfb3, 0xc58c63, 0x8d5a3b],
    cheer: "LET'S GO COMETS!",
    players: ['J. Rivera', 'M. Carter', 'D. Okafor', 'T. Walsh', 'K. Sato', 'L. Moreno', 'B. Hughes', 'A. Petrov', 'C. Diaz'],
  },
];

// Pitch catalogue. brk = constant acceleration (m/s^2) in pitcher-arm space:
// x: + toward the pitcher's arm side (for RHP that's -X world, 1B side... see game code), y: vertical extra.
// late: exponent that pushes the break toward the end of the flight.
export const PITCHES = [
  { id: 'FF', key: '1', name: '포심 패스트볼', en: '4-Seam', speed: 150, brk: [2.0, 5.5], late: 1, color: 0xffffff },
  { id: 'SI', key: '2', name: '싱커', en: 'Sinker', speed: 146, brk: [7.0, -3.5], late: 1.4, color: 0x9ad7ff },
  { id: 'FC', key: '3', name: '커터', en: 'Cutter', speed: 142, brk: [-4.5, 1.5], late: 1.8, color: 0xc0ffda },
  { id: 'SL', key: '4', name: '슬라이더', en: 'Slider', speed: 136, brk: [-11, -3], late: 1.5, color: 0x7dffb0 },
  { id: 'SW', key: '5', name: '스위퍼', en: 'Sweeper', speed: 131, brk: [-19, -2], late: 1.2, color: 0x6ef0ff },
  { id: 'CU', key: '6', name: '커브', en: 'Curve', speed: 122, brk: [-6, -17], late: 1.1, color: 0xffe06e },
  { id: 'CH', key: '7', name: '체인지업', en: 'Changeup', speed: 132, brk: [7.5, -8], late: 1.6, color: 0xffa6d8 },
  { id: 'FS', key: '8', name: '포크볼', en: 'Splitter', speed: 136, brk: [2.5, -14], late: 3.0, color: 0xd6a6ff },
  { id: 'KN', key: '9', name: '너클볼', en: 'Knuckle', speed: 112, brk: [0, -5], late: 1, knuckle: true, color: 0xeeeeee },
];

export const SPECIAL_PITCHES = [
  { id: 'SP_FIRE', key: 'Q', name: '블레이즈 라이징', en: 'BLAZE RISING', speed: 172, brk: [1.0, 9.5], late: 1, color: 0xff6a00, special: 'fire', cost: 100 },
  { id: 'SP_PHANTOM', key: 'W', name: '팬텀 포크', en: 'PHANTOM FORK', speed: 146, brk: [3.0, -23], late: 4.0, color: 0xb05cff, special: 'phantom', cost: 100 },
  { id: 'SP_THUNDER', key: 'R', name: '뇌신 스위퍼', en: 'THUNDER SWEEPER', speed: 150, brk: [-32, -3], late: 1.6, color: 0x57d8ff, special: 'thunder', cost: 100 },
];

export const INNINGS = 3;

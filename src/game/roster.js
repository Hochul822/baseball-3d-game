import { TEAMS, PITCHES } from '../constants.js';

let seed = 1234;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const ri = (a, b) => Math.round(a + rnd() * (b - a));

const HAIR = [0x1a1410, 0x2d1e14, 0x3b2616, 0x111111, 0x6b4a2a, 0xc9a25a];

export function buildRoster(teamIdx) {
  const def = TEAMS[teamIdx];
  seed = 1234 + teamIdx * 97;
  const batters = def.players.map((name, i) => {
    const slugger = i === 2 || i === 3 || i === 4;
    const leadoff = i === 0 || i === 1;
    const power = slugger ? ri(78, 95) : leadoff ? ri(45, 62) : ri(55, 75);
    const contact = leadoff ? ri(75, 92) : slugger ? ri(62, 80) : ri(58, 76);
    const speed = leadoff ? ri(78, 95) : slugger ? ri(40, 60) : ri(50, 75);
    return {
      name,
      number: [7, 2, 34, 25, 52, 10, 17, 44, 9][i] + teamIdx * 3,
      order: i + 1,
      power,
      contact,
      speed,
      eye: ri(50, 90),
      avg: 0.24 + contact / 1000 + rnd() * 0.03,
      hr: Math.round(power / 4 + rnd() * 8),
      skin: def.skin[i % def.skin.length],
      hair: HAIR[ri(0, HAIR.length - 1)],
      width: slugger ? 1.1 : leadoff ? 0.95 : 1.0,
      hits: 0,
      ab: 0,
    };
  });
  const pitcher = {
    name: teamIdx === 0 ? '류현석' : 'R. Kershaw-Lee',
    number: teamIdx === 0 ? 99 : 22,
    velo: teamIdx === 0 ? 152 : 155,
    control: teamIdx === 0 ? 82 : 78,
    stamina: 100,
    pitchCount: 0,
    arsenal: teamIdx === 0 ? ['FF', 'SL', 'CU', 'CH', 'FS', 'SI'] : ['FF', 'SW', 'FC', 'CU', 'CH', 'SI'],
    skin: def.skin[0],
    hair: HAIR[0],
  };
  const fielderNames = ['박준혁', '이상민', '최강', '한동훈', '김민수', '오지환', '나성범', '양현종', '손아섭'];
  return { def, idx: teamIdx, batters, pitcher, next: 0, fielderNames };
}

export function pitchById(id) {
  return PITCHES.find((p) => p.id === id);
}

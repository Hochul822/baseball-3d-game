import { TEAMS, PITCHES, SPECIAL_PITCHES } from '../constants.js';

const hex = (n) => '#' + n.toString(16).padStart(6, '0');
const el = (tag, cls, html) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
};

export class HUD {
  constructor(root) {
    this.root = root;
    this.layers = {};
    this.msgTimer = null;
    this.logItems = [];
  }

  clear() {
    this.root.innerHTML = '';
    this.layers = {};
  }

  // ------------------------------------------------------------------ title
  showTitle(onStart) {
    this.clear();
    const ov = el('div', 'overlay');
    ov.innerHTML = `
      <div class="logo"><span class="k">K-MAJOR</span><span class="b">BASEBALL</span></div>
      <div class="tagline">MLB × KBO  ·  TOON STADIUM  ·  SPECIAL SKILLS</div>
      <div class="opts">
        <div class="opt"><h4>내 팀 (홈)</h4><div class="choices" data-k="team">
          ${TEAMS.map((t, i) => `<button data-v="${i}" class="${i === 0 ? 'sel' : ''}"><span class="teamchip" style="background:${hex(t.primary)}"></span>${t.name}</button>`).join('')}
        </div></div>
        <div class="opt"><h4>이닝</h4><div class="choices" data-k="innings">
          ${[1, 3, 5, 9].map((n) => `<button data-v="${n}" class="${n === 3 ? 'sel' : ''}">${n}회</button>`).join('')}
        </div></div>
        <div class="opt"><h4>난이도</h4><div class="choices" data-k="diff">
          ${[['easy', '루키'], ['normal', '프로'], ['hard', '레전드']].map(([v, l]) => `<button data-v="${v}" class="${v === 'normal' ? 'sel' : ''}">${l}</button>`).join('')}
        </div></div>
      </div>
      <button class="start">PLAY BALL!</button>
      <div class="help">
        <div><h5>⚾ 타격 (내 팀 공격)</h5>
          <p><kbd>마우스</kbd>/<kbd>WASD</kbd> 컨택 커서 이동</p>
          <p><kbd>클릭</kbd>/<kbd>Space</kbd> 스윙 · <kbd>Shift</kbd>+스윙 = 파워 · <kbd>C</kbd> 컨택 모드</p>
          <p><kbd>B</kbd> 번트 자세 · <kbd>E</kbd> 필살 「드래곤 드라이브」 · <kbd>T</kbd> 필살 「섬광 일섬」</p>
          <p><kbd>S</kbd> 도루 · <kbd>G</kbd> 필살 「질풍 도루」</p></div>
        <div><h5>🔥 투구 (내 팀 수비)</h5>
          <p><kbd>1</kbd>~<kbd>9</kbd> 구종 선택 · <kbd>Q</kbd><kbd>W</kbd><kbd>R</kbd> 필살 마구</p>
          <p><kbd>마우스</kbd>/<kbd>WASD</kbd> 코스 조준</p>
          <p><kbd>클릭</kbd>/<kbd>Space</kbd> 1회: 게이지 시작 → 2회: 노란 구간에서 멈추기</p>
          <p><kbd>P</kbd> 1루 견제 · 수비는 자동 (다이빙·점프캐치·병살)</p></div>
      </div>`;
    const opts = { team: 0, innings: 3, diff: 'normal' };
    ov.querySelectorAll('.choices').forEach((c) => {
      c.addEventListener('click', (e) => {
        const b = e.target.closest('button');
        if (!b) return;
        c.querySelectorAll('button').forEach((x) => x.classList.remove('sel'));
        b.classList.add('sel');
        const k = c.dataset.k;
        opts[k] = k === 'diff' ? b.dataset.v : Number(b.dataset.v);
      });
    });
    ov.querySelector('.start').addEventListener('click', () => onStart(opts));
    this.root.appendChild(ov);
    this.layers.title = ov;
  }

  // ------------------------------------------------------------------ in-game layout
  buildGame(teams) {
    this.clear();
    this.teams = teams;
    const sb = el('div', 'scorebug');
    sb.innerHTML = `
      <div class="teams">
        <div class="row r0"><div class="chip" style="background:${hex(teams[0].primary)}"></div><div class="nm">${teams[0].short}</div><div class="sc">0</div></div>
        <div class="row r1"><div class="chip" style="background:${hex(teams[1].primary)}"></div><div class="nm">${teams[1].short}</div><div class="sc">0</div></div>
      </div>
      <div class="state">
        <div class="inn"><span class="arrow">▲</span><span class="n">1</span><div class="bases"><i class="b3"></i><i class="b2"></i><i class="b1"></i></div></div>
        <div class="bso"><span class="ball">B <b></b><b></b><b></b></span><span class="strike">S <b></b><b></b></span><span class="out">O <b></b><b></b></span></div>
      </div>`;
    this.root.appendChild(sb);
    this.layers.sb = sb;
    const lc = el('div', 'card left');
    const rc = el('div', 'card right');
    this.root.appendChild(lc);
    this.root.appendChild(rc);
    this.layers.lc = lc;
    this.layers.rc = rc;
    const g = el('div', 'gauge', `<div class="lbl">SKILL</div><div class="fill" style="height:0%"></div><div class="ready">필살 READY!</div>`);
    this.root.appendChild(g);
    this.layers.gauge = g;
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'zone');
    this.root.appendChild(svg);
    this.layers.svg = svg;
    const pci = el('div', 'pci', `<div class="ring"></div><div class="dotc"></div>`);
    pci.style.display = 'none';
    this.root.appendChild(pci);
    this.layers.pci = pci;
    const tgt = el('div', 'target', '<div class="c"></div>');
    tgt.style.display = 'none';
    this.root.appendChild(tgt);
    this.layers.target = tgt;
    const hm = el('div', 'hintmark');
    hm.style.opacity = 0;
    this.root.appendChild(hm);
    this.layers.hintmark = hm;
    const bottom = el('div', '');
    this.root.appendChild(bottom);
    this.layers.bottom = bottom;
    const hint = el('div', 'hint', '');
    this.root.appendChild(hint);
    this.layers.hint = hint;
    const log = el('div', 'log');
    this.root.appendChild(log);
    this.layers.log = log;
    const pinfo = el('div', 'pitchinfo', '<div class="spd"></div><div class="typ"></div>');
    pinfo.style.display = 'none';
    this.root.appendChild(pinfo);
    this.layers.pinfo = pinfo;
    const msg = el('div', 'msg');
    this.root.appendChild(msg);
    this.layers.msg = msg;
    const cut = el('div', 'cutin');
    this.root.appendChild(cut);
    this.layers.cut = cut;
    const fb = el('div', 'fade-black');
    this.root.appendChild(fb);
    this.layers.fade = fb;
    const mute = el('button', 'btn-mute interactive', '🔊');
    this.root.appendChild(mute);
    this.layers.mute = mute;
  }

  setScore(s) {
    const sb = this.layers.sb;
    if (!sb) return;
    sb.querySelector('.r0 .sc').textContent = s.score[0];
    sb.querySelector('.r1 .sc').textContent = s.score[1];
    sb.querySelector('.r0').classList.toggle('bat', s.half === 0);
    sb.querySelector('.r1').classList.toggle('bat', s.half === 1);
    sb.querySelector('.arrow').textContent = s.half === 0 ? '▲' : '▼';
    sb.querySelector('.inn .n').textContent = s.inning;
    ['b1', 'b2', 'b3'].forEach((b, i) => sb.querySelector('.' + b).classList.toggle('on', !!s.bases[i + 1]));
    const set = (cls, n) => sb.querySelectorAll(`.${cls} b`).forEach((b, i) => b.classList.toggle('on', i < n));
    set('ball', s.balls);
    set('strike', s.strikes);
    set('out', s.outs);
  }

  setMatchup(batter, pitcher, batTeam, pitTeam) {
    const { lc, rc } = this.layers;
    if (!lc) return;
    lc.style.borderLeftColor = hex(batTeam.primary);
    rc.style.borderRightColor = hex(pitTeam.primary);
    lc.innerHTML = `<div class="role">AT BAT · ${batter.order}번 타자</div><div class="name">${batter.name}</div><div class="stats">타율 .${String(Math.round(batter.avg * 1000)).padStart(3, '0')} · HR ${batter.hr} · 파워 ${batter.power} · 컨택 ${batter.contact}</div><div class="num">${batter.number}</div>`;
    rc.innerHTML = `<div class="role">PITCHER · 투구수 ${pitcher.pitchCount}</div><div class="name">${pitcher.name}</div><div class="stats">구속 ${pitcher.velo} · 제구 ${pitcher.control} · 스태미나 ${Math.round(pitcher.stamina)}</div><div class="num">${pitcher.number}</div>`;
  }

  setGauge(v, label = 'SKILL') {
    const g = this.layers.gauge;
    if (!g) return;
    g.querySelector('.fill').style.height = Math.min(100, v) + '%';
    g.classList.toggle('full', v >= 100);
    g.querySelector('.lbl').textContent = label;
  }

  hint(text) {
    if (this.layers.hint) this.layers.hint.innerHTML = text || '';
  }

  log(text) {
    const l = this.layers.log;
    if (!l) return;
    const d = el('div', '', text);
    l.prepend(d);
    while (l.children.length > 5) l.lastChild.remove();
    setTimeout(() => d.style.opacity = '0.55', 6000);
  }

  message(big, sub = '', cls = '', dur = 1.6) {
    const m = this.layers.msg;
    if (!m) return;
    clearTimeout(this.msgTimer);
    clearTimeout(this.msgTimer2);
    m.className = 'msg';
    void m.offsetWidth;
    m.className = 'msg pop ' + cls;
    m.innerHTML = `<div class="big">${big}</div>${sub ? `<div class="sub">${sub}</div>` : ''}`;
    this.msgTimer = setTimeout(() => {
      m.className = 'msg out ' + cls;
      this.msgTimer2 = setTimeout(() => (m.innerHTML = ''), 300);
    }, dur * 1000);
  }

  pitchInfo(kmh, name) {
    const p = this.layers.pinfo;
    if (!p) return;
    if (!kmh) {
      p.style.display = 'none';
      return;
    }
    p.style.display = 'block';
    p.querySelector('.spd').textContent = `${Math.round(kmh)} km/h`;
    p.querySelector('.typ').textContent = name;
  }

  // ------------------------------------------------------------------ control panels
  pitchMenu(selected, gauge, onPick) {
    const b = this.layers.bottom;
    b.className = 'pitchmenu interactive';
    const all = [...PITCHES, ...SPECIAL_PITCHES];
    b.innerHTML = all
      .map((p) => {
        const sp = !!p.special;
        const locked = sp && gauge < p.cost;
        return `<button data-id="${p.id}" class="${sp ? 'special' : ''} ${p.id === selected ? 'sel' : ''} ${locked ? 'locked' : ''}"><span><kbd>${p.key}</kbd><i class="dot" style="background:${hex(p.color)}"></i>${p.name}</span></button>`;
      })
      .join('');
    b.onclick = (e) => {
      const t = e.target.closest('button');
      if (t) onPick(t.dataset.id);
      e.stopPropagation();
    };
    b.onmousedown = (e) => e.stopPropagation();
  }

  actionBar(state, gauge, onAct) {
    const b = this.layers.bottom;
    b.className = 'actionbar interactive';
    const full = gauge >= 100;
    const items = [
      ['swing', 'Space', '스윙', ''],
      ['power', 'Shift', '파워', state.mode === 'power' ? 'on' : ''],
      ['contact', 'C', '컨택', state.mode === 'contact' ? 'on' : ''],
      ['bunt', 'B', '번트', state.mode === 'bunt' ? 'on' : ''],
      ['steal', 'S', '도루', state.canSteal ? '' : 'locked'],
      ['dragon', 'E', '드래곤 드라이브', 'special ' + (full ? '' : 'locked') + (state.mode === 'dragon' ? ' on' : '')],
      ['flash', 'T', '섬광 일섬', 'special ' + (full ? '' : 'locked') + (state.mode === 'flash' ? ' on' : '')],
      ['gale', 'G', '질풍 도루', 'special ' + (full && state.canSteal ? '' : 'locked')],
    ];
    b.innerHTML = items.map(([id, k, l, c]) => `<button data-id="${id}" class="${c}"><span><kbd>${k}</kbd>${l}</span></button>`).join('');
    b.onclick = (e) => {
      const t = e.target.closest('button');
      if (t) onAct(t.dataset.id);
      e.stopPropagation();
    };
    b.onmousedown = (e) => e.stopPropagation();
  }

  clearBottom() {
    const b = this.layers.bottom;
    if (!b) return;
    b.className = '';
    b.innerHTML = '';
  }

  /** zone: {x0,y0,x1,y1} screen rect; show: bool */
  drawZone(rect, show, extra = {}) {
    const svg = this.layers.svg;
    if (!svg) return;
    if (!show || !rect) {
      svg.innerHTML = '';
      return;
    }
    const { x0, y0, x1, y1 } = rect;
    const w = x1 - x0;
    const h = y1 - y0;
    let s = `<rect x="${x0}" y="${y0}" width="${w}" height="${h}" fill="rgba(255,255,255,0.04)" stroke="rgba(255,255,255,0.75)" stroke-width="2" rx="3"/>`;
    for (let i = 1; i < 3; i++) {
      s += `<line x1="${x0 + (w * i) / 3}" y1="${y0}" x2="${x0 + (w * i) / 3}" y2="${y1}" stroke="rgba(255,255,255,0.22)" stroke-width="1"/>`;
      s += `<line x1="${x0}" y1="${y0 + (h * i) / 3}" x2="${x1}" y2="${y0 + (h * i) / 3}" stroke="rgba(255,255,255,0.22)" stroke-width="1"/>`;
    }
    if (extra.marks) {
      for (const m of extra.marks) s += `<circle cx="${m.x}" cy="${m.y}" r="${m.r || 7}" fill="${m.c}" stroke="#000" stroke-width="1.5" opacity="${m.o ?? 0.9}"/>`;
    }
    svg.innerHTML = s;
  }

  cursor(kind, x, y, radiusPx, mode = '') {
    const { pci, target } = this.layers;
    if (!pci) return;
    if (kind === 'pci') {
      pci.style.display = 'block';
      target.style.display = 'none';
      pci.style.left = x + 'px';
      pci.style.top = y + 'px';
      const r = pci.querySelector('.ring');
      r.style.width = r.style.height = radiusPx * 2 + 'px';
      pci.className = 'pci ' + mode;
    } else if (kind === 'target') {
      pci.style.display = 'none';
      target.style.display = 'block';
      target.style.left = x + 'px';
      target.style.top = y + 'px';
    } else {
      pci.style.display = 'none';
      target.style.display = 'none';
    }
  }

  hintMark(x, y, show) {
    const h = this.layers.hintmark;
    if (!h) return;
    h.style.opacity = show ? 1 : 0;
    if (show) {
      h.style.left = x + 'px';
      h.style.top = y + 'px';
    }
  }

  meter(state) {
    let m = this.layers.meter;
    if (!state) {
      if (m) m.style.display = 'none';
      return;
    }
    if (!m) {
      m = el('div', 'meter', '<div class="cap">게이지를 노란 구간에서 멈추세요!</div><div class="zone-good"></div><div class="zone-perfect"></div><div class="needle"></div>');
      this.root.appendChild(m);
      this.layers.meter = m;
    }
    m.style.display = 'block';
    const good = m.querySelector('.zone-good');
    const perf = m.querySelector('.zone-perfect');
    good.style.left = (state.center - state.good) * 100 + '%';
    good.style.width = state.good * 200 + '%';
    perf.style.left = (state.center - state.perfect) * 100 + '%';
    perf.style.width = state.perfect * 200 + '%';
    m.querySelector('.needle').style.left = state.pos * 100 + '%';
  }

  cutin({ ko, en, c1 = '#ff3b6b', c2 = '#5a1bff', side = 'l', portrait = null, dur = 1.5 }) {
    const c = this.layers.cut;
    if (!c) return;
    c.className = 'cutin ' + side;
    c.style.setProperty('--c1', c1);
    c.style.setProperty('--c2', c2);
    c.innerHTML = `<div class="speedlines"></div><div class="band"></div><div class="face"></div><div class="txt"><div class="ko">${ko}</div><div class="en">${en}</div></div>`;
    if (portrait) c.querySelector('.face').appendChild(portrait);
    clearTimeout(this.cutTimer);
    this.cutTimer = setTimeout(() => (c.innerHTML = ''), dur * 1000 + 100);
  }

  fade(on) {
    this.layers.fade?.classList.toggle('on', on);
  }

  gameOver(score, teams, userIdx, onRestart) {
    const ov = el('div', 'overlay gameover');
    const win = score[userIdx] > score[1 - userIdx];
    const tie = score[0] === score[1];
    ov.innerHTML = `
      <div class="result" style="color:${tie ? '#fff' : win ? '#ffcc33' : '#6fa8ff'}">${tie ? 'DRAW' : win ? 'VICTORY!' : 'DEFEAT'}</div>
      <div class="final">${teams[0].name} ${score[0]} : ${score[1]} ${teams[1].name}</div>
      <button class="start">다시 하기</button>`;
    ov.querySelector('.start').addEventListener('click', onRestart);
    this.root.appendChild(ov);
  }
}

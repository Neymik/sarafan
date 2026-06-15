import { T } from '../data/tuning.js';
import { randomWalkableNear, isWalkable } from '../sim/flowfield.js';
import { enterLost } from '../sim/agent.js';
import { openComposer } from './boards.js';

const px2m = (canvas, e) => {
  const r = canvas.getBoundingClientRect();
  return { x: (e.clientX - r.left) / T.pxPerMeter, y: (e.clientY - r.top) / T.pxPerMeter };
};

export function initTools(canvas, world) {
  world.ui = { mode: 'cursor', dragging: null, holdTimer: null, holdAgent: null,
    paUntil: 0, rumorUntil: 0, shiftUsed: false };
  world.volunteers = [];

  const bar = document.getElementById('toolbar');
  bar.innerHTML = `
    <button data-mode="cursor" class="active">Курсор</button>
    <button data-mode="barrier">Барьер</button>
    <button data-mode="volunteer">Волонтёр</button>
    <span style="width:12px"></span>
    <button id="paBtn">📢 Громкая связь</button>
    <button id="rumorBtn">🗣 Вброс слуха</button>
    <button id="shiftBtn">⏰ Сдвинуть концерт +30м</button>`;
  for (const b of bar.querySelectorAll('[data-mode]')) {
    b.onclick = () => {
      world.ui.mode = b.dataset.mode;
      bar.querySelectorAll('[data-mode]').forEach(x => x.classList.toggle('active', x === b));
    };
  }
  // кулдауны на кнопках
  setInterval(() => {
    const pa = document.getElementById('paBtn'), ru = document.getElementById('rumorBtn');
    const paLeft = Math.ceil(world.ui.paUntil - world.t), ruLeft = Math.ceil(world.ui.rumorUntil - world.t);
    pa.disabled = paLeft > 0; pa.textContent = paLeft > 0 ? `📢 ${paLeft}с` : '📢 Громкая связь';
    ru.disabled = ruLeft > 0; ru.textContent = ruLeft > 0 ? `🗣 ${ruLeft}с` : '🗣 Вброс слуха';
    const sh = document.getElementById('shiftBtn');
    sh.disabled = world.ui.shiftUsed;
  }, 250);

  document.getElementById('shiftBtn').onclick = () => {
    if (world.ui.shiftUsed) return;
    world.ui.shiftUsed = true;
    world.facts.concert.time += 1800;
    world.facts.concert.changedAt = world.t;
    world.banner = { text: 'Концерт сдвинут на +30 мин (никто пока не знает!)', t: world.t };
  };
  document.getElementById('paBtn').onclick = e => {
    if (world.t < world.ui.paUntil) return;
    openComposer(world, e.clientX, e.clientY, (applyFn, label) => {
      for (const a of world.agents) {
        if (a.perception > 0 && a.beliefs) { applyFn(a, world); a.stress = Math.min(100, a.stress + T.paStress); }
      }
      world.ui.paUntil = world.t + T.paCooldown;
      world.flashes.push({ x: world.map.w / 2, y: world.map.h / 2, t: world.t, r: world.map.w / 2 });
      world.banner = { text: `📢 ${label}`, t: world.t };
    });
  };
  document.getElementById('rumorBtn').onclick = e => {
    if (world.t < world.ui.rumorUntil) return;
    const el = document.getElementById('cards');
    el.innerHTML = ''; el.style.left = e.clientX + 'px'; el.style.top = e.clientY + 'px'; el.style.display = 'flex';
    for (const [k, p] of Object.entries(world.map.pois)) {
      if (p.exit || p.staff || p.soldOut || p.weight <= 0) continue;
      const btn = document.createElement('button');
      btn.textContent = `«У "${p.label}" что-то раздают!»`;
      btn.onclick = () => {
        el.style.display = 'none';
        world.ui.rumorUntil = world.t + T.rumorInjectCooldown;
        const cands = world.agents.filter(a => a.kind === 'visitor' && a.beliefs);
        for (let i = 0; i < T.rumorInjectCount && cands.length; i++) {
          const a = cands.splice((Math.random() * cands.length) | 0, 1)[0];
          a.beliefs.knownPois.add(k);
          a.poiPromo[k] = world.t + T.promoTime;
        }
        world.banner = { text: `🗣 Слух запущен: ${p.label}`, t: world.t };
      };
      el.appendChild(btn);
    }
  };

  canvas.addEventListener('mousedown', e => {
    const m = px2m(canvas, e);
    if (world.ui.mode === 'barrier') return placeBarrier(world, m);
    if (world.ui.mode === 'volunteer') return placeVolunteer(world, m);
    // cursor: возможный драг — ждём dragHold
    let best = null, bd = 1;
    for (const a of world.agents) {
      const d = Math.hypot(a.x - m.x, a.y - m.y);
      if (d < bd && (a.kind === 'visitor')) { bd = d; best = a; }
    }
    if (!best) return;
    world.ui.holdAgent = best;
    world.ui.holdTimer = setTimeout(() => {
      best.dragged = true;
      world.ui.dragging = best;
      world.ui.holdAgent = null;
    }, T.dragHold * 1000);
  });
  canvas.addEventListener('mousemove', e => {
    const m = px2m(canvas, e);
    if (world.ui.dragging) { world.ui.dragging.x = m.x; world.ui.dragging.y = m.y; }
  });
  window.addEventListener('mouseup', () => {
    clearTimeout(world.ui.holdTimer); world.ui.holdTimer = null; world.ui.holdAgent = null;
    const a = world.ui.dragging;
    if (!a) return;
    world.ui.dragging = null;
    a.dragged = false;
    const g = world.fields.gridFor(0);
    if (!isWalkable(g, a.x, a.y)) { const p = randomWalkableNear(g, a.x, a.y, 4); a.x = p.x; a.y = p.y; }
    a.vx = a.vy = 0;
    enterLost(a, world, null);   // приземлился — «да где я вообще?!»
  });
}

function placeBarrier(world, m) {
  // клик по существующей ленте — снять
  for (let i = 0; i < T.barrierSlots; i++) {
    const s = world.fields.slots[i];
    if (s && m.x >= s.x && m.x <= s.x + s.w && m.y >= s.y && m.y <= s.y + s.h) {
      world.fields.clearSlot(i);
      world.syncObstacles();
      return;
    }
  }
  const g = world.fields.gridFor(0);
  if (!isWalkable(g, m.x, m.y)) return;
  const slot = [0, 1, 2].find(i => !world.fields.slots[i]);
  if (slot === undefined) { world.banner = { text: 'Все ленты заняты — сними одну', t: world.t }; return; }
  world.fields.setSlot(slot, { x: (m.x | 0) - 0.5, y: (m.y | 0) - 0.5, w: 2, h: 2 });
  world.syncObstacles();
}

function placeVolunteer(world, m) {
  const i = world.volunteers.findIndex(v => Math.hypot(v.x - m.x, v.y - m.y) < 1);
  if (i >= 0) { world.volunteers.splice(i, 1); return; }
  if (world.volunteers.length >= T.volunteerMax) { world.banner = { text: 'Волонтёры кончились (макс 2)', t: world.t }; return; }
  if (!isWalkable(world.fields.gridFor(0), m.x, m.y)) return;
  world.volunteers.push({ x: m.x, y: m.y });
}

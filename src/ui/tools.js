import { T } from '../data/tuning.js';
import { randomWalkableNear, isWalkable } from '../sim/flowfield.js';
import { enterLost, makeAgent } from '../sim/agent.js';
import { openComposer } from './boards.js';
import { injectFakeHype, injectMeta, composerOptions, makeBoardMessages } from '../data/messages.js';

const px2m = (canvas, e) => {
  const r = canvas.getBoundingClientRect();
  return { x: (e.clientX - r.left) / T.pxPerMeter, y: (e.clientY - r.top) / T.pxPerMeter };
};

export function initTools(canvas, world) {
  world.ui = { mode: 'cursor', dragging: null, holdTimer: null, holdAgent: null,
    paUntil: 0, rumorUntil: 0, shiftUsed: false, dragFrom: null, dragCooldownUntil: 0,
    armFakeHype: false };

  const bar = document.getElementById('toolbar');
  bar.innerHTML = `
    <button data-mode="cursor" class="active">Курсор</button>
    <button data-mode="barrier">Барьер</button>
    <button id="clearBarriersBtn">🧹 Снять барьеры</button>
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
    const cur = bar.querySelector('[data-mode="cursor"]');
    const dragLeft = Math.ceil(world.ui.dragCooldownUntil - world.t);
    if (cur) cur.textContent = dragLeft > 0 ? `Курсор ⏳${dragLeft}с` : 'Курсор';
  }, 250);

  document.getElementById('clearBarriersBtn').onclick = () => {
    for (let i = 0; i < T.barrierSlots; i++) if (world.fields.slots[i]) world.fields.clearSlot(i);
    world.syncObstacles();
  };

  document.getElementById('shiftBtn').onclick = () => {
    if (world.ui.shiftUsed) return;
    world.ui.shiftUsed = true;
    const ce = (world.events ?? []).find(e => e.id === 'concert');
    if (ce && ce.status !== 'over') {
      ce.time += 1800;
      ce.changedAt = world.t;
      world.banner = { text: 'Концерт сдвинут на +30 мин (никто пока не знает!)', t: world.t };
    }
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
    openRumorMenu(world, e.clientX, e.clientY);
  };

  canvas.addEventListener('mousedown', e => {
    const m = px2m(canvas, e);
    // fake-hype armed: intercept next canvas click before other branches
    if (world.ui.armFakeHype) {
      world.ui.armFakeHype = false;
      world.ui.rumorUntil = world.t + T.rumorInjectCooldown;
      injectFakeHype(world, { x: m.x, y: m.y });
      return;
    }
    if (world.map.boards.some(b => Math.hypot(b.x - m.x, b.y - m.y) < 2)) return;
    if (world.ui.mode === 'barrier') return placeBarrier(world, m);
    if (world.ui.mode === 'volunteer') return placeVolunteer(world, m);
    // cursor: возможный драг — ждём dragHold
    if (world.t < world.ui.dragCooldownUntil) return;
    let best = null, bd = 1;
    for (const a of world.agents) {
      const d = Math.hypot(a.x - m.x, a.y - m.y);
      if (d < bd) { bd = d; best = a; }
    }
    if (!best) return;
    world.ui.holdAgent = best;
    world.ui.holdTimer = setTimeout(() => {
      best.dragged = true;
      world.ui.dragging = best;
      world.ui.dragFrom = { x: best.x, y: best.y };
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
    world.ui.dragCooldownUntil = world.t + T.dragCooldown;
    if (world.ui.dragFrom && Math.hypot(a.x - world.ui.dragFrom.x, a.y - world.ui.dragFrom.y) > 1
        && (a.kind === 'visitor' || a.friendId)) {
      enterLost(a, world, null);   // реально перенесён — «да где я вообще?!»
    }
    world.ui.dragFrom = null;
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
  // 3×3 — пломбирует 3-метровый проход одним кликом; визуал = хитбокс = штамп
  world.fields.setSlot(slot, { x: (m.x | 0) - 1, y: (m.y | 0) - 1, w: 3, h: 3 });
  world.syncObstacles();
}

function placeVolunteer(world, m) {
  const near = world.agents.find(a => a.kind === 'volunteer' && Math.hypot(a.x - m.x, a.y - m.y) < 1);
  if (near) { near.despawn = true; return; }
  if (world.agents.filter(a => a.kind === 'volunteer').length >= T.volunteerMax) {
    world.banner = { text: 'Волонтёры кончились (макс 2)', t: world.t }; return;
  }
  if (!isWalkable(world.fields.gridFor(0), m.x, m.y)) return;
  const v = makeAgent(world, world.nextId = (world.nextId ?? 0) + 1);
  v.kind = 'volunteer'; v.x = m.x; v.y = m.y; v.maxSpeed = 2.2; v.sociability = 0;
  v.beliefs.knownPois = new Set(Object.keys(world.map.pois));
  world.agents.push(v);
}

// ---- Меню вброса слухов/приколов ----
function openRumorMenu(world, cx, cy) {
  const el = document.getElementById('cards');
  el.innerHTML = '';
  el.style.left = cx + 'px';
  el.style.top = cy + 'px';
  el.style.display = 'flex';
  el.style.flexDirection = 'column';

  const close = () => { el.style.display = 'none'; };
  const addBtn = (label, fn) => {
    const btn = document.createElement('button');
    btn.textContent = label;
    btn.onclick = () => { close(); fn(); };
    el.appendChild(btn);
  };

  const opts = composerOptions(world);
  const msgs = makeBoardMessages(world);

  // Эвент-слухи: по каждому эвенту + варианту
  for (const ev of (opts.events ?? [])) {
    if (ev.status === 'over') continue;
    for (const v of ev.variants) {
      addBtn(`📅 ${v.label}`, () => {
        world.ui.rumorUntil = world.t + T.rumorInjectCooldown;
        const applyFn = msgs.event(ev.id, v.kind);
        const cands = world.agents.filter(a => a.kind === 'visitor' && a.beliefs);
        for (let i = 0; i < T.rumorInjectCount && cands.length; i++) {
          const a = cands.splice((Math.random() * cands.length) | 0, 1)[0];
          applyFn(a, world);
        }
        world.banner = { text: `🗣 Слух об эвенте: ${v.label}`, t: world.t };
      });
    }
  }

  // Бутик 🔥 (boothGood): выбор бутика
  for (const b of (opts.booths ?? [])) {
    addBtn(`🔥 «${b.label} — топ!»`, () => {
      world.ui.rumorUntil = world.t + T.rumorInjectCooldown;
      const applyFn = msgs.boothGood(b.key);
      const cands = world.agents.filter(a => a.kind === 'visitor' && a.beliefs);
      for (let i = 0; i < T.rumorInjectCount && cands.length; i++) {
        const a = cands.splice((Math.random() * cands.length) | 0, 1)[0];
        applyFn(a, world);
      }
      world.banner = { text: `🔥 Сарафан: ${b.label} — крутой!`, t: world.t };
    });
  }

  // Бутик 🗑 (boothBad): выбор бутика
  for (const b of (opts.booths ?? [])) {
    addBtn(`🗑 «${b.label} — отстой»`, () => {
      world.ui.rumorUntil = world.t + T.rumorInjectCooldown;
      const applyFn = msgs.boothBad(b.key);
      const cands = world.agents.filter(a => a.kind === 'visitor' && a.beliefs);
      for (let i = 0; i < T.rumorInjectCount && cands.length; i++) {
        const a = cands.splice((Math.random() * cands.length) | 0, 1)[0];
        applyFn(a, world);
      }
      world.banner = { text: `🗑 Антисарафан: ${b.label}`, t: world.t };
    });
  }

  // Фейк-ажиотаж: вооружить следующий клик по карте
  addBtn('🎯 Фейк-ажиотаж (клик по карте)', () => {
    world.ui.armFakeHype = true;
    world.banner = { text: '🎯 Кликни по карте — туда ломанутся', t: world.t };
  });

  // Мета-приколы
  addBtn('😭 Мета: HL3 отменили', () => {
    world.ui.rumorUntil = world.t + T.rumorInjectCooldown;
    injectMeta(world, 'hl3');
  });
  addBtn('📶 Мета: Вайфай у входа', () => {
    world.ui.rumorUntil = world.t + T.rumorInjectCooldown;
    injectMeta(world, 'wifi');
  });
  addBtn('⭐ Мета: Звезда у еды', () => {
    world.ui.rumorUntil = world.t + T.rumorInjectCooldown;
    injectMeta(world, 'starfood');
  });
  addBtn('👶 Мета: Потерялся ребёнок', () => {
    world.ui.rumorUntil = world.t + T.rumorInjectCooldown;
    injectMeta(world, 'lostkid');
  });

  // Закрыть
  const closeBtn = document.createElement('button');
  closeBtn.textContent = '✖ Закрыть';
  closeBtn.onclick = close;
  el.appendChild(closeBtn);
}

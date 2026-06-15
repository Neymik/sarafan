import { T, speedFactor, turnFactor } from '../data/tuning.js';
import { think, enterLost } from './agent.js';
import { eyesUpdate } from './knowledge.js';
import { dialogueTick } from './dialogue.js';
import { queueTick } from './queue.js';
export { solidRects } from '../data/map.js';
import { solidRects } from '../data/map.js';

export function simTick(world, dt) {
  const { agents, hash } = world;
  hash.rebuild(agents);
  for (const a of agents) {
    if (a.dragged) { a.vx = a.vy = 0; continue; }
    a.neighbors = hash.queryCircle(a.x, a.y, T.densityRadius);
    a.density = a.neighbors.length - 1;
    a.contact = false;
    a.prevX = a.x; a.prevY = a.y; // фактическое смещение за тик измеряется ПОСЛЕ коллизий/стен
    if (a.beliefs && a.perception > 0) eyesUpdate(a, world);
    a.nextThink -= dt;
    if (a.nextThink <= 0) { a.nextThink = T.utilityTickEvery; if (a.beliefs && world.facts) think(a, world); }
  }
  dialogueTick(world, dt);
  queueTick(world, dt);
  for (const a of agents) if (!a.dragged) stepAgent(a, world, dt);
  resolveCollisions(world);
  const { w, h } = world.map;
  const solids = solidRects(world.map);
  const slots = (world.fields?.slots ?? []);
  for (const a of agents) {
    if (a.dragged) continue;
    for (const r of solids) pushOutOfRect(a, r);
    for (const s of slots) {
      if (!s) continue;
      const nx = Math.max(s.x, Math.min(s.x + s.w, a.x));
      const ny = Math.max(s.y, Math.min(s.y + s.h, a.y));
      const before = (a.x - nx) ** 2 + (a.y - ny) ** 2;
      pushOutOfRect(a, s);
      if (before < a.radius * a.radius && a.kind === 'visitor') {
        a._hitRect = s; applyBarrierLost(a, world); a._hitRect = null;
      }
    }
    a.x = Math.max(a.radius + 1, Math.min(w - 1 - a.radius, a.x));
    a.y = Math.max(a.radius + 1, Math.min(h - 1 - a.radius, a.y));
  }
  updateStress(world, dt);

  if (world.fields) {
    world.smartTimer = (world.smartTimer ?? 0) - dt;
    if (world.smartTimer <= 0) { world.smartTimer = T.smartRecomputeEvery; world.fields.recomputeSmart(agents, world.obstMask ?? 0, world.t); }
  }

  if (world.agents.some(a => a.despawn)) {
    if (world.score) world.score.angry += world.agents.filter(a => a.despawn && a.stress > 70).length;
    if (world.selected && world.selected.despawn) world.selected = null;
    world.agents = world.agents.filter(a => !a.despawn);
  }
}

export function updateNeedsJoy(a, dt) {
  if (a.joy > T.joyBaseline) a.joy = Math.max(T.joyBaseline, a.joy - T.joyDecay * dt);
  a.joy = Math.max(0, Math.min(100, a.joy));
}

export function applyBarrierLost(a, world) {
  let bit = 0;
  (world.fields?.slots ?? []).forEach((s, i) => {
    if (!s) return;
    if (a._hitRect === s) { bit = 1 << i; return; }
    // fallback: detect by overlap (when called directly without _hitRect set)
    if (!a._hitRect) {
      const nx = Math.max(s.x, Math.min(s.x + s.w, a.x));
      const ny = Math.max(s.y, Math.min(s.y + s.h, a.y));
      if ((a.x - nx) ** 2 + (a.y - ny) ** 2 < a.radius * a.radius) bit = 1 << i;
    }
  });
  if (!bit) return;
  if (a.obstMask & bit) return;          // уже знал — не теряется
  a.obstMask |= bit;
  a.stress = Math.min(100, a.stress + 10);
  enterLost(a, world, a.goalPoi);        // несёт obst в диалогах (тема obst уже спредит)
}

function updateStress(world, dt) {
  for (const a of world.agents) {
    if (a.dragged) continue;
    updateNeedsJoy(a, dt);
    let ds = -T.stressDecay;
    ds += T.stressFromDensity * Math.max(0, a.density - T.comfortN);
    if (a.contact) ds += T.stressFromContact;
    // «не могу продвинуться»: скорость врёт (PBD/стены правят позицию), мерим смещение
    const moving = Math.hypot(a.x - (a.prevX ?? a.x), a.y - (a.prevY ?? a.y)) / dt;
    if (a.activity === 'goto' && moving < 0.2 * a.maxSpeed) a.blockedTime += dt;
    else a.blockedTime = 0;
    if (a.blockedTime > T.blockedStressAfter) ds += T.blockedStressRate;
    if (world.litter) for (const l of world.litter)
      if ((l.x - a.x) ** 2 + (l.y - a.y) ** 2 < 0.25) { ds += T.litterStress; break; }
    a.stress = Math.max(0, Math.min(100, a.stress + ds * dt));
  }
}

function stepAgent(a, world, dt) {
  let dx = 0, dy = 0;
  let sx = 0, sy = 0, hasGoal = false;
  if (a.lureTarget) { a.target = a.lureTarget; a.goalPoi = null; }
  if (a.goalPoi && world.fields) {
    const mode = (a.smartUntil > world.t) ? 'smart' : 'clear';
    const mask = (a.obstMask ?? 0) & (world.obstMask ?? 0);
    const dir = world.fields.dir(mode, mask, a.goalPoi, a.x, a.y);
    if (dir) { sx = dir.x; sy = dir.y; hasGoal = true; }
  }
  if (!hasGoal && a.target) {
    const ex = a.target.x - a.x, ey = a.target.y - a.y, d = Math.hypot(ex, ey);
    if (d > 0.3) { const s = steerAround(a, ex / d, ey / d, world); sx = s.x; sy = s.y; hasGoal = true; }
    else if (a.activity === 'wander') a.target = null; // дошёл до точки исследования — мозг выберет новую
  }
  if (hasGoal) {
    let mods = 1;
    if (a.activity === 'wander') mods = 0.8;
    if (a.activity === 'phone') mods = 0.15;
    if (a.activity === 'browse') mods = 0.4;
    if (a.activity === 'talk') mods = a.talkWalk ? 0.5 : 0;
    if (a.activity === 'queue') mods = 0.5;
    if (a.activity === 'follow') mods = 0.9;
    if (a.activity === 'pose' || a.activity === 'clean') mods = 0;
    const speed = a.maxSpeed * speedFactor(a.density) * mods;
    dx = sx * speed; dy = sy * speed;
  }
  // течение с толпой
  if (a.density >= T.alignmentThreshold && Math.hypot(a.vx, a.vy) > 0.3) {
    let avx = 0, avy = 0, n = 0;
    for (const b of a.neighbors) if (b !== a) { avx += b.vx; avy += b.vy; n++; }
    if (n) {
      const conf = a.activity === 'phone' ? a.conformity * 2 : a.conformity;
      const w = Math.min(0.8, conf * a.density / T.jamN);
      dx = dx * (1 - w) + (avx / n) * w;
      dy = dy * (1 - w) + (avy / n) * w;
    }
  }
  // личная зона
  for (const b of a.neighbors) if (b !== a) {
    const ox = a.x - b.x, oy = a.y - b.y, d = Math.hypot(ox, oy);
    const want = a.personalSpace + a.radius + b.radius;
    if (d > 1e-3 && d < want) {
      const f = T.personalSpaceForce * (1 - d / want);
      dx += ox / d * f; dy += oy / d * f;
    }
  }
  // отталкивание от стен: мягкая сила до контакта
  for (const r of (world.obstacles ?? solidRects(world.map))) {
    const px = Math.max(r.x, Math.min(r.x + r.w, a.x));
    const py = Math.max(r.y, Math.min(r.y + r.h, a.y));
    const ox = a.x - px, oy = a.y - py, d = Math.hypot(ox, oy);
    const reach = a.radius + 0.4;
    if (d > 1e-4 && d < reach) {
      const f = T.wallRepel * (1 - d / reach);
      dx += ox / d * f; dy += oy / d * f;
    }
  }
  // уступание: TTC < 1с и чужой приоритет выше — шаг вбок + сброс скорости
  if (a.perception > 0) {
    for (const b of a.neighbors) {
      if (b === a) continue;
      const rx = b.x - a.x, ry = b.y - a.y;
      const rvx = b.vx - a.vx, rvy = b.vy - a.vy;
      const closing = -(rx * rvx + ry * rvy);
      if (closing <= 0) continue;
      const d = Math.hypot(rx, ry);
      if (d < 1e-4) continue;
      const ttc = d / (closing / d);
      if (ttc < 1) {
        // floor скорости в приоритете: покоящийся тяжёлый всё равно «главнее» лёгкого
        const myP = a.mass * Math.max(Math.hypot(a.vx, a.vy), 0.5) * (a.activity === 'goto' ? 1.5 : 1) * (a.kind === 'carrier' ? T.carrierPriority : 1);
        const theirP = b.mass * Math.max(Math.hypot(b.vx, b.vy), 0.5) * (b.activity === 'goto' ? 1.5 : 1) * (b.kind === 'carrier' ? T.carrierPriority : 1);
        if (theirP > myP * (2 - a.politeness)) {
          dx += -ry / d * 1.5;  // перпендикуляр от его курса
          dy +=  rx / d * 1.5;
          dx *= 0.5; dy *= 0.5;
          break;
        }
      }
    }
  }
  const k = Math.min(1, a.agility * turnFactor(a.density) * dt);
  a.vx += (dx - a.vx) * k; a.vy += (dy - a.vy) * k;
  a.x += a.vx * dt; a.y += a.vy * dt;
}

export function resolveCollisions(world) {
  for (let it = 0; it < 2; it++) {
    for (const a of world.agents) {
      if (a.dragged) continue;
      for (const b of a.neighbors) {
        if (b.id <= a.id || a.dragged || b.dragged) continue;
        const dx = b.x - a.x, dy = b.y - a.y;
        const d = Math.hypot(dx, dy), min = a.radius + b.radius;
        if (d > 1e-4 && d < min) {
          const push = min - d, tot = a.mass + b.mass, nx = dx / d, ny = dy / d;
          a.x -= nx * push * (b.mass / tot); a.y -= ny * push * (b.mass / tot);
          b.x += nx * push * (a.mass / tot); b.y += ny * push * (a.mass / tot);
          a.contact = b.contact = true;
        }
      }
    }
    // clamp to world bounds after each PBD iteration to prevent boundary tunnelling
    if (world.map) {
      const { w, h } = world.map;
      for (const a of world.agents) {
        a.x = Math.max(a.radius + 1, Math.min(w - 1 - a.radius, a.x));
        a.y = Math.max(a.radius + 1, Math.min(h - 1 - a.radius, a.y));
      }
    }
  }
}

export function segmentHitsRect(x, y, dx, dy, len, r, pad) {
  const ex = r.x - pad, ey = r.y - pad, ew = r.w + 2 * pad, eh = r.h + 2 * pad;
  let t0 = 0, t1 = len;
  // X slab
  if (Math.abs(dx) < 1e-9) { if (x < ex || x > ex + ew) return false; }
  else { let a = (ex - x) / dx, b = (ex + ew - x) / dx; if (a > b) { const t = a; a = b; b = t; }
    t0 = Math.max(t0, a); t1 = Math.min(t1, b); if (t0 > t1) return false; }
  // Y slab
  if (Math.abs(dy) < 1e-9) { if (y < ey || y > ey + eh) return false; }
  else { let a = (ey - y) / dy, b = (ey + eh - y) / dy; if (a > b) { const t = a; a = b; b = t; }
    t0 = Math.max(t0, a); t1 = Math.min(t1, b); if (t0 > t1) return false; }
  return true;
}

export function steerAround(a, dx, dy, world) {
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) return { x: dx, y: dy };
  let ux = dx / len, uy = dy / len;
  const obs = world.obstacles ?? (world.map ? solidRects(world.map) : []);
  const blocked = dir => obs.some(r => segmentHitsRect(a.x, a.y, dir.x, dir.y, T.whiskerLen, r, a.radius));
  if (!blocked({ x: ux, y: uy })) return { x: dx, y: dy };
  for (const deg of [30, -30, 60, -60, 90, -90]) {     // ищем ближайший свободный угол
    const r = deg * Math.PI / 180, c = Math.cos(r), s = Math.sin(r);
    const nd = { x: ux * c - uy * s, y: ux * s + uy * c };
    if (!blocked(nd)) return { x: nd.x * len, y: nd.y * len };
  }
  return { x: dx, y: dy }; // всё заблокировано — пусть wallRepel/pushOut разрулят
}

export function pushOutOfRect(a, r) {
  const px = Math.max(r.x, Math.min(r.x + r.w, a.x));
  const py = Math.max(r.y, Math.min(r.y + r.h, a.y));
  let dx = a.x - px, dy = a.y - py;
  const d = Math.hypot(dx, dy);
  if (d >= a.radius) return;
  if (d > 1e-4) { a.x = px + dx / d * a.radius; a.y = py + dy / d * a.radius; return; }
  // центр внутри прямоугольника — через ближайшую грань
  const L = a.x - r.x, R = r.x + r.w - a.x, Tp = a.y - r.y, B = r.y + r.h - a.y;
  const m = Math.min(L, R, Tp, B);
  if (m === L) a.x = r.x - a.radius;
  else if (m === R) a.x = r.x + r.w + a.radius;
  else if (m === Tp) a.y = r.y - a.radius;
  else a.y = r.y + r.h + a.radius;
}

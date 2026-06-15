import { T, speedFactor, turnFactor } from '../data/tuning.js';
import { updateEdgeCongestion, eyesUpdate, osmosis } from './knowledge.js';
import { think } from './agent.js';

export function simTick(world, dt) {
  const { agents, hash } = world;
  hash.rebuild(agents);
  world.congTimer -= dt;
  if (world.congTimer <= 0 && world.edgeCongestion) { world.congTimer = 1; updateEdgeCongestion(world); }
  for (const a of agents) {
    a.neighbors = hash.queryCircle(a.x, a.y, T.densityRadius);
    a.density = a.neighbors.length - 1;
    a.contact = false;
    a.prevX = a.x; a.prevY = a.y; // фактическое смещение за тик измеряется ПОСЛЕ коллизий/стен
    if (a.beliefs && world.edgePassable) {
      if (a.perception > 0) eyesUpdate(a, world);
      osmosis(a, world);
    }
    a.nextThink -= dt;
    if (a.nextThink <= 0) { a.nextThink = T.utilityTickEvery; if (a.beliefs && world.facts) think(a, world); }
  }
  for (const a of agents) stepAgent(a, world, dt);
  resolveCollisions(world);
  const { w, h } = world.map;
  const obs = world.obstacles ?? world.map.blocks;
  for (const a of agents) {
    for (const r of obs) pushOutOfRect(a, r);
    a.x = Math.max(a.radius + 1, Math.min(w - 1 - a.radius, a.x));
    a.y = Math.max(a.radius + 1, Math.min(h - 1 - a.radius, a.y));
  }
  updateStress(world, dt);
}

function updateStress(world, dt) {
  for (const a of world.agents) {
    let ds = -T.stressDecay;
    ds += T.stressFromDensity * Math.max(0, a.density - T.comfortN);
    if (a.contact) ds += T.stressFromContact;
    // «не могу продвинуться»: скорость врёт (PBD/стены правят позицию), мерим смещение
    const moving = Math.hypot(a.x - (a.prevX ?? a.x), a.y - (a.prevY ?? a.y)) / dt;
    if (a.activity === 'goto' && moving < 0.2 * a.maxSpeed) a.blockedTime += dt;
    else a.blockedTime = 0;
    if (a.blockedTime > T.blockedStressAfter) ds += T.blockedStressRate;
    a.stress = Math.max(0, Math.min(100, a.stress + ds * dt));
  }
}

export function currentTarget(a, world) {
  if (a.path && a.pathI < a.path.length) {
    const wp = world.map.waypoints[a.path[a.pathI]];
    if (Math.hypot(wp.x - a.x, wp.y - a.y) < 1.2) { a.pathI++; return currentTarget(a, world); }
    return wp;
  }
  return a.target; // финальная точка (POI) после конца цепочки
}

function stepAgent(a, world, dt) {
  let dx = 0, dy = 0;
  const wp = currentTarget(a, world);
  if (wp) {
    const ex = wp.x - a.x, ey = wp.y - a.y, d = Math.hypot(ex, ey) || 1;
    let mods = 1;
    if (a.activity === 'wander') mods = 0.6;
    if (a.activity === 'phone') mods = 0.15;
    const speed = a.maxSpeed * speedFactor(a.density) * mods;
    dx = ex / d * speed; dy = ey / d * speed;
  }
  // течение с толпой
  if (a.density >= T.alignmentThreshold) {
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
        const myP = a.mass * Math.max(Math.hypot(a.vx, a.vy), 0.5) * (a.activity === 'goto' ? 1.5 : 1);
        const theirP = b.mass * Math.max(Math.hypot(b.vx, b.vy), 0.5) * (b.activity === 'goto' ? 1.5 : 1);
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
      for (const b of a.neighbors) {
        if (b.id <= a.id) continue;
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

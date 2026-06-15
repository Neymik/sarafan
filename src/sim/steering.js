import { T, speedFactor, turnFactor } from '../data/tuning.js';

export function simTick(world, dt) {
  const { agents, hash } = world;
  hash.rebuild(agents);
  for (const a of agents) {
    a.neighbors = hash.queryCircle(a.x, a.y, T.densityRadius);
    a.density = a.neighbors.length - 1;
    a.contact = false;
  }
  for (const a of agents) stepAgent(a, world, dt);
  resolveCollisions(world);
  const { w, h } = world.map;
  for (const a of agents) {
    pushOutOfWalls(a, world.map.walls);
    a.x = Math.max(a.radius, Math.min(w - a.radius, a.x));
    a.y = Math.max(a.radius, Math.min(h - a.radius, a.y));
  }
}

export function currentTarget(a, world) {
  // Task 5 заменит на цепочку вейпоинтов; пока — прямая цель
  return a.target;
}

function stepAgent(a, world, dt) {
  let dx = 0, dy = 0;
  const wp = currentTarget(a, world);
  if (wp) {
    const ex = wp.x - a.x, ey = wp.y - a.y, d = Math.hypot(ex, ey) || 1;
    const speed = a.maxSpeed * speedFactor(a.density) * (a.activity === 'wander' ? 0.6 : 1);
    dx = ex / d * speed; dy = ey / d * speed;
  }
  // [Task 6: alignment + personal space вставляются здесь]
  // [Task 7: рефлекс уступания вставляется здесь]
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
        a.x = Math.max(a.radius, Math.min(w - a.radius, a.x));
        a.y = Math.max(a.radius, Math.min(h - a.radius, a.y));
      }
    }
  }
}

export function pushOutOfWalls(a, walls) {
  for (const [x1, y1, x2, y2] of walls) {
    const wx = x2 - x1, wy = y2 - y1;
    const t = Math.max(0, Math.min(1, ((a.x - x1) * wx + (a.y - y1) * wy) / (wx * wx + wy * wy)));
    const px = x1 + wx * t, py = y1 + wy * t;
    let dx = a.x - px, dy = a.y - py;
    const d = Math.hypot(dx, dy);
    if (d < a.radius) {
      if (d < 1e-4) { const l = Math.hypot(wy, wx) || 1; dx = wy / l; dy = -wx / l; }
      else { dx /= d; dy /= d; }
      a.x = px + dx * a.radius; a.y = py + dy * a.radius;
    }
  }
}

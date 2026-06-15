import { T } from '../data/tuning.js';

// Детектор давки: клетка с плотностью ≥6 проверяется queryCircle(1.5);
// > T.incidentDensity агентов 10 секунд подряд → «кто-то упал», зона 3×3
// оцепляется в слот 3/4 на T.incidentDur секунд.
export function incidentsTick(world, dt) {
  world.hot ??= new Map();
  world.incidentEnds ??= {};
  world.incTimer = (world.incTimer ?? 2) - dt;
  if (world.incTimer <= 0 && world.fields.density) {
    world.incTimer = 2;
    const d = world.fields.density, g = world.fields.gridFor(0);
    const seen = new Set();
    for (let i = 0; i < d.length; i++) {
      if (d[i] < 6) continue;
      const x = i % g.W + 0.5, y = ((i / g.W) | 0) + 0.5;
      if (world.hash.queryCircle(x, y, 1.5).length > T.incidentDensity) {
        seen.add(i);
        world.hot.set(i, (world.hot.get(i) ?? 0) + 2);
      }
    }
    for (const k of [...world.hot.keys()]) if (!seen.has(k)) world.hot.delete(k);
    for (const [i, dur] of [...world.hot]) {
      if (dur < T.incidentAfter) continue;
      world.hot.delete(i);
      const x = i % g.W, y = (i / g.W) | 0;
      for (const a of world.hash.queryCircle(x + 0.5, y + 0.5, T.incidentRadius))
        a.stress = Math.min(100, a.stress + T.incidentStress);
      world.score.incidents++;
      world.banner = { text: '⚠ Инцидент: давка, зону оцепили', t: world.t };
      const slot = !world.fields.slots[3] ? 3 : !world.fields.slots[4] ? 4 : -1;
      if (slot >= 0) {
        world.fields.setSlot(slot, { x: x - 1, y: y - 1, w: 3, h: 3 });
        world.incidentEnds[slot] = world.t + T.incidentDur;
        world.syncObstacles();
      }
    }
  }
  for (const [slot, end] of Object.entries(world.incidentEnds)) {
    if (world.t >= end) {
      world.fields.clearSlot(+slot);
      delete world.incidentEnds[slot];
      world.syncObstacles();
    }
  }
}

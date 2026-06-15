import { T } from '../data/tuning.js';

export function luresTick(world) {
  world.lures = (world.lures ?? []).filter(l => world.t < l.until);
  for (const a of world.agents) {
    if (!a.lureTarget) continue;
    if ((a.lureTarget.x - a.x) ** 2 + (a.lureTarget.y - a.y) ** 2 < T.lureRadius ** 2) {
      a.joy = Math.max(0, (a.joy ?? 50) - T.lureJoyHit);
      a.stress = Math.min(100, (a.stress ?? 0) + T.lureStress);
      a.lureTarget = null;                       // пусто — расходится
      if (a.activity === 'goto') { a.activity = 'wander'; a.goalPoi = null; }
    }
  }
}

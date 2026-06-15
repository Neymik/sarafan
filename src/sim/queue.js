import { T } from '../data/tuning.js';

export function queueSlotPos(poi, slot) {
  const [dx, dy] = poi.service.queueDir;
  return { x: poi.x + dx * T.queueSpacing * (slot + 1), y: poi.y + dy * T.queueSpacing * (slot + 1) };
}

export function initQueues(world) {
  world.queues = {};
  for (const [k, p] of Object.entries(world.map.pois))
    if (p.service) world.queues[k] = { line: [], servingUntil: 0 };
}

function serveDone(world, a, poiKey) {
  a.stress = Math.max(0, a.stress - T.serveSatisfaction);
  a.boredom = 0;
  a.visitedCount++;
  a.poiCooldown[poiKey] = world.t + T.poiCooldownTime;
  a.mobSince = undefined; a.mobPoi = undefined;
  a.activity = 'wander'; a.goalPoi = null; a.target = null;
  world.served = (world.served ?? 0) + 1;
}

export function queueTick(world, dt) {
  if (!world.queues) return;
  for (const [key, q] of Object.entries(world.queues)) {
    const poi = world.map.pois[key];

    // убрать из line деспавненных и не-queue агентов (активность могла смениться)
    q.line = q.line.filter(a => !a.despawn && a.activity === 'queue');

    // вступление: агенты с целью key рядом с POI → activity queue, goalPoi сброс
    for (const a of world.agents) {
      if (a.goalPoi !== key || a.activity === 'queue' || a.activity === 'mobbing') continue;
      if ((a.x - poi.x) ** 2 + (a.y - poi.y) ** 2 < T.queueJoinRadius ** 2) {
        a.activity = 'queue';
        a.goalPoi = null;
        q.line.push(a);
      }
    }

    // дезертирство → mobbing
    q.line = q.line.filter((a, slot) => {
      const headDensity = world.hash.queryCircle(poi.x, poi.y, 2).length;
      if (a.stress > T.queueDefectStress || slot > T.queueDefectSlot || headDensity > T.mobThreshold) {
        a.activity = 'mobbing';
        a.target = { x: poi.x, y: poi.y };
        a.mobPoi = key;
        a.mobSince ??= world.t;
        return false;
      }
      return true;
    });

    // обслуживание
    if (world.t >= q.servingUntil) {
      const mobDensity = world.hash.queryCircle(poi.x, poi.y, 2).length;
      const degraded = mobDensity > T.mobThreshold;
      const rate = poi.service.rate * 10 / T.timeScale / (degraded ? T.mobRateFactor : 1);
      let served = null;
      if (degraded) {
        // обслуживается случайный ближний (несправедливость)
        const near = world.agents.filter(x =>
          (x.activity === 'mobbing' || x.activity === 'queue') &&
          (x.x - poi.x) ** 2 + (x.y - poi.y) ** 2 < 4);
        if (near.length) {
          served = near[(Math.random() * near.length) | 0];
          if (q.line[0] && served !== q.line[0])
            q.line[0].stress = Math.min(100, q.line[0].stress + T.injusticeStress);
          const i = q.line.indexOf(served); if (i >= 0) q.line.splice(i, 1);
        }
      } else if (q.line.length) {
        const head = q.line[0];
        if ((head.x - poi.x) ** 2 + (head.y - poi.y) ** 2 < 9) served = q.line.shift();
      }
      if (served) { serveDone(world, served, key); q.servingUntil = world.t + rate; }
    }

    // слоты: каждый агент в очереди получает целевую позицию (после обслуживания — сдвиг)
    q.line.forEach((a, slot) => { a.target = queueSlotPos(poi, slot); });

    // mobbing-таймаут: устал толкаться — плюнул и ушёл (только моберы ЭТОГО poi)
    for (const a of world.agents) {
      if (a.activity !== 'mobbing' || a.mobPoi !== key) continue;
      a.mobSince ??= world.t;
      if (world.t - a.mobSince > 30) {
        a.mobSince = undefined; a.mobPoi = undefined;
        a.poiCooldown[key] = world.t + T.poiCooldownTime;
        a.activity = 'wander'; a.target = null;
        a.stress = Math.min(100, a.stress + 10);
      }
    }
  }
}

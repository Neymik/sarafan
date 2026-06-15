import { T } from '../data/tuning.js';
import { makeAgent } from './agent.js';

const STOCKED = ['merch1', 'merch2'];

export function initLogistics(world) {
  world.depot = { reserve: { merch1: T.reserveInit, merch2: T.reserveInit }, enRoute: {} };
}

function near(a, p) { return (a.x - p.fx) ** 2 + (a.y - p.fy) ** 2 < 4; }

function spawnCarrier(world, key) {
  const depot = world.map.pois.depot;
  const a = makeAgent(world, world.nextId = (world.nextId ?? 0) + 1);
  a.kind = 'carrier';
  a.x = depot.fx; a.y = depot.fy;
  a.maxSpeed = T.carrierSpeed; a.radius = 0.35; a.mass = 2.5;
  a.sociability = 0;
  a.activity = 'goto'; a.goalPoi = key; a.carryTo = key;
  a.beliefs.knownPois = new Set(Object.keys(world.map.pois)); // персонал знает план
  a.obstMask = world.obstMask ?? 0;
  world.agents.push(a);
  world.depot.enRoute[key] = a.id;
}

export function logisticsTick(world) {
  for (const key of STOCKED) {
    const p = world.map.pois[key];
    if (p.soldOut) continue;
    if (p.stock === 0 && world.depot.reserve[key] === 0 && !world.depot.enRoute[key]) {
      p.soldOut = true; p.weight = 0;
      const q = world.queues[key];
      for (const a of q.line) {
        a.stress = Math.min(100, a.stress + 10);
        a.activity = 'wander'; a.target = null;
        a.poiCooldown[key] = world.t + 1e9;
      }
      q.line = [];
      world.banner = { text: `${p.label}: РАСПРОДАНО`, t: world.t };
      continue;
    }
    if (p.stock < T.stockLow && world.depot.reserve[key] > 0 && !world.depot.enRoute[key]) spawnCarrier(world, key);
  }
  // вождение грузчиков
  for (const a of world.agents) {
    if (a.kind !== 'carrier' || a.despawn) continue;
    if (a.carryTo && near(a, world.map.pois[a.carryTo])) {
      const p = world.map.pois[a.carryTo];
      const add = Math.min(T.stockBatch, world.depot.reserve[a.carryTo]);
      p.stock += add;
      world.depot.reserve[a.carryTo] -= add;
      world.depot.enRoute[a.carryTo] = null;
      a.carryTo = null; a.goalPoi = 'depot';
    } else if (!a.carryTo && near(a, world.map.pois.depot)) {
      a.despawn = true;
    }
  }
}

import { T, gameClock } from '../data/tuning.js';
import { makeBeliefs } from './knowledge.js';
import { findPath, nearestWaypoint } from './pathfinding.js';

export const PRESETS = [ // веса [goto, wander, phone, rest], доля известной карты
  { name: 'planner',  w: [1.4, 0.6, 0.4, 0.8], mapKnown: 1.0 },
  { name: 'wanderer', w: [0.8, 1.3, 0.6, 0.8], mapKnown: 0.7 },
  { name: 'zombie',   w: [0.9, 0.7, 1.6, 0.6], mapKnown: 0.3 },
];

export function makeAgent(world, id) {
  const p = PRESETS[(Math.random() * PRESETS.length) | 0];
  const big = Math.random() < 0.06; // большой косплеер
  return {
    id, preset: p.name, mapKnown: p.mapKnown, weights: p.w,
    x: world.map.spawn.x + (Math.random() - 0.5) * 4,
    y: world.map.spawn.y + (Math.random() - 0.5) * 8,
    vx: 0, vy: 0,
    radius: big ? 0.45 : 0.22 + Math.random() * 0.08,
    mass: big ? 3 : 0.8 + Math.random() * 0.4,
    maxSpeed: 2.0 + Math.random() * 1.4,
    agility: 3 + Math.random() * 3,
    personalSpace: 0.4 + Math.random() * 1.0,
    conformity: 0.2 + Math.random() * 0.6,
    politeness: Math.random(),
    perception: 1,
    wantsConcert: Math.random() < 0.7,
    stress: 0, fatigue: 0, boredom: 0, phoneItch: Math.random() * 30,
    activity: 'wander', target: null, path: [], pathI: 0,
    deceivedUntil: -99, lostSince: 0, phoneDoneAt: 0, blockedTime: 0,
    nextThink: Math.random() * T.utilityTickEvery,
    neighbors: [], density: 0, contact: false, beliefs: makeBeliefs(world.map, p.mapKnown),
  };
}

export function setGoal(a, world, poiKey) {
  const poi = world.map.pois[poiKey];
  const from = nearestWaypoint(world.map, a.x, a.y);
  const p = findPath(world.map, a.beliefs, from, poi.wp);
  if (!p) return false;
  a.path = p; a.pathI = 0;
  if (p.length > 1) { // не идти назад к стартовому вейпоинту, если следующий уже ближе
    const w0 = world.map.waypoints[p[0]], w1 = world.map.waypoints[p[1]];
    if (Math.hypot(w1.x - a.x, w1.y - a.y) < Math.hypot(w0.x - a.x, w0.y - a.y)) a.pathI = 1;
  }
  const wpt = world.map.waypoints[poi.wp];
  a.target = { x: wpt.x + (Math.random() - 0.5) * 3, y: wpt.y + (Math.random() - 0.5) * 3, poi: poiKey };
  return true;
}

function inZone(a, world, zoneId) {
  const z = world.map.zones.find(z => z.id === zoneId);
  if (!z) return false;
  const r = z.rect;
  return a.x >= r[0] && a.x <= r[0] + r[2] && a.y >= r[1] && a.y <= r[1] + r[3];
}

export function think(a, world) {
  if (a.activity === 'lost') {
    // 1) вижу табло — мгновенно узнаю карту (и актуальную проходимость)
    for (const brd of world.map.boards) {
      if ((brd.x - a.x) ** 2 + (brd.y - a.y) ** 2 < T.sightRadius ** 2) {
        for (let i = 0; i < world.map.edges.length; i++) { a.beliefs.edgeKnown[i] = 1; a.beliefs.edgePassable[i] = world.edgePassable[i]; }
        a.activity = 'wander'; return;
      }
    }
    // 2) сосед-знаток поделился
    for (const b of a.neighbors) {
      if (b !== a && b.beliefs && b.activity !== 'phone' &&
          countKnown(b.beliefs) > countKnown(a.beliefs) + 3) {
        for (let i = 0; i < world.map.edges.length; i++)
          if (b.beliefs.edgeKnown[i]) { a.beliefs.edgeKnown[i] = 1; a.beliefs.edgePassable[i] = b.beliefs.edgePassable[i]; }
        a.activity = 'wander'; return;
      }
    }
    // 3) скачал карту (в толпе медленнее)
    if (world.t >= a.phoneDoneAt) {
      for (let i = 0; i < world.map.edges.length; i++) { a.beliefs.edgeKnown[i] = 1; a.beliefs.edgePassable[i] = world.edgePassable[i]; }
      a.activity = 'wander'; return;
    }
    // 4) таймаут — плюнул и забыл цель
    if (world.t - a.lostSince > T.lostTimeout) { a.wantsConcert = false; a.activity = 'wander'; return; }
    return; // стоит на месте — тело само собирает пробку
  }

  const f = world.facts.concert, belC = a.beliefs.events.concert;
  if (a.activity === 'goto' && inZone(a, world, belC.place) &&
      (f.status !== belC.status || f.time !== belC.time)) {
    a.beliefs.events.concert = { ...f, learnedAt: world.t }; // узнал глазами
    a.deceivedUntil = world.t + 15;
    a.stress = Math.min(100, a.stress + 25);
    a.activity = 'wander'; a.path = []; a.target = null;
    return; // переварит обиду до следующего think
  }

  const dt = T.utilityTickEvery;
  // нужды
  const moving = Math.hypot(a.vx, a.vy) > 0.3;
  a.fatigue  = Math.min(100, Math.max(0, a.fatigue + (moving ? T.fatigueRate : -T.fatigueRate) * dt));
  a.boredom  = Math.min(100, Math.max(0, a.boredom + ((a.activity === 'wander' || a.activity === 'rest') ? T.boredomRate : -T.boredomRate) * dt));
  a.phoneItch = Math.min(100, Math.max(0, a.phoneItch + (a.activity === 'phone' ? -8 : T.phoneItchRate) * dt));

  // utility GoTo: срочность концерта по МОЕМУ убеждению
  const bel = a.beliefs.events.concert;
  let goto_ = 0;
  if (a.wantsConcert && bel.status === 'on' && !inZone(a, world, bel.place)) {
    const left = bel.time - gameClock(world.t); // игровых секунд до начала
    goto_ = Math.max(0, Math.min(1.5, 1.5 * (1 - left / 1800)));
  }
  const u = {
    goto: a.weights[0] * goto_,
    wander: a.weights[1] * (0.3 + a.boredom / 200),
    phone: a.weights[2] * (a.phoneItch / 100),
    rest: a.weights[3] * ((a.fatigue + a.stress * 0.7) / 120),
  };
  if (u[a.activity] !== undefined) u[a.activity] *= T.hysteresis;

  let best = 'wander', bv = -1;
  for (const k in u) if (u[k] > bv) { bv = u[k]; best = k; }

  if (best === a.activity && a.path.length) return;
  switch (best) {
    case 'goto':
      if (!setGoal(a, world, bel.place)) { enterLost(a, world); return; } // enterLost — Task 10
      break;
    case 'wander': {
      const keys = Object.keys(world.map.pois);
      if (!setGoal(a, world, keys[(Math.random() * keys.length) | 0])) {
        a.path = []; // дорог не знает — топчется неподалёку
        a.target = { x: a.x + (Math.random() - 0.5) * 6, y: a.y + (Math.random() - 0.5) * 6 };
      }
      break;
    }
    case 'phone':
      a.path = []; a.target = null; break;
    case 'rest': {
      if (!setGoal(a, world, 'chill')) { a.path = []; a.target = null; } // отдыхает где стоит
      break;
    }
  }
  a.activity = best;
  a.perception = best === 'phone' ? 0 : 1;
}

export function enterLost(a, world) {
  a.activity = 'lost';
  a.perception = 1; // потерявшийся поднимает голову от телефона и озирается
  a.path = []; a.target = null;
  a.lostSince = world.t;
  a.stress = Math.min(100, a.stress + T.lostStressSpike);
  for (const b of a.neighbors) if (b !== a && b.stress !== undefined)
    b.stress = Math.min(100, b.stress + T.lostNeighborStress); // паника заразна
  a.phoneDoneAt = world.t + T.phoneMapBase * (1 + T.phoneMapDensityK * a.density); // плотность = перегруз WiFi
}

function countKnown(B) { let n = 0; for (const k of B.edgeKnown) n += k; return n; }

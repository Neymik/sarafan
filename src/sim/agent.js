import { T, gameClock } from '../data/tuning.js';
import { randomWalkableNear } from './flowfield.js';

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
    activity: 'wander', target: null,
    goalPoi: null, smartUntil: -99, doorMask: 0, talkWalk: false, despawn: false,
    deceivedUntil: -99, lostSince: 0, phoneDoneAt: 0, blockedTime: 0,
    nextThink: Math.random() * T.utilityTickEvery,
    neighbors: [], density: 0, contact: false,
    beliefs: {
      knownPois: new Set(Object.keys(world.map.pois)),
      jamMarks: [],
      events: { concert: { time: 14 * 3600, place: 'stage', status: 'on', learnedAt: 0 } },
    },
  };
}

export function setGoal(a, world, poiKey) {
  if (!a.beliefs.knownPois.has(poiKey)) return false;
  a.goalPoi = poiKey; a.target = null;
  return true;
}

function nearPoi(a, world, key) {
  const p = world.map.pois[key];
  return p ? (p.x - a.x) ** 2 + (p.y - a.y) ** 2 < 16 : false;
}

export function think(a, world) {
  if (a.activity === 'lost') {
    // lost block body — simplified for Task 4 bridge
    a.activity = 'wander'; return;
  }

  const f = world.facts.concert, belC = a.beliefs.events.concert;
  if (a.activity === 'goto' && nearPoi(a, world, belC.place) &&
      (f.status !== belC.status || f.time !== belC.time)) {
    a.beliefs.events.concert = { ...f, learnedAt: world.t }; // узнал глазами
    const benign = f.status === 'started' && belC.status === 'on' && f.time === belC.time;
    if (!benign) { // «концерт уже идёт, а я успел» — не обман
      a.deceivedUntil = world.t + 15;
      a.stress = Math.min(100, a.stress + 25);
      a.activity = 'wander'; a.goalPoi = null; a.target = null;
      return; // переварит обиду до следующего think
    }
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
  if (a.wantsConcert && (bel.status === 'on' || bel.status === 'started') && !nearPoi(a, world, bel.place)) {
    const left = bel.time - gameClock(world.t); // игровых секунд до начала
    goto_ = Math.max(0, Math.min(1.5, 1.5 * (1 - left / 1800)));
  }
  // если уже есть явная цель (goalPoi не концерт) — поддерживаем стремление хотя бы на 0.5
  if (a.goalPoi && a.goalPoi !== bel.place) goto_ = Math.max(goto_, 0.5);
  const u = {
    goto: a.weights[0] * goto_,
    wander: a.weights[1] * (0.3 + a.boredom / 200),
    phone: a.weights[2] * (a.phoneItch / 100),
    rest: a.weights[3] * ((a.fatigue + a.stress * 0.7) / 120),
  };
  if (u[a.activity] !== undefined) u[a.activity] *= T.hysteresis;

  let best = 'wander', bv = -1;
  for (const k in u) if (u[k] > bv) { bv = u[k]; best = k; }

  if (best === a.activity && (a.goalPoi || a.target)) return;
  switch (best) {
    case 'goto':
      if (a.beliefs.knownPois.has(bel.place)) { a.goalPoi = bel.place; a.target = null; }
      else { enterLost(a, world); return; }
      break;
    case 'wander': {
      const known = [...a.beliefs.knownPois].filter(k => {
        const p = world.map.pois[k]; return p && !p.exit && p.weight > 0;
      });
      // weighted random pick (weight from POI definition)
      let pick = null;
      if (known.length) {
        let sum = 0; for (const k of known) sum += world.map.pois[k].weight;
        let r = Math.random() * sum;
        for (const k of known) { r -= world.map.pois[k].weight; if (r <= 0) { pick = k; break; } }
        if (!pick) pick = known[known.length - 1];
      }
      if (!pick || !setGoal(a, world, pick)) {
        a.goalPoi = null;
        a.target = randomWalkableNear(world.fields.gridFor(0), a.x, a.y, 6);
      }
      break;
    }
    case 'phone':
      a.goalPoi = null; a.target = null; break;
    case 'rest': {
      if (!setGoal(a, world, 'info')) { a.goalPoi = null; a.target = null; }
      break;
    }
  }
  a.activity = best;
  a.perception = best === 'phone' ? 0 : 1;
}

export function enterLost(a, world) {
  a.activity = 'lost';
  a.perception = 1; // потерявшийся поднимает голову от телефона и озирается
  a.goalPoi = null; a.target = null;
  a.lostSince = world.t;
  a.stress = Math.min(100, a.stress + T.lostStressSpike);
  for (const b of a.neighbors) if (b !== a && b.stress !== undefined)
    b.stress = Math.min(100, b.stress + T.lostNeighborStress); // паника заразна
  a.phoneDoneAt = world.t + T.phoneMapBase * (1 + T.phoneMapDensityK * a.density); // плотность = перегруз WiFi
}

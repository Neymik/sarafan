import { T } from '../data/tuning.js';
import { makeBeliefs } from './knowledge.js';

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

import { T } from './tuning.js';
import { makeAgent } from '../sim/agent.js';
import { EXITS } from './map.js';

const h = (hh, mm) => ((hh - 13) * 3600 + mm * 60) / T.timeScale;

function spawnAt(world, exitKey) {
  const p = world.map.pois[exitKey];
  const a = makeAgent(world, world.nextId = (world.nextId ?? world.agents.length) + 1);
  a.x = p.x + (Math.random() - 0.5) * 2;
  a.y = p.y + (Math.random() - 0.5) * 2;
  world.agents.push(a);
}

export const SCHEDULE = [
  { at: h(13, 10), name: 'Поезд: +80 человек', fire(world) {
      for (let i = 0; i < 80; i++) spawnAt(world, 'exitMain');
  }},
  { at: h(13, 40), name: 'Западный проём — изменение', fire(world) {
      // door mechanism removed in v3 (Task 2)
  }},
  { at: h(14, 0), name: 'Концерт начался', fire(world) {
      world.facts.concert = { ...world.facts.concert, status: 'started', changedAt: world.t };
  }},
  { at: h(14, 20), name: 'Концерт закончился', fire(world) {
      world.facts.concert = { ...world.facts.concert, status: 'over', changedAt: world.t };
  }},
];

export function tickSchedule(world) {
  for (const ev of SCHEDULE) {
    if (!ev.done && world.t >= ev.at) { ev.done = true; ev.fire(world); world.banner = { text: ev.name, t: world.t }; }
  }
  // постоянный приток
  world.nextArrival ??= 2;
  if (world.t >= world.nextArrival && world.agents.length < T.maxAgents) {
    world.nextArrival = world.t + T.arrivalEvery * (0.5 + Math.random());
    spawnAt(world, EXITS[(Math.random() * EXITS.length) | 0]);
  }
}

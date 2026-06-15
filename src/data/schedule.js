import { T } from './tuning.js';
import { makeAgent } from '../sim/agent.js';

const h = (hh, mm) => ((hh - 13) * 3600 + mm * 60) / T.timeScale; // игровое время → world.t

export const SCHEDULE = [
  { at: h(13, 10), name: 'Поезд: +120 человек', fire(world) {
      for (let i = 0; i < 120; i++) world.agents.push(makeAgent(world, world.agents.length));
  }},
  { at: h(13, 40), name: 'Южная дверь сцены закрыта', fire(world) {
      world.edgePassable[10] = 0;
      world.facts.doorS = { open: false, changedAt: world.t };
  }},
  { at: h(14, 0), name: 'Концерт начался', fire(world) {
      world.facts.concert = { ...world.facts.concert, status: 'started', changedAt: world.t };
  }},
];

export function tickSchedule(world) {
  for (const ev of SCHEDULE) {
    if (!ev.done && world.t >= ev.at) { ev.done = true; ev.fire(world); world.banner = { text: ev.name, t: world.t }; }
  }
}

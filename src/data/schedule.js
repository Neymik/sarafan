import { T, gameClock } from './tuning.js';
import { makeAgent } from '../sim/agent.js';
import { EXITS } from './map.js';
import { randomWalkableNear } from '../sim/flowfield.js';

export const h = (hh, mm) => ((hh - 13) * 3600 + mm * 60) / T.timeScale;

export function spawnAt(world, exitKey) {
  const p = world.map.pois[exitKey];
  const a = makeAgent(world, world.nextId = (world.nextId ?? 0) + 1);
  const pos = randomWalkableNear(world.fields.gridFor(0), p.fx, p.fy, 1.5);
  a.x = pos.x; a.y = pos.y;
  world.agents.push(a);
  return a;
}

function pickWaveExit() {
  const r = Math.random();
  return r < 0.6 ? 'exitMain' : r < 0.8 ? 'exitW' : 'exitE';
}

export const SCHEDULE = [
  { at: h(15, 20), name: 'Выставка скоро закрывается', fire(w) { w.closing = true; } },
];

export function tickSchedule(world) {
  for (const ev of SCHEDULE) {
    if (!ev.done && world.t >= ev.at) { ev.done = true; ev.fire(world); world.banner = { text: ev.name, t: world.t }; }
  }
  // волна открытия: target — кумулятивная цель, отстающие входы догоняют
  if (world.t < T.openingWaveDur + 2) {
    world.waveSpawned ??= 0;
    const target = Math.min(T.openingWave, Math.floor(T.openingWave * world.t / T.openingWaveDur));
    let guard = 12; // не более 12 спавнов за тик (антиклот по горлу)
    while (world.waveSpawned < target && guard-- > 0) {
      const key = pickWaveExit();
      const p = world.map.pois[key];
      const jammed = world.hash.queryCircle(p.fx, p.fy, 2).length > T.jamN * 2; // вход забит — пробуем другой
      if (jammed) continue;
      spawnAt(world, key);
      world.waveSpawned++;
    }
    return;
  }
  // ручеёк после волны; приток глохнет в 15:00
  const gc = gameClock(world.t);
  if (gc >= 15 * 3600) return;
  world.nextArrival ??= world.t + 1;
  if (world.t >= world.nextArrival && world.agents.length < T.maxAgents) {
    world.nextArrival = world.t + T.arrivalEvery * (0.5 + Math.random());
    spawnAt(world, EXITS[(Math.random() * EXITS.length) | 0]);
  }
}

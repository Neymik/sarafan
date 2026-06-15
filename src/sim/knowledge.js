import { T } from '../data/tuning.js';

export function makeWorldFacts() {
  return {
    concert: { time: 14 * 3600, place: 'stage', status: 'on', changedAt: 0 },
    doorS:   { open: true, changedAt: 0 },   // южная дверь сцены = ребро e10
  };
}

export function makeBeliefs(map, mapKnown) {
  const E = map.edges.length;
  const known = new Uint8Array(E), passable = new Uint8Array(E).fill(1), congestion = new Uint8Array(E);
  for (let i = 0; i < E; i++) known[i] = Math.random() < mapKnown ? 1 : 0;
  known[0] = known[1] = 1; // вход знают все
  return {
    edgeKnown: known, edgePassable: passable, edgeCongestion: congestion,
    events: { concert: { time: 14 * 3600, place: 'stage', status: 'on', learnedAt: 0 } },
  };
}

// правда о загрузке рёбер, пересчёт ~раз в секунду
export function updateEdgeCongestion(world) {
  world.map.edges.forEach((e, i) => {
    const n = world.hash.queryCircle(e.mid.x, e.mid.y, 2).length;
    world.edgeCongestion[i] = Math.min(255, n * 20);
  });
}

// глаза: рёбра в радиусе видимости — узнаю правду
export function eyesUpdate(a, world) {
  const B = a.beliefs;
  world.map.edges.forEach((e, i) => {
    if ((e.mid.x - a.x) ** 2 + (e.mid.y - a.y) ** 2 < T.sightRadius ** 2) {
      B.edgeKnown[i] = 1;
      B.edgePassable[i] = world.edgePassable[i];
      B.edgeCongestion[i] = world.edgeCongestion[i];
    }
  });
}

// осмос: шанс перенять более свежий факт у случайного соседа, с мутацией
export function osmosis(a, world) {
  if (a.neighbors.length < 2 || Math.random() > T.osmosisChance * a.neighbors.length) return;
  const b = a.neighbors[(Math.random() * a.neighbors.length) | 0];
  if (b === a || !b.beliefs) return;
  const mine = a.beliefs.events.concert, theirs = b.beliefs.events.concert;
  if (theirs.learnedAt > mine.learnedAt) {
    a.beliefs.events.concert = { ...theirs };
    if (Math.random() < T.rumorMutation) { // слух искажается на ступень
      const m = a.beliefs.events.concert;
      if (Math.random() < 0.5) m.time += 600; else m.status = 'cancelled';
      m.learnedAt -= 1; // слух «чуть старше» правды из той же вспышки — правда побеждает при контакте
    }
  }
}

// табло: вещание правды всем видящим в радиусе
export function boardBroadcast(world, board, applyFn) {
  world.flashes.push({ x: board.x, y: board.y, t: world.t });
  for (const a of world.hash.queryCircle(board.x, board.y, T.boardRadius)) {
    if (a.perception > 0 && a.beliefs) applyFn(a, world);
  }
}

// отставание знания агента от правды (для цвета), в реальных секундах
export function knowledgeLag(a, world) {
  const f = world.facts.concert, b = a.beliefs.events.concert;
  const stale = f.time !== b.time || f.place !== b.place || f.status !== b.status;
  return stale ? world.t - f.changedAt : 0;
}

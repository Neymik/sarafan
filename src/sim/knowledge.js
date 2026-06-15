import { T } from '../data/tuning.js';
import { isWalkable } from './flowfield.js';

export function makeWorldFacts() {
  return {
    concert: { time: 14 * 3600, place: 'stage', status: 'on', changedAt: 0 },
    doorW: { open: true, changedAt: 0 },
  };
}

export function makeBeliefs(world, mapKnown) {
  const known = new Set();
  for (const [k, p] of Object.entries(world.map.pois)) {
    if (p.exit) { known.add(k); continue; }          // входы-выходы знают все
    if (Math.random() < mapKnown) known.add(k);
  }
  return {
    knownPois: known, jamMarks: [],
    events: { concert: { time: 14 * 3600, place: 'stage', status: 'on', learnedAt: 0 } },
  };
}

// глаза: открытие POI в радиусе зрения, двери, протухание jamMarks
export function eyesUpdate(a, world) {
  const B = a.beliefs;
  for (const [k, p] of Object.entries(world.map.pois)) {
    if (!B.knownPois.has(k) && (p.x - a.x) ** 2 + (p.y - a.y) ** 2 < T.sightRadius ** 2)
      B.knownPois.add(k);
  }
  world.map.doors.forEach((d, i) => {
    const bit = 1 << i;
    if ((world.doorsClosed & bit) && !(a.doorMask & bit)) {
      const cx = d.x + d.w / 2, cy = d.y + d.h / 2;
      if ((cx - a.x) ** 2 + (cy - a.y) ** 2 < T.sightRadius ** 2) {
        a.doorMask |= bit;
        a.stress = Math.min(100, a.stress + 10); // упс, закрыто
      }
    }
  });
  if (B.jamMarks.length) B.jamMarks = B.jamMarks.filter(j => world.t - j.learnedAt < T.jamMarkTtl);
}

// проба «впереди затор»: 2 точки вдоль скорости
export function probeJamAhead(a, world) {
  const sp = Math.hypot(a.vx, a.vy);
  if (sp < 0.1) return null;
  const ux = a.vx / sp, uy = a.vy / sp;
  for (const d of [3, 6]) {
    const x = a.x + ux * d, y = a.y + uy * d;
    if (world.hash.queryCircle(x, y, 2).length > T.jamThreshold) return { x, y, r: 2.5, learnedAt: world.t };
  }
  return null;
}

export function addJamMark(beliefs, mark) {
  for (const j of beliefs.jamMarks)
    if ((j.x - mark.x) ** 2 + (j.y - mark.y) ** 2 < 4) { j.learnedAt = mark.learnedAt; return; }
  beliefs.jamMarks.push(mark);
  if (beliefs.jamMarks.length > T.jamMarksMax) beliefs.jamMarks.shift();
}

// затор на моём пути? (метка в пределах 6 м впереди по направлению движения)
export function jamMarkAhead(a) {
  const sp = Math.hypot(a.vx, a.vy);
  if (sp < 0.1) return null;
  const ux = a.vx / sp, uy = a.vy / sp;
  for (const j of a.beliefs.jamMarks) {
    const rx = j.x - a.x, ry = j.y - a.y;
    const along = rx * ux + ry * uy;
    if (along > 0 && along < 6 && Math.abs(-rx * uy + ry * ux) < j.r + 1) return j;
  }
  return null;
}

// табло: вещание applyFn всем видящим в радиусе (как v1)
export function boardBroadcast(world, board, applyFn) {
  world.flashes.push({ x: board.x, y: board.y, t: world.t });
  for (const a of world.hash.queryCircle(board.x, board.y, T.boardRadius))
    if (a.perception > 0 && a.beliefs) applyFn(a, world);
}

// чему табло учит про СВОЙ участок: POI, двери и текущие заторы в boardLocalRadius
export function boardLocalLesson(world, board) {
  const R2 = T.boardLocalRadius ** 2;
  const pois = Object.entries(world.map.pois)
    .filter(([k, p]) => (p.x - board.x) ** 2 + (p.y - board.y) ** 2 < R2).map(([k]) => k);
  let doorBits = 0;
  world.map.doors.forEach((d, i) => {
    if ((d.x + d.w / 2 - board.x) ** 2 + (d.y + d.h / 2 - board.y) ** 2 < R2) doorBits |= 1 << i;
  });
  // заторы: пробы плотности у локальных POI
  const jams = [];
  for (const k of pois) {
    const p = world.map.pois[k];
    if (world.hash.queryCircle(p.x, p.y, 2.5).length > T.jamThreshold)
      jams.push({ x: p.x, y: p.y, r: 3, learnedAt: world.t });
  }
  return { pois, doorBits: doorBits & (world.doorsClosed ?? 0), jams };
}

export function knowledgeLag(a, world) {
  const f = world.facts.concert, b = a.beliefs.events.concert;
  const stale = f.time !== b.time || f.place !== b.place || f.status !== b.status;
  return stale ? world.t - f.changedAt : 0;
}

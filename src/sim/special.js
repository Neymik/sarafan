import { T, gameClock } from '../data/tuning.js';
import { makeAgent } from './agent.js';
import { randomWalkableNear } from './flowfield.js';
import { boardLocalLesson } from './knowledge.js';
import { h, spawnAt } from '../data/schedule.js';

// расписание выходов спецперсон
export const SPAWNS = [
  { at: 0.3,        kind: 'superfan', n: 5 },
  { at: h(13, 5),   kind: 'janitor',  n: 2 },
  { at: h(13, 15),  kind: 'journalist' },
  { at: h(13, 20),  kind: 'streamer' },
  { at: h(14, 50),  kind: 'streamer' },
  { at: h(13, 50),  kind: 'cosplayStar' },
  { at: h(15, 10),  kind: 'cosplayStar' },
];

export function spawnSpecial(world, kind) {
  const a = spawnAt(world, ['exitMain', 'exitW', 'exitE'][(Math.random() * 3) | 0]);
  switch (kind) {
    case 'superfan':
      a.superfan = true; a.stubborn = 1; a.wantsConcert = true;
      a.satThreshold = 99; // не уходит «насытившись»
      break;
    case 'streamer':
      a.kind = 'streamer'; a.maxSpeed *= 0.6;
      a.despawnAt = world.t + 15 * 60 / T.timeScale;
      a.beliefs.knownPois = new Set(Object.keys(world.map.pois));
      break;
    case 'cosplayStar': {
      a.kind = 'cosplayStar'; a.radius = 0.45; a.mass = 2;
      const spot = randomWalkableNear(world.fields.gridFor(0), 12 + Math.random() * 36, 8 + Math.random() * 24, 6);
      a.target = spot; a.activity = 'goto';
      break;
    }
    case 'janitor':
      a.kind = 'janitor'; a.maxSpeed = 1.6;
      break;
    case 'journalist':
      a.kind = 'journalist';
      a.despawnAt = h(15, 45);
      a.beliefs.knownPois = new Set(Object.keys(world.map.pois));
      break;
  }
  return a;
}

export function specialTick(world, dt) {
  world.spawnsDone ??= new Set();
  for (let idx = 0; idx < SPAWNS.length; idx++) {
    const ev = SPAWNS[idx];
    if (!world.spawnsDone.has(idx) && world.t >= ev.at) {
      world.spawnsDone.add(idx);
      for (let i = 0; i < (ev.n ?? 1); i++) spawnSpecial(world, ev.kind);
    }
  }
  streamerTick(world);
  starTick(world);
  pairSpawnTick(world);
  pairTick(world);
  janitorTick(world, dt);
  litterTick(world, dt);
  rumorTick(world);
  volunteerTick(world);
}

function pickPoiTarget(world, a) {
  const keys = Object.keys(world.map.pois).filter(k => {
    const p = world.map.pois[k];
    return !p.exit && !p.staff && p.weight > 0;
  });
  a.goalPoi = keys[(Math.random() * keys.length) | 0];
  a.activity = 'goto'; a.target = null;
}

function streamerTick(world) {
  for (const s of world.agents) {
    if (s.kind !== 'streamer') continue;
    if (world.t >= s.despawnAt) {
      s.despawn = true;
      for (const f of world.agents) if (f.activity === 'follow' && f.followTarget === s.id) { f.activity = 'wander'; f.target = null; }
      continue;
    }
    if (!s.goalPoi) pickPoiTarget(world, s);
    const p = world.map.pois[s.goalPoi];
    if (p && (s.x - p.fx) ** 2 + (s.y - p.fy) ** 2 < 9) pickPoiTarget(world, s);
    // вербовка хвоста
    let count = 0;
    for (const f of world.agents) if (f.activity === 'follow' && f.followTarget === s.id) count++;
    for (const b of world.hash.queryCircle(s.x, s.y, T.followAura)) {
      if (count >= T.followMax) break;
      if (b.kind !== 'visitor' || b.sociability <= 0.6) continue;
      if (b.activity !== 'wander' && b.activity !== 'browse') continue;
      b.activity = 'follow'; b.followTarget = s.id; b.goalPoi = null;
      count++;
    }
    // хвост держит курс на стримера
    for (const f of world.agents)
      if (f.activity === 'follow' && f.followTarget === s.id) f.target = { x: s.x, y: s.y };
  }
}

function starTick(world) {
  for (const s of world.agents) {
    if (s.kind !== 'cosplayStar') continue;
    if (s.activity === 'goto' && s.target && (s.x - s.target.x) ** 2 + (s.y - s.target.y) ** 2 < 1) {
      s.activity = 'pose'; s.target = null;
      s.poseUntil = world.t + T.poseGameMin * 60 / T.timeScale;
    }
    if (s.activity === 'pose') {
      if (world.t >= s.poseUntil) { s.despawn = true; continue; }
      for (const b of world.hash.queryCircle(s.x, s.y, T.starAura)) {
        if (b.kind !== 'visitor' || b.boredom < 40) continue;
        if (b.activity !== 'wander' && b.activity !== 'browse') continue;
        const spot = randomWalkableNear(world.fields.gridFor(0), s.x, s.y, 2);
        b.activity = 'browse'; b.browseUntil = s.poseUntil;
        b.goalPoi = null; b.target = spot;
        b.boredom = Math.max(0, b.boredom - 30); // сфоткал звезду
      }
    }
  }
}

function pairSpawnTick() {}
function pairTick() {}
function janitorTick() {}
function litterTick() {}
function rumorTick() {}
function volunteerTick() {}

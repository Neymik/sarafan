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

function pairSpawnTick(world) {
  world.nextPair ??= h(13, 8);
  if (world.t < world.nextPair) return;
  world.nextPair = world.t + T.pairEveryGameMin * 60 / T.timeScale;
  const key = ['exitMain', 'exitW', 'exitE'][(Math.random() * 3) | 0];
  const a = spawnAt(world, key), b = spawnAt(world, key);
  a.friendId = b.id; b.friendId = a.id;
}

export function pairTick(world) {
  for (const a of world.agents) {
    if (!a.friendId) continue;
    const b = world.agents.find(x => x.id === a.friendId);
    if (!b || b.despawn) { a.friendId = null; a.searching = false; continue; }
    if (a.id > b.id) continue; // пара обрабатывается один раз
    const d2 = (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
    if (!a.searching && d2 > T.pairSepDist ** 2) {
      for (const x of [a, b]) {
        x.searching = true; x.goalPoi = null; x.target = null; x.activity = 'wander';
        x.stress = Math.min(100, x.stress + 20);
        x.searchRetargetAt = 0;
      }
    } else if (a.searching && d2 < T.pairReuniteDist ** 2) {
      for (const x of [a, b]) { x.searching = false; x.stress = Math.min(x.stress, 10); x.target = null; }
      world.flashes.push({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, t: world.t, r: 2, kind: 'heart' });
    } else if (a.searching) {
      for (const x of [a, b]) {
        if (world.t >= (x.searchRetargetAt ?? 0)) {
          x.searchRetargetAt = world.t + 3;
          x.target = randomWalkableNear(world.fields.gridFor(0), x.x, x.y, 10);
        }
      }
    }
  }
}

function janitorTick(world, dt) {
  for (const j of world.agents) {
    if (j.kind !== 'janitor') continue;
    if (j.cleanUntil > world.t) continue;        // моет
    if (j.cleanTarget) {                          // домыл — убрать мусор
      const i = (world.litter ?? []).indexOf(j.cleanTarget);
      if (i >= 0) world.litter.splice(i, 1);
      j.cleanTarget = null;
    }
    let best = null, bd = 25;
    for (const l of world.litter ?? []) {
      const d2 = (l.x - j.x) ** 2 + (l.y - j.y) ** 2;
      if (d2 < bd) { bd = d2; best = l; }
    }
    if (best) {
      if (bd < 0.36) { j.cleanTarget = best; j.cleanUntil = world.t + 2; j.activity = 'clean'; j.target = null; }
      else { j.activity = 'wander'; j.target = { x: best.x, y: best.y }; }
    } else if (!j.target) {
      j.activity = 'wander';
      j.target = randomWalkableNear(world.fields.gridFor(0), j.x, j.y, 8);
    }
  }
}

function litterTick(world, dt) {
  world.litter ??= [];
  world.litterTimer = (world.litterTimer ?? 0) - dt;
  if (world.litterTimer > 0 || !world.fields.density) return;
  world.litterTimer = T.litterEvery;
  const d = world.fields.density, g = world.fields.gridFor(0);
  for (let i = 0; i < d.length; i++) {
    if (world.litter.length >= T.litterMax) break;
    if (d[i] >= T.jamN && Math.random() < T.litterChance)
      world.litter.push({ x: i % g.W + Math.random(), y: ((i / g.W) | 0) + Math.random() });
  }
}

function rumorTick(world) {
  world.nextRumor ??= T.rumorEvery;
  if (world.t < world.nextRumor) return;
  world.nextRumor = world.t + T.rumorEvery + (Math.random() * 2 - 1) * T.rumorJitter;
  injectSpontaneousRumor(world);
}

export function injectSpontaneousRumor(world) {
  const cands = world.agents.filter(a => a.kind === 'visitor' && a.sociability > 0.7 && a.perception > 0);
  if (!cands.length) return;
  const a = cands[(Math.random() * cands.length) | 0];
  const f = world.facts.concert;
  a.beliefs.events.concert = Math.random() < 0.5
    ? { ...f, status: 'cancelled', learnedAt: world.t }
    : { ...f, time: f.time + 1800, learnedAt: world.t };
  let nearest = '', bd = Infinity;
  for (const [k, p] of Object.entries(world.map.pois)) {
    const d2 = (p.fx - a.x) ** 2 + (p.fy - a.y) ** 2;
    if (d2 < bd) { bd = d2; nearest = p.label; }
  }
  world.banner = { text: `🔥 Слух пошёл (район: ${nearest})`, t: world.t };
}

function volunteerTick(world) {
  for (const v of world.volunteers ?? []) {
    for (const a of world.hash.queryCircle(v.x, v.y, T.volunteerRadius)) {
      if (!a.beliefs || a.kind !== 'visitor') continue;
      if (a.activity === 'lost') {
        for (const k of Object.keys(world.map.pois)) a.beliefs.knownPois.add(k);
        a.obstMask = world.obstMask ?? 0;
        a.activity = 'wander'; a.stress = Math.max(0, a.stress - 15);
      } else if ((a.volTaughtAt ?? -99) + T.volunteerTeachEvery < world.t) {
        a.volTaughtAt = world.t;
        const lesson = boardLocalLesson(world, v);   // v = {x, y} — годится как «табло»
        for (const k of lesson.pois) a.beliefs.knownPois.add(k);
        a.obstMask |= lesson.obstBits;
      }
    }
  }
}

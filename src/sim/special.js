import { T, gameClock } from '../data/tuning.js';
import { makeAgent } from './agent.js';
import { randomWalkableNear } from './flowfield.js';
import { boardLocalLesson } from './knowledge.js';
import { h, spawnAt } from '../data/schedule.js';

// расписание выходов спецперсон
export const SPAWNS = [
  { at: 0.3,        kind: 'superfan', n: 5 },
  { at: 0.5,        kind: 'leader',   n: 1 },
  { at: h(13, 5),   kind: 'janitor',  n: 2 },
  { at: h(13, 15),  kind: 'journalist' },
  { at: h(13, 20),  kind: 'streamer' },
  { at: h(13, 40),  kind: 'leader',   n: 1 },
  { at: h(14, 50),  kind: 'streamer' },
  { at: h(13, 50),  kind: 'cosplayStar' },
  { at: h(15, 10),  kind: 'cosplayStar' },
];

export function spawnSpecial(world, kind) {
  if (kind === 'leader') return spawnLeader(world);
  const a = spawnAt(world, ['exitMain', 'exitW', 'exitE'][(Math.random() * 3) | 0]);
  switch (kind) {
    case 'superfan':
      a.superfan = true; a.stubborn = 1;
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
  journalistTick(world);
  starTick(world);
  pairSpawnTick(world);
  pairTick(world);
  janitorTick(world, dt);
  litterTick(world, dt);
  rumorTick(world);
  volunteerNpcTick(world, dt);
  leaderTick(world);
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

function journalistTick(world) {
  for (const j of world.agents) {
    if (j.kind !== 'journalist') continue;
    if (world.t >= j.despawnAt) { j.despawn = true; continue; }
    if (!j.goalPoi) pickPoiTarget(world, j);
    const p = world.map.pois[j.goalPoi];
    if (p && (j.x - p.fx) ** 2 + (j.y - p.fy) ** 2 < 9) pickPoiTarget(world, j);
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
    if (a.despawn) continue; // деспавнящийся не пугает напарника разлукой
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
    if (d[i] >= T.litterJamCell && Math.random() < T.litterChance)
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

  // 50/50: booth-сарафан или эвент-мутация
  const boothKeys = Object.keys(world.map.pois).filter(k => world.map.pois[k].booth);
  if (Math.random() < 0.5 && boothKeys.length) {
    // booth-сарафан: пометить случайного visitor евангелистом или нытиком на 30 с
    const key = boothKeys[(Math.random() * boothKeys.length) | 0];
    const visitor = cands[(Math.random() * cands.length) | 0];
    if (Math.random() < 0.5) {
      visitor.evangelBooth = key;
      visitor.evangelistUntil = world.t + 30;
    } else {
      visitor.complainBooth = key;
      visitor.complainUntil = world.t + 30;
    }
    const p = world.map.pois[key];
    world.banner = { text: `🔥 Сарафан о бутике: ${p.label ?? key}`, t: world.t };
    // также мутируем эвент-слух (чтобы всегда гарантировать зачинщика)
    const ce = (world.events ?? []).find(e => e.id === 'concert');
    if (ce && ce.status !== 'over') {
      a.beliefs.knownEvents.add('concert');
      a.beliefs.eventTime['concert'] = ce.time + 1800;
    }
    return;
  }

  // эвент-мутация: сдвинуть время концерта
  const ce = (world.events ?? []).find(e => e.id === 'concert');
  if (ce && ce.status !== 'over') {
    // слух: сдвинуть время концерта на +30 мин у этого агента
    a.beliefs.knownEvents.add('concert');
    a.beliefs.eventTime['concert'] = ce.time + 1800;
  }
  let nearest = '', bd = Infinity;
  for (const [k, p] of Object.entries(world.map.pois)) {
    const d2 = (p.fx - a.x) ** 2 + (p.fy - a.y) ** 2;
    if (d2 < bd) { bd = d2; nearest = p.label; }
  }
  world.banner = { text: `🔥 Слух пошёл (район: ${nearest})`, t: world.t };
}

export function volunteerNpcTick(world, dt) {
  for (const v of world.agents) {
    if (v.kind !== 'volunteer') continue;
    // снять стресс рядом + вылечить lost
    for (const o of world.hash.queryCircle(v.x, v.y, T.volunteerRadius)) {
      if (o === v) continue;
      if (o.stress !== undefined) o.stress = Math.max(0, o.stress - T.volRelief * dt);
      if (o.activity === 'lost' && o.beliefs) {
        for (const k of Object.keys(world.map.pois)) o.beliefs.knownPois.add(k);
        o.obstMask = world.obstMask ?? 0; o.activity = 'wander';
      }
    }
    // искать самый стрессовый кластер раз в 1.5с
    if ((v.nextSeek ?? 0) <= world.t) {
      v.nextSeek = world.t + 1.5;
      let best = null, bs = 15;
      for (const o of world.agents) {
        if (o.kind !== 'visitor' || o.stress < 50) continue;
        const c = world.hash.queryCircle(o.x, o.y, 2).reduce((s, x) => s + (x.stress ?? 0), 0);
        if (c > bs) { bs = c; best = o; }
      }
      v.target = best ? { x: best.x, y: best.y } : randomWalkableNear(world.fields.gridFor(0), v.x, v.y, 8);
    }
  }
}

export function spawnLeader(world) {
  const L = spawnAt(world, 'exitMain');
  L.kind = 'leader';
  L.beliefs.knownPois = new Set(Object.keys(world.map.pois));
  pickPoiTarget(world, L);
  for (let i = 0; i < T.leaderGroupSize; i++) {
    const f = spawnAt(world, 'exitMain');
    f.activity = 'follow'; f.followTarget = L.id; f.goalPoi = null;
  }
  return L;
}

function leaderTick(world) {
  for (const L of world.agents) {
    if (L.kind !== 'leader') continue;
    if (!L.goalPoi || (world.map.pois[L.goalPoi] &&
        (L.x - world.map.pois[L.goalPoi].fx) ** 2 + (L.y - world.map.pois[L.goalPoi].fy) ** 2 < 9)) pickPoiTarget(world, L);
    for (const f of world.agents)
      if (f.activity === 'follow' && f.followTarget === L.id) f.target = { x: L.x, y: L.y };
  }
}

import { T, gameClock, gameOffset } from '../data/tuning.js';
import { makeBeliefs, probeJamAhead, jamMarkAhead, addJamMark, boardLocalLesson } from './knowledge.js';
import { randomWalkableNear } from './flowfield.js';
import { knownEventUrgency } from '../data/events.js';

export const PRESETS = [ // веса [goto, wander, phone, rest], доля известной карты
  { name: 'planner',  w: [1.4, 0.6, 0.4, 0.8], mapKnown: 1.0 },
  { name: 'wanderer', w: [0.8, 1.3, 0.6, 0.8], mapKnown: 0.7 },
  { name: 'zombie',   w: [0.9, 0.7, 1.6, 0.6], mapKnown: 0.3 },
];

export function makeAgent(world, id) {
  const p = PRESETS[(Math.random() * PRESETS.length) | 0];
  const big = Math.random() < T.bigChance; // большой косплеер
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
    joy: T.joyStart + Math.random() * T.joyJitter,
    attendedEvents: new Set(),
    evangelBooth: null, evangelistUntil: 0, complainBooth: null, complainUntil: 0,
    lureTarget: null,
    stress: 0, fatigue: 0, boredom: 0, phoneItch: Math.random() * 30,
    activity: 'wander', target: null,
    goalPoi: null, smartUntil: -99, obstMask: 0, talkWalk: false, despawn: false,
    kind: 'visitor', poiPromo: {}, searching: false, dragged: false, friendId: null, superfan: false,
    deceivedUntil: -99, lostSince: 0, phoneDoneAt: 0, blockedTime: 0,
    nextThink: Math.random() * T.utilityTickEvery,
    neighbors: [], density: 0, contact: false,
    sociability: Math.random(), stubborn: Math.random(),
    talkCooldownUntil: 0, talkWith: -1, talkEndAt: 0,
    jamReactAt: 0, poiCooldown: {}, browseUntil: 0,
    visitedCount: 0, satThreshold: 6 + (Math.random() * 8 | 0),
    beliefs: makeBeliefs(world, p.mapKnown),
  };
}

function nearPoi(a, world, key) {
  const p = world.map.pois[key];
  return p ? (p.fx - a.x) ** 2 + (p.fy - a.y) ** 2 < 16 : false;
}

export function computeDesires(a, world) {
  const out = [];
  for (const k of a.beliefs.knownPois) {
    const p = world.map.pois[k];
    if (!p || p.exit || p.staff || p.weight <= 0) continue;
    if ((a.poiCooldown[k] ?? 0) > world.t) continue;
    let s = p.weight * ((a.poiPromo[k] ?? 0) > world.t ? T.promoFactor : 1) * (a.visitedPois?.has(k) ? 0.3 : 1);
    for (const ev of (world.events ?? [])) {
      if (ev.poi !== k || !a.beliefs.knownEvents.has(ev.id) || ev.status === 'over' || a.attendedEvents.has(ev.id)) continue;
      const bt = a.beliefs.eventTime[ev.id] ?? ev.time;
      const left = bt - gameOffset(world.t);  // both bt and gameOffset are offsets from 13:00
      if (left < 1800) s *= 1 + ev.hype * Math.max(0.2, 1 - left / 1800);
    }
    out.push({ key: k, score: s });
  }
  out.sort((x, y) => y.score - x.score);
  return out;
}

function weightedPickPoi(a, world) {
  const d = computeDesires(a, world);
  if (!d.length) return null;
  let sum = 0; for (const e of d) sum += e.score;
  if (sum <= 0) return d[0].key;
  let r = Math.random() * sum;
  for (const e of d) { r -= e.score; if (r <= 0) return e.key; }
  return d[d.length - 1].key;
}

function nearestExit(a, world) {
  let best = null, bd = Infinity;
  for (const [k, p] of Object.entries(world.map.pois)) {
    if (!p.exit) continue;
    const d = (p.fx - a.x) ** 2 + (p.fy - a.y) ** 2;
    if (d < bd) { bd = d; best = k; }
  }
  return best;
}

function startExplore(a, world) {
  a.goalPoi = null;
  a.target = randomWalkableNear(world.fields.gridFor(0), a.x, a.y, 8);
}

export function arrive(a, world) { // дошёл до goalPoi (несервисного)
  const p = world.map.pois[a.goalPoi];
  // эвент на этом POI, который агент знал и ещё не посещал
  for (const ev of (world.events ?? [])) {
    if (ev.poi !== a.goalPoi || ev.status !== 'live') continue;
    if (!a.beliefs.knownEvents.has(ev.id) || a.attendedEvents.has(ev.id)) continue;
    a.attendedEvents.add(ev.id);
    a.joy = Math.max(0, Math.min(100, a.joy + ev.quality * 25 + T.eventBonus));
  }
  // качество бутика
  if (p && p.booth) {
    const dJoy = p.quality * 25;
    a.joy = Math.max(0, Math.min(100, a.joy + dJoy));
    if (dJoy > 15) { a.evangelBooth = a.goalPoi; a.evangelistUntil = world.t + T.evangelistTime; a.sociability = Math.min(1, a.sociability * 1.5); }
    else if (dJoy < -15) { a.stress = Math.min(100, a.stress + 8); a.complainBooth = a.goalPoi; a.complainUntil = world.t + T.evangelistTime; }
  }
  (a.visitedPois ??= new Set()).add(a.goalPoi);
  a.visitedCount++;
  a.poiCooldown[a.goalPoi] = world.t + T.poiCooldownTime;
  a.browseUntil = world.t + T.browseMin + Math.random() * (T.browseMax - T.browseMin);
  a.target = randomWalkableNear(world.fields.gridFor(0), a.x, a.y, 2);
  a.goalPoi = null;
  a.activity = 'browse';
}

export function think(a, world) {
  if (a.kind !== 'visitor') return;          // спецагентов ведут special/logistics
  if (a.searching) return;                    // ищет друга — ведёт special.js
  if (a.activity === 'follow') {              // хвост стримера
    const s = world.agents.find(x => x.id === a.followTarget);
    if (!s || s.despawn) { a.activity = 'wander'; a.target = null; }
    return;
  }
  if (a.activity === 'talk' || a.activity === 'queue' || a.activity === 'mobbing') return; // ведут dialogue.js / queue.js
  if (a.activity === 'lost') { thinkLost(a, world); return; }

  if (a.superfan) {
    const ce = world.events?.find(e => e.id === 'concert');
    const over = !ce || ce.status === 'over';
    if (over) { a.superfan = false; if (a.browseUntil > world.t + 60) a.browseUntil = 0; }
    else {
      const bt = a.beliefs.eventTime?.['concert'] ?? ce.time;
      const soon = ce.status === 'live' || gameOffset(world.t) >= bt - 1800;  // bt is offset from 13:00
      a.beliefs.knownEvents.add('concert');           // суперфан всегда знает про концерт
      if (soon) {
        if (nearPoi(a, world, 'stage')) { a.activity = 'browse'; a.browseUntil = world.t + 9999; a.goalPoi = null; return; }
        if (a.activity !== 'queue' && a.activity !== 'mobbing') { a.activity = 'goto'; a.goalPoi = 'stage'; a.target = null; return; }
      } else if (!a.visitedPois?.has('autograph') && a.activity !== 'queue' && a.activity !== 'mobbing' && a.goalPoi !== 'autograph') {
        a.activity = 'goto'; a.goalPoi = 'autograph'; a.target = null; return;
      }
    }
  }

  const dt = T.utilityTickEvery;
  // нужды
  const moving = Math.hypot(a.vx, a.vy) > 0.3;
  a.fatigue = Math.min(100, Math.max(0, a.fatigue + (moving ? T.fatigueRate : -T.fatigueRate) * dt));
  a.boredom = Math.min(100, Math.max(0, a.boredom + ((a.activity === 'wander' || a.activity === 'rest' || a.activity === 'browse') ? T.boredomRate : -T.boredomRate) * dt));
  a.phoneItch = Math.min(100, Math.max(0, a.phoneItch + (a.activity === 'phone' ? -8 : T.phoneItchRate) * dt));

  // паническое забывание
  if (a.stress > 80 && Math.random() < T.panicForgetChance) {
    const ks = [...a.beliefs.knownPois].filter(k => !world.map.pois[k].exit);
    if (ks.length) {
      const lost = ks[(Math.random() * ks.length) | 0];
      a.beliefs.knownPois.delete(lost);
      if (a.goalPoi === lost) { a.goalPoi = null; a.target = null; }
    }
  }

  // browse: стоим у стенда, пока не надоело
  if (a.activity === 'browse' && world.t < a.browseUntil) return;

  // прибытие к цели
  if (a.goalPoi) {
    const p = world.map.pois[a.goalPoi];
    if (p.exit) {  // выходы всасывают издалека при закрытии — иначе давка в дверях
      const r2 = world.closing ? 81 : 16;
      if ((p.fx - a.x) ** 2 + (p.fy - a.y) ** 2 < r2) { a.despawn = true; return; }
    } else if (nearPoi(a, world, a.goalPoi)) {
      if (p.service) return; // вступление в очередь делает queue.js (queueTick)
      arrive(a, world);
      return;
    }
  }

  // реакция на затор впереди (только когда есть цель-поле)
  if (a.goalPoi && world.t > a.jamReactAt) {
    const jam = probeJamAhead(a, world) || jamMarkAhead(a);
    if (jam) {
      a.jamReactAt = world.t + T.jamReactCooldown;
      addJamMark(a.beliefs, { ...jam, learnedAt: world.t });
      const urgent = a.activity === 'goto';
      if (a.stubborn > 0.65 || urgent) {
        // «пофиг, прорвусь» — ничего не меняем
      } else if (Math.random() < 0.5 + a.sociability * 0.2) {
        a.smartUntil = world.t + T.smartDuration;            // «обойду»
      } else {
        a.poiCooldown[a.goalPoi] = world.t + T.poiCooldownTime; // «да ну его»
        a.goalPoi = null; a.target = null; a.activity = 'wander';
      }
    }
  }

  // utility
  const ev = knownEventUrgency(a, world);
  const goto_ = Math.min(1.5, ev.urgency * 0.3);
  const u = {
    goto: a.weights[0] * goto_,
    wander: a.weights[1] * (0.3 + a.boredom / 200),
    phone: a.weights[2] * (a.phoneItch / 100),
    rest: a.weights[3] * ((a.fatigue + a.stress * 0.7) / 120),
    leave: (world.closing ? 1.6 : T.leaveWeight) *
      Math.max(world.closing ? 0.8 : 0, Math.min(1.5, (a.visitedCount / a.satThreshold) * 0.8 + a.fatigue / 150)),
  };
  if (u[a.activity] !== undefined) u[a.activity] *= T.hysteresis;

  let best = 'wander', bv = -1;
  for (const k in u) if (u[k] > bv) { bv = u[k]; best = k; }

  if (best === a.activity && (a.goalPoi || a.target)) return;
  switch (best) {
    case 'goto':
      if (ev.poi && a.beliefs.knownPois.has(ev.poi)) { a.goalPoi = ev.poi; a.target = null; }
      else { a.activity = 'wander'; a.goalPoi = null; }   // знал эвент, но не место — побредёт/исследует
      break;
    case 'wander': {
      const pick = weightedPickPoi(a, world);
      if (pick) { a.goalPoi = pick; a.target = null; }
      else startExplore(a, world);  // ничего не знает — исследует и учится глазами
      break;
    }
    case 'phone':
      a.goalPoi = null; a.target = null; break;
    case 'rest': {
      // отдых: стоит, а если давка — отползает в случайную сторону
      a.goalPoi = null;
      a.target = a.density > T.comfortN ? randomWalkableNear(world.fields.gridFor(0), a.x, a.y, 5) : null;
      break;
    }
    case 'leave': {
      a.goalPoi = nearestExit(a, world); a.target = null; break;
    }
  }
  a.activity = best;
  a.perception = best === 'phone' ? 0 : 1;
}

function thinkLost(a, world) {
  // 1) табло рядом — учит своему участку; выходим, если цель теперь известна
  for (const brd of world.map.boards) {
    if ((brd.x - a.x) ** 2 + (brd.y - a.y) ** 2 < T.sightRadius ** 2) {
      const lesson = boardLocalLesson(world, brd);
      for (const k of lesson.pois) a.beliefs.knownPois.add(k);
      a.obstMask |= lesson.obstBits;
      if (!a.lostGoal || a.beliefs.knownPois.has(a.lostGoal)) { a.activity = 'wander'; return; }
    }
  }
  // 2) сосед знает мою цель
  for (const b of a.neighbors) {
    if (b !== a && b.beliefs && b.activity !== 'phone' && a.lostGoal && b.beliefs.knownPois.has(a.lostGoal)) {
      a.beliefs.knownPois.add(a.lostGoal);
      a.activity = 'wander'; return;
    }
  }
  // 3) скачал план выставки (в толпе медленнее)
  if (world.t >= a.phoneDoneAt) {
    for (const k of Object.keys(world.map.pois)) a.beliefs.knownPois.add(k);
    a.obstMask = world.obstMask ?? 0;
    a.activity = 'wander'; return;
  }
  // 4) таймаут
  if (world.t - a.lostSince > T.lostTimeout) { a.lostGoal = null; a.activity = 'wander'; return; }
}

export function enterLost(a, world, goalKey) {
  a.activity = 'lost';
  a.perception = 1;
  a.goalPoi = null; a.target = null;
  a.lostGoal = goalKey ?? null;
  a.lostSince = world.t;
  a.stress = Math.min(100, a.stress + T.lostStressSpike);
  for (const b of a.neighbors) if (b !== a && b.stress !== undefined)
    b.stress = Math.min(100, b.stress + T.lostNeighborStress);
  a.phoneDoneAt = world.t + T.phoneMapBase * (1 + T.phoneMapDensityK * a.density);
}

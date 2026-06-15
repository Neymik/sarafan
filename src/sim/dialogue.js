import { T } from '../data/tuning.js';
import { addJamMark } from './knowledge.js';

export function bystanderChance(d) {
  return Math.max(0, T.bystanderBase * (1 - d / T.bystanderRadius));
}

// тема: случайный факт из знаний обоих. kinds: poi | jam | event | obst | boothGood | boothBad
export function pickTopic(a, b, world) {
  for (const src of [a, b]) {
    if (src.evangelistUntil > world.t && src.evangelBooth) return { kind: 'boothGood', key: src.evangelBooth };
    if (src.complainUntil > world.t && src.complainBooth) return { kind: 'boothBad', key: src.complainBooth };
  }
  const topics = [];
  for (const src of [a, b]) {
    for (const k of src.beliefs.knownPois) topics.push({ kind: 'poi', poi: k });
    for (const j of src.beliefs.jamMarks) topics.push({ kind: 'jam', jam: { ...j } });
    for (const id of src.beliefs.knownEvents) topics.push({ kind: 'event', id, time: src.beliefs.eventTime[id] });
    const ob = src.obstMask & (world.obstMask ?? ~0);
    if (ob) topics.push({ kind: 'obst', mask: ob });
  }
  if (!topics.length) return null;
  return topics[(Math.random() * topics.length) | 0];
}

export function applyTopic(agent, topic, t, noMutation = false) {
  switch (topic.kind) {
    case 'poi': agent.beliefs.knownPois.add(topic.poi); break;
    case 'jam': addJamMark(agent.beliefs, { ...topic.jam }); break;
    case 'obst': agent.obstMask |= topic.mask; break;
    case 'event': {
      const cur = agent.beliefs.eventTime[topic.id];
      if (cur === undefined || (topic.learnedAt ?? 0) >= 0) {  // принимаем знание
        agent.beliefs.knownEvents.add(topic.id);
        if (topic.time !== undefined) agent.beliefs.eventTime[topic.id] = topic.time;
      }
      break;
    }
    case 'boothGood': agent.beliefs.knownPois.add(topic.key); agent.poiPromo[topic.key] = t + T.promoTime; break;
    case 'boothBad': agent.poiCooldown[topic.key] = t + T.poiCooldownTime; break;
  }
}

// ЗАМЕЧАНИЕ: используем простую и корректную версию
function canTalk(a, world) {
  if (a.kind !== 'visitor') return false;
  if (a.perception <= 0 || a.talkCooldownUntil > world.t) return false;
  return ['wander', 'browse', 'rest'].includes(a.activity);
}

export function dialogueTick(world, dt) {
  const { agents } = world;
  // завершение разговоров
  for (const a of agents) {
    if (a.activity !== 'talk') continue;
    if (world.t >= a.talkEndAt) {
      const b = agents.find(x => x.id === a.talkWith);
      finishTalk(world, a, b);
    }
  }
  // старт новых
  for (const a of agents) {
    if (!canTalk(a, world)) continue;
    for (const b of a.neighbors) {
      if (b === a || b.id <= a.id) continue;
      if (!canTalk(b, world)) continue;
      if ((a.x - b.x) ** 2 + (a.y - b.y) ** 2 > T.talkRadius ** 2) continue;
      if (Math.random() > T.talkChance * a.sociability * b.sociability * dt * 10) continue;
      const dur = T.talkMin + Math.random() * (T.talkMax - T.talkMin);
      const sameDir = (a.vx * b.vx + a.vy * b.vy) > 0 && Math.hypot(a.vx, a.vy) > 0.5;
      for (const x of [a, b]) {
        x.activity = 'talk';
        x.talkWith = x === a ? b.id : a.id;
        x.talkEndAt = world.t + dur;
        x.talkWalk = sameDir;
        if (!sameDir) { x.goalPoi = null; x.target = null; }
      }
      break;
    }
  }
}

export function finishTalk(world, a, b) {
  // Если b уже завершил разговор (talkWith уже != a.id или activity != 'talk'),
  // это значит finishTalk уже был вызван для b раньше в этой итерации цикла.
  // Проверяем: если b.activity !== 'talk', то он уже освобождён — передаём undefined.
  const bActive = b && b.activity === 'talk' && b.talkWith === a.id ? b : undefined;
  const peers = bActive ? [a, bActive] : [a];
  const mx = bActive ? (a.x + bActive.x) / 2 : a.x;
  const my = bActive ? (a.y + bActive.y) / 2 : a.y;
  if (bActive) {
    const topic = pickTopic(a, bActive, world);
    const nearVol = (world.volunteers ?? []).some(v => (v.x - mx) ** 2 + (v.y - my) ** 2 < T.volunteerRadius ** 2);
    if (topic) {
      for (const x of peers) if (Math.random() < T.talkTransfer) applyTopic(x, topic, world.t, nearVol);
      // зеваки
      world.flashes.push({ x: mx, y: my, t: world.t, r: T.bystanderRadius }); // мини-волна знания
      for (const o of world.hash.queryCircle(mx, my, T.bystanderRadius)) {
        if (o === a || o === bActive || !o.beliefs || o.perception <= 0) continue;
        if (Math.random() < bystanderChance(Math.hypot(o.x - mx, o.y - my))) applyTopic(o, topic, world.t, nearVol);
      }
    }
  }
  world.talksFinished = (world.talksFinished ?? 0) + (bActive ? 1 : 0);
  for (const x of peers) {
    x.activity = 'wander';
    x.talkWith = -1; x.talkWalk = false;
    x.talkCooldownUntil = world.t + T.talkCooldown;
    x.boredom = Math.max(0, x.boredom - 25);   // поболтал — повеселел
    if (x.personalSpace < T.extrovertSpace) {
      x.stress = Math.max(0, x.stress - T.talkRelief);
      x.joy = Math.min(100, (x.joy ?? 50) + T.talkJoy);
    }
  }
}

import { T, gameClock } from './tuning.js';

// Стартовое расписание (организатор видит все, агенты — частично). time/dur в игр. сек от 13:00.
export function makeEvents(map) {
  const h = (hh, mm) => (hh - 13) * 3600 + mm * 60;
  const base = [
    { id: 'autograph', poi: 'autograph', time: h(13, 30), dur: 30 * 60, hype: 4, quality: 0.6,  title: 'Автограф-сессия' },
    { id: 'concert',   poi: 'stage',     time: h(14, 30), dur: 30 * 60, hype: 6, quality: 0.8,  title: 'Главный концерт' },
    { id: 'drop',      poi: 'merch2',    time: h(15, 0),  dur: 20 * 60, hype: 4, quality: 0.4,  title: 'Дроп лимитки' },
  ];
  // 2 сюрприза на случайных бутиках (один может быть хайп+помойка)
  const booths = Object.keys(map.pois).filter(k => map.pois[k].booth);
  for (let i = 0; i < 2; i++) {
    const poi = booths[(Math.random() * booths.length) | 0];
    base.push({ id: 'surprise' + i, poi, time: h(13, 45) + i * 40 * 60,
      dur: 20 * 60, hype: 2 + Math.random() * 4, quality: Math.random() * 2 - 1,
      title: 'Анонс на ' + (map.pois[poi].label ?? poi) });
  }
  for (const e of base) { e.status = 'upcoming'; e.changedAt = 0; }
  return base;
}

export function eventStatusTick(world) {
  const gc = gameClock(world.t);
  for (const e of world.events) {
    if (e.status === 'upcoming' && gc >= e.time) {
      e.status = 'live'; e.changedAt = world.t;
      world.banner = { text: '🔴 ' + e.title + ' началось', t: world.t };
    } else if (e.status === 'live' && gc >= e.time + e.dur) {
      e.status = 'over'; e.changedAt = world.t;
      world.banner = { text: '✓ ' + e.title + ' завершилось', t: world.t };
    }
  }
}

// перенос: если forceId не задан — случайный upcoming, иначе конкретный
export function eventRescheduleTick(world, forceId) {
  const ups = world.events.filter(e => e.status === 'upcoming');
  if (!ups.length) return;
  const e = forceId ? world.events.find(x => x.id === forceId) : ups[(Math.random() * ups.length) | 0];
  if (!e || e.status !== 'upcoming') return;
  const delta = (15 + Math.random() * 15) * 60 * (Math.random() < 0.5 ? -1 : 1);
  e.time = Math.max(0, e.time + delta);
  e.changedAt = world.t;
}

// срочность известного агенту эвента в [0..1.5] и его POI (для утилити/желаний)
export function knownEventUrgency(a, world) {
  let best = 0, poi = null;
  for (const ev of world.events) {
    if (!a.beliefs.knownEvents.has(ev.id) || ev.status === 'over' || a.attendedEvents?.has(ev.id)) continue;
    if (!a.beliefs.knownPois.has(ev.poi)) continue;
    const bt = a.beliefs.eventTime[ev.id] ?? ev.time;
    const left = bt - gameClock(world.t);
    let u = Math.max(0, Math.min(1.5, 1.5 * (1 - left / 1800)));
    if (ev.status === 'live') u = Math.max(u, 1.2);
    const score = u * ev.hype;
    if (score > best) { best = score; poi = ev.poi; }
  }
  return { urgency: best, poi };
}

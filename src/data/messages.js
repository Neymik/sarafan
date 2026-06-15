import { T, fmtClock } from './tuning.js';
import { boardLocalLesson, addJamMark } from '../sim/knowledge.js';

// Конструктор: applyFn для табло (радиус) и громкой связи (все).
export function makeBoardMessages(world) {
  return {
    promote: key => (a, w) => {
      a.beliefs.knownPois.add(key);
      a.poiPromo[key] = w.t + T.promoTime;
    },
    jam: key => (a, w) => {
      const p = w.map.pois[key];
      addJamMark(a.beliefs, { x: p.fx, y: p.fy, r: 3, learnedAt: w.t });
    },
    concert: kind => (a, w) => {
      const ce = (w.events ?? []).find(e => e.id === 'concert');
      if (!ce) return;
      a.beliefs.knownEvents.add('concert');
      if (kind === 'truth') {
        a.beliefs.eventTime['concert'] = ce.time;
      } else if (kind === 'delay') {
        a.beliefs.eventTime['concert'] = ce.time + 1800;
      }
      // 'cancel' → агент просто не знает времени (удалить знание?), оставим знание без времени
    },
    // booth-сарафан: boothGood учит и ставит промо, boothBad — избегание
    boothGood: key => (a, w) => {
      a.beliefs.knownPois.add(key);
      a.poiPromo[key] = w.t + T.promoTime;
    },
    boothBad: key => (a, w) => {
      a.poiCooldown[key] = w.t + T.poiCooldownTime;
    },
    // эвент-варианты: truth/delay/cancel для конкретного эвента
    event: (evId, kind) => (a, w) => {
      const ev = (w.events ?? []).find(e => e.id === evId);
      if (!ev) return;
      a.beliefs.knownEvents.add(evId);
      if (kind === 'truth') {
        a.beliefs.eventTime[evId] = ev.time;
      } else if (kind === 'delay') {
        a.beliefs.eventTime[evId] = ev.time + 1800;
      }
      // 'cancel' — знание без времени (пусть игнорируют)
    },
    local: board => (a, w) => {
      const lesson = boardLocalLesson(w, board);
      for (const k of lesson.pois) a.beliefs.knownPois.add(k);
      a.obstMask |= lesson.obstBits;
      for (const j of lesson.jams) addJamMark(a.beliefs, { ...j });
    },
  };
}

// варианты для UI-селектов
export function composerOptions(world) {
  const pois = Object.entries(world.map.pois)
    .filter(([k, p]) => !p.exit && !p.staff && !p.soldOut && p.weight > 0)
    .map(([k, p]) => ({ key: k, label: p.label }));
  const ce = (world.events ?? []).find(e => e.id === 'concert');

  // эвент-варианты из world.events
  const eventOptions = (world.events ?? []).map(ev => ({
    id: ev.id,
    title: ev.title,
    status: ev.status,
    variants: [
      { kind: 'truth', label: `Правда: ${ev.title.slice(0,12)} в ${fmtClock(13*3600+ev.time)}` },
      { kind: 'delay', label: `«${ev.title.slice(0,12)} переносится на ${fmtClock(13*3600+ev.time+1800)}»` },
      { kind: 'cancel', label: `«${ev.title.slice(0,12)} ОТМЕНЁН»` },
    ],
  }));

  // бутики для сарафана
  const booths = Object.entries(world.map.pois)
    .filter(([k, p]) => p.booth)
    .map(([k, p]) => ({ key: k, label: p.label ?? k }));

  return {
    pois,
    concert: ce ? [
      { kind: 'truth', label: `Правда: концерт в ${fmtClock(13*3600+ce.time)}${ce.status === 'over' ? ' (завершён)' : ''}` },
      { kind: 'delay', label: `«Концерт переносится на ${fmtClock(13*3600+ce.time + 1800)}»` },
      { kind: 'cancel', label: '«Концерт ОТМЕНЁН»' },
    ] : [],
    events: eventOptions,
    booths,
  };
}

// ---- Фейк-ажиотаж: создать lure и навести на него агентов ----
export function injectFakeHype(world, pt) {
  world.lures ??= [];
  world.lures.push({ x: pt.x, y: pt.y, until: world.t + T.lureTtl });
  const cands = world.agents.filter(a => a.kind === 'visitor' && a.beliefs);
  for (let i = 0; i < T.lureInjectCount && cands.length; i++) {
    const a = cands.splice((Math.random() * cands.length) | 0, 1)[0];
    a.lureTarget = { x: pt.x, y: pt.y };
  }
  world.banner = { text: '🗣 «Там что-то раздают!»', t: world.t };
}

// ---- Мета-приколы ----
export function injectMeta(world, kind) {
  const vis = world.agents.filter(a => a.kind === 'visitor' && a.beliefs);
  if (kind === 'hl3') {
    for (const a of vis) if (a.perception > 0) a.joy = Math.max(0, a.joy - 8);
    world.banner = { text: '🗣 «Анонс отмены… все в трауре»', t: world.t };
  } else if (kind === 'wifi') {
    for (const a of vis) {
      if (a.activity === 'phone') {
        const e = nearestExitPt(world, a);
        if (e) { a.target = e; a.goalPoi = null; }
      }
    }
    world.banner = { text: '🗣 «Вайфай только у входа»', t: world.t };
  } else if (kind === 'starfood') {
    const food = world.map.pois.food;
    if (food) injectFakeHype(world, { x: food.fx, y: food.fy });
  } else if (kind === 'lostkid') {
    let n = 0;
    for (const a of vis) { if (n++ >= 15) break; a.goalPoi = 'info'; a.activity = 'goto'; a.target = null; }
    world.banner = { text: '🗣 «Потерялся ребёнок — все на инфостойку»', t: world.t };
  }
}

function nearestExitPt(world, a) {
  let best = null, bd = Infinity;
  for (const [k, p] of Object.entries(world.map.pois)) {
    if (p.exit) {
      const d = (p.fx - a.x) ** 2 + (p.fy - a.y) ** 2;
      if (d < bd) { bd = d; best = p; }
    }
  }
  return best ? { x: best.fx, y: best.fy } : null;
}

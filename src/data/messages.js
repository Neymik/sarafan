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
      const f = w.facts.concert;
      const ev = kind === 'truth' ? { ...f }
        : kind === 'delay' ? { ...f, time: f.time + 1800 }
        : { ...f, status: 'cancelled' };
      a.beliefs.events.concert = { ...ev, learnedAt: w.t };
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
    .filter(([k, p]) => !p.exit && !p.staff && !p.soldOut)
    .map(([k, p]) => ({ key: k, label: p.label }));
  const f = world.facts.concert;
  return {
    pois,
    concert: [
      { kind: 'truth', label: `Правда: концерт в ${fmtClock(f.time)}${f.status === 'cancelled' ? ' (отменён?)' : ''}` },
      { kind: 'delay', label: `«Концерт переносится на ${fmtClock(f.time + 1800)}»` },
      { kind: 'cancel', label: '«Концерт ОТМЕНЁН»' },
    ],
  };
}

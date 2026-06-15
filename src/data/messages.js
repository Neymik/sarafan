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
  return {
    pois,
    concert: ce ? [
      { kind: 'truth', label: `Правда: концерт в ${fmtClock(13*3600+ce.time)}${ce.status === 'over' ? ' (завершён)' : ''}` },
      { kind: 'delay', label: `«Концерт переносится на ${fmtClock(13*3600+ce.time + 1800)}»` },
      { kind: 'cancel', label: '«Концерт ОТМЕНЁН»' },
    ] : [],
  };
}

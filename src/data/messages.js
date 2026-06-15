import { fmtClock } from './tuning.js';
import { boardLocalLesson, addJamMark } from '../sim/knowledge.js';

export function messagesFor(world, board) {
  const f = world.facts.concert;
  return [
    {
      label: `Концерт: ${fmtClock(f.time)}, сцена — всё в силе`,
      apply(a, w) { a.beliefs.events.concert = { ...f, learnedAt: w.t }; },
    },
    {
      label: 'Карта участка: что рядом и где толпа',
      apply(a, w) {
        const lesson = boardLocalLesson(w, board);
        for (const k of lesson.pois) a.beliefs.knownPois.add(k);
        a.doorMask |= lesson.doorBits;
        for (const j of lesson.jams) addJamMark(a.beliefs, { ...j });
      },
    },
    {
      label: 'ЛОЖЬ: «Концерт переносится на 30 мин»',
      apply(a, w) { a.beliefs.events.concert = { ...a.beliefs.events.concert, time: f.time + 1800, learnedAt: w.t }; },
    },
  ];
}

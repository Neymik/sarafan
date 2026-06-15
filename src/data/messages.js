import { boardLocalLesson, addJamMark } from '../sim/knowledge.js';

export function messagesFor(world, board) {
  return [{
    label: 'Карта участка: что рядом и где толпа',
    apply(a, w) {
      const lesson = boardLocalLesson(w, board);
      for (const k of lesson.pois) a.beliefs.knownPois.add(k);
      a.obstMask |= lesson.obstBits;
      for (const j of lesson.jams) addJamMark(a.beliefs, { ...j });
    },
  }];
}

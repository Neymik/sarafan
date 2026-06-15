import { fmtClock } from './tuning.js';

// Карточки контекстные: правда о концерте, правда о двери, «успокоить» (снизить срочность ложным переносом)
export function messagesFor(world) {
  const f = world.facts.concert;
  return [
    {
      label: `Концерт: ${fmtClock(f.time)}, сцена — всё в силе`,
      apply(a, w) { a.beliefs.events.concert = { ...f, learnedAt: w.t }; },
    },
    {
      label: world.facts.doorS.open ? 'Южный вход сцены: открыт' : 'Южный вход ЗАКРЫТ — идите через северный',
      apply(a, w) {
        a.beliefs.edgeKnown[10] = a.beliefs.edgeKnown[11] = 1;
        a.beliefs.edgePassable[10] = w.edgePassable[10];
        a.beliefs.edgePassable[11] = w.edgePassable[11];
      },
    },
    {
      label: 'ЛОЖЬ: «Концерт переносится на 30 мин»', // эксперимент с обманом (доверие — после джама)
      apply(a, w) { a.beliefs.events.concert = { ...a.beliefs.events.concert, time: f.time + 1800, learnedAt: w.t }; },
    },
  ];
}

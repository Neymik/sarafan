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
      label: 'Двери сцены: запад ' + (world.facts.doorW?.open === false ? 'ЗАКРЫТ' : 'открыт'),
      apply(a, w) { a.doorMask |= (w.doorsClosed ?? 0); },
    },
    {
      label: 'ЛОЖЬ: «Концерт переносится на 30 мин»', // эксперимент с обманом (доверие — после джама)
      apply(a, w) { a.beliefs.events.concert = { ...a.beliefs.events.concert, time: f.time + 1800, learnedAt: w.t }; },
    },
  ];
}

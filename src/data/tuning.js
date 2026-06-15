export const T = {
  simHz: 30,
  timeScale: 30,          // 1 реальная сек = 30 игровых сек; день 13:00→14:30 = 3 мин
  pxPerMeter: 16,
  agentCount: 400,
  // плотность (n = соседей в радиусе densityRadius)
  densityRadius: 2.0,
  comfortN: 3,
  jamN: 8,
  // силы
  personalSpaceForce: 2.0,
  alignmentThreshold: 4,
  // нужды/стресс (в единицах за реальную секунду)
  fatigueRate: 0.6, boredomRate: 1.2, phoneItchRate: 1.0,
  stressFromDensity: 1.2, stressFromContact: 0.8, stressDecay: 3.0, // равновесие ≈ 5.5 соседей
  blockedStressAfter: 3, blockedStressRate: 2.0,
  // знание
  sightRadius: 8,
  osmosisChance: 0.01,    // за тик на соседа
  rumorMutation: 0.1,
  boardRadius: 6,
  lagRed: 20,             // реальных сек устаревания до красного
  // мозг
  utilityTickEvery: 1.5,  // реальных сек
  hysteresis: 1.3,
  // lost
  lostStressSpike: 25, lostNeighborStress: 5,
  phoneMapBase: 8, phoneMapDensityK: 0.6, lostTimeout: 25,
  // flow fields
  smartFieldK: 0.35,        // штраф клетки за агента плотности
  smartRecomputeEvery: 2,   // реальных сек
  smartDuration: 20,        // сколько агент «смотрит по сторонам» после решения обойти
  jamThreshold: 7,          // соседей в пробе = «впереди затор»
  jamMarkTtl: 30, jamMarksMax: 4,
  boardLocalRadius: 15,     // радиус «участка», о котором знает табло
  // мозг v2
  browseMin: 4, browseMax: 10,
  poiCooldownTime: 60,
  panicForgetChance: 0.05,    // за think-тик при stress>80
  jamReactCooldown: 10,
  leaveWeight: 0.9,
  // диалоги
  talkRadius: 1.2, talkChance: 0.15,   // в сек при sociability 1×1
  talkMin: 4, talkMax: 7,
  talkCooldown: 20,
  talkTransfer: 0.9, bystanderBase: 0.1, bystanderRadius: 3,
  // очереди
  queueSpacing: 0.6,
  queueJoinRadius: 3,
  queueDefectStress: 70, queueDefectSlot: 10,
  mobThreshold: 9,           // соседей у точки обслуживания = «ком»
  mobRateFactor: 0.4,
  injusticeStress: 15,
  serveSatisfaction: 30,     // сброс стресса обслуженному
};
export function speedFactor(n) { return Math.max(0.15, 1 - Math.max(0, n - T.comfortN) * 0.09); }
export function turnFactor(n)  { return Math.max(0.2,  1 - Math.max(0, n - T.comfortN) * 0.10); }
export function gameClock(t)   { return 13 * 3600 + t * T.timeScale; } // игровые секунды
export function fmtClock(gs)   { const h = (gs / 3600) | 0, m = ((gs % 3600) / 60) | 0; return `${h}:${String(m).padStart(2, '0')}`; }
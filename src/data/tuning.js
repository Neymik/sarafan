export const T = {
  simHz: 30,
  timeScale: 60,          // 1 игровая минута = 1 реальная сек; день 13:00→16:00 = 3 мин
  pxPerMeter: 16,
  // плотность
  densityRadius: 2.0, comfortN: 5, jamN: 8,
  // силы
  personalSpaceForce: 2.0, alignmentThreshold: 4, wallRepel: 3.0,
  // нужды/стресс (в единицах за реальную секунду)
  fatigueRate: 0.6, boredomRate: 1.2, phoneItchRate: 1.0,
  stressFromDensity: 1.2, stressFromContact: 0.8, stressDecay: 4.0,
  blockedStressAfter: 4, blockedStressRate: 2.0,
  // знание
  sightRadius: 8, rumorMutation: 0.1, boardRadius: 6, lagRed: 20,
  // мозг
  utilityTickEvery: 1.5, hysteresis: 1.3,
  lostStressSpike: 25, lostNeighborStress: 5,
  phoneMapBase: 8, phoneMapDensityK: 0.6, lostTimeout: 25,
  // flow fields
  smartFieldK: 0.35, smartRecomputeEvery: 2, smartDuration: 20,
  jamThreshold: 7, jamMarkTtl: 30, jamMarksMax: 4,
  boardLocalRadius: 15,
  fieldCacheMax: 12,      // максимум кэшированных масок Fields
  // мозг v2
  browseMin: 4, browseMax: 10, poiCooldownTime: 60,
  panicForgetChance: 0.05, jamReactCooldown: 10, leaveWeight: 0.9,
  // диалоги
  talkRadius: 1.2, talkChance: 0.15, talkMin: 4, talkMax: 7, talkCooldown: 20,
  talkTransfer: 0.9, bystanderBase: 0.1, bystanderRadius: 3,
  // очереди
  queueSpacing: 0.6, queueJoinRadius: 3,
  queueDefectStress: 70, queueDefectSlot: 10,
  mobThreshold: 9, mobRateFactor: 0.4, injusticeStress: 15, serveSatisfaction: 30,
  // население
  openingWave: 200, openingWaveDur: 10, // 200 чел за первые 10 реальных сек
  arrivalEvery: 1.0, maxAgents: 700,
  // логистика
  stockLow: 5, stockBatch: 10, reserveInit: 40,
  carrierSpeed: 1.2, carrierPriority: 2, starvedStress: 0.8,
  // спецагенты
  followAura: 4, followMax: 15,
  starAura: 10, poseGameMin: 15,        // косплеер позирует 15 игр. мин (15 реальных сек)
  pairSepDist: 15, pairReuniteDist: 5, pairEveryGameMin: 15,
  litterEvery: 2, litterChance: 0.3, litterMax: 40, litterStress: 0.3, litterJamCell: 4, // агентов в клетке 1м² для мусора (физический максимум ~6)
  // эвенты
  rumorEvery: 45, rumorJitter: 15,
  incidentDensity: 12, incidentAfter: 10, incidentDur: 20, incidentStress: 15, incidentRadius: 5,
  // инструменты игрока
  promoFactor: 3, promoTime: 60,
  paCooldown: 45, paStress: 5,
  rumorInjectCooldown: 30, rumorInjectCount: 15,
  volunteerMax: 2, volunteerRadius: 6, volunteerTeachEvery: 10,
  barrierSlots: 3, dragHold: 0.25,
  pressCheckEvery: 10,
};
export function speedFactor(n) { return Math.max(0.25, 1 - Math.max(0, n - T.comfortN) * 0.09); }
export function turnFactor(n)  { return Math.max(0.2,  1 - Math.max(0, n - T.comfortN) * 0.10); }
export function gameClock(t)   { return 13 * 3600 + t * T.timeScale; }
export function fmtClock(gs)   { const h = (gs / 3600) | 0, m = ((gs % 3600) / 60) | 0; return `${h}:${String(m).padStart(2, '0')}`; }

// Мир 60×44 м. Препятствия — прямоугольники blocks. Двери — проёмы, которые
// расписание может закрывать (становятся физическими блоками + клетками стен).
export const MAP = {
  w: 60, h: 44,
  doors: [
    { x: 19, y: 9, w: 4, h: 1 },   // d0 западный проём зала сцены
    { x: 37, y: 9, w: 4, h: 1 },   // d1 восточный проём зала сцены
  ],
  blocks: [
    // стена зала сцены y=9 с двумя проёмами (проёмы = doors выше)
    { x: 1,  y: 9, w: 18, h: 1 }, { x: 23, y: 9, w: 14, h: 1 }, { x: 41, y: 9, w: 18, h: 1 },
    { x: 8,  y: 2, w: 44, h: 3, label: 'СЦЕНА' },
    // ряд мерч-стендов
    { x: 6, y: 13, w: 8, h: 3 }, { x: 18, y: 13, w: 8, h: 3 },
    { x: 34, y: 13, w: 8, h: 3 }, { x: 46, y: 13, w: 8, h: 3 },
    // два ряда выставочных будок 6×4, проходы 4 м
    { x: 6, y: 20, w: 6, h: 4 }, { x: 16, y: 20, w: 6, h: 4 }, { x: 26, y: 20, w: 6, h: 4 },
    { x: 36, y: 20, w: 6, h: 4 }, { x: 46, y: 20, w: 6, h: 4 },
    { x: 6, y: 28, w: 6, h: 4 }, { x: 16, y: 28, w: 6, h: 4 }, { x: 26, y: 28, w: 6, h: 4 },
    { x: 36, y: 28, w: 6, h: 4 }, { x: 46, y: 28, w: 6, h: 4 },
    // стойка фудкорта
    { x: 6, y: 38, w: 10, h: 3, label: 'ФУД' },
  ],
  pois: {
    stage:     { x: 30, y: 7,  label: 'Сцена',          weight: 0 },
    merch1:    { x: 10, y: 17, label: 'Мерч A',         weight: 2,   service: { rate: 6, queueDir: [1, 0] } },
    merch2:    { x: 50, y: 17, label: 'Мерч B',         weight: 2,   service: { rate: 6, queueDir: [-1, 0] } },
    food:      { x: 11, y: 37, label: 'Фудкорт',        weight: 3,   service: { rate: 4, queueDir: [1, 0] } },
    info:      { x: 33, y: 40, label: 'Инфостойка',     weight: 1 },
    wcL:       { x: 3,  y: 22, label: 'Туалет (зап.)',  weight: 1 },
    wcR:       { x: 56, y: 30, label: 'Туалет (вост.)', weight: 1 },
    photo:     { x: 44, y: 34, label: 'Фотозона',       weight: 2.5 },
    autograph: { x: 12, y: 34, label: 'Автограф-зона',  weight: 2.5 },
    boothA:    { x: 14, y: 22, label: 'Стенд студии',   weight: 1.5 },
    boothB:    { x: 29, y: 26, label: 'Стенд издателя', weight: 1.5 },
    boothC:    { x: 44, y: 30, label: 'Инди-уголок',    weight: 1.5 },
    exitMain:  { x: 30, y: 42, label: 'Главный вход',   weight: 0, exit: true },
    exitW:     { x: 2,  y: 35, label: 'Западный вход',  weight: 0, exit: true },
    exitE:     { x: 57, y: 12, label: 'Восточный вход', weight: 0, exit: true },
  },
  boards: [ { x: 28, y: 41 }, { x: 30, y: 18 }, { x: 14, y: 26 }, { x: 46, y: 26 } ],
  spawn: { x: 30, y: 42 },
};
export const EXITS = Object.keys(MAP.pois).filter(k => MAP.pois[k].exit);
// service rate — игровых секунд на одного клиента ×10 (rate 4 = 40 игровых сек);
// реальная длительность = rate * 10 / T.timeScale.

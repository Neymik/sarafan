// Мир 60×44 м. POI — прямоугольные объекты с гранью-«прилавком» (face).
// front-точка (fx, fy) — подход/цель поля/голова очереди — предвычисляется ниже.
export const MAP = {
  w: 60, h: 44,
  pois: {
    stage:     { x: 14, y: 1,  w: 32, h: 4, face: 'S', label: 'СЦЕНА',          weight: 0 },
    wcL:       { x: 1,  y: 14, w: 2,  h: 3, face: 'E', label: 'Туалет (зап.)',  weight: 1 },
    merch1:    { x: 1,  y: 20, w: 2,  h: 6, face: 'E', label: 'Мерч A',         weight: 2,   service: { rate: 6 }, stock: 15 },
    autograph: { x: 1,  y: 30, w: 2,  h: 5, face: 'E', label: 'Автограф-зона',  weight: 2.5 },
    wcR:       { x: 57, y: 14, w: 2,  h: 3, face: 'W', label: 'Туалет (вост.)', weight: 1 },
    merch2:    { x: 57, y: 20, w: 2,  h: 6, face: 'W', label: 'Мерч B',         weight: 2,   service: { rate: 6 }, stock: 15 },
    depot:     { x: 57, y: 30, w: 2,  h: 6, face: 'W', label: 'СКЛАД',          weight: 0,   staff: true },
    boothA: { x: 15, y: 15, w: 6, h: 3, face: 'S', label: 'Стенд студии',   booth: true },
    boothB: { x: 33, y: 21, w: 6, h: 3, face: 'N', label: 'Стенд издателя', booth: true },
    boothC: { x: 24, y: 27, w: 6, h: 3, face: 'S', label: 'Инди-уголок',    booth: true },
    b1:  { x: 6,  y: 15, w: 6, h: 3, face: 'S', label: 'Бутик 1',  booth: true },
    b2:  { x: 24, y: 15, w: 6, h: 3, face: 'S', label: 'Бутик 2',  booth: true },
    b3:  { x: 33, y: 15, w: 6, h: 3, face: 'S', label: 'Бутик 3',  booth: true },
    b4:  { x: 42, y: 15, w: 6, h: 3, face: 'S', label: 'Бутик 4',  booth: true },
    b5:  { x: 6,  y: 21, w: 6, h: 3, face: 'N', label: 'Бутик 5',  booth: true },
    b6:  { x: 15, y: 21, w: 6, h: 3, face: 'N', label: 'Бутик 6',  booth: true },
    b7:  { x: 24, y: 21, w: 6, h: 3, face: 'N', label: 'Бутик 7',  booth: true },
    b8:  { x: 42, y: 21, w: 6, h: 3, face: 'N', label: 'Бутик 8',  booth: true },
    b9:  { x: 6,  y: 27, w: 6, h: 3, face: 'S', label: 'Бутик 9',  booth: true },
    b10: { x: 15, y: 27, w: 6, h: 3, face: 'S', label: 'Бутик 10', booth: true },
    b11: { x: 33, y: 27, w: 6, h: 3, face: 'S', label: 'Бутик 11', booth: true },
    b12: { x: 42, y: 27, w: 6, h: 3, face: 'S', label: 'Бутик 12', booth: true },
    food:      { x: 6,  y: 38, w: 12, h: 3, face: 'N', label: 'Фудкорт',        weight: 3,   service: { rate: 8 } },
    info:      { x: 20, y: 39, w: 5,  h: 3, face: 'N', label: 'Инфостойка',     weight: 1 },
    photo:     { x: 44, y: 39, w: 6,  h: 3, face: 'N', label: 'Фотозона',       weight: 2.5 },
    exitMain:  { x: 30,   y: 42.2, label: 'Главный вход',   weight: 0, exit: true },
    exitW:     { x: 1.5,  y: 36.5, label: 'Западный вход',  weight: 0, exit: true },
    exitE:     { x: 58.2, y: 10,   label: 'Восточный вход', weight: 0, exit: true },
  },
  // все острова-будки теперь в pois (booth: true) — solidRects их подхватит
  blocks: [],
  boards: [{ x: 28, y: 41 }, { x: 30, y: 19 }, { x: 13, y: 25 }, { x: 45, y: 25 }],
  spawn: { x: 30, y: 41.5 },
};

export function poiFront(p) {
  if (p.exit) return { x: p.x, y: p.y };
  const cx = p.x + p.w / 2, cy = p.y + p.h / 2;
  switch (p.face) {
    case 'N': return { x: cx, y: p.y - 0.7 };
    case 'S': return { x: cx, y: p.y + p.h + 0.7 };
    case 'W': return { x: p.x - 0.7, y: cy };
    case 'E': return { x: p.x + p.w + 0.7, y: cy };
  }
}
// очередь растёт вдоль грани-прилавка
export function queueDirOf(p) { return (p.face === 'N' || p.face === 'S') ? [1, 0] : [0, 1]; }
// все твёрдые прямоугольники: блоки + POI-объекты (exit — точки, не твёрдые)
export function solidRects(map) {
  return [...map.blocks, ...Object.values(map.pois ?? {}).filter(p => !p.exit && p.w)];
}
for (const p of Object.values(MAP.pois)) { const f = poiFront(p); p.fx = f.x; p.fy = f.y; }
for (const p of Object.values(MAP.pois)) {
  if (!p.booth) continue;
  p.hype = 0.5 + Math.random() * 2.5;
  p.quality = Math.random() * 2 - 1;
  p.weight = p.hype;
}
export const EXITS = Object.keys(MAP.pois).filter(k => MAP.pois[k].exit);
// service rate: реальные сек на клиента = rate * 10 / T.timeScale

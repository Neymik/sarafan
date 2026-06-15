# Crowd v3 «Живая выставка» Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Реализовать спеку v3 (docs/superpowers/specs/2026-06-13-crowd-v3-living-expo-design.md): clearance-навигация, карта POI-объектов, день 13:00–16:00 с волной открытия, спецагенты, логистика мерча, инциденты, слухи, счёт+финал, инструменты игрока, дев-панель.

**Architecture:** Чистые JS-модули (sim/ без DOM), весь баланс в src/data/tuning.js. Дверная маск-механика v2 обобщается в реестр динамических препятствий (5 слотов: 3 барьера игрока + 2 инцидента); `doorMask` агента переименовывается в `obstMask`. POI становятся прямоугольниками с гранью-«прилавком» (front-точка `fx/fy` предвычисляется в map.js). Спецагенты (`a.kind !== 'visitor'`) управляются отдельными тиками (special/logistics), `think()` их пропускает.

**Tech Stack:** Vanilla JS (ES modules), Canvas 2D, node:assert (tests/run.js, `node tests/run.js`). Браузер цел только после Task 13 — между задачами зелёными должны быть только node-тесты.

**ВАЖНО для всех задач:** ветка `proto`. Между Task 1 и Task 13 браузерная игра неработоспособна — это ожидаемо; гейт каждой задачи = `node tests/run.js` зелёный.

---

### Task 1: Карта v3, tuning v3, flowfield с clearance и слотами препятствий

**Files:**
- Rewrite: `src/data/map.js`
- Rewrite: `src/data/tuning.js`
- Modify: `src/sim/flowfield.js`
- Modify: `tests/run.js` (тесты grid/field: убрать дверные, добавить clearance/барьер)

- [ ] **Step 1: Переписать src/data/map.js целиком**

```js
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
    boothA:    { x: 15, y: 15, w: 6,  h: 3, face: 'S', label: 'Стенд студии',   weight: 1.5 },
    boothB:    { x: 33, y: 21, w: 6,  h: 3, face: 'S', label: 'Стенд издателя', weight: 1.5 },
    boothC:    { x: 24, y: 27, w: 6,  h: 3, face: 'N', label: 'Инди-уголок',    weight: 1.5 },
    food:      { x: 6,  y: 38, w: 12, h: 3, face: 'N', label: 'Фудкорт',        weight: 3,   service: { rate: 8 } },
    info:      { x: 20, y: 39, w: 5,  h: 3, face: 'N', label: 'Инфостойка',     weight: 1 },
    photo:     { x: 44, y: 39, w: 6,  h: 3, face: 'N', label: 'Фотозона',       weight: 2.5 },
    exitMain:  { x: 30,   y: 42.2, label: 'Главный вход',   weight: 0, exit: true },
    exitW:     { x: 1.5,  y: 36.5, label: 'Западный вход',  weight: 0, exit: true },
    exitE:     { x: 58.2, y: 10,   label: 'Восточный вход', weight: 0, exit: true },
  },
  // безымянные острова будок: 3 ряда × 5, проходы 3 м (именные — в pois выше)
  blocks: [
    { x: 6, y: 15, w: 6, h: 3 }, { x: 24, y: 15, w: 6, h: 3 }, { x: 33, y: 15, w: 6, h: 3 }, { x: 42, y: 15, w: 6, h: 3 },
    { x: 6, y: 21, w: 6, h: 3 }, { x: 15, y: 21, w: 6, h: 3 }, { x: 24, y: 21, w: 6, h: 3 }, { x: 42, y: 21, w: 6, h: 3 },
    { x: 6, y: 27, w: 6, h: 3 }, { x: 15, y: 27, w: 6, h: 3 }, { x: 33, y: 27, w: 6, h: 3 }, { x: 42, y: 27, w: 6, h: 3 },
  ],
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
export const EXITS = Object.keys(MAP.pois).filter(k => MAP.pois[k].exit);
// service rate: реальные сек на клиента = rate * 10 / T.timeScale
```

- [ ] **Step 2: Переписать src/data/tuning.js целиком**

```js
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
  stressFromDensity: 1.2, stressFromContact: 0.8, stressDecay: 3.5,
  blockedStressAfter: 3, blockedStressRate: 2.0,
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
  litterEvery: 2, litterChance: 0.3, litterMax: 40, litterStress: 0.3,
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
```

- [ ] **Step 3: Написать падающие тесты (заменить дверные)**

В `tests/run.js`: УДАЛИТЬ тесты «grid: проход проходим…» (со строками про двери d0/d1), «field: закрытие западной двери…». Тест «field: градиент ведёт к POI…» оставить, заменив `MAP.pois.food.x, MAP.pois.food.y` на `MAP.pois.food.fx, MAP.pois.food.fy` и точку проверки на `(56.5, 34.5)` (восточный проход). В тесте «smartField» цель — `MAP.pois.merch1.fx, MAP.pois.merch1.fy`, плотный кластер: `for (let x = 18; x < 24; x++) dens[19 * g.W + x] = 10;` и проверочный индекс `19 * g.W + 30`. В тесте «randomWalkableNear» точку `(8, 21)` → `(8, 19)` (проход). Все вызовы `buildGrid(MAP, 0)` → `buildGrid(MAP, [null, null, null, null, null], 0)`. Добавить:

```js
test('grid v3: проход проходим, POI-объект и остров — нет', () => {
  const g = buildGrid(MAP, [null, null, null, null, null], 0);
  assert.equal(isWalkable(g, 13, 22), true);    // вертикальный проход между будками
  assert.equal(isWalkable(g, 8, 16), false);    // безымянный остров
  assert.equal(isWalkable(g, 2, 21), false);    // merch1 — POI-объект твёрд
  assert.equal(isWalkable(g, 30, 8), true);     // площадь сцены открыта
});

test('clearance: центр коридора дешевле пристенка', () => {
  const tiny = { w: 9, h: 7, blocks: [], pois: {} };           // только внешние стены
  const g = buildGrid(tiny, [null, null, null, null, null], 0);
  assert.equal(g.clear[1 * g.W + 4], 1);                        // у стены
  assert.equal(g.clear[3 * g.W + 4], 3);                        // центр
  const f = computeField(g, 1, 3, null);
  assert.ok(f[3 * g.W + 6] < f[1 * g.W + 6], 'путь по центру дешевле: ' +
    f[3 * g.W + 6] + ' vs ' + f[1 * g.W + 6]);
});

test('барьер-слот: знающая маска блокирована, незнающая — нет', () => {
  const fl = new Fields(MAP);
  fl.setSlot(0, { x: 12, y: 21, w: 3, h: 3 });  // лента поперёк прохода
  assert.equal(fl.activeMask(), 1);
  assert.equal(isWalkable(fl.gridFor(1), 13, 22), false, 'знающий видит стену');
  assert.equal(isWalkable(fl.gridFor(0), 13, 22), true, 'незнающий идёт по памяти');
  fl.clearSlot(0);
  assert.equal(fl.activeMask(), 0);
  assert.equal(isWalkable(fl.gridFor(1), 13, 22), true, 'после снятия свободно');
});
```

- [ ] **Step 4: Запустить — убедиться, что новые тесты падают**

Run: `node tests/run.js` — FAIL (buildGrid не принимает slots, clear отсутствует, map.doors нет).

- [ ] **Step 5: Обновить src/sim/flowfield.js**

Импорт сверху: `import { solidRects } from '../data/map.js';` (плюс существующий T). Заменить `buildGrid` и добавить clearance:

```js
export function buildGrid(map, slots, mask) {
  const W = map.w, H = map.h;
  const walk = new Uint8Array(W * H).fill(1);
  for (let x = 0; x < W; x++) { walk[x] = 0; walk[(H - 1) * W + x] = 0; }
  for (let y = 0; y < H; y++) { walk[y * W] = 0; walk[y * W + W - 1] = 0; }
  for (const b of solidRects(map)) stamp(walk, W, H, b);
  (slots ?? []).forEach((s, i) => { if (s && (mask & (1 << i))) stamp(walk, W, H, s); });
  // clearance: BFS от всех стен, капаем на 3
  const clear = new Uint8Array(W * H).fill(255);
  const q = [];
  for (let i = 0; i < W * H; i++) if (!walk[i]) { clear[i] = 0; q.push(i); }
  for (let h = 0; h < q.length; h++) {
    const i = q[h], c = clear[i];
    if (c >= 3) continue;
    const x = i % W, y = (i / W) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const ni = ny * W + nx;
      if (clear[ni] > c + 1) { clear[ni] = c + 1; q.push(ni); }
    }
  }
  return { W, H, walk, clear };
}
```

В `computeField` строку `const nd = d + w * (cellCost ? cellCost(ni) : 1);` заменить на:

```js
      const base = grid.clear[ni] === 1 ? 1.8 : grid.clear[ni] === 2 ? 1.3 : 1;
      const nd = d + w * base * (cellCost ? cellCost(ni) : 1);
```

Класс `Fields` заменить целиком:

```js
// Менеджер полей: clear по маскам активных слотов-препятствий (лениво) + smart на правде.
// Слоты 0–2 — барьеры игрока, 3–4 — инциденты.
export class Fields {
  constructor(map) {
    this.map = map;
    this.slots = [null, null, null, null, null];
    this.grids = new Map(); this.clear = new Map();
    this.smart = {}; this.smartMask = 0;
    this.gridFor(0);
  }
  activeMask() { let m = 0; this.slots.forEach((s, i) => { if (s) m |= 1 << i; }); return m; }
  setSlot(i, rect) { this.slots[i] = rect; this.invalidate(); }
  clearSlot(i) { this.slots[i] = null; this.invalidate(); }
  invalidate() { this.grids.clear(); this.clear.clear(); this.smart = {}; this.gridFor(0); }
  _cap(map) { if (map.size > T.fieldCacheMax) map.delete(map.keys().next().value); }
  gridFor(mask) {
    if (!this.grids.has(mask)) { this.grids.set(mask, buildGrid(this.map, this.slots, mask)); this._cap(this.grids); }
    return this.grids.get(mask);
  }
  clearFor(mask) {
    if (!this.clear.has(mask)) {
      const g = this.gridFor(mask), set = {};
      for (const [k, p] of Object.entries(this.map.pois)) set[k] = computeField(g, p.fx, p.fy, null);
      this.clear.set(mask, set); this._cap(this.clear);
    }
    return this.clear.get(mask);
  }
  recomputeSmart(agents, actualMask) {
    const g = this.gridFor(actualMask);
    this.smartMask = actualMask;
    const d = this.density = new Float32Array(g.W * g.H);
    for (const a of agents) {
      const i = (a.y | 0) * g.W + (a.x | 0);
      if (i >= 0 && i < d.length) d[i]++;
    }
    const cost = i => 1 + T.smartFieldK * d[i];
    for (const [k, p] of Object.entries(this.map.pois)) this.smart[k] = computeField(g, p.fx, p.fy, cost);
  }
  dir(mode, mask, poi, x, y) {
    if (mode === 'smart' && this.smart[poi]) return fieldDir(this.gridFor(this.smartMask ?? 0), this.smart[poi], x, y);
    const set = this.clearFor(mask);
    return set[poi] ? fieldDir(this.gridFor(mask), set[poi], x, y) : null;
  }
}
```

- [ ] **Step 6: Запустить тесты**

Run: `node tests/run.js` — все PASS (включая 3 новых).

- [ ] **Step 7: Commit**

```bash
git add src/data/map.js src/data/tuning.js src/sim/flowfield.js tests/run.js
git commit -m "feat(v3): expo map with POI objects, clearance flow fields, obstacle slots"
```

---

### Task 2: obstMask повсюду, front-точки, wallRepel, двери удалены

**Files:**
- Modify: `src/sim/knowledge.js`, `src/sim/agent.js`, `src/sim/dialogue.js`, `src/sim/steering.js`, `src/sim/queue.js`, `src/data/messages.js`
- Modify: `tests/run.js` (queue/dialogue тесты)

- [ ] **Step 1: Обновить падающие тесты**

В `tests/run.js`: тест «queue: слоты вдоль queueDir с шагом» заменить:

```js
test('queue: слоты вдоль грани от front-точки', () => {
  const poi = { x: 9, y: 19, w: 2, h: 2, face: 'E', service: { rate: 4 } };
  poi.fx = 11.7; poi.fy = 20;            // face E → front справа, очередь вдоль [0,1]
  const p0 = queueSlotPos(poi, 0), p2 = queueSlotPos(poi, 2);
  assert.ok(Math.abs(p0.y - 20.6) < 1e-9 && Math.abs(p2.y - 21.8) < 1e-9);
  assert.equal(p0.x, 11.7);
});
```

В тесте «queue: обслуживание двигает очередь…» поле poi заменить на
`const poi = { x: 9, y: 19, w: 2, h: 2, face: 'E', fx: 10, fy: 20, service: { rate: 0.0001 } };`
(агенты mk(id) стоят в `x: 10 + id, y: 20` — около front). В тесте
«dialogue: тема из объединения…» `doorMask: 0` → `obstMask: 0`, и в mk() добавить
`kind: 'visitor'`. Вызов pickTopic третьим аргументом получает
`{ map: { pois: { food: {} } }, obstMask: 0 }`.

Run: `node tests/run.js` — FAIL (queueSlotPos ещё старый и т.д.).

- [ ] **Step 2: src/sim/knowledge.js**

- `makeWorldFacts`: удалить `doorW`, время концерта 14:30:
  ```js
  export function makeWorldFacts() {
    return { concert: { time: 14.5 * 3600, place: 'stage', status: 'on', changedAt: 0 } };
  }
  ```
- `makeBeliefs`: `time: 14.5 * 3600` в обоих местах файла (и в makeBeliefs).
- `eyesUpdate`: открытие POI — дистанция до `p.fx, p.fy`; блок `world.map.doors.forEach(...)` заменить на:
  ```js
  (world.fields?.slots ?? []).forEach((s, i) => {
    const bit = 1 << i;
    if (!s || (a.obstMask & bit)) return;
    const cx = s.x + s.w / 2, cy = s.y + s.h / 2;
    if ((cx - a.x) ** 2 + (cy - a.y) ** 2 < T.sightRadius ** 2) {
      a.obstMask |= bit;
      a.stress = Math.min(100, a.stress + 10); // упс, перекрыто
    }
  });
  ```
- `boardLocalLesson`: дистанции POI через `p.fx, p.fy`; блок doorBits заменить:
  ```js
  let obstBits = 0;
  (world.fields?.slots ?? []).forEach((s, i) => {
    if (s && (s.x + s.w / 2 - board.x) ** 2 + (s.y + s.h / 2 - board.y) ** 2 < R2) obstBits |= 1 << i;
  });
  ```
  и в return `{ pois, obstBits, jams }`; jam-пробы — у `p.fx, p.fy`.

- [ ] **Step 3: src/sim/agent.js**

- `makeAgent`: `doorMask: 0` → `obstMask: 0`; добавить в объект: `kind: 'visitor', poiPromo: {}, searching: false, dragged: false, friendId: null, superfan: false,`.
- `nearPoi`: `(p.fx - a.x) ** 2 + (p.fy - a.y) ** 2 < 16`.
- `weightedPickPoi`: после `if (!p || p.exit || p.weight <= 0) continue;` добавить `if (p.staff) continue;`; строка веса:
  ```js
  const promo = (a.poiPromo[k] ?? 0) > world.t ? T.promoFactor : 1;
  entries.push([k, p.weight * promo * (a.visitedPois?.has(k) ? 0.3 : 1)]);
  ```
- `nearestExit`: дистанции через `p.fx, p.fy` (у exit fx=x).
- `arrive`: без изменений логики (randomWalkableNear уже от a.x/a.y).
- `think`: в начале (до talk/queue):
  ```js
  if (a.kind !== 'visitor') return;          // спецагентов ведут special/logistics
  if (a.searching) return;                    // ищет друга — ведёт special.js
  if (a.activity === 'follow') {              // хвост стримера
    const s = world.agents.find(x => x.id === a.followTarget);
    if (!s || s.despawn) { a.activity = 'wander'; a.target = null; }
    return;
  }
  ```
  Дальше — суперфан, после проверки lost (вставить после строки `if (a.activity === 'lost') {...}`):
  ```js
  if (a.superfan) {
    const bel = a.beliefs.events.concert;
    const soon = bel.status === 'started' || (bel.status === 'on' && gameClock(world.t) >= bel.time - 1800);
    if (soon) {
      if (nearPoi(a, world, 'stage')) {
        a.activity = 'browse'; a.browseUntil = world.t + 9999; a.goalPoi = null;
        if (bel.status === 'over' || world.facts.concert.status === 'over') { a.superfan = false; a.browseUntil = 0; }
        return;
      }
      if (a.activity !== 'queue' && a.activity !== 'mobbing') { a.activity = 'goto'; a.goalPoi = 'stage'; a.target = null; return; }
    } else if (!a.visitedPois?.has('autograph') && a.activity !== 'queue' && a.activity !== 'mobbing' && a.goalPoi !== 'autograph') {
      a.activity = 'goto'; a.goalPoi = 'autograph'; a.target = null; return;
    }
  }
  ```
- `thinkLost` п.1: `a.doorMask |= lesson.doorBits;` → `a.obstMask |= lesson.obstBits;`; п.3: `a.doorMask = world.doorsClosed ?? 0;` → `a.obstMask = world.obstMask ?? 0;`.

- [ ] **Step 4: src/sim/dialogue.js**

- `pickTopic`: `if (src.doorMask) topics.push({ kind: 'door', mask: src.doorMask });` →
  ```js
  const ob = src.obstMask & (world.obstMask ?? ~0);
  if (ob) topics.push({ kind: 'obst', mask: ob });
  ```
- `applyTopic`: `case 'door': agent.doorMask |= topic.mask; break;` → `case 'obst': agent.obstMask |= topic.mask; break;`
- `canTalk`: добавить `if (a.kind !== 'visitor') return false;` первой строкой.
- `finishTalk`: блок мутации обернуть проверкой волонтёра:
  ```js
  if (Math.random() < T.talkTransfer) applyTopic(x, topic, world.t);
  ```
  остаётся как есть, а внутри applyTopic менять нечего — мутация живёт в applyTopic
  (event-ветка). Вместо этого в `applyTopic` сигнатуру НЕ менять, а мутацию гейтить
  в finishTalk: перед циклом peers вычислить
  ```js
  const nearVol = (world.volunteers ?? []).some(v => (v.x - mx) ** 2 + (v.y - my) ** 2 < T.volunteerRadius ** 2);
  ```
  …но mx/my вычисляются позже. Перенести объявление `const mx..., my...` ВЫШЕ
  `if (topic)` и передавать четвёртым аргументом: `applyTopic(x, topic, world.t, nearVol)`.
  В `applyTopic(agent, topic, t, noMutation = false)` ветка event:
  `if (!noMutation && Math.random() < T.rumorMutation) { ... }`.

- [ ] **Step 5: src/sim/steering.js**

- `stepAgent`: маска `const mask = (a.obstMask ?? 0) & (world.obstMask ?? 0);`
- `stepAgent` mods: добавить `if (a.activity === 'follow') mods = 0.9;`
  `if (a.activity === 'pose' || a.activity === 'clean') mods = 0;`
- Отталкивание от стен — вставить после блока «личная зона»:
  ```js
  // отталкивание от стен: мягкая сила до контакта
  for (const r of (world.obstacles ?? world.map.blocks)) {
    const px = Math.max(r.x, Math.min(r.x + r.w, a.x));
    const py = Math.max(r.y, Math.min(r.y + r.h, a.y));
    const ox = a.x - px, oy = a.y - py, d = Math.hypot(ox, oy);
    const reach = a.radius + 0.4;
    if (d > 1e-4 && d < reach) {
      const f = T.wallRepel * (1 - d / reach);
      dx += ox / d * f; dy += oy / d * f;
    }
  }
  ```
- Уступание: строки myP/theirP получают приоритет грузчика:
  ```js
  const myP = a.mass * Math.max(Math.hypot(a.vx, a.vy), 0.5) * (a.activity === 'goto' ? 1.5 : 1) * (a.kind === 'carrier' ? T.carrierPriority : 1);
  const theirP = b.mass * Math.max(Math.hypot(b.vx, b.vy), 0.5) * (b.activity === 'goto' ? 1.5 : 1) * (b.kind === 'carrier' ? T.carrierPriority : 1);
  ```
- `simTick`: в цикле per-agent первой строкой `if (a.dragged) { a.vx = a.vy = 0; continue; }`;
  в цикле `stepAgent` — `for (const a of agents) if (!a.dragged) stepAgent(a, world, dt);`;
  в `resolveCollisions` внутренний цикл — `if (b.id <= a.id || a.dragged || b.dragged) continue;`
  (и внешний `if (a.dragged) continue;`); в цикле pushOutOfRect — `if (a.dragged) continue;`.
- `smartTimer`-блок: `world.fields.recomputeSmart(agents, world.obstMask ?? 0);`
- `updateStress`: `if (a.dragged) continue;` первой строкой тела цикла; литтер-стресс:
  ```js
  if (world.litter) for (const l of world.litter)
    if ((l.x - a.x) ** 2 + (l.y - a.y) ** 2 < 0.25) { ds += T.litterStress; break; }
  ```
- despawn-фильтр дополнить счётом злых:
  ```js
  if (world.agents.some(a => a.despawn)) {
    if (world.score) world.score.angry += world.agents.filter(a => a.despawn && a.stress > 70).length;
    if (world.selected && world.selected.despawn) world.selected = null;
    world.agents = world.agents.filter(a => !a.despawn);
  }
  ```

- [ ] **Step 6: src/sim/queue.js**

- Импорт: `import { queueDirOf } from '../data/map.js';`
- `queueSlotPos`:
  ```js
  export function queueSlotPos(poi, slot) {
    const [dx, dy] = queueDirOf(poi);
    return { x: poi.fx + dx * T.queueSpacing * (slot + 1), y: poi.fy + dy * T.queueSpacing * (slot + 1) };
  }
  ```
- Все `poi.x` / `poi.y` в queueTick (вступление, headDensity, mobDensity, near-фильтр, head-проверка, mob target) заменить на `poi.fx` / `poi.fy`.
- Дезертирство: первой строкой фильтра `if (a.superfan) return true; // суперфан не дезертирует`.
- Вступление: спецагенты не встают: `if (a.kind !== 'visitor') continue;` первой строкой.

- [ ] **Step 7: src/data/messages.js — временная заглушка (полноценный конструктор в Task 10)**

```js
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
```

- [ ] **Step 8: Тесты зелёные + grep-проверка**

Run: `node tests/run.js` — PASS.
Run: `grep -rn "doorMask\|doorsClosed\|map.doors\|closeDoor\|doorW" src/ | grep -v main.js | grep -v render/ | grep -v ui/` — пусто (main/render/ui чинятся в Task 12–13).

- [ ] **Step 9: Commit**

```bash
git add -A src/ tests/run.js
git commit -m "feat(v3): obstMask registry, POI fronts, wall repulsion, doors removed from sim"
```

---

### Task 3: Расписание v3 — день, волна открытия, динамический концерт

**Files:**
- Rewrite: `src/data/schedule.js`
- Modify: `src/sim/agent.js` (closing-вес leave)
- Test: `tests/run.js`

- [ ] **Step 1: Падающий тест волны**

```js
import { tickSchedule } from '../src/data/schedule.js';
import { makeWorldFacts } from '../src/sim/knowledge.js';
import { simTick } from '../src/sim/steering.js';

test('волна открытия: ~200 за 10 сек, все в проходимых клетках', () => {
  const world = {
    t: 0, map: MAP, agents: [], flashes: [], hash: new SpatialHash(1),
    facts: makeWorldFacts(), fields: new Fields(MAP), obstMask: 0,
    score: { incidents: 0, angry: 0 },
  };
  initQueues(world);
  const dt = 1 / 30;
  for (let i = 0; i < Math.round(10.5 / dt); i++) { tickSchedule(world); simTick(world, dt); world.t += dt; }
  assert.ok(Math.abs(world.agents.length - 200) <= 10, 'спавнено: ' + world.agents.length);
  const g = world.fields.gridFor(0);
  for (const a of world.agents) assert.ok(isWalkable(g, a.x, a.y), `в стене (${a.x.toFixed(1)},${a.y.toFixed(1)})`);
});
```

Run: `node tests/run.js` — FAIL.

- [ ] **Step 2: Переписать src/data/schedule.js целиком**

```js
import { T, gameClock } from './tuning.js';
import { makeAgent } from '../sim/agent.js';
import { EXITS } from './map.js';
import { randomWalkableNear } from '../sim/flowfield.js';

export const h = (hh, mm) => ((hh - 13) * 3600 + mm * 60) / T.timeScale;

export function spawnAt(world, exitKey) {
  const p = world.map.pois[exitKey];
  const a = makeAgent(world, world.nextId = (world.nextId ?? 0) + 1);
  const pos = randomWalkableNear(world.fields.gridFor(0), p.fx, p.fy, 1.5);
  a.x = pos.x; a.y = pos.y;
  world.agents.push(a);
  return a;
}

function pickWaveExit() {
  const r = Math.random();
  return r < 0.6 ? 'exitMain' : r < 0.8 ? 'exitW' : 'exitE';
}

export const SCHEDULE = [
  { at: h(13, 30), name: 'Автограф-сессия началась', fire(w) { w.map.pois.autograph.weight = 7.5; } },
  { at: h(14, 0),  name: 'Автограф-сессия закончилась', fire(w) { w.map.pois.autograph.weight = 2.5; } },
  { at: h(15, 0),  name: 'Дроп лимитки у Мерч B!', fire(w) { if (!w.map.pois.merch2.soldOut) w.map.pois.merch2.weight = 6; } },
  { at: h(15, 20), name: 'Выставка скоро закрывается', fire(w) { w.map.pois.merch2.weight = w.map.pois.merch2.soldOut ? 0 : 2; w.closing = true; } },
];

export function tickSchedule(world) {
  for (const ev of SCHEDULE) {
    if (!ev.done && world.t >= ev.at) { ev.done = true; ev.fire(world); world.banner = { text: ev.name, t: world.t }; }
  }
  // динамический концерт: факты двигаются инструментом «сдвиг», статусы — от правды
  const f = world.facts.concert, gc = gameClock(world.t);
  if (f.status === 'on' && gc >= f.time) {
    f.status = 'started'; f.changedAt = world.t;
    world.banner = { text: 'Концерт начался', t: world.t };
    if (world.score) {
      const st = world.map.pois.stage;
      world.score.concertWant = world.agents.filter(a => a.wantsConcert).length;
      world.score.concertHit = world.agents.filter(a => (a.x - st.fx) ** 2 + (a.y - st.fy) ** 2 < 225).length;
      const j = world.agents.find(a => a.kind === 'journalist');
      if (j && (j.x - st.fx) ** 2 + (j.y - st.fy) ** 2 < 225) world.score.press.pos += 3;
    }
  }
  if (f.status === 'started' && gc >= f.time + 1800) {
    f.status = 'over'; f.changedAt = world.t;
    world.banner = { text: 'Концерт закончился', t: world.t };
  }
  // волна открытия: target — кумулятивная цель, отстающие входы догоняют
  if (world.t < T.openingWaveDur + 2) {
    world.waveSpawned ??= 0;
    const target = Math.min(T.openingWave, Math.floor(T.openingWave * world.t / T.openingWaveDur));
    let guard = 12; // не более 12 спавнов за тик (антиклот по горлу)
    while (world.waveSpawned < target && guard-- > 0) {
      const key = pickWaveExit();
      const p = world.map.pois[key];
      if (world.hash.queryCircle(p.fx, p.fy, 2).length > T.jamN) continue; // вход забит — пробуем другой
      spawnAt(world, key);
      world.waveSpawned++;
    }
    return;
  }
  // ручеёк после волны; приток глохнет в 15:00
  if (gc >= 15 * 3600) return;
  world.nextArrival ??= world.t + 1;
  if (world.t >= world.nextArrival && world.agents.length < T.maxAgents) {
    world.nextArrival = world.t + T.arrivalEvery * (0.5 + Math.random());
    spawnAt(world, EXITS[(Math.random() * EXITS.length) | 0]);
  }
}
```

- [ ] **Step 3: closing-вес в src/sim/agent.js**

Строку utility `leave:` заменить:

```js
    leave: (world.closing ? 1.6 : T.leaveWeight) *
      Math.max(world.closing ? 0.8 : 0, Math.min(1.5, (a.visitedCount / a.satThreshold) * 0.8 + a.fatigue / 150)),
```

- [ ] **Step 4: Тесты**

Run: `node tests/run.js` — PASS (волна и все прежние).

- [ ] **Step 5: Commit**

```bash
git add src/data/schedule.js src/sim/agent.js tests/run.js
git commit -m "feat(v3): day 13:00-16:00, opening wave, dynamic concert schedule"
```

---

### Task 4: Логистика — stock-гейт очереди, склад, грузчики

**Files:**
- Create: `src/sim/logistics.js`
- Modify: `src/sim/queue.js`
- Test: `tests/run.js`

- [ ] **Step 1: Падающие тесты**

```js
import { initLogistics, logisticsTick } from '../src/sim/logistics.js';

test('stock: пустой склад у POI останавливает обслуживание', () => {
  const poi = { x: 9, y: 19, w: 2, h: 2, face: 'E', fx: 10, fy: 20, service: { rate: 0.0001 }, stock: 1 };
  const world = { t: 100, map: { pois: { q: poi } }, agents: [], hash: { queryCircle: () => [] } };
  initQueues(world);
  const mk = id => ({ id, kind: 'visitor', x: 10, y: 20, stress: 50, boredom: 50, visitedCount: 0,
    activity: 'queue', goalPoi: null, target: null, poiCooldown: {}, beliefs: { knownPois: new Set() } });
  const a = mk(1), b = mk(2);
  world.agents.push(a, b);
  world.queues.q.line.push(a, b);
  queueTick(world, 1);
  assert.equal(poi.stock, 0, 'первый купил последнее');
  assert.equal(world.queues.q.line.length, 1);
  world.t = 200;
  queueTick(world, 1);
  assert.equal(world.queues.q.line.length, 1, 'без товара не обслуживаем');
  poi.stock = 10;
  world.t = 300;
  queueTick(world, 1);
  assert.equal(world.queues.q.line.length, 0, 'подвезли — очередь пошла');
});

test('логистика: stock<5 рождает грузчика, прибытие пополняет', () => {
  const world = {
    t: 0, map: MAP, agents: [], hash: new SpatialHash(1),
    facts: makeWorldFacts(), fields: new Fields(MAP), obstMask: 0, queues: {},
  };
  initQueues(world); initLogistics(world);
  MAP.pois.merch1.stock = 2; MAP.pois.merch1.soldOut = false; MAP.pois.merch1.weight = 2;
  logisticsTick(world);
  const c = world.agents.find(a => a.kind === 'carrier');
  assert.ok(c, 'грузчик вышел со склада');
  assert.equal(c.goalPoi, 'merch1');
  c.x = MAP.pois.merch1.fx; c.y = MAP.pois.merch1.fy;   // телепорт «прибыл»
  logisticsTick(world);
  assert.equal(MAP.pois.merch1.stock, 12, '2 + партия 10');
  assert.equal(c.goalPoi, 'depot', 'возвращается на склад');
  c.x = MAP.pois.depot.fx; c.y = MAP.pois.depot.fy;
  logisticsTick(world);
  assert.ok(c.despawn, 'грузчик ушёл со смены');
  MAP.pois.merch1.stock = 15; // не загрязнять другие тесты
});
```

Run: `node tests/run.js` — FAIL (нет logistics.js, stock не гейтит).

- [ ] **Step 2: stock-гейт в src/sim/queue.js**

Блок «обслуживание» обернуть:

```js
    // обслуживание (только при наличии товара)
    const hasStock = poi.stock === undefined || poi.stock > 0;
    if (hasStock && world.t >= q.servingUntil) {
      ... весь существующий блок serve ...
      if (served) {
        if (poi.stock !== undefined) poi.stock--;
        serveDone(world, served, key); q.servingUntil = world.t + rate;
      }
    }
    if (!hasStock) {
      // «НЕТ ТОВАРА»: ожидание злит, новички разворачиваются
      for (const a of q.line) a.stress = Math.min(100, a.stress + T.starvedStress * dt);
    }
```

В блоке «вступление» после проверки радиуса добавить:

```js
        if (poi.stock === 0 && Math.random() < 0.5) {   // увидел табличку — развернулся
          a.poiCooldown[key] = world.t + T.poiCooldownTime;
          a.goalPoi = null; a.activity = 'wander';
          continue;
        }
```

- [ ] **Step 3: Создать src/sim/logistics.js**

```js
import { T } from '../data/tuning.js';
import { makeAgent } from './agent.js';

const STOCKED = ['merch1', 'merch2'];

export function initLogistics(world) {
  world.depot = { reserve: { merch1: T.reserveInit, merch2: T.reserveInit }, enRoute: {} };
}

function near(a, p) { return (a.x - p.fx) ** 2 + (a.y - p.fy) ** 2 < 4; }

function spawnCarrier(world, key) {
  const depot = world.map.pois.depot;
  const a = makeAgent(world, world.nextId = (world.nextId ?? 0) + 1);
  a.kind = 'carrier';
  a.x = depot.fx; a.y = depot.fy;
  a.maxSpeed = T.carrierSpeed; a.radius = 0.35; a.mass = 2.5;
  a.sociability = 0;
  a.activity = 'goto'; a.goalPoi = key; a.carryTo = key;
  a.beliefs.knownPois = new Set(Object.keys(world.map.pois)); // персонал знает план
  a.obstMask = world.obstMask ?? 0;
  world.agents.push(a);
  world.depot.enRoute[key] = a.id;
}

export function logisticsTick(world) {
  for (const key of STOCKED) {
    const p = world.map.pois[key];
    if (p.soldOut) continue;
    if (p.stock === 0 && world.depot.reserve[key] === 0 && !world.depot.enRoute[key]) {
      p.soldOut = true; p.weight = 0;
      const q = world.queues[key];
      for (const a of q.line) {
        a.stress = Math.min(100, a.stress + 10);
        a.activity = 'wander'; a.target = null;
        a.poiCooldown[key] = world.t + 1e9;
      }
      q.line = [];
      world.banner = { text: `${p.label}: РАСПРОДАНО`, t: world.t };
      continue;
    }
    if (p.stock < T.stockLow && world.depot.reserve[key] > 0 && !world.depot.enRoute[key]) spawnCarrier(world, key);
  }
  // вождение грузчиков
  for (const a of world.agents) {
    if (a.kind !== 'carrier' || a.despawn) continue;
    if (a.carryTo && near(a, world.map.pois[a.carryTo])) {
      const p = world.map.pois[a.carryTo];
      const add = Math.min(T.stockBatch, world.depot.reserve[a.carryTo]);
      p.stock += add;
      world.depot.reserve[a.carryTo] -= add;
      world.depot.enRoute[a.carryTo] = null;
      a.carryTo = null; a.goalPoi = 'depot';
    } else if (!a.carryTo && near(a, world.map.pois.depot)) {
      a.despawn = true;
    }
  }
}
```

- [ ] **Step 4: Тесты**

Run: `node tests/run.js` — PASS.

- [ ] **Step 5: Commit**

```bash
git add src/sim/logistics.js src/sim/queue.js tests/run.js
git commit -m "feat(v3): merch stock, depot reserve, box carriers"
```

---

### Task 5: special.js часть 1 — спавнер, суперфаны, стример, косплеер

**Files:**
- Create: `src/sim/special.js`
- Test: `tests/run.js`

- [ ] **Step 1: Падающий тест спавнера**

```js
import { specialTick, spawnSpecial } from '../src/sim/special.js';

test('special: спавнер создаёт kind с нужными правками', () => {
  const world = { t: 0, map: MAP, agents: [], hash: new SpatialHash(1),
    facts: makeWorldFacts(), fields: new Fields(MAP), obstMask: 0, flashes: [] };
  const s = spawnSpecial(world, 'streamer');
  assert.equal(s.kind, 'streamer');
  assert.ok(s.maxSpeed < 2.1, 'стример медленный');
  const f = spawnSpecial(world, 'superfan');
  assert.equal(f.kind, 'visitor', 'суперфан — обычный visitor с флагом');
  assert.equal(f.superfan, true);
  assert.equal(f.stubborn, 1);
});
```

Run: `node tests/run.js` — FAIL.

- [ ] **Step 2: Создать src/sim/special.js (часть 1)**

```js
import { T, gameClock } from '../data/tuning.js';
import { makeAgent } from './agent.js';
import { randomWalkableNear } from './flowfield.js';
import { boardLocalLesson } from './knowledge.js';
import { h, spawnAt } from '../data/schedule.js';

// расписание выходов спецперсон
export const SPAWNS = [
  { at: 0.3,        kind: 'superfan', n: 5 },
  { at: h(13, 5),   kind: 'janitor',  n: 2 },
  { at: h(13, 15),  kind: 'journalist' },
  { at: h(13, 20),  kind: 'streamer' },
  { at: h(14, 50),  kind: 'streamer' },
  { at: h(13, 50),  kind: 'cosplayStar' },
  { at: h(15, 10),  kind: 'cosplayStar' },
];

export function spawnSpecial(world, kind) {
  const a = spawnAt(world, ['exitMain', 'exitW', 'exitE'][(Math.random() * 3) | 0]);
  switch (kind) {
    case 'superfan':
      a.superfan = true; a.stubborn = 1; a.wantsConcert = true;
      a.satThreshold = 99; // не уходит «насытившись»
      break;
    case 'streamer':
      a.kind = 'streamer'; a.maxSpeed *= 0.6;
      a.despawnAt = world.t + 15 * 60 / T.timeScale;
      a.beliefs.knownPois = new Set(Object.keys(world.map.pois));
      break;
    case 'cosplayStar': {
      a.kind = 'cosplayStar'; a.radius = 0.45; a.mass = 2;
      const spot = randomWalkableNear(world.fields.gridFor(0), 12 + Math.random() * 36, 8 + Math.random() * 24, 6);
      a.target = spot; a.activity = 'goto';
      break;
    }
    case 'janitor':
      a.kind = 'janitor'; a.maxSpeed = 1.6;
      break;
    case 'journalist':
      a.kind = 'journalist';
      a.despawnAt = h(15, 45);
      a.beliefs.knownPois = new Set(Object.keys(world.map.pois));
      break;
  }
  return a;
}

export function specialTick(world, dt) {
  for (const ev of SPAWNS) {
    if (!ev.done && world.t >= ev.at) {
      ev.done = true;
      for (let i = 0; i < (ev.n ?? 1); i++) spawnSpecial(world, ev.kind);
    }
  }
  streamerTick(world);
  starTick(world);
  pairSpawnTick(world);
  pairTick(world);
  janitorTick(world, dt);
  litterTick(world, dt);
  rumorTick(world);
  volunteerTick(world);
}

function pickPoiTarget(world, a) {
  const keys = Object.keys(world.map.pois).filter(k => {
    const p = world.map.pois[k];
    return !p.exit && !p.staff && p.weight > 0;
  });
  a.goalPoi = keys[(Math.random() * keys.length) | 0];
  a.activity = 'goto'; a.target = null;
}

function streamerTick(world) {
  for (const s of world.agents) {
    if (s.kind !== 'streamer') continue;
    if (world.t >= s.despawnAt) {
      s.despawn = true;
      for (const f of world.agents) if (f.activity === 'follow' && f.followTarget === s.id) { f.activity = 'wander'; f.target = null; }
      continue;
    }
    if (!s.goalPoi) pickPoiTarget(world, s);
    const p = world.map.pois[s.goalPoi];
    if (p && (s.x - p.fx) ** 2 + (s.y - p.fy) ** 2 < 9) pickPoiTarget(world, s);
    // вербовка хвоста
    let count = 0;
    for (const f of world.agents) if (f.activity === 'follow' && f.followTarget === s.id) count++;
    for (const b of world.hash.queryCircle(s.x, s.y, T.followAura)) {
      if (count >= T.followMax) break;
      if (b.kind !== 'visitor' || b.sociability <= 0.6) continue;
      if (b.activity !== 'wander' && b.activity !== 'browse') continue;
      b.activity = 'follow'; b.followTarget = s.id; b.goalPoi = null;
      count++;
    }
    // хвост держит курс на стримера
    for (const f of world.agents)
      if (f.activity === 'follow' && f.followTarget === s.id) f.target = { x: s.x, y: s.y };
  }
}

function starTick(world) {
  for (const s of world.agents) {
    if (s.kind !== 'cosplayStar') continue;
    if (s.activity === 'goto' && s.target && (s.x - s.target.x) ** 2 + (s.y - s.target.y) ** 2 < 1) {
      s.activity = 'pose'; s.target = null;
      s.poseUntil = world.t + T.poseGameMin * 60 / T.timeScale;
    }
    if (s.activity === 'pose') {
      if (world.t >= s.poseUntil) { s.despawn = true; continue; }
      for (const b of world.hash.queryCircle(s.x, s.y, T.starAura)) {
        if (b.kind !== 'visitor' || b.boredom < 40) continue;
        if (b.activity !== 'wander' && b.activity !== 'browse') continue;
        const spot = randomWalkableNear(world.fields.gridFor(0), s.x, s.y, 2);
        b.activity = 'browse'; b.browseUntil = s.poseUntil;
        b.goalPoi = null; b.target = spot;
        b.boredom = Math.max(0, b.boredom - 30); // сфоткал звезду
      }
    }
  }
}
```

(`pairSpawnTick/pairTick/janitorTick/litterTick/rumorTick/volunteerTick` — пустые
заглушки `function pairSpawnTick() {}` и т.д. в этой задаче; наполняются в Task 6.)

- [ ] **Step 3: Тесты**

Run: `node tests/run.js` — PASS.

- [ ] **Step 4: Commit**

```bash
git add src/sim/special.js tests/run.js
git commit -m "feat(v3): special agents pt1 - superfan, streamer tail, cosplay star"
```

---

### Task 6: special.js часть 2 — пары, уборщики, мусор, слухи, волонтёры

**Files:**
- Modify: `src/sim/special.js` (наполнить заглушки)
- Test: `tests/run.js`

- [ ] **Step 1: Падающие тесты**

```js
import { pairTick, injectSpontaneousRumor } from '../src/sim/special.js';
import { makeAgent } from '../src/sim/agent.js';

test('lostPair: разлука включает поиск, встреча лечит', () => {
  const world = { t: 100, map: MAP, agents: [], hash: new SpatialHash(1),
    facts: makeWorldFacts(), fields: new Fields(MAP), obstMask: 0, flashes: [] };
  const a = makeAgent(world, 1), b = makeAgent(world, 2);
  a.friendId = 2; b.friendId = 1;
  a.x = 10; a.y = 35; b.x = 40; b.y = 35; a.stress = b.stress = 0;
  world.agents.push(a, b);
  pairTick(world);
  assert.ok(a.searching && b.searching, 'оба ищут');
  assert.ok(a.stress >= 20, 'стресс разлуки');
  b.x = 11; b.y = 35;
  pairTick(world);
  assert.ok(!a.searching && !b.searching, 'воссоединились');
  assert.ok(a.stress <= 10 && b.stress <= 10, 'отлегло');
});

test('слух: заражает одного с пометкой свежести', () => {
  const world = { t: 50, map: MAP, agents: [], hash: new SpatialHash(1),
    facts: makeWorldFacts(), fields: new Fields(MAP), obstMask: 0, flashes: [] };
  for (let i = 0; i < 10; i++) { const a = makeAgent(world, i); a.sociability = 0.9; world.agents.push(a); }
  injectSpontaneousRumor(world);
  const infected = world.agents.filter(a => {
    const c = a.beliefs.events.concert;
    return c.status === 'cancelled' || c.time !== world.facts.concert.time;
  });
  assert.equal(infected.length, 1, 'ровно один зачинщик');
  assert.equal(infected[0].beliefs.events.concert.learnedAt, world.t, 'слух свежее правды');
});
```

Run: `node tests/run.js` — FAIL.

- [ ] **Step 2: Наполнить заглушки в src/sim/special.js**

```js
function pairSpawnTick(world) {
  world.nextPair ??= h(13, 8);
  if (world.t < world.nextPair) return;
  world.nextPair = world.t + T.pairEveryGameMin * 60 / T.timeScale;
  const key = ['exitMain', 'exitW', 'exitE'][(Math.random() * 3) | 0];
  const a = spawnAt(world, key), b = spawnAt(world, key);
  a.friendId = b.id; b.friendId = a.id;
}

export function pairTick(world) {
  for (const a of world.agents) {
    if (!a.friendId) continue;
    const b = world.agents.find(x => x.id === a.friendId);
    if (!b || b.despawn) { a.friendId = null; a.searching = false; continue; }
    if (a.id > b.id) continue; // пара обрабатывается один раз
    const d2 = (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
    if (!a.searching && d2 > T.pairSepDist ** 2) {
      for (const x of [a, b]) {
        x.searching = true; x.goalPoi = null; x.target = null; x.activity = 'wander';
        x.stress = Math.min(100, x.stress + 20);
        x.searchRetargetAt = 0;
      }
    } else if (a.searching && d2 < T.pairReuniteDist ** 2) {
      for (const x of [a, b]) { x.searching = false; x.stress = Math.min(x.stress, 10); x.target = null; }
      world.flashes.push({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, t: world.t, r: 2, kind: 'heart' });
    } else if (a.searching) {
      for (const x of [a, b]) {
        if (world.t >= (x.searchRetargetAt ?? 0)) {
          x.searchRetargetAt = world.t + 3;
          x.target = randomWalkableNear(world.fields.gridFor(0), x.x, x.y, 10);
        }
      }
    }
  }
}

function janitorTick(world, dt) {
  for (const j of world.agents) {
    if (j.kind !== 'janitor') continue;
    if (j.cleanUntil > world.t) continue;        // моет
    if (j.cleanTarget) {                          // домыл — убрать мусор
      const i = (world.litter ?? []).indexOf(j.cleanTarget);
      if (i >= 0) world.litter.splice(i, 1);
      j.cleanTarget = null;
    }
    let best = null, bd = 25;
    for (const l of world.litter ?? []) {
      const d2 = (l.x - j.x) ** 2 + (l.y - j.y) ** 2;
      if (d2 < bd) { bd = d2; best = l; }
    }
    if (best) {
      if (bd < 0.36) { j.cleanTarget = best; j.cleanUntil = world.t + 2; j.activity = 'clean'; j.target = null; }
      else { j.activity = 'wander'; j.target = { x: best.x, y: best.y }; }
    } else if (!j.target) {
      j.activity = 'wander';
      j.target = randomWalkableNear(world.fields.gridFor(0), j.x, j.y, 8);
    }
  }
}

function litterTick(world, dt) {
  world.litter ??= [];
  world.litterTimer = (world.litterTimer ?? 0) - dt;
  if (world.litterTimer > 0 || !world.fields.density) return;
  world.litterTimer = T.litterEvery;
  const d = world.fields.density, g = world.fields.gridFor(0);
  for (let i = 0; i < d.length; i++) {
    if (world.litter.length >= T.litterMax) break;
    if (d[i] >= T.jamN && Math.random() < T.litterChance)
      world.litter.push({ x: i % g.W + Math.random(), y: ((i / g.W) | 0) + Math.random() });
  }
}

function rumorTick(world) {
  world.nextRumor ??= T.rumorEvery;
  if (world.t < world.nextRumor) return;
  world.nextRumor = world.t + T.rumorEvery + (Math.random() * 2 - 1) * T.rumorJitter;
  injectSpontaneousRumor(world);
}

export function injectSpontaneousRumor(world) {
  const cands = world.agents.filter(a => a.kind === 'visitor' && a.sociability > 0.7 && a.perception > 0);
  if (!cands.length) return;
  const a = cands[(Math.random() * cands.length) | 0];
  const f = world.facts.concert;
  a.beliefs.events.concert = Math.random() < 0.5
    ? { ...f, status: 'cancelled', learnedAt: world.t }
    : { ...f, time: f.time + 1800, learnedAt: world.t };
  let nearest = '', bd = Infinity;
  for (const [k, p] of Object.entries(world.map.pois)) {
    const d2 = (p.fx - a.x) ** 2 + (p.fy - a.y) ** 2;
    if (d2 < bd) { bd = d2; nearest = p.label; }
  }
  world.banner = { text: `🔥 Слух пошёл (район: ${nearest})`, t: world.t };
}

function volunteerTick(world) {
  for (const v of world.volunteers ?? []) {
    for (const a of world.hash.queryCircle(v.x, v.y, T.volunteerRadius)) {
      if (!a.beliefs || a.kind !== 'visitor') continue;
      if (a.activity === 'lost') {
        for (const k of Object.keys(world.map.pois)) a.beliefs.knownPois.add(k);
        a.obstMask = world.obstMask ?? 0;
        a.activity = 'wander'; a.stress = Math.max(0, a.stress - 15);
      } else if ((a.volTaughtAt ?? -99) + T.volunteerTeachEvery < world.t) {
        a.volTaughtAt = world.t;
        const lesson = boardLocalLesson(world, v);   // v = {x, y} — годится как «табло»
        for (const k of lesson.pois) a.beliefs.knownPois.add(k);
        a.obstMask |= lesson.obstBits;
      }
    }
  }
}
```

(Удалить пустые заглушки этих функций из Task 5; `pairTick` и
`injectSpontaneousRumor` экспортируются.)

- [ ] **Step 3: Тесты**

Run: `node tests/run.js` — PASS.

- [ ] **Step 4: Commit**

```bash
git add src/sim/special.js tests/run.js
git commit -m "feat(v3): special agents pt2 - lost pairs, janitors, litter, rumors, volunteers"
```

---

### Task 7: Инциденты давки

**Files:**
- Create: `src/sim/incidents.js`
- Test: `tests/run.js`

- [ ] **Step 1: Падающий тест**

```js
import { incidentsTick } from '../src/sim/incidents.js';

test('инцидент: горячая клетка 10с → слот занят, через 20с свободен', () => {
  const fl = new Fields(MAP);
  const g = fl.gridFor(0);
  fl.density = new Float32Array(g.W * g.H);
  const cell = 22 * g.W + 30;                       // проход
  fl.density[cell] = 7;
  const crowd = Array.from({ length: 13 }, () => ({ stress: 0 }));
  const world = {
    t: 0, map: MAP, agents: [], fields: fl, obstMask: 0,
    hash: { queryCircle: () => crowd },
    score: { incidents: 0 },
    syncObstacles() { this.obstMask = this.fields.activeMask(); },
  };
  for (let i = 0; i < 13; i++) { incidentsTick(world, 1); world.t += 1; }
  assert.equal(world.score.incidents, 1, 'инцидент засчитан');
  assert.ok(world.fields.slots[3], 'слот 3 занят оцеплением');
  assert.ok(crowd[0].stress > 0, 'волна стресса прошла');
  fl.density[cell] = 0;
  for (let i = 0; i < 25; i++) { incidentsTick(world, 1); world.t += 1; }
  assert.equal(world.fields.slots[3], null, 'оцепление снято');
});
```

Run: `node tests/run.js` — FAIL.

- [ ] **Step 2: Создать src/sim/incidents.js**

```js
import { T } from '../data/tuning.js';

// Детектор давки: клетка с плотностью ≥6 проверяется queryCircle(1.5);
// > T.incidentDensity агентов 10 секунд подряд → «кто-то упал», зона 3×3
// оцепляется в слот 3/4 на T.incidentDur секунд.
export function incidentsTick(world, dt) {
  world.hot ??= new Map();
  world.incidentEnds ??= {};
  world.incTimer = (world.incTimer ?? 0) - dt;
  if (world.incTimer <= 0 && world.fields.density) {
    world.incTimer = 2;
    const d = world.fields.density, g = world.fields.gridFor(0);
    const seen = new Set();
    for (let i = 0; i < d.length; i++) {
      if (d[i] < 6) continue;
      const x = i % g.W + 0.5, y = ((i / g.W) | 0) + 0.5;
      if (world.hash.queryCircle(x, y, 1.5).length > T.incidentDensity) {
        seen.add(i);
        world.hot.set(i, (world.hot.get(i) ?? 0) + 2);
      }
    }
    for (const k of [...world.hot.keys()]) if (!seen.has(k)) world.hot.delete(k);
    for (const [i, dur] of [...world.hot]) {
      if (dur < T.incidentAfter) continue;
      world.hot.delete(i);
      const x = i % g.W, y = (i / g.W) | 0;
      for (const a of world.hash.queryCircle(x + 0.5, y + 0.5, T.incidentRadius))
        a.stress = Math.min(100, a.stress + T.incidentStress);
      world.score.incidents++;
      world.banner = { text: '⚠ Инцидент: давка, зону оцепили', t: world.t };
      const slot = !world.fields.slots[3] ? 3 : !world.fields.slots[4] ? 4 : -1;
      if (slot >= 0) {
        world.fields.setSlot(slot, { x: x - 1, y: y - 1, w: 3, h: 3 });
        world.incidentEnds[slot] = world.t + T.incidentDur;
        world.syncObstacles();
      }
    }
  }
  for (const [slot, end] of Object.entries(world.incidentEnds)) {
    if (world.t >= end) {
      world.fields.clearSlot(+slot);
      delete world.incidentEnds[slot];
      world.syncObstacles();
    }
  }
}
```

- [ ] **Step 3: Тесты** — `node tests/run.js` PASS.

- [ ] **Step 4: Commit**

```bash
git add src/sim/incidents.js tests/run.js
git commit -m "feat(v3): crush incidents occupy obstacle slots"
```

---

### Task 8: Счёт, журналист, финальный экран

**Files:**
- Create: `src/sim/score.js`, `src/ui/finale.js`
- Modify: `src/sim/special.js` (движение журналиста), `index.html` (#score, #finale)

- [ ] **Step 1: Создать src/sim/score.js**

```js
import { T } from '../data/tuning.js';

export function initScore(world) {
  world.score = {
    incidents: 0, angry: 0, served: 0,
    press: { pos: 0, neg: 0 },
    concertWant: 0, concertHit: 0,
    stressHist: [],
  };
}

export function scoreTick(world, dt) {
  const s = world.score;
  s.histTimer = (s.histTimer ?? 0) - dt;
  if (s.histTimer <= 0) {
    s.histTimer = 1;
    const avg = world.agents.reduce((sum, a) => sum + a.stress, 0) / (world.agents.length || 1);
    s.stressHist.push(avg);
    if (s.stressHist.length > 60) s.stressHist.shift();
  }
  // журналист «снимает кадр»
  s.pressTimer = (s.pressTimer ?? 0) - dt;
  if (s.pressTimer <= 0) {
    s.pressTimer = T.pressCheckEvery;
    const j = world.agents.find(a => a.kind === 'journalist');
    if (j) {
      const around = world.hash.queryCircle(j.x, j.y, 8).filter(a => a !== j);
      if (around.some(a => a.activity === 'mobbing')) s.press.neg++;
      else if (around.length > 3) {
        const avg = around.reduce((sum, a) => sum + a.stress, 0) / around.length;
        if (avg < 40 && around.some(a => a.activity === 'browse' || a.activity === 'queue')) s.press.pos++;
      }
    }
  }
}

export function updateScorePanel(world) {
  const el = document.getElementById('score');
  if (!el) return;
  const s = world.score;
  const avg = s.stressHist[s.stressHist.length - 1] ?? 0;
  const spark = s.stressHist.map(v => '▁▂▃▄▅▆▇█'[Math.min(7, (v / 12.5) | 0)]).join('');
  const press = s.press.pos - s.press.neg;
  el.textContent =
`── СЧЁТ ──
стресс ${avg.toFixed(0)}
${spark}
обслужено: ${world.served ?? 0}
концерт: ${s.concertWant ? Math.round(100 * s.concertHit / s.concertWant) + '%' : '—'}
ушли злыми: ${s.angry}
инциденты: ${s.incidents}
пресса 📰: ${press > 0 ? '+' : ''}${press}`;
}
```

- [ ] **Step 2: Движение журналиста в special.js**

В `specialTick` после `streamerTick(world);` добавить вызов `journalistTick(world);`
и функцию:

```js
function journalistTick(world) {
  for (const j of world.agents) {
    if (j.kind !== 'journalist') continue;
    if (world.t >= j.despawnAt) { j.despawn = true; continue; }
    if (!j.goalPoi) pickPoiTarget(world, j);
    const p = world.map.pois[j.goalPoi];
    if (p && (j.x - p.fx) ** 2 + (j.y - p.fy) ** 2 < 9) pickPoiTarget(world, j);
  }
}
```

- [ ] **Step 3: Создать src/ui/finale.js**

```js
import { gameClock } from '../data/tuning.js';

export function maybeFinale(world) {
  if (world.over || gameClock(world.t) < 16 * 3600) return;
  world.over = true;
  const s = world.score;
  const avg = s.stressHist.reduce((a, b) => a + b, 0) / (s.stressHist.length || 1);
  const press = s.press.pos - s.press.neg;
  const verdict =
    s.incidents === 0 && press >= 3 && avg < 45 ? '🏆 Образцовый конвент' :
    s.incidents > 2 || press <= -3 || s.angry > 40 ? '🔥 Позор в прессе' :
    '😮‍💨 Выжили';
  const el = document.getElementById('finale');
  el.innerHTML = `<div>
    <h1>${verdict}</h1>
    <p>средний стресс часа пик: ${avg.toFixed(0)}</p>
    <p>обслужено: ${world.served ?? 0} · на концерт успели: ${s.concertWant ? Math.round(100 * s.concertHit / s.concertWant) + '%' : '—'}</p>
    <p>ушли злыми: ${s.angry} · инциденты: ${s.incidents} · пресса: ${press > 0 ? '+' : ''}${press}</p>
    <p style="opacity:.6">F5 — новый день</p>
  </div>`;
  el.style.display = 'flex';
}
```

- [ ] **Step 4: index.html — каркас v3**

Переписать `index.html` целиком (тулбар и панель симуляции наполняются скриптами
Task 9–11, здесь только контейнеры и стили):

```html
<!doctype html>
<html><head><meta charset="utf-8"><title>ConCrowd</title>
<style>
  body{margin:0;background:#0b0b10;display:flex;flex-direction:column;justify-content:center;align-items:center;min-height:100vh;font-family:system-ui;gap:6px}
  canvas{background:#14141c}
  #toolbar{display:flex;gap:6px;align-items:center;color:#9ab;font:12px monospace}
  #toolbar button{background:#28304a;border:0;color:#dde;padding:6px 10px;border-radius:6px;cursor:pointer}
  #toolbar button.active{background:#4a6fd0}
  #toolbar button:disabled{opacity:.4;cursor:default}
  #simpanel{display:flex;gap:6px;align-items:center;color:#9ab;font:11px monospace;flex-wrap:wrap;max-width:960px}
  #simpanel button{background:#333a4c;border:0;color:#cde;padding:4px 8px;border-radius:4px;cursor:pointer}
  #cards{position:fixed;display:none;flex-direction:column;gap:6px;background:#222;padding:10px;border-radius:8px;z-index:5}
  #cards button{background:#3a6;border:0;color:#fff;padding:8px 12px;border-radius:6px;cursor:pointer;text-align:left}
  #cards select{padding:4px}
  #inspector{position:fixed;right:8px;top:8px;width:240px;background:rgba(20,22,30,.92);color:#cde;font:11px monospace;padding:10px;border-radius:8px;display:none;white-space:pre-wrap}
  #score{position:fixed;right:8px;bottom:8px;width:240px;background:rgba(20,22,30,.92);color:#cde;font:11px monospace;padding:10px;border-radius:8px;white-space:pre-wrap}
  #finale{position:fixed;inset:0;display:none;justify-content:center;align-items:center;background:rgba(5,6,10,.88);color:#fff;font:14px monospace;text-align:center;z-index:10}
</style></head>
<body>
<div id="toolbar"></div>
<canvas id="c" width="960" height="704"></canvas>
<div id="simpanel"></div>
<div id="cards"></div>
<div id="inspector"></div>
<div id="score"></div>
<div id="finale"></div>
<script type="module" src="src/main.js"></script>
</body></html>
```

- [ ] **Step 5: Тесты + Commit**

Run: `node tests/run.js` — PASS (score/finale не импортируются тестами).

```bash
git add src/sim/score.js src/ui/finale.js src/sim/special.js index.html
git commit -m "feat(v3): scoring, journalist press rating, finale screen"
```

---

### Task 9: Инструменты игрока — тулбар, барьеры, волонтёры, драг

**Files:**
- Create: `src/ui/tools.js`

- [ ] **Step 1: Создать src/ui/tools.js**

```js
import { T } from '../data/tuning.js';
import { randomWalkableNear, isWalkable } from '../sim/flowfield.js';
import { enterLost } from '../sim/agent.js';

const px2m = (canvas, e) => {
  const r = canvas.getBoundingClientRect();
  return { x: (e.clientX - r.left) / T.pxPerMeter, y: (e.clientY - r.top) / T.pxPerMeter };
};

export function initTools(canvas, world) {
  world.ui = { mode: 'cursor', dragging: null, holdTimer: null, holdAgent: null,
    paUntil: 0, rumorUntil: 0, shiftUsed: false };
  world.volunteers = [];

  const bar = document.getElementById('toolbar');
  bar.innerHTML = `
    <button data-mode="cursor" class="active">Курсор</button>
    <button data-mode="barrier">Барьер</button>
    <button data-mode="volunteer">Волонтёр</button>
    <span style="width:12px"></span>
    <button id="paBtn">📢 Громкая связь</button>
    <button id="rumorBtn">🗣 Вброс слуха</button>
    <button id="shiftBtn">⏰ Сдвинуть концерт +30м</button>`;
  for (const b of bar.querySelectorAll('[data-mode]')) {
    b.onclick = () => {
      world.ui.mode = b.dataset.mode;
      bar.querySelectorAll('[data-mode]').forEach(x => x.classList.toggle('active', x === b));
    };
  }
  // кулдауны на кнопках
  setInterval(() => {
    const pa = document.getElementById('paBtn'), ru = document.getElementById('rumorBtn');
    const paLeft = Math.ceil(world.ui.paUntil - world.t), ruLeft = Math.ceil(world.ui.rumorUntil - world.t);
    pa.disabled = paLeft > 0; pa.textContent = paLeft > 0 ? `📢 ${paLeft}с` : '📢 Громкая связь';
    ru.disabled = ruLeft > 0; ru.textContent = ruLeft > 0 ? `🗣 ${ruLeft}с` : '🗣 Вброс слуха';
    const sh = document.getElementById('shiftBtn');
    sh.disabled = world.ui.shiftUsed;
  }, 250);

  document.getElementById('shiftBtn').onclick = () => {
    if (world.ui.shiftUsed) return;
    world.ui.shiftUsed = true;
    world.facts.concert.time += 1800;
    world.facts.concert.changedAt = world.t;
    world.banner = { text: 'Концерт сдвинут на +30 мин (никто пока не знает!)', t: world.t };
  };
  // paBtn / rumorBtn навешиваются в Task 10 (конструктор сообщений)

  canvas.addEventListener('mousedown', e => {
    const m = px2m(canvas, e);
    if (world.ui.mode === 'barrier') return placeBarrier(world, m);
    if (world.ui.mode === 'volunteer') return placeVolunteer(world, m);
    // cursor: возможный драг — ждём dragHold
    let best = null, bd = 1;
    for (const a of world.agents) {
      const d = Math.hypot(a.x - m.x, a.y - m.y);
      if (d < bd && (a.kind === 'visitor')) { bd = d; best = a; }
    }
    if (!best) return;
    world.ui.holdAgent = best;
    world.ui.holdTimer = setTimeout(() => {
      best.dragged = true;
      world.ui.dragging = best;
      world.ui.holdAgent = null;
    }, T.dragHold * 1000);
  });
  canvas.addEventListener('mousemove', e => {
    const m = px2m(canvas, e);
    if (world.ui.dragging) { world.ui.dragging.x = m.x; world.ui.dragging.y = m.y; }
  });
  window.addEventListener('mouseup', () => {
    clearTimeout(world.ui.holdTimer); world.ui.holdTimer = null; world.ui.holdAgent = null;
    const a = world.ui.dragging;
    if (!a) return;
    world.ui.dragging = null;
    a.dragged = false;
    const g = world.fields.gridFor(0);
    if (!isWalkable(g, a.x, a.y)) { const p = randomWalkableNear(g, a.x, a.y, 4); a.x = p.x; a.y = p.y; }
    a.vx = a.vy = 0;
    enterLost(a, world, null);   // приземлился — «да где я вообще?!»
  });
}

function placeBarrier(world, m) {
  // клик по существующей ленте — снять
  for (let i = 0; i < T.barrierSlots; i++) {
    const s = world.fields.slots[i];
    if (s && m.x >= s.x && m.x <= s.x + s.w && m.y >= s.y && m.y <= s.y + s.h) {
      world.fields.clearSlot(i);
      world.syncObstacles();
      return;
    }
  }
  const g = world.fields.gridFor(0);
  if (!isWalkable(g, m.x, m.y)) return;
  const slot = [0, 1, 2].find(i => !world.fields.slots[i]);
  if (slot === undefined) { world.banner = { text: 'Все ленты заняты — сними одну', t: world.t }; return; }
  world.fields.setSlot(slot, { x: (m.x | 0) - 0.5, y: (m.y | 0) - 0.5, w: 2, h: 2 });
  world.syncObstacles();
}

function placeVolunteer(world, m) {
  const i = world.volunteers.findIndex(v => Math.hypot(v.x - m.x, v.y - m.y) < 1);
  if (i >= 0) { world.volunteers.splice(i, 1); return; }
  if (world.volunteers.length >= T.volunteerMax) { world.banner = { text: 'Волонтёры кончились (макс 2)', t: world.t }; return; }
  if (!isWalkable(world.fields.gridFor(0), m.x, m.y)) return;
  world.volunteers.push({ x: m.x, y: m.y });
}
```

- [ ] **Step 2: Инспектор уважает режимы — src/ui/inspector.js**

В клик-листенере первой строкой: `if (world.ui && world.ui.mode !== 'cursor') return;`

- [ ] **Step 3: Тесты + Commit**

Run: `node tests/run.js` — PASS.

```bash
git add src/ui/tools.js src/ui/inspector.js
git commit -m "feat(v3): player toolbar - barriers, volunteers, agent drag"
```

---

### Task 10: Конструктор сообщений — табло, громкая связь, вброс слуха

**Files:**
- Rewrite: `src/data/messages.js`
- Rewrite: `src/ui/boards.js`
- Modify: `src/ui/tools.js` (paBtn/rumorBtn)

- [ ] **Step 1: Переписать src/data/messages.js**

```js
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
```

- [ ] **Step 2: Переписать src/ui/boards.js — конструктор у табло**

```js
import { T } from '../data/tuning.js';
import { boardBroadcast } from '../sim/knowledge.js';
import { makeBoardMessages, composerOptions } from '../data/messages.js';

// Общий конструктор: рисует формы в #cards, onPick(applyFn, label) — что делать с выбором.
export function openComposer(world, screenX, screenY, onPick, withLocal = null) {
  const el = document.getElementById('cards');
  el.innerHTML = '';
  el.style.left = Math.min(screenX, innerWidth - 280) + 'px';
  el.style.top = Math.min(screenY, innerHeight - 240) + 'px';
  el.style.display = 'flex';
  const M = makeBoardMessages(world);
  const opts = composerOptions(world);

  const row = (labelText, selectOpts, makeFn) => {
    const div = document.createElement('div');
    const sel = document.createElement('select');
    for (const o of selectOpts) { const op = document.createElement('option'); op.value = o.key; op.textContent = o.label; sel.appendChild(op); }
    const btn = document.createElement('button');
    btn.textContent = labelText;
    btn.onclick = () => { onPick(makeFn(sel.value), `${labelText}: ${sel.selectedOptions[0].textContent}`); el.style.display = 'none'; };
    div.append(btn, sel);
    el.appendChild(div);
  };
  row('Продвинуть', opts.pois, M.promote);
  row('Затор у', opts.pois, M.jam);
  for (const c of opts.concert) {
    const btn = document.createElement('button');
    btn.textContent = c.label;
    btn.onclick = () => { onPick(M.concert(c.kind), c.label); el.style.display = 'none'; };
    el.appendChild(btn);
  }
  if (withLocal) {
    const btn = document.createElement('button');
    btn.textContent = 'Карта участка (POI/ленты/заторы рядом)';
    btn.onclick = () => { onPick(M.local(withLocal), 'Карта участка'); el.style.display = 'none'; };
    el.appendChild(btn);
  }
}

export function initBoards(canvas, world) {
  const cardsEl = document.getElementById('cards');
  canvas.addEventListener('click', e => {
    const r = canvas.getBoundingClientRect();
    const mx = (e.clientX - r.left) / T.pxPerMeter, my = (e.clientY - r.top) / T.pxPerMeter;
    const board = world.map.boards.find(b => Math.hypot(b.x - mx, b.y - my) < 2);
    cardsEl.style.display = 'none';
    if (!board) return;
    openComposer(world, e.clientX, e.clientY,
      applyFn => boardBroadcast(world, board, applyFn), board);
  });
}
```

- [ ] **Step 3: Громкая связь и вброс в src/ui/tools.js**

Импорты: `import { openComposer } from './boards.js';` и в `initTools` после shiftBtn:

```js
  document.getElementById('paBtn').onclick = e => {
    if (world.t < world.ui.paUntil) return;
    openComposer(world, e.clientX, e.clientY, (applyFn, label) => {
      for (const a of world.agents) {
        if (a.perception > 0 && a.beliefs) { applyFn(a, world); a.stress = Math.min(100, a.stress + T.paStress); }
      }
      world.ui.paUntil = world.t + T.paCooldown;
      world.flashes.push({ x: world.map.w / 2, y: world.map.h / 2, t: world.t, r: world.map.w / 2 });
      world.banner = { text: `📢 ${label}`, t: world.t };
    });
  };
  document.getElementById('rumorBtn').onclick = e => {
    if (world.t < world.ui.rumorUntil) return;
    const el = document.getElementById('cards');
    el.innerHTML = ''; el.style.left = e.clientX + 'px'; el.style.top = e.clientY + 'px'; el.style.display = 'flex';
    for (const [k, p] of Object.entries(world.map.pois)) {
      if (p.exit || p.staff || p.soldOut || p.weight <= 0) continue;
      const btn = document.createElement('button');
      btn.textContent = `«У "${p.label}" что-то раздают!»`;
      btn.onclick = () => {
        el.style.display = 'none';
        world.ui.rumorUntil = world.t + T.rumorInjectCooldown;
        const cands = world.agents.filter(a => a.kind === 'visitor' && a.beliefs);
        for (let i = 0; i < T.rumorInjectCount && cands.length; i++) {
          const a = cands.splice((Math.random() * cands.length) | 0, 1)[0];
          a.beliefs.knownPois.add(k);
          a.poiPromo[k] = world.t + T.promoTime;
        }
        world.banner = { text: `🗣 Слух запущен: ${p.label}`, t: world.t };
      };
      el.appendChild(btn);
    }
  };
```

- [ ] **Step 4: Тесты + Commit**

Run: `node tests/run.js` — PASS.

```bash
git add src/data/messages.js src/ui/boards.js src/ui/tools.js
git commit -m "feat(v3): message composer for boards, PA announce, rumor injection"
```

---

### Task 11: Дев-панель симуляции

**Files:**
- Create: `src/ui/simpanel.js`

- [ ] **Step 1: Создать src/ui/simpanel.js**

```js
import { spawnAt } from '../data/schedule.js';
import { EXITS } from '../data/map.js';

export function initSimPanel(world) {
  const el = document.getElementById('simpanel');
  el.innerHTML = `<b>сим:</b>
    <button id="spPlus">+50</button><button id="spMinus">−50</button><button id="spWave">волна 100</button>
    <button id="spPause">⏸</button><button id="spSpeed">×1</button>
    <button id="spCalm">сброс стресса</button>
    <label><input type="checkbox" id="spDebug"> debug</label>
    <span id="spPois"></span>`;
  const sp = id => document.getElementById(id);
  const rndExit = () => EXITS[(Math.random() * EXITS.length) | 0];
  sp('spPlus').onclick = () => { for (let i = 0; i < 50; i++) spawnAt(world, rndExit()); };
  sp('spWave').onclick = () => { for (let i = 0; i < 100; i++) spawnAt(world, rndExit()); };
  sp('spMinus').onclick = () => {
    const vis = world.agents.filter(a => a.kind === 'visitor');
    for (let i = 0; i < 50 && vis.length; i++) vis.splice((Math.random() * vis.length) | 0, 1)[0].despawn = true;
  };
  sp('spPause').onclick = () => { world.paused = !world.paused; sp('spPause').textContent = world.paused ? '▶' : '⏸'; };
  sp('spSpeed').onclick = () => { world.speedMul = world.speedMul === 2 ? 1 : 2; sp('spSpeed').textContent = '×' + world.speedMul; };
  sp('spCalm').onclick = () => { for (const a of world.agents) a.stress = 0; };
  sp('spDebug').onchange = e => { world.debug = e.target.checked; };
  // чекбоксы POI: weight→0 на лету; сервисные — роспуск очереди (обратимый)
  const box = sp('spPois');
  for (const [k, p] of Object.entries(world.map.pois)) {
    if (p.exit || p.staff || p.weight <= 0) continue;
    const lb = document.createElement('label');
    const cb = document.createElement('input');
    cb.type = 'checkbox'; cb.checked = true;
    cb.onchange = () => {
      if (!cb.checked) {
        p.weight0 = p.weight; p.weight = 0;
        const q = world.queues?.[k];
        if (q) { for (const a of q.line) { a.activity = 'wander'; a.target = null; } q.line = []; }
      } else if (!p.soldOut) p.weight = p.weight0 ?? p.weight;
    };
    lb.append(cb, document.createTextNode(p.label.slice(0, 8)));
    box.appendChild(lb);
  }
}
```

- [ ] **Step 2: Тесты + Commit**

Run: `node tests/run.js` — PASS.

```bash
git add src/ui/simpanel.js
git commit -m "feat(v3): dev sim panel - population, pause, speed, POI toggles"
```

---

### Task 12: Рендер v3 + инспектор + debug

**Files:**
- Modify: `src/render/draw.js`, `src/render/debug.js`, `src/ui/inspector.js`

- [ ] **Step 1: src/render/draw.js — переписать `draw` и `drawAgents`**

```js
import { T } from '../data/tuning.js';
import { knowledgeLag } from '../sim/knowledge.js';
const S = T.pxPerMeter;

export function draw(ctx, world) {
  const { map } = world;
  ctx.fillStyle = '#10131a';
  ctx.fillRect(0, 0, map.w * S, map.h * S);
  // безымянные острова
  ctx.fillStyle = '#262b38';
  for (const b of map.blocks) ctx.fillRect(b.x * S, b.y * S, b.w * S, b.h * S);
  ctx.strokeStyle = '#3a4356'; ctx.lineWidth = 1;
  for (const b of map.blocks) ctx.strokeRect(b.x * S, b.y * S, b.w * S, b.h * S);
  // POI-объекты
  for (const [k, p] of Object.entries(map.pois)) {
    if (p.exit) {
      ctx.fillStyle = '#4f8'; ctx.font = '10px monospace';
      ctx.fillText('⌄ ' + p.label, p.x * S - 20, p.y * S);
      continue;
    }
    ctx.fillStyle = p.soldOut ? '#3a2a33' : p.staff ? '#33404d' : '#2c3a52';
    ctx.fillRect(p.x * S, p.y * S, p.w * S, p.h * S);
    ctx.strokeStyle = '#4a5d80'; ctx.strokeRect(p.x * S, p.y * S, p.w * S, p.h * S);
    ctx.fillStyle = '#9fc1e8'; ctx.font = '10px monospace';
    ctx.fillText(p.label, (p.x + 0.3) * S, (p.y + p.h / 2 + 0.2) * S);
    ctx.fillStyle = '#8fa'; ctx.fillRect(p.fx * S - 2, p.fy * S - 2, 4, 4); // прилавок
    if (p.stock !== undefined) {
      ctx.font = 'bold 10px monospace';
      ctx.fillStyle = p.soldOut ? '#e55' : p.stock === 0 ? '#fa3' : '#9fa';
      ctx.fillText(p.soldOut ? 'РАСПРОДАНО' : p.stock === 0 ? 'НЕТ ТОВАРА' : '×' + p.stock, p.fx * S + 6, p.fy * S - 6);
    }
  }
  // табло
  for (const b of map.boards) { ctx.fillStyle = '#4af'; ctx.fillRect(b.x * S - 5, b.y * S - 5, 10, 10); }
  // слоты препятствий: 0–2 ленты, 3–4 инциденты
  (world.fields?.slots ?? []).forEach((s, i) => {
    if (!s) return;
    ctx.fillStyle = i < 3 ? 'rgba(255,210,60,.55)' : 'rgba(255,70,70,.45)';
    ctx.fillRect(s.x * S, s.y * S, s.w * S, s.h * S);
    ctx.fillStyle = '#fff'; ctx.font = '12px monospace';
    ctx.fillText(i < 3 ? '🚧' : '⚠', (s.x + s.w / 2 - 0.4) * S, (s.y + s.h / 2 + 0.3) * S);
  });
  // мусор
  ctx.fillStyle = '#777';
  for (const l of world.litter ?? []) ctx.fillRect(l.x * S - 1, l.y * S - 1, 2, 2);
  // волонтёры
  for (const v of world.volunteers ?? []) {
    ctx.strokeStyle = '#3ef'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(v.x * S, v.y * S, 6, 0, 7); ctx.stroke();
    ctx.fillStyle = '#3ef'; ctx.font = 'bold 9px monospace'; ctx.fillText('V', v.x * S - 3, v.y * S + 3);
  }
  drawAgents(ctx, world);
  drawFlashes(ctx, world);
  if (world.selected && !world.selected.despawn) {
    const a = world.selected;
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(a.x * S, a.y * S, (a.radius + 0.4) * S, 0, 7); ctx.stroke();
    const goal = a.goalPoi ? { x: world.map.pois[a.goalPoi].fx, y: world.map.pois[a.goalPoi].fy } : a.target;
    if (goal) {
      ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(a.x * S, a.y * S); ctx.lineTo(goal.x * S, goal.y * S); ctx.stroke();
    }
  }
}

export function agentColor(a, world) {
  if (a.kind === 'carrier') return '#f80';
  if (a.kind === 'janitor') return '#889';
  if (a.kind === 'streamer') return '#fd4';
  if (a.kind === 'cosplayStar') return '#f6a';
  if (a.kind === 'journalist') return '#eee';
  if (world.t < a.deceivedUntil) return '#b06ee8';
  const lag = Math.min(1, knowledgeLag(a, world) / T.lagRed);
  const r = Math.round(80 + 175 * lag), g = Math.round(200 - 140 * lag);
  return `rgb(${r},${g},80)`;
}

function drawAgents(ctx, world) {
  ctx.font = '10px monospace';
  for (const a of world.agents) {
    if (a.dragged) {  // тень под поднятым
      ctx.fillStyle = 'rgba(0,0,0,.5)';
      ctx.beginPath(); ctx.arc(a.x * S + 3, a.y * S + 5, a.radius * S, 0, 7); ctx.fill();
    }
    ctx.fillStyle = agentColor(a, world);
    ctx.beginPath(); ctx.arc(a.x * S, a.y * S, a.radius * S * (a.dragged ? 1.3 : 1), 0, 7); ctx.fill();
    if (a.superfan) { ctx.strokeStyle = '#f44'; ctx.lineWidth = 1.5; ctx.stroke(); }
    else if (a.stress > 60) {
      ctx.strokeStyle = `rgba(255,255,255,${0.4 + 0.4 * Math.sin(world.t * 8 + a.id)})`;
      ctx.lineWidth = 1.5; ctx.stroke();
    }
    const icon =
      a.activity === 'lost' ? '?!' :
      a.searching ? '💔' :
      a.kind === 'carrier' ? '📦' :
      a.kind === 'streamer' ? '📷' :
      a.kind === 'cosplayStar' ? '⭐' :
      a.kind === 'janitor' ? '🧹' :
      a.kind === 'journalist' ? '✎' :
      a.activity === 'talk' ? '💬' : null;
    if (icon) { ctx.fillStyle = '#ff0'; ctx.fillText(icon, a.x * S + 4, a.y * S - 4); }
    if (a.activity === 'phone') { ctx.fillStyle = '#0cf'; ctx.fillRect(a.x * S - 1, a.y * S - 6, 3, 4); }
  }
}

function drawFlashes(ctx, world) {
  world.flashes = world.flashes.filter(f => world.t - f.t < 1.2);
  for (const f of world.flashes) {
    const age = (world.t - f.t) / 1.2;
    if (f.kind === 'heart') {
      ctx.fillStyle = `rgba(255,120,170,${1 - age})`; ctx.font = '16px monospace';
      ctx.fillText('💗', f.x * S - 8, (f.y - age * 1.5) * S);
      continue;
    }
    ctx.strokeStyle = `rgba(120,255,160,${1 - age})`; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(f.x * S, f.y * S, age * (f.r ?? T.boardRadius) * S, 0, 7); ctx.stroke();
  }
}
```

- [ ] **Step 2: src/render/debug.js**

Проверить grep'ом: `grep -n "doorsClosed\|doorMask\|edges" src/render/debug.js` —
все вхождения `world.doorsClosed` заменить на `world.obstMask`, `a.doorMask` на
`a.obstMask`; grid берётся как `world.fields.gridFor(world.obstMask ?? 0)`.
Если остался guard `if (!world.map.edges) return;` — удалить.

- [ ] **Step 3: src/ui/inspector.js — updateInspector**

Заменить строки знаний/цели:

```js
`#${a.id} ${a.kind === 'visitor' ? a.preset : a.kind}${a.superfan ? ' 🔥суперфан' : ''}${a.searching ? ' 💔ищет друга' : ''}  [${a.activity}]
stress  ${bar(a.stress)} ${a.stress | 0}
fatigue ${bar(a.fatigue)} ${a.fatigue | 0}
boredom ${bar(a.boredom)} ${a.boredom | 0}
phone   ${bar(a.phoneItch)} ${a.phoneItch | 0}
─ характер ─
sociability ${a.sociability.toFixed(2)}  stubborn ${a.stubborn.toFixed(2)}
politeness ${a.politeness.toFixed(2)}  conformity ${a.conformity.toFixed(2)}
mass ${a.mass.toFixed(1)}  speed ${a.maxSpeed.toFixed(1)}  agility ${a.agility.toFixed(1)}
─ знание ─
POI: ${a.beliefs.knownPois.size}/${totalPois}  jamMarks: ${a.beliefs.jamMarks.length}  ленты: ${a.obstMask}
концерт: верит ${fmtClock(bel.time)}/${bel.status}
правда:  ${fmtClock(f.time)}/${f.status} ${knowledgeLag(a, world) > 0 ? '⚠ ОТСТАЛ' : '✓'}
─ цель ─
${a.goalPoi ? world.map.pois[a.goalPoi].label + (a.smartUntil > world.t ? ' [обходит]' : ' [по памяти]') : (a.target ? 'локальная точка' : '—')}
visited ${a.visitedCount}/${a.satThreshold}`;
```

- [ ] **Step 4: Тесты + Commit**

Run: `node tests/run.js` — PASS.

```bash
git add src/render/draw.js src/render/debug.js src/ui/inspector.js
git commit -m "feat(v3): render POI objects, special agents, slots, litter, volunteers"
```

---

### Task 13: Интеграция main.js, смоук, приёмка

**Files:**
- Rewrite: `src/main.js`
- Smoke: `tests/smoke.js` (одноразовый, НЕ коммитить в run.js)

- [ ] **Step 1: Переписать src/main.js**

```js
import { T } from './data/tuning.js';
import { MAP, solidRects } from './data/map.js';
import { draw } from './render/draw.js';
import { drawDebug } from './render/debug.js';
import { SpatialHash } from './sim/spatialHash.js';
import { simTick } from './sim/steering.js';
import { makeWorldFacts } from './sim/knowledge.js';
import { Fields } from './sim/flowfield.js';
import { initBoards } from './ui/boards.js';
import { initInspector, updateInspector } from './ui/inspector.js';
import { drawHud } from './ui/hud.js';
import { tickSchedule } from './data/schedule.js';
import { initQueues } from './sim/queue.js';
import { initLogistics, logisticsTick } from './sim/logistics.js';
import { specialTick } from './sim/special.js';
import { incidentsTick } from './sim/incidents.js';
import { initScore, scoreTick, updateScorePanel } from './sim/score.js';
import { maybeFinale } from './ui/finale.js';
import { initTools } from './ui/tools.js';
import { initSimPanel } from './ui/simpanel.js';

const canvas = document.getElementById('c');
canvas.width = MAP.w * T.pxPerMeter; canvas.height = MAP.h * T.pxPerMeter;
const ctx = canvas.getContext('2d');

export const world = {
  t: 0, map: MAP, agents: [], flashes: [], litter: [], volunteers: [],
  debug: false, selected: null, paused: false, speedMul: 1, over: false, closing: false,
  hash: new SpatialHash(1), facts: makeWorldFacts(),
  obstMask: 0, fields: new Fields(MAP),
};
world.syncObstacles = () => {
  world.obstMask = world.fields.activeMask();
  world.obstacles = [...solidRects(MAP), ...world.fields.slots.filter(Boolean)];
};
world.syncObstacles();
initQueues(world); initLogistics(world); initScore(world);
window.world = world;

window.addEventListener('keydown', e => { if (e.key === 'd') world.debug = !world.debug; });
initTools(canvas, world);          // ДО boards/inspector: режимы фильтруют клики
initBoards(canvas, world);
initInspector(canvas, world);
initSimPanel(world);

// мир стартует пустым — волна открытия заходит через tickSchedule

let acc = 0, last = performance.now();
function frame(now) {
  acc += Math.min(0.1, (now - last) / 1000); last = now;
  const dt = 1 / T.simHz;
  while (acc >= dt) {
    acc -= dt;
    if (world.paused || world.over) continue;
    for (let s = 0; s < (world.speedMul ?? 1); s++) {
      tickSchedule(world);
      specialTick(world, dt);
      logisticsTick(world);
      incidentsTick(world, dt);
      simTick(world, dt);
      scoreTick(world, dt);
      world.t += dt;
    }
  }
  draw(ctx, world);
  if (world.debug) drawDebug(ctx, world);
  drawHud(ctx, world);
  updateInspector(world);
  updateScorePanel(world);
  maybeFinale(world);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
```

- [ ] **Step 2: grep дочисток**

Run: `grep -rn "doorMask\|doorsClosed\|map.doors\|closeDoor\|doorW\|osmosis" src/` — пусто.
Run: `node tests/run.js` — PASS.

- [ ] **Step 3: Headless-смоук (180 сек = весь день)**

Создать ВРЕМЕННЫЙ `tests/smoke.js`: собрать мир как в main.js, но без DOM/рендера
(initScore/initQueues/initLogistics + syncObstacles), прокрутить
`for (t до 185 сек, dt=1/30) { tickSchedule; specialTick; logisticsTick;
incidentsTick; simTick; scoreTick; }` и каждые 30 сек логировать:
`t, clock, agents.length, NaN-позиции (count), внутри-блоков (count через
isWalkable), served, talksFinished, score.angry, score.incidents, depot.reserve,
stock merch1/merch2, активности (подсчёт по a.activity)`. Критерии:
- NaN = 0, агентов в стенах = 0 на каждом срезе;
- население: ~200 к t=10, пик ≥ 300, спад после 15:20;
- served > 50; depot.reserve убывает (грузчики ходили);
- score.stressHist последний срез < 80 (день не утонул в красном);
- к t=185 world.over === false (over ставит только maybeFinale в браузере) —
  вместо этого проверить gameClock(185) ≥ 16:00.
Запустить `node tests/smoke.js`, приложить вывод в отчёт. Удалить файл после
прогона (или оставить — но НЕ включать в run.js).

- [ ] **Step 4: Commit**

```bash
git add src/main.js
git commit -m "feat(v3): integrate living expo - full day loop with all systems"
```

- [ ] **Step 5: Браузерная приёмка** — выполняет контроллер/пользователь по спеке §13 (сервер `python3 -m http.server 8000` уже крутится).

---

## Self-Review (выполнен)

- Покрытие спеки: §1 → T1+T2; §2 → T3; §3 → T1; §4 → T1+T2+T9; §5 → T5+T6; §6 → T4; §7 → T6+T7; §8 → T8; §9 → T9+T10; §10 → T11; §11 → все; §12 → тесты в T1,T3,T4,T6,T7; §13 → T13.
- Типы согласованы: `buildGrid(map, slots, mask)`, `p.fx/fy`, `a.obstMask`, `world.obstMask`, `world.syncObstacles()`, `boardLocalLesson → {pois, obstBits, jams}`, `applyTopic(agent, topic, t, noMutation)`, `spawnAt(world, key) → agent`, `h(hh, mm)` экспортируется из schedule.js (нужен special.js).
- Известный компромисс: spawnAt в T3 использует `world.fields.gridFor(0)` — тесты задач 4–7 создают мир с `fields: new Fields(MAP)`, это согласовано.


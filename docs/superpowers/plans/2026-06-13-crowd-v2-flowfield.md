# Crowd v2: Flow Fields, Expo Map, Dialogues, Queues, Inspector — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Переезд прототипа на выставочную карту с flow-field-навигацией, локальным знанием (knownPois/jamMarks/маски дверей), диалогами вместо осмоса, очередями с деградацией, инспектором агента и притоком/оттоком посетителей.

**Architecture:** Сетка 1×1 м из прямоугольников-препятствий; per-POI поля расстояний (Дейкстра с кучей), clearField в вариантах по маске известных закрытых дверей + smartField с плотностью. Агент читает градиент поля своей цели; конвейер сил v1 (alignment/личная зона/уступание/PBD) не меняется. Знание агента: Set известных POI, jamMarks, маска дверей, убеждение о событии.

**Tech Stack:** vanilla JS ES-модули, Canvas, node-тесты (`node tests/run.js`).

**Spec:** `docs/superpowers/specs/2026-06-12-crowd-v2-flowfield-design.md`. База: ветка `proto` (v1 работает).

**Соглашения:** мир в метрах; индекс клетки `i = y*W + x`; `world.t` — реальные секунды; маска дверей — битовая (`1<<doorIndex`); эффективная маска агента = `a.doorMask & world.doorsClosed` (знание о двери имеет смысл, только пока она реально закрыта).

---

### Task 1: Новая карта (data/map.js v2)

**Files:**
- Rewrite: `src/data/map.js`
- Modify: `tests/run.js` (тесты вейпоинтов умирают в Task 4; здесь — НЕ трогать)

- [ ] **Step 1: Полностью заменить src/data/map.js на:**

```js
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
```

(Старые zones/walls/waypoints/edges/adj удаляются целиком. Поля `service.rate` трактуются в Task 8.)

- [ ] **Step 2: Проверка** — `node -e "import('./src/data/map.js').then(m => console.log(m.MAP.blocks.length, Object.keys(m.MAP.pois).length, m.EXITS))"` → `15 15 [ 'exitMain', 'exitW', 'exitE' ]`.
ВНИМАНИЕ: `node tests/run.js` сейчас СЛОМАН (старые тесты ссылаются на waypoints) — это ожидаемо до Task 4. НЕ чинить тесты в этом таске.

- [ ] **Step 3: Commit** — `git add -A && git commit -m "feat(v2): expo booth map data format"`

---

### Task 2: Сетка и flow fields (sim/flowfield.js, TDD)

**Files:**
- Create: `src/sim/flowfield.js`
- Modify: `tests/run.js` (добавить тесты; старые пути-тесты будут удалены в Task 4)
- Modify: `src/data/tuning.js`

- [ ] **Step 1: tuning.js — добавить в объект T:**

```js
  // flow fields
  smartFieldK: 0.35,        // штраф клетки за агента плотности
  smartRecomputeEvery: 2,   // реальных сек
  smartDuration: 20,        // сколько агент «смотрит по сторонам» после решения обойти
  jamThreshold: 7,          // соседей в пробе = «впереди затор»
  jamMarkTtl: 30, jamMarksMax: 4,
  boardLocalRadius: 15,     // радиус «участка», о котором знает табло
```

- [ ] **Step 2: Тесты в tests/run.js** (добавить import + тесты до раннера):

```js
import { buildGrid, computeField, fieldDir, Fields, isWalkable, randomWalkableNear } from '../src/sim/flowfield.js';
import { MAP } from '../src/data/map.js';

test('grid: проход проходим, будка и граница нет, закрытая дверь закрыта', () => {
  const g0 = buildGrid(MAP, 0);
  assert.equal(isWalkable(g0, 14, 22), true);   // проход между будками
  assert.equal(isWalkable(g0, 8, 21), false);   // внутри будки
  assert.equal(isWalkable(g0, 0, 10), false);   // граница
  assert.equal(isWalkable(g0, 20, 9.5), true);  // открытый проём d0
  const g1 = buildGrid(MAP, 1);                  // d0 закрыта
  assert.equal(isWalkable(g1, 20, 9.5), false);
  assert.equal(isWalkable(g1, 38, 9.5), true);  // d1 всё ещё открыт
});

test('field: градиент ведёт к POI и обтекает будки', () => {
  const g = buildGrid(MAP, 0);
  const f = computeField(g, MAP.pois.food.x, MAP.pois.food.y, null);
  // из дальнего угла дистанция конечна
  assert.ok(isFinite(f[(12 | 0) * g.W + (56 | 0)]), 'food достижим справа сверху');
  // шаг по градиенту уменьшает дистанцию
  let x = 56.5, y = 12.5;
  const d0 = f[(y | 0) * g.W + (x | 0)];
  const dir = fieldDir(g, f, x, y);
  assert.ok(dir, 'градиент есть');
  const d1 = f[((y + dir.y) | 0) * g.W + ((x + dir.x) | 0)];
  assert.ok(d1 < d0, 'градиент спускается');
});

test('field: закрытие западной двери удлиняет путь к сцене с запада', () => {
  const gOpen = buildGrid(MAP, 0), gClosed = buildGrid(MAP, 1);
  const fOpen = computeField(gOpen, MAP.pois.stage.x, MAP.pois.stage.y, null);
  const fClosed = computeField(gClosed, MAP.pois.stage.x, MAP.pois.stage.y, null);
  const i = (12 | 0) * gOpen.W + (10 | 0);      // точка в западном проходе
  assert.ok(fClosed[i] > fOpen[i] + 5, 'обход через восточную дверь дороже');
  assert.ok(isFinite(fClosed[i]), 'но путь существует');
});

test('smartField: плотный кластер дорожает', () => {
  const g = buildGrid(MAP, 0);
  const dens = new Float32Array(g.W * g.H);
  for (let x = 18; x < 24; x++) dens[17 * g.W + x] = 10;  // стена людей в проходе y=17
  const cost = i => 1 + 0.35 * dens[i];
  const fSmart = computeField(g, MAP.pois.merch1.x, MAP.pois.merch1.y, cost);
  const fClear = computeField(g, MAP.pois.merch1.x, MAP.pois.merch1.y, null);
  const i = 17 * g.W + 30;
  assert.ok(fSmart[i] > fClear[i], 'через толпу дороже');
});

test('randomWalkableNear: всегда проходимая клетка', () => {
  const g = buildGrid(MAP, 0);
  for (let k = 0; k < 50; k++) {
    const p = randomWalkableNear(g, 8, 21, 6);  // центр в будке — точка всё равно проходима
    assert.ok(isWalkable(g, p.x, p.y), `(${p.x},${p.y})`);
  }
});
```

- [ ] **Step 3: Запустить** `node tests/run.js` — новые тесты падают (модуля нет). Старые path-тесты тоже падают с Task 1 — игнорировать до Task 4.

- [ ] **Step 4: Создать src/sim/flowfield.js**

```js
import { T } from '../data/tuning.js';

const DIRS = [[1,0,1],[-1,0,1],[0,1,1],[0,-1,1],[1,1,1.4],[1,-1,1.4],[-1,1,1.4],[-1,-1,1.4]];

function stamp(walk, W, H, r) {
  const x0 = Math.max(0, Math.floor(r.x)), x1 = Math.min(W, Math.ceil(r.x + r.w));
  const y0 = Math.max(0, Math.floor(r.y)), y1 = Math.min(H, Math.ceil(r.y + r.h));
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) walk[y * W + x] = 0;
}

export function buildGrid(map, closedMask) {
  const W = map.w, H = map.h;
  const walk = new Uint8Array(W * H).fill(1);
  for (let x = 0; x < W; x++) { walk[x] = 0; walk[(H - 1) * W + x] = 0; }
  for (let y = 0; y < H; y++) { walk[y * W] = 0; walk[y * W + W - 1] = 0; }
  for (const b of map.blocks) stamp(walk, W, H, b);
  map.doors.forEach((d, i) => { if (closedMask & (1 << i)) stamp(walk, W, H, d); });
  return { W, H, walk };
}

export function isWalkable(grid, x, y) {
  const cx = x | 0, cy = y | 0;
  if (cx < 0 || cy < 0 || cx >= grid.W || cy >= grid.H) return false;
  return !!grid.walk[cy * grid.W + cx];
}

export function randomWalkableNear(grid, x, y, r) {
  for (let k = 0; k < 30; k++) {
    const px = x + (Math.random() - 0.5) * 2 * r, py = y + (Math.random() - 0.5) * 2 * r;
    if (isWalkable(grid, px, py)) return { x: px, y: py };
  }
  // фолбэк: полный скан ближайшей проходимой
  for (let rad = 1; rad < Math.max(grid.W, grid.H); rad++)
    for (let dy = -rad; dy <= rad; dy++) for (let dx = -rad; dx <= rad; dx++)
      if (isWalkable(grid, x + dx, y + dy)) return { x: (x + dx | 0) + 0.5, y: (y + dy | 0) + 0.5 };
  return { x, y };
}

// Дейкстра от клетки POI по всей сетке. cellCost(i) >= 1 или null (все клетки = 1).
export function computeField(grid, tx, ty, cellCost) {
  const { W, H, walk } = grid;
  const dist = new Float32Array(W * H).fill(Infinity);
  const start = (ty | 0) * W + (tx | 0);
  if (!walk[start]) return dist;
  dist[start] = 0;
  const heap = [[0, start]];
  const push = (d, i) => {
    heap.push([d, i]);
    let c = heap.length - 1;
    while (c > 0) { const p = (c - 1) >> 1; if (heap[p][0] <= heap[c][0]) break; [heap[p], heap[c]] = [heap[c], heap[p]]; c = p; }
  };
  const pop = () => {
    const top = heap[0], last = heap.pop();
    if (heap.length) {
      heap[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1; let m = i;
        if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
        if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
        if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m;
      }
    }
    return top;
  };
  while (heap.length) {
    const [d, i] = pop();
    if (d > dist[i]) continue;
    const cx = i % W, cy = (i / W) | 0;
    for (const [dx, dy, w] of DIRS) {
      const nx = cx + dx, ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const ni = ny * W + nx;
      if (!walk[ni]) continue;
      if (dx && dy && (!walk[cy * W + nx] || !walk[ny * W + cx])) continue; // не срезать углы
      const nd = d + w * (cellCost ? cellCost(ni) : 1);
      if (nd < dist[ni]) { dist[ni] = nd; push(nd, ni); }
    }
  }
  return dist;
}

// Нормированный шаг к соседней клетке с минимальной дистанцией.
export function fieldDir(grid, field, x, y) {
  const { W, H, walk } = grid;
  const cx = x | 0, cy = y | 0;
  if (cx < 0 || cy < 0 || cx >= W || cy >= H) return null;
  let best = walk[cy * W + cx] ? field[cy * W + cx] : Infinity, bx = 0, by = 0;
  for (const [dx, dy] of DIRS) {
    const nx = cx + dx, ny = cy + dy;
    if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
    const ni = ny * W + nx;
    if (!walk[ni]) continue;
    if (dx && dy && (!walk[cy * W + nx] || !walk[ny * W + cx])) continue;
    if (field[ni] < best) { best = field[ni]; bx = dx; by = dy; }
  }
  if (!bx && !by) return null; // мы в клетке POI или некуда идти
  const l = Math.hypot(bx, by);
  return { x: bx / l, y: by / l };
}

// Менеджер полей: clear по маскам закрытых дверей (лениво) + smart на актуальной правде.
export class Fields {
  constructor(map) {
    this.map = map;
    this.grids = new Map();     // mask -> grid
    this.clear = new Map();     // mask -> { poiKey: field }
    this.smart = {};            // poiKey -> field (актуальная маска + плотность)
    this.density = null;
    this.gridFor(0);
  }
  gridFor(mask) {
    if (!this.grids.has(mask)) this.grids.set(mask, buildGrid(this.map, mask));
    return this.grids.get(mask);
  }
  clearFor(mask) {
    if (!this.clear.has(mask)) {
      const g = this.gridFor(mask), set = {};
      for (const [k, p] of Object.entries(this.map.pois)) set[k] = computeField(g, p.x, p.y, null);
      this.clear.set(mask, set);
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
    for (const [k, p] of Object.entries(this.map.pois)) this.smart[k] = computeField(g, p.x, p.y, cost);
  }
  // direction для агента: mode 'clear' (его маска знаний) или 'smart' (актуальная правда)
  dir(mode, mask, poi, x, y) {
    if (mode === 'smart' && this.smart[poi]) return fieldDir(this.gridFor(this.smartMask ?? 0), this.smart[poi], x, y);
    const set = this.clearFor(mask);
    return set[poi] ? fieldDir(this.gridFor(mask), set[poi], x, y) : null;
  }
}
```

- [ ] **Step 5: Run** `node tests/run.js` — 5 новых тестов ok (старые path/wall-тесты всё ещё падают — ожидаемо).

- [ ] **Step 6: Commit** — `git add -A && git commit -m "feat(v2): grid, dijkstra flow fields, door-mask variants, smart fields"`

---

### Task 3: Коллизии с блоками вместо стен-отрезков

**Files:**
- Modify: `src/sim/steering.js` (pushOutOfWalls → pushOutOfRect/обход препятствий)
- Modify: `src/render/draw.js` (рендер блоков)
- Modify: `tests/run.js` (заменить wall-тест)

- [ ] **Step 1: steering.js — заменить функцию pushOutOfWalls на:**

```js
export function pushOutOfRect(a, r) {
  const px = Math.max(r.x, Math.min(r.x + r.w, a.x));
  const py = Math.max(r.y, Math.min(r.y + r.h, a.y));
  let dx = a.x - px, dy = a.y - py;
  const d = Math.hypot(dx, dy);
  if (d >= a.radius) return;
  if (d > 1e-4) { a.x = px + dx / d * a.radius; a.y = py + dy / d * a.radius; return; }
  // центр внутри прямоугольника — через ближайшую грань
  const L = a.x - r.x, R = r.x + r.w - a.x, Tp = a.y - r.y, B = r.y + r.h - a.y;
  const m = Math.min(L, R, Tp, B);
  if (m === L) a.x = r.x - a.radius;
  else if (m === R) a.x = r.x + r.w + a.radius;
  else if (m === Tp) a.y = r.y - a.radius;
  else a.y = r.y + r.h + a.radius;
}
```

В simTick заменить цикл `pushOutOfWalls(a, world.map.walls)` на:

```js
  for (const a of agents) {
    for (const r of world.obstacles) pushOutOfRect(a, r);
    a.x = Math.max(a.radius + 1, Math.min(w - 1 - a.radius, a.x));
    a.y = Math.max(a.radius + 1, Math.min(h - 1 - a.radius, a.y));
  }
```

(`world.obstacles` = blocks + закрытые двери; собирается в main.js, Task 4. Клемп
теперь с отступом 1 — граница сетки непроходима. Тот же отступ внести в клемп
внутри resolveCollisions.)

- [ ] **Step 2: tests/run.js — удалить тест `walls: агента выталкивает из стены` и импорт pushOutOfWalls; добавить:**

```js
import { pushOutOfRect } from '../src/sim/steering.js';

test('rect: выталкивает сбоку и из центра', () => {
  const a = { x: 5.1, y: 7, radius: 0.3 };
  pushOutOfRect(a, { x: 5, y: 5, w: 4, h: 4 });
  assert.ok(a.x <= 5 - 0.3 + 1e-9, 'вытолкнут влево: ' + a.x);
  const b = { x: 7, y: 5.2, radius: 0.3 };
  pushOutOfRect(b, { x: 5, y: 5, w: 4, h: 4 });
  assert.ok(b.y <= 5 - 0.3 + 1e-9, 'из центра через верхнюю грань: ' + b.y);
});
```

- [ ] **Step 3: draw.js — заменить рендер zones/walls на блоки** (в draw(), вместо циклов по zones и walls):

```js
  ctx.fillStyle = '#10131a';
  ctx.fillRect(0, 0, map.w * S, map.h * S);
  ctx.fillStyle = '#262b38';
  for (const b of map.blocks) ctx.fillRect(b.x * S, b.y * S, b.w * S, b.h * S);
  ctx.strokeStyle = '#3a4356'; ctx.lineWidth = 1;
  for (const b of map.blocks) ctx.strokeRect(b.x * S, b.y * S, b.w * S, b.h * S);
  // закрытые двери
  if (world.doorsClosed) map.doors.forEach((d, i) => {
    if (world.doorsClosed & (1 << i)) { ctx.fillStyle = '#a33'; ctx.fillRect(d.x * S, d.y * S, d.w * S, d.h * S); }
  });
  // подписи блоков и POI
  ctx.fillStyle = '#5a6478'; ctx.font = '10px monospace';
  for (const b of map.blocks) if (b.label) ctx.fillText(b.label, (b.x + 0.4) * S, (b.y + b.h / 2) * S);
  ctx.fillStyle = '#8fa';
  for (const [k, p] of Object.entries(map.pois)) { ctx.fillRect(p.x * S - 2, p.y * S - 2, 4, 4); ctx.fillText(p.label, p.x * S + 4, p.y * S - 4); }
```

- [ ] **Step 4: Run** `node tests/run.js` — rect-тест ok (path-тесты падают до Task 4).

- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat(v2): rect obstacles collision + block render"`

---

### Task 4: Переподключение стиринга на градиент + main.js v2

**Files:**
- Modify: `src/sim/steering.js`, `src/main.js`
- Delete: `src/sim/pathfinding.js`
- Modify: `tests/run.js` (удалить тесты pathfinding/nearestWaypoint и их импорты)

- [ ] **Step 1: steering.js — заменить currentTarget и seek-блок stepAgent:**

Удалить функцию `currentTarget` целиком. В stepAgent заменить блок `const wp = currentTarget(...)... if (wp) {...}` на:

```js
  let sx = 0, sy = 0, hasGoal = false;
  if (a.goalPoi && world.fields) {
    const mode = (a.smartUntil > world.t) ? 'smart' : 'clear';
    const mask = (a.doorMask ?? 0) & (world.doorsClosed ?? 0);
    const dir = world.fields.dir(mode, mask, a.goalPoi, a.x, a.y);
    if (dir) { sx = dir.x; sy = dir.y; hasGoal = true; }
  }
  if (!hasGoal && a.target) {
    const ex = a.target.x - a.x, ey = a.target.y - a.y, d = Math.hypot(ex, ey);
    if (d > 0.3) { sx = ex / d; sy = ey / d; hasGoal = true; }
  }
  if (hasGoal) {
    let mods = 1;
    if (a.activity === 'wander') mods = 0.8;
    if (a.activity === 'phone') mods = 0.15;
    if (a.activity === 'browse') mods = 0.4;
    if (a.activity === 'talk') mods = a.talkWalk ? 0.5 : 0;
    if (a.activity === 'queue') mods = 0.5;
    const speed = a.maxSpeed * speedFactor(a.density) * mods;
    dx = sx * speed; dy = sy * speed;
  }
```

В alignment-блоке добавить гейт «только в движении» — заменить условие на:

```js
  if (a.density >= T.alignmentThreshold && Math.hypot(a.vx, a.vy) > 0.3) {
```

В simTick добавить пересчёт smart-полей (после блока congTimer; блок congTimer/updateEdgeCongestion УДАЛИТЬ — рёбер больше нет):

```js
  if (world.fields) {
    world.smartTimer = (world.smartTimer ?? 0) - dt;
    if (world.smartTimer <= 0) { world.smartTimer = T.smartRecomputeEvery; world.fields.recomputeSmart(agents, world.doorsClosed ?? 0); }
  }
```

В конце simTick — деспаун:

```js
  if (world.agents.some(a => a.despawn)) {
    if (world.selected && world.selected.despawn) world.selected = null;
    world.agents = world.agents.filter(a => !a.despawn);
  }
```

- [ ] **Step 2: main.js — полная замена:**

```js
import { T } from './data/tuning.js';
import { MAP } from './data/map.js';
import { draw } from './render/draw.js';
import { drawDebug } from './render/debug.js';
import { makeAgent } from './sim/agent.js';
import { SpatialHash } from './sim/spatialHash.js';
import { simTick } from './sim/steering.js';
import { makeWorldFacts } from './sim/knowledge.js';
import { Fields, randomWalkableNear } from './sim/flowfield.js';
import { initBoards } from './ui/boards.js';
import { drawHud } from './ui/hud.js';
import { tickSchedule } from './data/schedule.js';

const canvas = document.getElementById('c');
canvas.width = MAP.w * T.pxPerMeter; canvas.height = MAP.h * T.pxPerMeter;
const ctx = canvas.getContext('2d');

export const world = {
  t: 0, map: MAP, agents: [], flashes: [], debug: false, selected: null,
  hash: new SpatialHash(1), facts: makeWorldFacts(),
  doorsClosed: 0, fields: new Fields(MAP),
};
world.obstacles = [...MAP.blocks];
window.world = world;

export function closeDoor(world, idx) {
  world.doorsClosed |= 1 << idx;
  world.obstacles = [...MAP.blocks, ...MAP.doors.filter((d, i) => world.doorsClosed & (1 << i))];
  world.fields.recomputeSmart(world.agents, world.doorsClosed);
}

window.addEventListener('keydown', e => { if (e.key === 'd') world.debug = !world.debug; });
initBoards(canvas, world);

const g0 = world.fields.gridFor(0);
for (let i = 0; i < T.agentCount; i++) {
  const a = makeAgent(world, i);
  const p = randomWalkableNear(g0, 4 + Math.random() * 52, 4 + Math.random() * 36, 4);
  a.x = p.x; a.y = p.y;
  world.agents.push(a);
}

let acc = 0, last = performance.now();
function frame(now) {
  acc += Math.min(0.1, (now - last) / 1000); last = now;
  const dt = 1 / T.simHz;
  while (acc >= dt) { tickSchedule(world); simTick(world, dt); world.t += dt; acc -= dt; }
  draw(ctx, world);
  if (world.debug) drawDebug(ctx, world);
  drawHud(ctx, world);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
```

ПРИМЕЧАНИЕ: agent.js на этом этапе ещё v1 (думает в терминах path) — компромисс
на один таск: в Step 3 временно упростить think, чтобы не падало. schedule.js
тоже ссылается на старое — поправить минимально (Step 4). Инспектор подключится
в Task 10 (initInspector), пока selected ставить некому — это нормально.

- [ ] **Step 3: agent.js — временный мост (полноценный мозг v2 — Task 6):**

Удалить import pathfinding. Заменить setGoal на:

```js
export function setGoal(a, world, poiKey) {
  if (!a.beliefs.knownPois.has(poiKey)) return false;
  a.goalPoi = poiKey; a.target = null;
  return true;
}
```

В think удалить: lost-блок обращений к edgeKnown (заменить тело lost на `{ a.activity = 'wander'; return; }` — восстановится в Task 6), deceived-блок оставить (place теперь ключ POI: заменить `inZone(a, world, belC.place)` на `nearPoi(a, world, belC.place)`), добавить хелпер:

```js
function nearPoi(a, world, key) {
  const p = world.map.pois[key];
  return p ? (p.x - a.x) ** 2 + (p.y - a.y) ** 2 < 16 : false;
}
```

Удалить функцию inZone. В случаях switch: wander → `setGoal` случайного известного POI, при провале — локальная цель ТОЛЬКО в проходимой клетке:

```js
    case 'wander': {
      const known = [...a.beliefs.knownPois].filter(k => !world.map.pois[k].exit);
      if (!known.length || !setGoal(a, world, known[(Math.random() * known.length) | 0])) {
        a.goalPoi = null;
        const { randomWalkableNear } = worldFlow(world);
        a.target = randomWalkableNear(world.fields.gridFor(0), a.x, a.y, 6);
      }
      break;
    }
```

ВНИМАНИЕ: импортировать randomWalkableNear напрямую (`import { randomWalkableNear } from './flowfield.js';`), хелпер worldFlow не нужен — выше показан смысл, в коде просто вызов `randomWalkableNear(world.fields.gridFor(0), a.x, a.y, 6)`. rest → setGoal('wcL'|'food'... временно: `setGoal(a, world, 'info')`, при провале стоять. goto → setGoal(bel.place) при провале enterLost (как было). phone — как было. Все упоминания `a.path`/`a.pathI` удалить (поля и в makeAgent), добавить в makeAgent: `goalPoi: null, smartUntil: -99, doorMask: 0, talkWalk: false, despawn: false,` и beliefs (knowledge.js будет переписан в Task 5; до тех пор временно `beliefs: { knownPois: new Set(Object.keys(world.map.pois)), jamMarks: [], events: { concert: { time: 14*3600, place: 'stage', status: 'on', learnedAt: 0 } } }` — прямо в makeAgent, убрав вызов makeBeliefs).

- [ ] **Step 4: schedule.js — временно**: событие закрытия двери: `fire(world) { closeDoor(world, 0); world.facts.doorW = { open: false, changedAt: world.t }; }` (импорт `closeDoor` из main.js создаёт цикл — вместо этого ПЕРЕНЕСТИ closeDoor в flowfield.js НЕ НАДО; правильное место: schedule.js не импортирует main; поэтому в main.js повесить `world.closeDoor = idx => closeDoor(world, idx);` и в schedule вызывать `world.closeDoor(0)`). Train-событие оставить (makeAgent спавнит у входа). knowledge.js пока не трогать, кроме: в steering.js удалить импорты `updateEdgeCongestion, eyesUpdate, osmosis` и их вызовы (вернутся в Task 5 в новом виде); в draw.js agentColor: knowledgeLag остаётся (events не менялись).

- [ ] **Step 5: tests/run.js** — удалить импорты и 5 тестов pathfinding (`path: ...`, `nearestWaypoint: ...`), удалить import MAP-зависимых хелперов fullBeliefs.

- [ ] **Step 6: Проверки**
1. `node tests/run.js` — ВСЕ оставшиеся тесты ok (spatialHash, PBD, rect, 5×flowfield).
2. Headless smoke:

```bash
node -e "
import('./src/data/map.js').then(async ({MAP}) => {
  const { SpatialHash } = await import('./src/sim/spatialHash.js');
  const { makeAgent } = await import('./src/sim/agent.js');
  const { simTick } = await import('./src/sim/steering.js');
  const { makeWorldFacts } = await import('./src/sim/knowledge.js');
  const { Fields, randomWalkableNear } = await import('./src/sim/flowfield.js');
  const world = { map: MAP, agents: [], hash: new SpatialHash(1), t: 0, flashes: [],
    facts: makeWorldFacts(), doorsClosed: 0, fields: new Fields(MAP), obstacles: [...MAP.blocks] };
  const g = world.fields.gridFor(0);
  for (let i = 0; i < 300; i++) {
    const a = makeAgent(world, i);
    const p = randomWalkableNear(g, 4 + Math.random() * 52, 4 + Math.random() * 36, 4);
    a.x = p.x; a.y = p.y; a.goalPoi = 'food'; a.activity = 'goto';
    world.agents.push(a);
  }
  for (let s = 0; s < 1800; s++) { simTick(world, 1/30); world.t += 1/30; }
  let nan = 0, near = 0, inBlock = 0;
  for (const a of world.agents) {
    if (!isFinite(a.x) || !isFinite(a.y)) nan++;
    if (Math.hypot(a.x - 11, a.y - 37) < 6) near++;
    for (const b of MAP.blocks) if (a.x > b.x && a.x < b.x + b.w && a.y > b.y && a.y < b.y + b.h) inBlock++;
  }
  console.log('nan', nan, 'nearFood', near, '/300, inBlock', inBlock);
})"
```

Expected: `nan 0`, `inBlock 0`, nearFood > 100 (все знают все POI во временном мосте; толпа стекается к фудкорту по проходам).

- [ ] **Step 7: Commit** — `git add -A && git commit -m "feat(v2): gradient steering, fields in world, remove waypoint pathfinding"`

---

### Task 5: Знание v2 (sim/knowledge.js переписать)

**Files:**
- Rewrite: `src/sim/knowledge.js`
- Modify: `src/sim/steering.js` (вернуть вызовы знания), `src/sim/agent.js` (makeBeliefs обратно), `src/render/draw.js` (без изменений — knowledgeLag совместим)

- [ ] **Step 1: Полностью заменить src/sim/knowledge.js:**

```js
import { T } from '../data/tuning.js';
import { isWalkable } from './flowfield.js';

export function makeWorldFacts() {
  return {
    concert: { time: 14 * 3600, place: 'stage', status: 'on', changedAt: 0 },
    doorW: { open: true, changedAt: 0 },
  };
}

export function makeBeliefs(world, mapKnown) {
  const known = new Set();
  for (const [k, p] of Object.entries(world.map.pois)) {
    if (p.exit) { known.add(k); continue; }          // входы-выходы знают все
    if (Math.random() < mapKnown) known.add(k);
  }
  return {
    knownPois: known, jamMarks: [],
    events: { concert: { time: 14 * 3600, place: 'stage', status: 'on', learnedAt: 0 } },
  };
}

// глаза: открытие POI в радиусе зрения, двери, протухание jamMarks
export function eyesUpdate(a, world) {
  const B = a.beliefs;
  for (const [k, p] of Object.entries(world.map.pois)) {
    if (!B.knownPois.has(k) && (p.x - a.x) ** 2 + (p.y - a.y) ** 2 < T.sightRadius ** 2)
      B.knownPois.add(k);
  }
  world.map.doors.forEach((d, i) => {
    const bit = 1 << i;
    if ((world.doorsClosed & bit) && !(a.doorMask & bit)) {
      const cx = d.x + d.w / 2, cy = d.y + d.h / 2;
      if ((cx - a.x) ** 2 + (cy - a.y) ** 2 < T.sightRadius ** 2) {
        a.doorMask |= bit;
        a.stress = Math.min(100, a.stress + 10); // упс, закрыто
      }
    }
  });
  if (B.jamMarks.length) B.jamMarks = B.jamMarks.filter(j => world.t - j.learnedAt < T.jamMarkTtl);
}

// проба «впереди затор»: 2 точки вдоль скорости
export function probeJamAhead(a, world) {
  const sp = Math.hypot(a.vx, a.vy);
  if (sp < 0.1) return null;
  const ux = a.vx / sp, uy = a.vy / sp;
  for (const d of [3, 6]) {
    const x = a.x + ux * d, y = a.y + uy * d;
    if (world.hash.queryCircle(x, y, 2).length > T.jamThreshold) return { x, y, r: 2.5, learnedAt: world.t };
  }
  return null;
}

export function addJamMark(beliefs, mark) {
  for (const j of beliefs.jamMarks)
    if ((j.x - mark.x) ** 2 + (j.y - mark.y) ** 2 < 4) { j.learnedAt = mark.learnedAt; return; }
  beliefs.jamMarks.push(mark);
  if (beliefs.jamMarks.length > T.jamMarksMax) beliefs.jamMarks.shift();
}

// затор на моём пути? (метка в пределах 6 м впереди по направлению движения)
export function jamMarkAhead(a) {
  const sp = Math.hypot(a.vx, a.vy);
  if (sp < 0.1) return null;
  const ux = a.vx / sp, uy = a.vy / sp;
  for (const j of a.beliefs.jamMarks) {
    const rx = j.x - a.x, ry = j.y - a.y;
    const along = rx * ux + ry * uy;
    if (along > 0 && along < 6 && Math.abs(-rx * uy + ry * ux) < j.r + 1) return j;
  }
  return null;
}

// табло: вещание applyFn всем видящим в радиусе (как v1)
export function boardBroadcast(world, board, applyFn) {
  world.flashes.push({ x: board.x, y: board.y, t: world.t });
  for (const a of world.hash.queryCircle(board.x, board.y, T.boardRadius))
    if (a.perception > 0 && a.beliefs) applyFn(a, world);
}

// чему табло учит про СВОЙ участок: POI, двери и текущие заторы в boardLocalRadius
export function boardLocalLesson(world, board) {
  const R2 = T.boardLocalRadius ** 2;
  const pois = Object.entries(world.map.pois)
    .filter(([k, p]) => (p.x - board.x) ** 2 + (p.y - board.y) ** 2 < R2).map(([k]) => k);
  let doorBits = 0;
  world.map.doors.forEach((d, i) => {
    if ((d.x + d.w / 2 - board.x) ** 2 + (d.y + d.h / 2 - board.y) ** 2 < R2) doorBits |= 1 << i;
  });
  // заторы: пробы плотности у локальных POI
  const jams = [];
  for (const k of pois) {
    const p = world.map.pois[k];
    if (world.hash.queryCircle(p.x, p.y, 2.5).length > T.jamThreshold)
      jams.push({ x: p.x, y: p.y, r: 3, learnedAt: world.t });
  }
  return { pois, doorBits: doorBits & (world.doorsClosed ?? 0), jams };
}

export function knowledgeLag(a, world) {
  const f = world.facts.concert, b = a.beliefs.events.concert;
  const stale = f.time !== b.time || f.place !== b.place || f.status !== b.status;
  return stale ? world.t - f.changedAt : 0;
}
```

- [ ] **Step 2: agent.js** — вернуть `import { makeBeliefs } from './knowledge.js';` и в makeAgent `beliefs: makeBeliefs(world, p.mapKnown),` (вместо временного инлайна). Добавить параметры в makeAgent: `sociability: Math.random(), stubborn: Math.random(), talkCooldownUntil: 0, talkWith: -1, talkEndAt: 0, jamReactAt: 0, poiCooldown: {}, browseUntil: 0, visitedCount: 0, satThreshold: 3 + (Math.random() * 5 | 0),`.

- [ ] **Step 3: steering.js** — в первом цикле по агентам вернуть (вместо удалённого в Task 4):

```js
    if (a.beliefs && a.perception > 0) eyesUpdate(a, world);
```

(импорт `import { eyesUpdate } from './knowledge.js';`). Осмоса больше НЕТ — не возвращать.

- [ ] **Step 4: Проверка** — `node tests/run.js` все ok; smoke из Task 4 Step 6 с заменой `a.goalPoi='food'` работает по-прежнему (beliefs known по mapKnown: добавить в smoke `a.beliefs.knownPois.add('food');` после makeAgent).

- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat(v2): local knowledge - knownPois, jamMarks, door bits, board lessons"`

---

### Task 6: Мозг v2 (agent.js: цели, исследование, реакция на затор, browse, leave, паника)

**Files:**
- Rewrite: `src/sim/agent.js` (think целиком; makeAgent — поля уже добавлены)
- Modify: `src/data/tuning.js`

- [ ] **Step 1: tuning.js — добавить в T:**

```js
  // мозг v2
  browseMin: 4, browseMax: 10,
  poiCooldownTime: 60,
  panicForgetChance: 0.05,    // за think-тик при stress>80
  jamReactCooldown: 10,
  leaveWeight: 0.9,
```

- [ ] **Step 2: agent.js — заменить think() и добавить хелперы (полный код):**

```js
function weightedPickPoi(a, world) {
  const entries = [];
  for (const k of a.beliefs.knownPois) {
    const p = world.map.pois[k];
    if (!p || p.exit || p.weight <= 0) continue;
    if ((a.poiCooldown[k] ?? 0) > world.t) continue;
    entries.push([k, p.weight * (a.visitedPois?.has(k) ? 0.3 : 1)]);
  }
  if (!entries.length) return null;
  let sum = 0; for (const [, w] of entries) sum += w;
  let r = Math.random() * sum;
  for (const [k, w] of entries) { r -= w; if (r <= 0) return k; }
  return entries[entries.length - 1][0];
}

function nearestExit(a, world) {
  let best = null, bd = Infinity;
  for (const [k, p] of Object.entries(world.map.pois)) {
    if (!p.exit) continue;
    const d = (p.x - a.x) ** 2 + (p.y - a.y) ** 2;
    if (d < bd) { bd = d; best = k; }
  }
  return best;
}

function startExplore(a, world) {
  a.goalPoi = null;
  a.target = randomWalkableNear(world.fields.gridFor(0), a.x, a.y, 8);
}

function arrive(a, world) { // дошёл до goalPoi (несервисного)
  (a.visitedPois ??= new Set()).add(a.goalPoi);
  a.visitedCount++;
  a.poiCooldown[a.goalPoi] = world.t + T.poiCooldownTime;
  a.browseUntil = world.t + T.browseMin + Math.random() * (T.browseMax - T.browseMin);
  a.target = randomWalkableNear(world.fields.gridFor(0), a.x, a.y, 2);
  a.goalPoi = null;
  a.activity = 'browse';
}

export function think(a, world) {
  if (a.activity === 'talk' || a.activity === 'queue' || a.activity === 'mobbing') return; // ведут dialogue.js / queue.js
  if (a.activity === 'lost') { thinkLost(a, world); return; }

  // обман ожиданий (как v1, по близости к POI)
  const f = world.facts.concert, belC = a.beliefs.events.concert;
  if (a.activity === 'goto' && a.goalPoi === belC.place && nearPoi(a, world, belC.place) &&
      (f.status !== belC.status || f.time !== belC.time)) {
    a.beliefs.events.concert = { ...f, learnedAt: world.t };
    const benign = f.status === 'started' && belC.status === 'on' && f.time === belC.time;
    if (!benign) {
      a.deceivedUntil = world.t + 15;
      a.stress = Math.min(100, a.stress + 25);
      a.activity = 'wander'; a.goalPoi = null; a.target = null;
      return;
    }
  }

  const dt = T.utilityTickEvery;
  // нужды
  const moving = Math.hypot(a.vx, a.vy) > 0.3;
  a.fatigue = Math.min(100, Math.max(0, a.fatigue + (moving ? T.fatigueRate : -T.fatigueRate) * dt));
  a.boredom = Math.min(100, Math.max(0, a.boredom + ((a.activity === 'wander' || a.activity === 'rest' || a.activity === 'browse') ? T.boredomRate : -T.boredomRate) * dt));
  a.phoneItch = Math.min(100, Math.max(0, a.phoneItch + (a.activity === 'phone' ? -8 : T.phoneItchRate) * dt));

  // паническое забывание
  if (a.stress > 80 && Math.random() < T.panicForgetChance) {
    const ks = [...a.beliefs.knownPois].filter(k => !world.map.pois[k].exit);
    if (ks.length) {
      const lost = ks[(Math.random() * ks.length) | 0];
      a.beliefs.knownPois.delete(lost);
      if (a.goalPoi === lost) { a.goalPoi = null; a.target = null; }
    }
  }

  // browse: стоим у стенда, пока не надоело
  if (a.activity === 'browse' && world.t < a.browseUntil) return;

  // прибытие к цели
  if (a.goalPoi && nearPoi(a, world, a.goalPoi)) {
    const p = world.map.pois[a.goalPoi];
    if (p.exit) { a.despawn = true; return; }
    if (p.service) return; // вступление в очередь делает queue.js (queueTick)
    arrive(a, world);
    return;
  }

  // реакция на затор впереди (только когда есть цель-поле)
  if (a.goalPoi && world.t > a.jamReactAt) {
    const jam = probeJamAhead(a, world) || jamMarkAhead(a);
    if (jam) {
      a.jamReactAt = world.t + T.jamReactCooldown;
      addJamMark(a.beliefs, { ...jam, learnedAt: world.t });
      const urgent = a.activity === 'goto';
      if (a.stubborn > 0.65 || urgent) {
        // «пофиг, прорвусь» — ничего не меняем
      } else if (Math.random() < 0.5 + a.sociability * 0.2) {
        a.smartUntil = world.t + T.smartDuration;            // «обойду»
      } else {
        a.poiCooldown[a.goalPoi] = world.t + T.poiCooldownTime; // «да ну его»
        a.goalPoi = null; a.target = null; a.activity = 'wander';
      }
    }
  }

  // utility
  const bel = a.beliefs.events.concert;
  let goto_ = 0;
  if (a.wantsConcert && (bel.status === 'on' || bel.status === 'started') && !nearPoi(a, world, bel.place)) {
    const left = bel.time - gameClock(world.t);
    goto_ = Math.max(0, Math.min(1.5, 1.5 * (1 - left / 1800)));
  }
  const u = {
    goto: a.weights[0] * goto_,
    wander: a.weights[1] * (0.3 + a.boredom / 200),
    phone: a.weights[2] * (a.phoneItch / 100),
    rest: a.weights[3] * ((a.fatigue + a.stress * 0.7) / 120),
    leave: T.leaveWeight * Math.max(0, Math.min(1.5, (a.visitedCount / a.satThreshold) * 0.8 + a.fatigue / 150)),
  };
  if (u[a.activity] !== undefined) u[a.activity] *= T.hysteresis;

  let best = 'wander', bv = -1;
  for (const k in u) if (u[k] > bv) { bv = u[k]; best = k; }

  if (best === a.activity && (a.goalPoi || a.target)) return;
  switch (best) {
    case 'goto':
      if (a.beliefs.knownPois.has(bel.place)) { a.goalPoi = bel.place; a.target = null; }
      else { enterLost(a, world, bel.place); return; }
      break;
    case 'wander': {
      const pick = weightedPickPoi(a, world);
      if (pick) { a.goalPoi = pick; a.target = null; }
      else startExplore(a, world);  // ничего не знает — исследует и учится глазами
      break;
    }
    case 'phone':
      a.goalPoi = null; a.target = null; break;
    case 'rest': {
      // отдых: стоит, а если давка — отползает в случайную сторону
      a.goalPoi = null;
      a.target = a.density > T.comfortN ? randomWalkableNear(world.fields.gridFor(0), a.x, a.y, 5) : null;
      break;
    }
    case 'leave': {
      a.goalPoi = nearestExit(a, world); a.target = null; break;
    }
  }
  a.activity = best;
  a.perception = best === 'phone' ? 0 : 1;
}

function thinkLost(a, world) {
  // 1) табло рядом — учит своему участку; выходим, если цель теперь известна
  for (const brd of world.map.boards) {
    if ((brd.x - a.x) ** 2 + (brd.y - a.y) ** 2 < T.sightRadius ** 2) {
      const lesson = boardLocalLesson(world, brd);
      for (const k of lesson.pois) a.beliefs.knownPois.add(k);
      a.doorMask |= lesson.doorBits;
      if (!a.lostGoal || a.beliefs.knownPois.has(a.lostGoal)) { a.activity = 'wander'; return; }
    }
  }
  // 2) сосед знает мою цель
  for (const b of a.neighbors) {
    if (b !== a && b.beliefs && b.activity !== 'phone' && a.lostGoal && b.beliefs.knownPois.has(a.lostGoal)) {
      a.beliefs.knownPois.add(a.lostGoal);
      a.activity = 'wander'; return;
    }
  }
  // 3) скачал план выставки (в толпе медленнее)
  if (world.t >= a.phoneDoneAt) {
    for (const k of Object.keys(world.map.pois)) a.beliefs.knownPois.add(k);
    a.doorMask = world.doorsClosed ?? 0;
    a.activity = 'wander'; return;
  }
  // 4) таймаут
  if (world.t - a.lostSince > T.lostTimeout) { a.wantsConcert = false; a.lostGoal = null; a.activity = 'wander'; return; }
}

export function enterLost(a, world, goalKey) {
  a.activity = 'lost';
  a.perception = 1;
  a.goalPoi = null; a.target = null;
  a.lostGoal = goalKey ?? null;
  a.lostSince = world.t;
  a.stress = Math.min(100, a.stress + T.lostStressSpike);
  for (const b of a.neighbors) if (b !== a && b.stress !== undefined)
    b.stress = Math.min(100, b.stress + T.lostNeighborStress);
  a.phoneDoneAt = world.t + T.phoneMapBase * (1 + T.phoneMapDensityK * a.density);
}
```

Импорты agent.js: `import { T, gameClock } from '../data/tuning.js'; import { makeBeliefs, probeJamAhead, jamMarkAhead, addJamMark, boardLocalLesson } from './knowledge.js'; import { randomWalkableNear } from './flowfield.js';`. Функции setGoal больше нет (удалить и её использование). `nearPoi` остаётся из Task 4. В makeAgent: убрать weights-зависимый mapKnown? НЕТ — PRESETS остаются как есть.

- [ ] **Step 3: Smoke**

```bash
node -e "
import('./src/data/map.js').then(async ({MAP}) => {
  const { SpatialHash } = await import('./src/sim/spatialHash.js');
  const { makeAgent } = await import('./src/sim/agent.js');
  const { simTick } = await import('./src/sim/steering.js');
  const { makeWorldFacts } = await import('./src/sim/knowledge.js');
  const { Fields, randomWalkableNear } = await import('./src/sim/flowfield.js');
  const world = { map: MAP, agents: [], hash: new SpatialHash(1), t: 0, flashes: [],
    facts: makeWorldFacts(), doorsClosed: 0, fields: new Fields(MAP), obstacles: [...MAP.blocks] };
  const g = world.fields.gridFor(0);
  for (let i = 0; i < 350; i++) {
    const a = makeAgent(world, i);
    const p = randomWalkableNear(g, 4 + Math.random() * 52, 4 + Math.random() * 36, 4);
    a.x = p.x; a.y = p.y;
    world.agents.push(a);
  }
  const dist = () => { const c = {}; for (const a of world.agents) c[a.activity] = (c[a.activity]||0)+1; return JSON.stringify(c); };
  for (let s = 0; s < 1800; s++) { simTick(world, 1/30); world.t += 1/30; }
  console.log('t60', dist());
  // движение: средняя скорость толпы не нулевая
  let v = 0; for (const a of world.agents) v += Math.hypot(a.vx, a.vy);
  console.log('avgSpeed', (v / world.agents.length).toFixed(2), 'm/s');
  let nan = 0; for (const a of world.agents) if (!isFinite(a.x)) nan++;
  console.log('nan', nan, 'population', world.agents.length);
})"
```

Expected: микс активностей (wander/browse/phone/rest, возможно lost/goto), avgSpeed > 0.4 (толпа циркулирует, не залипла), nan 0. Population может уменьшиться (leave) — это норм.

- [ ] **Step 4: Run `node tests/run.js`** — все ok.

- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat(v2): brain v2 - weighted goals, explore, jam reaction fork, browse, leave, panic forgetting"`

---

### Task 7: Диалоги (sim/dialogue.js, TDD)

**Files:**
- Create: `src/sim/dialogue.js`
- Modify: `src/sim/steering.js`, `src/data/tuning.js`, `src/render/draw.js`, `tests/run.js`

- [ ] **Step 1: tuning.js — добавить в T:**

```js
  // диалоги
  talkRadius: 1.2, talkChance: 0.15,   // в сек при sociability 1×1
  talkMin: 4, talkMax: 7,
  talkCooldown: 20,
  talkTransfer: 0.9, bystanderBase: 0.1, bystanderRadius: 3,
```

- [ ] **Step 2: Тесты (в tests/run.js):**

```js
import { bystanderChance, pickTopic, applyTopic } from '../src/sim/dialogue.js';

test('dialogue: шанс зеваки падает с расстоянием до нуля', () => {
  assert.ok(Math.abs(bystanderChance(0) - 0.1) < 1e-9);
  assert.ok(bystanderChance(1.5) > 0 && bystanderChance(1.5) < 0.1);
  assert.equal(bystanderChance(3), 0);
  assert.equal(bystanderChance(5), 0);
});

test('dialogue: тема из объединения знаний, applyTopic учит', () => {
  const mk = () => ({ beliefs: { knownPois: new Set(), jamMarks: [], events: { concert: { time: 1, place: 'stage', status: 'on', learnedAt: 5 } } }, doorMask: 0 });
  const a = mk(), b = mk();
  a.beliefs.knownPois.add('food');
  const t = pickTopic(a, b, { map: { pois: { food: {} } } });
  assert.ok(t, 'тема нашлась');
  applyTopic(b, t, 10);
  if (t.kind === 'poi') assert.ok(b.beliefs.knownPois.has('food'));
  if (t.kind === 'event') assert.ok(b.beliefs.events.concert.learnedAt >= 5);
});
```

- [ ] **Step 3: Создать src/sim/dialogue.js**

```js
import { T } from '../data/tuning.js';
import { addJamMark } from './knowledge.js';

export function bystanderChance(d) {
  return Math.max(0, T.bystanderBase * (1 - d / T.bystanderRadius));
}

// тема: случайный факт из знаний обоих. kinds: poi | jam | event | door
export function pickTopic(a, b, world) {
  const topics = [];
  for (const src of [a, b]) {
    for (const k of src.beliefs.knownPois) topics.push({ kind: 'poi', poi: k });
    for (const j of src.beliefs.jamMarks) topics.push({ kind: 'jam', jam: { ...j } });
    topics.push({ kind: 'event', ev: { ...src.beliefs.events.concert } });
    if (src.doorMask) topics.push({ kind: 'door', mask: src.doorMask });
  }
  if (!topics.length) return null;
  return topics[(Math.random() * topics.length) | 0];
}

export function applyTopic(agent, topic, t) {
  switch (topic.kind) {
    case 'poi': agent.beliefs.knownPois.add(topic.poi); break;
    case 'jam': addJamMark(agent.beliefs, { ...topic.jam }); break;
    case 'door': agent.doorMask |= topic.mask; break;
    case 'event': {
      const mine = agent.beliefs.events.concert;
      if (topic.ev.learnedAt > mine.learnedAt) {
        agent.beliefs.events.concert = { ...topic.ev };
        if (Math.random() < T.rumorMutation) {
          const m = agent.beliefs.events.concert;
          if (Math.random() < 0.5) m.time += 600; else m.status = 'cancelled';
          m.learnedAt -= 1; // слух «старше» правды — правда побеждает при встрече
        }
      }
      break;
    }
  }
}

function canTalk(a, world) {
  if (a.perception <= 0 || a.talkCooldownUntil > world.t) return false;
  return a.activity === 'wander' || a.activity === 'browse' || a.activity === 'rest' ||
         (a.activity === 'goto' && false) === false && a.activity !== 'lost' && a.activity !== 'talk' &&
         a.activity !== 'queue' && a.activity !== 'mobbing' && a.activity !== 'phone' && a.activity !== 'goto';
}

export function dialogueTick(world, dt) {
  const { agents } = world;
  // завершение разговоров
  for (const a of agents) {
    if (a.activity !== 'talk') continue;
    if (world.t >= a.talkEndAt) {
      const b = agents.find(x => x.id === a.talkWith);
      finishTalk(world, a, b);
    }
  }
  // старт новых
  for (const a of agents) {
    if (!canTalk(a, world)) continue;
    for (const b of a.neighbors) {
      if (b === a || b.id <= a.id) continue;
      if (!canTalk(b, world)) continue;
      if ((a.x - b.x) ** 2 + (a.y - b.y) ** 2 > T.talkRadius ** 2) continue;
      if (Math.random() > T.talkChance * a.sociability * b.sociability * dt * 10) continue;
      const dur = T.talkMin + Math.random() * (T.talkMax - T.talkMin);
      const sameDir = (a.vx * b.vx + a.vy * b.vy) > 0 && Math.hypot(a.vx, a.vy) > 0.5;
      for (const x of [a, b]) {
        x.prevActivity = x.activity;
        x.activity = 'talk';
        x.talkWith = x === a ? b.id : a.id;
        x.talkEndAt = world.t + dur;
        x.talkWalk = sameDir;
        if (!sameDir) { x.goalPoi = null; x.target = null; }
      }
      break;
    }
  }
}

function finishTalk(world, a, b) {
  const peers = b ? [a, b] : [a];
  if (b) {
    const topic = pickTopic(a, b, world);
    if (topic) {
      for (const x of peers) if (Math.random() < T.talkTransfer) applyTopic(x, topic, world.t);
      // зеваки
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      for (const o of world.hash.queryCircle(mx, my, T.bystanderRadius)) {
        if (o === a || o === b || !o.beliefs || o.perception <= 0) continue;
        if (Math.random() < bystanderChance(Math.hypot(o.x - mx, o.y - my))) applyTopic(o, topic, world.t);
      }
    }
  }
  for (const x of peers) {
    x.activity = 'wander';
    x.talkWith = -1; x.talkWalk = false;
    x.talkCooldownUntil = world.t + T.talkCooldown;
    x.boredom = Math.max(0, x.boredom - 25);   // поболтал — повеселел
  }
}
```

ЗАМЕЧАНИЕ к canTalk: выражение должно быть ПРОСТЫМ — перепиши при имплементации как:

```js
function canTalk(a, world) {
  if (a.perception <= 0 || a.talkCooldownUntil > world.t) return false;
  return ['wander', 'browse', 'rest'].includes(a.activity);
}
```

(goto/phone/lost/queue/talk не разговаривают; цифровая версия выше в плане — описка, использовать этот вариант.)

- [ ] **Step 4: steering.js** — импорт + вызов в simTick после цикла think/eyes:

```js
import { dialogueTick } from './dialogue.js';
// в simTick, после первого цикла по агентам:
  dialogueTick(world, dt);
```

- [ ] **Step 5: draw.js — пузырь над говорящими** (в drawAgents, рядом с lost/phone):

```js
    if (a.activity === 'talk') { ctx.fillStyle = '#fff'; ctx.font = '10px monospace'; ctx.fillText('💬', a.x * S - 4, a.y * S - 6); }
```

- [ ] **Step 6: Run** `node tests/run.js` — все ok. Smoke Task 6 повторить — в распределении активностей появляется `talk`.

- [ ] **Step 7: Commit** — `git add -A && git commit -m "feat(v2): dialogue system replaces osmosis - 90/10 transfer, bystanders, topics"`

---

### Task 8: Очереди с деградацией (sim/queue.js, TDD)

**Files:**
- Create: `src/sim/queue.js`
- Modify: `src/sim/steering.js`, `src/data/tuning.js`, `tests/run.js`, `src/main.js`

- [ ] **Step 1: tuning.js — добавить в T:**

```js
  // очереди
  queueSpacing: 0.6,
  queueJoinRadius: 3,
  queueDefectStress: 70, queueDefectSlot: 10,
  mobThreshold: 9,           // соседей у точки обслуживания = «ком»
  mobRateFactor: 0.4,
  injusticeStress: 15,
  serveSatisfaction: 30,     // сброс стресса обслуженному
```

- [ ] **Step 2: Тесты (tests/run.js):**

```js
import { initQueues, queueTick, queueSlotPos } from '../src/sim/queue.js';

test('queue: слоты вдоль queueDir с шагом', () => {
  const poi = { x: 10, y: 20, service: { rate: 4, queueDir: [1, 0] } };
  const p0 = queueSlotPos(poi, 0), p2 = queueSlotPos(poi, 2);
  assert.ok(Math.abs(p0.x - 10.6) < 1e-9 && Math.abs(p2.x - 11.8) < 1e-9);
  assert.equal(p0.y, 20);
});

test('queue: обслуживание двигает очередь, обслуженный доволен', () => {
  const poi = { x: 10, y: 20, service: { rate: 0.0001, queueDir: [1, 0] } }; // мгновенное
  const world = { t: 100, map: { pois: { q: poi } }, agents: [], hash: { queryCircle: () => [] } };
  initQueues(world);
  const mk = id => ({ id, x: 10 + id, y: 20, stress: 50, boredom: 50, visitedCount: 0,
    activity: 'queue', goalPoi: 'q', target: null, poiCooldown: {}, beliefs: { knownPois: new Set() } });
  const a = mk(1), b = mk(2);
  world.agents.push(a, b);
  world.queues.q.line.push(a, b);
  queueTick(world, 1);
  assert.equal(world.queues.q.line.length, 1, 'голова обслужена');
  assert.ok(a.stress < 50, 'обслуженный сбросил стресс');
  assert.equal(a.activity, 'wander');
  assert.equal(b.target.x, queueSlotPos(poi, 0).x, 'второй переехал в слот 0');
});
```

- [ ] **Step 3: Создать src/sim/queue.js**

```js
import { T } from '../data/tuning.js';

export function queueSlotPos(poi, slot) {
  const [dx, dy] = poi.service.queueDir;
  return { x: poi.x + dx * T.queueSpacing * (slot + 1), y: poi.y + dy * T.queueSpacing * (slot + 1) };
}

export function initQueues(world) {
  world.queues = {};
  for (const [k, p] of Object.entries(world.map.pois))
    if (p.service) world.queues[k] = { line: [], servingUntil: 0 };
}

function serveDone(world, a, poiKey) {
  a.stress = Math.max(0, a.stress - T.serveSatisfaction);
  a.boredom = 0;
  a.visitedCount++;
  a.poiCooldown[poiKey] = world.t + T.poiCooldownTime;
  a.activity = 'wander'; a.goalPoi = null; a.target = null;
}

export function queueTick(world, dt) {
  if (!world.queues) return;
  for (const [key, q] of Object.entries(world.queues)) {
    const poi = world.map.pois[key];
    q.line = q.line.filter(a => !a.despawn && (a.activity === 'queue'));

    // вступление: агенты с целью key рядом с хвостом/точкой
    for (const a of world.agents) {
      if (a.goalPoi !== key || a.activity === 'queue' || a.activity === 'mobbing') continue;
      if ((a.x - poi.x) ** 2 + (a.y - poi.y) ** 2 < T.queueJoinRadius ** 2) {
        a.activity = 'queue';
        a.goalPoi = null;
        q.line.push(a);
      }
    }

    // дезертирство → mobbing
    q.line = q.line.filter((a, slot) => {
      const headDensity = world.hash.queryCircle(poi.x, poi.y, 2).length;
      if (a.stress > T.queueDefectStress || slot > T.queueDefectSlot || headDensity > T.mobThreshold) {
        a.activity = 'mobbing';
        a.target = { x: poi.x, y: poi.y };
        return false;
      }
      return true;
    });

    // слоты
    q.line.forEach((a, slot) => { a.target = queueSlotPos(poi, slot); });

    // обслуживание
    if (world.t >= q.servingUntil) {
      const mobDensity = world.hash.queryCircle(poi.x, poi.y, 2).length;
      const degraded = mobDensity > T.mobThreshold;
      const rate = poi.service.rate * 10 / T.timeScale / (degraded ? T.mobRateFactor : 1); // реальных сек на клиента
      let served = null;
      if (degraded) {
        // обслуживается случайный ближний (несправедливость)
        const near = world.agents.filter(x => (x.activity === 'mobbing' || x.activity === 'queue') &&
          (x.x - poi.x) ** 2 + (x.y - poi.y) ** 2 < 4);
        if (near.length) {
          served = near[(Math.random() * near.length) | 0];
          if (q.line[0] && served !== q.line[0])
            q.line[0].stress = Math.min(100, q.line[0].stress + T.injusticeStress);
          const i = q.line.indexOf(served); if (i >= 0) q.line.splice(i, 1);
        }
      } else if (q.line.length) {
        const head = q.line[0];
        if ((head.x - poi.x) ** 2 + (head.y - poi.y) ** 2 < 9) served = q.line.shift();
      }
      if (served) { serveDone(world, served, key); q.servingUntil = world.t + rate; }
    }
  }
}
```

- [ ] **Step 4: steering.js** — импорт и вызов в simTick сразу после dialogueTick: `queueTick(world, dt);` (`import { queueTick } from './queue.js';`). main.js: `import { initQueues } from './sim/queue.js'; initQueues(world);` после создания world.

- [ ] **Step 5: mobbing-агенты в think**: уже игнорируются (`talk|queue|mobbing` → return). Выход из mobbing: либо обслужили (serveDone), либо вечно толкаться? Добавить в queueTick в конце per-poi обработки:

```js
    // mobbing-таймаут: устал толкаться — плюнул и ушёл
    for (const a of world.agents) {
      if (a.activity !== 'mobbing') continue;
      a.mobSince ??= world.t;
      if (world.t - a.mobSince > 30) {
        a.mobSince = undefined;
        a.poiCooldown[key] = world.t + T.poiCooldownTime;
        a.activity = 'wander'; a.target = null;
        a.stress = Math.min(100, a.stress + 10);
      }
    }
```

(блок ставится внутри цикла по очередям; mobSince сбрасывать и в serveDone: `a.mobSince = undefined;`).

- [ ] **Step 6: Run** `node tests/run.js` — все ok.

- [ ] **Step 7: Commit** — `git add -A && git commit -m "feat(v2): service queues with mob degradation and injustice stress"`

---

### Task 9: Приток/отток + расписание v2

**Files:**
- Rewrite: `src/data/schedule.js`
- Modify: `src/data/tuning.js`, `src/data/messages.js`

- [ ] **Step 1: tuning.js — добавить в T:**

```js
  // население
  arrivalEvery: 1.4,   // реальных сек между приходами (база)
  maxAgents: 700,
```

- [ ] **Step 2: schedule.js — полная замена:**

```js
import { T } from './tuning.js';
import { makeAgent } from '../sim/agent.js';
import { EXITS } from './map.js';

const h = (hh, mm) => ((hh - 13) * 3600 + mm * 60) / T.timeScale;

function spawnAt(world, exitKey) {
  const p = world.map.pois[exitKey];
  const a = makeAgent(world, world.nextId = (world.nextId ?? world.agents.length) + 1);
  a.x = p.x + (Math.random() - 0.5) * 2;
  a.y = p.y + (Math.random() - 0.5) * 2;
  world.agents.push(a);
}

export const SCHEDULE = [
  { at: h(13, 10), name: 'Поезд: +80 человек', fire(world) {
      for (let i = 0; i < 80; i++) spawnAt(world, 'exitMain');
  }},
  { at: h(13, 40), name: 'Западный проём сцены закрыт', fire(world) {
      world.closeDoor(0);
      world.facts.doorW = { open: false, changedAt: world.t };
  }},
  { at: h(14, 0), name: 'Концерт начался', fire(world) {
      world.facts.concert = { ...world.facts.concert, status: 'started', changedAt: world.t };
  }},
];

export function tickSchedule(world) {
  for (const ev of SCHEDULE) {
    if (!ev.done && world.t >= ev.at) { ev.done = true; ev.fire(world); world.banner = { text: ev.name, t: world.t }; }
  }
  // постоянный приток
  world.nextArrival ??= 2;
  if (world.t >= world.nextArrival && world.agents.length < T.maxAgents) {
    world.nextArrival = world.t + T.arrivalEvery * (0.5 + Math.random());
    spawnAt(world, EXITS[(Math.random() * EXITS.length) | 0]);
  }
}
```

- [ ] **Step 3: messages.js — карточки v2 (полная замена):**

```js
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
```

boards.js: messagesFor теперь принимает board — заменить вызов на `messagesFor(world, board)`.

- [ ] **Step 4: hud.js — счётчик населения** (добавить в drawHud после полоски стресса):

```js
  ctx.fillStyle = '#9ab'; ctx.font = '12px monospace';
  ctx.fillText('чел: ' + world.agents.length, 320, 23);
```

(баннер сдвинуть на x=400).

- [ ] **Step 5: Smoke полной партии:**

```bash
node -e "
import('./src/data/map.js').then(async ({MAP}) => {
  const { SpatialHash } = await import('./src/sim/spatialHash.js');
  const { makeAgent } = await import('./src/sim/agent.js');
  const { simTick } = await import('./src/sim/steering.js');
  const { makeWorldFacts } = await import('./src/sim/knowledge.js');
  const { Fields, randomWalkableNear } = await import('./src/sim/flowfield.js');
  const { initQueues } = await import('./src/sim/queue.js');
  const { tickSchedule, SCHEDULE } = await import('./src/data/schedule.js');
  const world = { map: MAP, agents: [], hash: new SpatialHash(1), t: 0, flashes: [],
    facts: makeWorldFacts(), doorsClosed: 0, fields: new Fields(MAP), obstacles: [...MAP.blocks] };
  world.closeDoor = idx => { world.doorsClosed |= 1 << idx;
    world.obstacles = [...MAP.blocks, ...MAP.doors.filter((d, i) => world.doorsClosed & (1 << i))];
    world.fields.recomputeSmart(world.agents, world.doorsClosed); };
  initQueues(world);
  const g = world.fields.gridFor(0);
  for (let i = 0; i < 300; i++) {
    const a = makeAgent(world, i);
    const p = randomWalkableNear(g, 4 + Math.random() * 52, 4 + Math.random() * 36, 4);
    a.x = p.x; a.y = p.y; world.agents.push(a);
  }
  let spawned0 = world.agents.length;
  for (let s = 0; s < 5400; s++) { tickSchedule(world); simTick(world, 1/30); world.t += 1/30; }
  const dist = {}; for (const a of world.agents) dist[a.activity] = (dist[a.activity]||0)+1;
  let nan = 0, avg = 0; for (const a of world.agents) { if (!isFinite(a.x)) nan++; avg += a.stress; }
  console.log('events', SCHEDULE.filter(e=>e.done).length, '/3, pop', world.agents.length,
    'nan', nan, 'avgStress', (avg/world.agents.length).toFixed(1), JSON.stringify(dist));
})"
```

Expected: events 3/3; pop живое число (приток − отток, обычно 350–600); nan 0; в распределении есть queue/talk/browse; avgStress < 70 (просторнее карта). Report numbers.

- [ ] **Step 6: Run `node tests/run.js`** — все ok.

- [ ] **Step 7: Commit** — `git add -A && git commit -m "feat(v2): continuous inflow/outflow, schedule v2, local board lessons"`

---

### Task 10: Инспектор агента (ui/inspector.js)

**Files:**
- Create: `src/ui/inspector.js`
- Modify: `index.html`, `src/ui/boards.js`, `src/main.js`, `src/render/draw.js`

- [ ] **Step 1: index.html — стили и div** (в `<style>` добавить, в body после #cards):

```css
#inspector{position:fixed;right:8px;top:8px;width:240px;background:rgba(20,22,30,.92);color:#cde;
  font:11px monospace;padding:10px;border-radius:8px;display:none;white-space:pre-wrap}
```
```html
<div id="inspector"></div>
```

- [ ] **Step 2: src/ui/inspector.js**

```js
import { T, fmtClock } from '../data/tuning.js';
import { knowledgeLag } from '../sim/knowledge.js';

export function initInspector(canvas, world) {
  const el = document.getElementById('inspector');
  canvas.addEventListener('click', e => {
    const r = canvas.getBoundingClientRect();
    const mx = (e.clientX - r.left) / T.pxPerMeter, my = (e.clientY - r.top) / T.pxPerMeter;
    // табло в приоритете
    if (world.map.boards.some(b => Math.hypot(b.x - mx, b.y - my) < 2)) return;
    let best = null, bd = 1;
    for (const a of world.agents) {
      const d = Math.hypot(a.x - mx, a.y - my);
      if (d < bd) { bd = d; best = a; }
    }
    world.selected = best;
    el.style.display = best ? 'block' : 'none';
  });
  window.addEventListener('keydown', e => { if (e.key === 'Escape') { world.selected = null; el.style.display = 'none'; } });
}

export function updateInspector(world) {
  const el = document.getElementById('inspector');
  const a = world.selected;
  if (!a) { el.style.display = 'none'; return; }
  const bel = a.beliefs.events.concert, f = world.facts.concert;
  const bar = v => '█'.repeat(Math.round(v / 10)).padEnd(10, '·');
  const totalPois = Object.keys(world.map.pois).length;
  el.style.display = 'block';
  el.textContent =
`#${a.id} ${a.preset}  [${a.activity}]
stress  ${bar(a.stress)} ${a.stress | 0}
fatigue ${bar(a.fatigue)} ${a.fatigue | 0}
boredom ${bar(a.boredom)} ${a.boredom | 0}
phone   ${bar(a.phoneItch)} ${a.phoneItch | 0}
─ характер ─
sociability ${a.sociability.toFixed(2)}  stubborn ${a.stubborn.toFixed(2)}
politeness ${a.politeness.toFixed(2)}  conformity ${a.conformity.toFixed(2)}
mass ${a.mass.toFixed(1)}  speed ${a.maxSpeed.toFixed(1)}  agility ${a.agility.toFixed(1)}
─ знание ─
POI: ${a.beliefs.knownPois.size}/${totalPois}  jamMarks: ${a.beliefs.jamMarks.length}  двери: ${a.doorMask}
концерт: верит ${fmtClock(bel.time)}/${bel.status}
правда:  ${fmtClock(f.time)}/${f.status} ${knowledgeLag(a, world) > 0 ? '⚠ ОТСТАЛ' : '✓'}
─ цель ─
${a.goalPoi ? world.map.pois[a.goalPoi].label + (a.smartUntil > world.t ? ' [обходит]' : ' [по памяти]') : (a.target ? 'локальная точка' : '—')}
visited ${a.visitedCount}/${a.satThreshold}`;
}
```

- [ ] **Step 3: main.js** — `import { initInspector } from './ui/inspector.js'; import { updateInspector } from './ui/inspector.js';` вызвать `initInspector(canvas, world);` после initBoards; в frame() после drawHud: `updateInspector(world);`

- [ ] **Step 4: draw.js — подсветка выбранного** (в конце draw()):

```js
  if (world.selected && !world.selected.despawn) {
    const a = world.selected;
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(a.x * S, a.y * S, (a.radius + 0.4) * S, 0, 7); ctx.stroke();
    const goal = a.goalPoi ? world.map.pois[a.goalPoi] : a.target;
    if (goal) {
      ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(a.x * S, a.y * S); ctx.lineTo(goal.x * S, goal.y * S); ctx.stroke();
    }
  }
```

- [ ] **Step 5: Проверка** — `node tests/run.js` ok (инспектор — DOM-модуль, в тесты не входит); браузерная проверка кликов — на приёмке контроллером.

- [ ] **Step 6: Commit** — `git add -A && git commit -m "feat(v2): agent inspector panel with live state, needs, beliefs, goal"`

---

### Task 11: Debug overlay v2

**Files:**
- Rewrite: `src/render/debug.js`

- [ ] **Step 1: Полная замена src/render/debug.js:**

```js
import { T } from '../data/tuning.js';
const S = T.pxPerMeter;

export function drawDebug(ctx, world) {
  const g = world.fields.gridFor(world.doorsClosed ?? 0);
  // непроходимые клетки
  ctx.fillStyle = 'rgba(255,80,80,0.12)';
  for (let y = 0; y < g.H; y++) for (let x = 0; x < g.W; x++)
    if (!g.walk[y * g.W + x]) ctx.fillRect(x * S, y * S, S, S);
  // тепло плотности (из smart-полей)
  if (world.fields.density) {
    const d = world.fields.density;
    ctx.fillStyle = 'rgba(255,140,30,0.5)';
    for (let y = 0; y < g.H; y++) for (let x = 0; x < g.W; x++) {
      const v = d[y * g.W + x];
      if (v > 2) { ctx.globalAlpha = Math.min(0.5, v * 0.06); ctx.fillRect(x * S, y * S, S, S); }
    }
    ctx.globalAlpha = 1;
  }
  // поле выбранного агента: стрелки его clear-градиента
  const a = world.selected;
  if (a && a.goalPoi) {
    const mask = (a.doorMask ?? 0) & (world.doorsClosed ?? 0);
    ctx.strokeStyle = 'rgba(120,220,255,0.6)';
    for (let y = 1; y < g.H; y += 2) for (let x = 1; x < g.W; x += 2) {
      const dir = world.fields.dir(a.smartUntil > world.t ? 'smart' : 'clear', mask, a.goalPoi, x + 0.5, y + 0.5);
      if (!dir) continue;
      ctx.beginPath();
      ctx.moveTo((x + 0.5) * S, (y + 0.5) * S);
      ctx.lineTo((x + 0.5 + dir.x * 0.8) * S, (y + 0.5 + dir.y * 0.8) * S);
      ctx.stroke();
    }
  }
  // вектора скоростей
  ctx.strokeStyle = 'rgba(120,180,255,0.4)';
  for (const ag of world.agents) {
    ctx.beginPath(); ctx.moveTo(ag.x * S, ag.y * S); ctx.lineTo((ag.x + ag.vx) * S, (ag.y + ag.vy) * S); ctx.stroke();
  }
}
```

- [ ] **Step 2: Run** `node tests/run.js` — ok. Commit — `git add -A && git commit -m "feat(v2): debug overlay - grid, density heat, selected agent field arrows"`

---

### Task 12: Приёмка v2

- [ ] **Step 1: Полный прогон тестов** — `node tests/run.js`: все ok.
- [ ] **Step 2: Финальный smoke из Task 9 Step 5** — events 3/3, nan 0, население живое, очереди и диалоги в распределении.
- [ ] **Step 3: Браузерная приёмка по спеке §9 — выполняет КОНТРОЛЛЕР/пользователь:**
1. Циркуляция по проходам, нет залипших кластеров.
2. Никто не смотрит в стену дольше пары секунд.
3. «💬»-пары и волна знания.
4. Очередь у фудкорта → ком при наплыве.
5. Развилка характера через инспектор.
6. Инспектор объясняет агента.
Балансировка ТОЛЬКО через tuning.js.
- [ ] **Step 4: Commit финальный** — `git add -A && git commit -m "chore(v2): acceptance pass"`

---

## Покрытие спеки v2

| Спека | Таск |
|---|---|
| §1 карта-выставка, blocks/pois/boards | 1, 3 |
| §2 сетка, clear/smart поля, маски дверей | 2, 4 |
| §2 знание: knownPois/jamMarks/каналы/реакция на затор | 5, 6 |
| §2 Lost v2, паническое забывание | 6 |
| §3 диалоги 90/10, зеваки, мутация | 7 |
| §4 инспектор | 10 |
| §5 очереди, слом, несправедливость | 8 |
| §5.5 приток/отток, двери-маски честность | 9, 2, 4 |
| §6 оживление: dwell/alignment-gate/walkable-цели | 6, 4 |
| §7 умирает/появляется | 1–8 |
| §8 тесты | 2, 3, 7, 8 |
| §9 приёмка | 12 |

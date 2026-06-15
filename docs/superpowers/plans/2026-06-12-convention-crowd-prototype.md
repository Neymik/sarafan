# Convention Crowd Prototype — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Браузерный прототип толпо-симуляции конвента: 400 агентов с убеждениями, эмерджентные пробки, табло как рычаг игрока, стресс как метрика.

**Architecture:** Чистый JS (ES-модули, без сборщика). Симуляция (социальные силы + PBD) отделена от рендера (Canvas 2D). Контент и баланс — в `src/data/`. Одна временная шкала: `world.t` — реальные секунды; игровые часы — только отображение (`t × timeScale`).

**Tech Stack:** HTML5 Canvas, vanilla JS, Node (только для юнит-тестов математики: `node tests/run.js`), `python3 -m http.server` для запуска.

**Spec:** `docs/superpowers/specs/2026-06-12-convention-crowd-prototype-design.md`

**Единицы:** мир в метрах (60×40 м), рендер 16 px/м (canvas 960×640). Скорости в м/реальную секунду. Сим-тик 30 Гц фиксированный.

---

### Task 1: Скелет проекта и игровой цикл

**Files:**
- Create: `index.html`, `package.json`, `src/main.js`, `src/data/tuning.js`

- [ ] **Step 1: package.json (нужен для ES-модулей в node-тестах)**

```json
{ "name": "concrowd", "private": true, "type": "module" }
```

- [ ] **Step 2: index.html**

```html
<!doctype html>
<html><head><meta charset="utf-8"><title>ConCrowd</title>
<style>
  body{margin:0;background:#0b0b10;display:flex;justify-content:center;align-items:center;height:100vh;font-family:system-ui}
  canvas{background:#14141c}
  #cards{position:fixed;display:none;flex-direction:column;gap:6px;background:#222;padding:10px;border-radius:8px}
  #cards button{background:#3a6;border:0;color:#fff;padding:8px 12px;border-radius:6px;cursor:pointer;text-align:left}
</style></head>
<body>
<canvas id="c" width="960" height="640"></canvas>
<div id="cards"></div>
<script type="module" src="src/main.js"></script>
</body></html>
```

- [ ] **Step 3: src/data/tuning.js — ВСЕ константы баланса**

```js
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
  stressFromDensity: 1.2, stressFromContact: 0.8, stressDecay: 1.5,
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
};
export function speedFactor(n) { return Math.max(0.15, 1 - Math.max(0, n - T.comfortN) * 0.09); }
export function turnFactor(n)  { return Math.max(0.2,  1 - Math.max(0, n - T.comfortN) * 0.10); }
export function gameClock(t)   { return 13 * 3600 + t * T.timeScale; } // игровые секунды
export function fmtClock(gs)   { const h = (gs / 3600) | 0, m = ((gs % 3600) / 60) | 0; return `${h}:${String(m).padStart(2, '0')}`; }
```

- [ ] **Step 4: src/main.js — фиксированный цикл, пока пустой мир**

```js
import { T } from './data/tuning.js';

const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');

export const world = { t: 0, agents: [], flashes: [], debug: false };

window.addEventListener('keydown', e => { if (e.key === 'd') world.debug = !world.debug; });

let acc = 0, last = performance.now();
function frame(now) {
  acc += Math.min(0.1, (now - last) / 1000); last = now;
  const dt = 1 / T.simHz;
  while (acc >= dt) { simTick(world, dt); world.t += dt; acc -= dt; }
  render();
  requestAnimationFrame(frame);
}
function simTick(world, dt) {} // заменится импортом в Task 4
function render() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#888'; ctx.font = '14px monospace';
  ctx.fillText('t=' + world.t.toFixed(1), 10, 20);
}
requestAnimationFrame(frame);
```

- [ ] **Step 5: Проверка**

Run: `cd /Users/neymik/Documents/GameJam_CVKBC && python3 -m http.server 8000` (фоном), открыть `http://localhost:8000`.
Expected: тёмный canvas, тикающий счётчик `t=`.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: project skeleton, fixed-timestep loop, tuning"
```

---

### Task 2: Карта в данных + статический рендер

**Files:**
- Create: `src/data/map.js`, `src/render/draw.js`
- Modify: `src/main.js`

- [ ] **Step 1: src/data/map.js**

Топология: вход → холл → (мерч, фудкорт, чилл) и сцена с ДВУМЯ дверями (юж/сев) — для механики обхода.

```js
// Мир 60×40 м. Зоны — прямоугольники [x,y,w,h]. Стены — отрезки [x1,y1,x2,y2].
export const MAP = {
  w: 60, h: 40,
  zones: [
    { id: 'entrance', rect: [0, 12, 10, 16], color: '#1d2430' },
    { id: 'hall',     rect: [10, 10, 40, 20], color: '#1a1f28' },
    { id: 'merch',    rect: [10, 30, 20, 10], color: '#241d2c' },
    { id: 'food',     rect: [30, 30, 20, 10], color: '#2c241d' },
    { id: 'chill',    rect: [10, 0, 40, 10],  color: '#1d2c24' },
    { id: 'stage',    rect: [50, 0, 10, 40],  color: '#2c1d22' },
  ],
  walls: [
    [0,0,60,0],[60,0,60,40],[60,40,0,40],[0,40,0,0],          // внешние
    [10,0,10,18],[10,22,10,40],                               // вход: дверь y 18..22
    [10,30,18,30],[21,30,38,30],[41,30,50,30],                // холл/верх: двери мерч 18..21, фуд 38..41
    [10,10,28,10],[32,10,50,10],                              // холл/чилл: дверь 28..32
    [50,0,50,12],[50,16,50,24],[50,28,50,40],                 // сцена: юж. дверь y12..16, сев. y24..28
  ],
  waypoints: [
    { x: 3,    y: 20 },  // 0 спавн
    { x: 10,   y: 20 },  // 1 дверь входа
    { x: 18,   y: 20 },  // 2 холл-запад
    { x: 30,   y: 20 },  // 3 холл-центр
    { x: 44,   y: 20 },  // 4 холл-восток
    { x: 19.5, y: 30 },  // 5 дверь мерча
    { x: 20,   y: 35 },  // 6 мерч
    { x: 39.5, y: 30 },  // 7 дверь фуда
    { x: 40,   y: 35 },  // 8 фуд
    { x: 30,   y: 10 },  // 9 дверь чилла
    { x: 30,   y: 5  },  // 10 чилл
    { x: 50,   y: 14 },  // 11 южная дверь сцены
    { x: 50,   y: 26 },  // 12 северная дверь сцены
    { x: 55,   y: 20 },  // 13 сцена
  ],
  edges: [
    [0,1],[1,2],[2,3],[3,4],          // e0..e3 ось холла
    [2,5],[5,6],                      // e4,e5 мерч
    [4,7],[7,8],                      // e6,e7 фуд
    [3,9],[9,10],                     // e8,e9 чилл
    [4,11],[4,12],[11,13],[12,13],    // e10..e13 сцена (юг/север)
  ],
  pois: {
    stage: { wp: 13, zone: 'stage' },
    merch: { wp: 6,  zone: 'merch' },
    food:  { wp: 8,  zone: 'food'  },
    chill: { wp: 10, zone: 'chill' },
    hall:  { wp: 3,  zone: 'hall'  },
  },
  boards: [
    { x: 12, y: 18 },   // у входа
    { x: 30, y: 22 },   // центр холла
    { x: 46, y: 18 },   // перед сценой
  ],
  spawn: { x: 3, y: 20 },
};
// adjacency + длины
MAP.adj = MAP.waypoints.map(() => []);
MAP.edges.forEach(([a, b], i) => {
  const wa = MAP.waypoints[a], wb = MAP.waypoints[b];
  const len = Math.hypot(wb.x - wa.x, wb.y - wa.y);
  MAP.edges[i] = { a, b, len, id: i, mid: { x: (wa.x + wb.x) / 2, y: (wa.y + wb.y) / 2 } };
  MAP.adj[a].push(i); MAP.adj[b].push(i);
});
```

- [ ] **Step 2: src/render/draw.js**

```js
import { T, gameClock } from '../data/tuning.js';
const S = T.pxPerMeter;

export function draw(ctx, world) {
  const { map } = world;
  ctx.clearRect(0, 0, map.w * S, map.h * S);
  for (const z of map.zones) {
    const [x, y, w, h] = z.rect;
    ctx.fillStyle = z.color; ctx.fillRect(x * S, y * S, w * S, h * S);
  }
  ctx.strokeStyle = '#aab'; ctx.lineWidth = 2;
  for (const [x1, y1, x2, y2] of map.walls) {
    ctx.beginPath(); ctx.moveTo(x1 * S, y1 * S); ctx.lineTo(x2 * S, y2 * S); ctx.stroke();
  }
  for (const b of map.boards) {
    ctx.fillStyle = '#4af'; ctx.fillRect(b.x * S - 5, b.y * S - 5, 10, 10);
  }
  drawAgents(ctx, world);
  drawFlashes(ctx, world);
}

export function agentColor(a, world) { return '#7c7'; } // заменится в Task 8

function drawAgents(ctx, world) {
  for (const a of world.agents) {
    ctx.fillStyle = agentColor(a, world);
    ctx.beginPath(); ctx.arc(a.x * S, a.y * S, a.radius * S, 0, 7); ctx.fill();
    if (a.stress > 60) {           // стресс-обводка, пульс
      ctx.strokeStyle = `rgba(255,255,255,${0.4 + 0.4 * Math.sin(world.t * 8 + a.id)})`;
      ctx.lineWidth = 1.5; ctx.stroke();
    }
    if (a.activity === 'lost') { ctx.fillStyle = '#ff0'; ctx.font = '12px monospace'; ctx.fillText('?!', a.x * S + 4, a.y * S - 4); }
    if (a.activity === 'phone') { ctx.fillStyle = '#0cf'; ctx.fillRect(a.x * S - 1, a.y * S - 6, 3, 4); }
  }
}
function drawFlashes(ctx, world) {
  world.flashes = world.flashes.filter(f => world.t - f.t < 1.2);
  for (const f of world.flashes) {
    const age = (world.t - f.t) / 1.2;
    ctx.strokeStyle = `rgba(120,255,160,${1 - age})`; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(f.x * S, f.y * S, age * T.boardRadius * S, 0, 7); ctx.stroke();
  }
}
```

- [ ] **Step 3: Подключить в main.js**

Заменить `render()` и мир:

```js
import { MAP } from './data/map.js';
import { draw } from './render/draw.js';
// world:
export const world = { t: 0, map: MAP, agents: [], flashes: [], debug: false };
// render():
function render() { draw(ctx, world); }
```

- [ ] **Step 4: Проверка** — обновить страницу. Expected: зоны-плиты разных оттенков, стены с проёмами, 3 синих квадратика-табло.

- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat: map data and static render"`

---

### Task 3: SpatialHash (TDD)

**Files:**
- Create: `src/sim/spatialHash.js`, `tests/run.js`

- [ ] **Step 1: Написать падающий тест — tests/run.js**

```js
import assert from 'node:assert';
import { SpatialHash } from '../src/sim/spatialHash.js';

const tests = [];
export function test(name, fn) { tests.push([name, fn]); }

test('spatialHash: находит соседей в радиусе, не находит дальних', () => {
  const h = new SpatialHash(1);
  const agents = [
    { id: 0, x: 5, y: 5 }, { id: 1, x: 5.5, y: 5 }, { id: 2, x: 20, y: 20 },
  ];
  h.rebuild(agents);
  const near = h.queryCircle(5, 5, 2);
  assert.deepEqual(near.map(a => a.id).sort(), [0, 1]);
});

let fail = 0;
for (const [name, fn] of tests) {
  try { fn(); console.log('ok -', name); }
  catch (e) { fail++; console.error('FAIL -', name, '\n', e.message); }
}
process.exit(fail ? 1 : 0);
```

- [ ] **Step 2: Запустить — убедиться, что падает**

Run: `node tests/run.js`
Expected: FAIL (Cannot find module spatialHash.js)

- [ ] **Step 3: Реализация — src/sim/spatialHash.js**

```js
export class SpatialHash {
  constructor(cell) { this.cell = cell; this.map = new Map(); }
  key(cx, cy) { return cx * 100003 + cy; }
  rebuild(agents) {
    this.map.clear();
    for (const a of agents) {
      const k = this.key(Math.floor(a.x / this.cell), Math.floor(a.y / this.cell));
      let arr = this.map.get(k);
      if (!arr) { arr = []; this.map.set(k, arr); }
      arr.push(a);
    }
  }
  queryCircle(x, y, r) {
    const out = [], r2 = r * r;
    const x0 = Math.floor((x - r) / this.cell), x1 = Math.floor((x + r) / this.cell);
    const y0 = Math.floor((y - r) / this.cell), y1 = Math.floor((y + r) / this.cell);
    for (let cx = x0; cx <= x1; cx++) for (let cy = y0; cy <= y1; cy++) {
      const arr = this.map.get(this.key(cx, cy));
      if (arr) for (const a of arr) {
        const dx = a.x - x, dy = a.y - y;
        if (dx * dx + dy * dy <= r2) out.push(a);
      }
    }
    return out;
  }
}
```

- [ ] **Step 4: Run `node tests/run.js`** — Expected: `ok - spatialHash...`, exit 0.

- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat: spatial hash with node test runner"`

---

### Task 4: Агенты + минимальный стиринг + PBD + стены (толпа на экране)

**Files:**
- Create: `src/sim/agent.js` (только makeAgent, мозг — Task 9), `src/sim/steering.js`
- Modify: `src/main.js`, `tests/run.js`

- [ ] **Step 1: src/sim/agent.js — фабрика (без мозга)**

```js
import { T } from '../data/tuning.js';

export const PRESETS = [ // веса [goto, wander, phone, rest], доля известной карты
  { name: 'planner',  w: [1.4, 0.6, 0.4, 0.8], mapKnown: 1.0 },
  { name: 'wanderer', w: [0.8, 1.3, 0.6, 0.8], mapKnown: 0.7 },
  { name: 'zombie',   w: [0.9, 0.7, 1.6, 0.6], mapKnown: 0.3 },
];

export function makeAgent(world, id) {
  const p = PRESETS[(Math.random() * PRESETS.length) | 0];
  const big = Math.random() < 0.06; // большой косплеер
  return {
    id, preset: p.name, mapKnown: p.mapKnown, weights: p.w,
    x: world.map.spawn.x + (Math.random() - 0.5) * 4,
    y: world.map.spawn.y + (Math.random() - 0.5) * 8,
    vx: 0, vy: 0,
    radius: big ? 0.45 : 0.22 + Math.random() * 0.08,
    mass: big ? 3 : 0.8 + Math.random() * 0.4,
    maxSpeed: 2.0 + Math.random() * 1.4,
    agility: 3 + Math.random() * 3,
    personalSpace: 0.4 + Math.random() * 1.0,
    conformity: 0.2 + Math.random() * 0.6,
    politeness: Math.random(),
    perception: 1,
    wantsConcert: Math.random() < 0.7,
    stress: 0, fatigue: 0, boredom: 0, phoneItch: Math.random() * 30,
    activity: 'wander', target: null, path: [], pathI: 0,
    deceivedUntil: -99, lostSince: 0, phoneDoneAt: 0, blockedTime: 0,
    nextThink: Math.random() * T.utilityTickEvery,
    neighbors: [], density: 0, contact: false, beliefs: null, // beliefs — Task 8
  };
}
```

- [ ] **Step 2: src/sim/steering.js — конвейер**

В этом таске: seek к временной цели + интеграция + PBD + стены. Плотность/alignment/личная зона — Task 6 (вставки помечены).

```js
import { T, speedFactor, turnFactor } from '../data/tuning.js';

export function simTick(world, dt) {
  const { agents, hash } = world;
  hash.rebuild(agents);
  for (const a of agents) {
    a.neighbors = hash.queryCircle(a.x, a.y, T.densityRadius);
    a.density = a.neighbors.length - 1;
    a.contact = false;
  }
  for (const a of agents) stepAgent(a, world, dt);
  resolveCollisions(world);
  for (const a of agents) pushOutOfWalls(a, world.map.walls);
}

export function currentTarget(a, world) {
  // Task 5 заменит на цепочку вейпоинтов; пока — прямая цель
  return a.target;
}

function stepAgent(a, world, dt) {
  let dx = 0, dy = 0;
  const wp = currentTarget(a, world);
  if (wp) {
    const ex = wp.x - a.x, ey = wp.y - a.y, d = Math.hypot(ex, ey) || 1;
    const speed = a.maxSpeed * speedFactor(a.density) * (a.activity === 'wander' ? 0.6 : 1);
    dx = ex / d * speed; dy = ey / d * speed;
  }
  // [Task 6: alignment + personal space вставляются здесь]
  // [Task 7: рефлекс уступания вставляется здесь]
  const k = Math.min(1, a.agility * turnFactor(a.density) * dt);
  a.vx += (dx - a.vx) * k; a.vy += (dy - a.vy) * k;
  a.x += a.vx * dt; a.y += a.vy * dt;
}

export function resolveCollisions(world) {
  for (let it = 0; it < 2; it++) {
    for (const a of world.agents) {
      for (const b of a.neighbors) {
        if (b.id <= a.id) continue;
        const dx = b.x - a.x, dy = b.y - a.y;
        const d = Math.hypot(dx, dy), min = a.radius + b.radius;
        if (d > 1e-4 && d < min) {
          const push = min - d, tot = a.mass + b.mass, nx = dx / d, ny = dy / d;
          a.x -= nx * push * (b.mass / tot); a.y -= ny * push * (b.mass / tot);
          b.x += nx * push * (a.mass / tot); b.y += ny * push * (a.mass / tot);
          a.contact = b.contact = true;
        }
      }
    }
  }
}

export function pushOutOfWalls(a, walls) {
  for (const [x1, y1, x2, y2] of walls) {
    const wx = x2 - x1, wy = y2 - y1;
    const t = Math.max(0, Math.min(1, ((a.x - x1) * wx + (a.y - y1) * wy) / (wx * wx + wy * wy)));
    const px = x1 + wx * t, py = y1 + wy * t;
    let dx = a.x - px, dy = a.y - py;
    const d = Math.hypot(dx, dy);
    if (d < a.radius) {
      if (d < 1e-4) { const l = Math.hypot(wy, wx) || 1; dx = wy / l; dy = -wx / l; }
      else { dx /= d; dy /= d; }
      a.x = px + dx * a.radius; a.y = py + dy * a.radius;
    }
  }
}
```

- [ ] **Step 3: Тест PBD — добавить в tests/run.js перед раннером**

```js
import { resolveCollisions, pushOutOfWalls } from '../src/sim/steering.js';

test('PBD: пересекающиеся кружки раздвигаются, тяжёлый сдвигается меньше', () => {
  const a = { id: 0, x: 0,   y: 0, radius: 0.3, mass: 1, neighbors: [] };
  const b = { id: 1, x: 0.3, y: 0, radius: 0.3, mass: 3, neighbors: [] };
  a.neighbors = [b]; b.neighbors = [a];
  resolveCollisions({ agents: [a, b] });
  const d = Math.hypot(b.x - a.x, b.y - a.y);
  assert.ok(d >= 0.59, 'разведены: ' + d);
  assert.ok(Math.abs(b.x - 0.3) < Math.abs(a.x - 0), 'тяжёлый сдвинулся меньше');
});

test('walls: агента выталкивает из стены', () => {
  const a = { x: 5, y: 0.1, radius: 0.3 };
  pushOutOfWalls(a, [[0, 0, 10, 0]]);
  assert.ok(Math.abs(a.y) >= 0.3 - 1e-9);
});
```

Run: `node tests/run.js` — Expected: оба новых теста FAIL до реализации (если steering.js уже написан в Step 2 — сразу ok; порядок шагов 2–3 допустимо поменять, главное — увидеть тесты зелёными).

- [ ] **Step 4: main.js — заспавнить толпу с временными случайными целями**

```js
import { makeAgent } from './sim/agent.js';
import { SpatialHash } from './sim/spatialHash.js';
import { simTick } from './sim/steering.js';
// в world добавить: hash: new SpatialHash(1),
// после создания world:
for (let i = 0; i < T.agentCount; i++) {
  const a = makeAgent(world, i);
  const z = world.map.zones[(Math.random() * world.map.zones.length) | 0].rect;
  a.target = { x: z[0] + Math.random() * z[2], y: z[1] + Math.random() * z[3] }; // ВРЕМЕННО, уберётся в Task 5
  world.agents.push(a);
}
// удалить локальную заглушку simTick
```

- [ ] **Step 5: Проверки**

Run: `node tests/run.js` — Expected: 3 ok, exit 0.
Браузер: 400 кружков расползаются из входа по карте, **толкутся в дверях** (видна арка/затор у входа), сквозь стены не проходят. FPS стабильный (для проверки можно временно вывести `1/dtFrame` в title).

- [ ] **Step 6: Commit** — `git add -A && git commit -m "feat: agents, steering seek, PBD collisions, walls - crowd on screen"`

---

### Task 5: Поиск пути по убеждениям (TDD) + цепочки вейпоинтов

**Files:**
- Create: `src/sim/pathfinding.js`
- Modify: `src/sim/steering.js`, `src/main.js`, `tests/run.js`

Заметка: граф ~14 узлов — Дейкстра без эвристики, это «A* по спеке» с h=0.

- [ ] **Step 1: Тест в tests/run.js**

```js
import { findPath, nearestWaypoint } from '../src/sim/pathfinding.js';
import { MAP } from '../src/data/map.js';

function fullBeliefs() {
  const E = MAP.edges.length;
  return { edgeKnown: new Uint8Array(E).fill(1), edgePassable: new Uint8Array(E).fill(1), edgeCongestion: new Uint8Array(E) };
}

test('path: спавн → сцена идёт через холл', () => {
  const p = findPath(MAP, fullBeliefs(), 0, 13);
  assert.deepEqual(p.slice(0, 2), [0, 1]);
  assert.equal(p[p.length - 1], 13);
});

test('path: неизвестное ребро = пути нет', () => {
  const b = fullBeliefs();
  b.edgeKnown.fill(0);
  assert.equal(findPath(MAP, b, 0, 13), null);
});

test('path: закрытая южная дверь (e10) уводит через северную (e11)', () => {
  const b = fullBeliefs();
  b.edgePassable[10] = 0;
  const p = findPath(MAP, b, 0, 13);
  assert.ok(p.includes(12), 'идёт через wp12 (северная дверь): ' + p);
});

test('path: пробка на ребре делает обход выгодным', () => {
  const b = fullBeliefs();
  b.edgeCongestion[10] = 255; // южная дверь забита
  const p = findPath(MAP, b, 0, 13);
  assert.ok(p.includes(12), 'обход через север: ' + p);
});

test('nearestWaypoint: центр холла → wp3', () => {
  assert.equal(nearestWaypoint(MAP, 30, 20), 3);
});
```

Run: `node tests/run.js` — Expected: новые тесты FAIL.

- [ ] **Step 2: src/sim/pathfinding.js**

```js
export function nearestWaypoint(map, x, y) {
  let best = 0, bd = Infinity;
  map.waypoints.forEach((w, i) => {
    const d = (w.x - x) ** 2 + (w.y - y) ** 2;
    if (d < bd) { bd = d; best = i; }
  });
  return best;
}

// Дейкстра по убеждениям агента. Возвращает [wpId,...] или null.
export function findPath(map, beliefs, from, to) {
  const N = map.waypoints.length;
  const dist = new Array(N).fill(Infinity), prev = new Array(N).fill(-1), done = new Array(N).fill(false);
  dist[from] = 0;
  for (;;) {
    let u = -1, ud = Infinity;
    for (let i = 0; i < N; i++) if (!done[i] && dist[i] < ud) { u = i; ud = dist[i]; }
    if (u === -1) break;
    if (u === to) break;
    done[u] = true;
    for (const ei of map.adj[u]) {
      if (!beliefs.edgeKnown[ei] || !beliefs.edgePassable[ei]) continue;
      const e = map.edges[ei];
      const v = e.a === u ? e.b : e.a;
      const cost = e.len * (1 + 0.02 * beliefs.edgeCongestion[ei]); // congestion 0..255
      if (dist[u] + cost < dist[v]) { dist[v] = dist[u] + cost; prev[v] = u; }
    }
  }
  if (dist[to] === Infinity) return null;
  const path = [];
  for (let v = to; v !== -1; v = prev[v]) path.unshift(v);
  return path;
}
```

- [ ] **Step 3: Run `node tests/run.js`** — Expected: все ok.

- [ ] **Step 4: steering.js — заменить currentTarget на цепочку вейпоинтов**

```js
export function currentTarget(a, world) {
  if (a.path && a.pathI < a.path.length) {
    const wp = world.map.waypoints[a.path[a.pathI]];
    if (Math.hypot(wp.x - a.x, wp.y - a.y) < 1.2) { a.pathI++; return currentTarget(a, world); }
    return wp;
  }
  return a.target; // финальная точка (POI) после конца цепочки
}
```

- [ ] **Step 5: main.js — временные цели теперь через пути**

Заменить блок временных целей (Task 4 Step 4) на:

```js
import { findPath, nearestWaypoint } from './sim/pathfinding.js';
// ... в цикле спавна:
const a = makeAgent(world, i);
const poiKeys = Object.keys(world.map.pois);
const poi = world.map.pois[poiKeys[(Math.random() * poiKeys.length) | 0]];
const full = { edgeKnown: new Uint8Array(world.map.edges.length).fill(1),
               edgePassable: new Uint8Array(world.map.edges.length).fill(1),
               edgeCongestion: new Uint8Array(world.map.edges.length) }; // ВРЕМЕННО до Task 8
a.path = findPath(world.map, full, nearestWaypoint(world.map, a.x, a.y), poi.wp) || [];
a.pathI = 0;
const wpt = world.map.waypoints[poi.wp];
a.target = { x: wpt.x + (Math.random() - 0.5) * 3, y: wpt.y + (Math.random() - 0.5) * 3 };
world.agents.push(a);
```

- [ ] **Step 6: Проверка в браузере** — агенты идут по коридорам через двери (не по прямой в стену), у дверей мерча/фуда заторы.

- [ ] **Step 7: Commit** — `git add -A && git commit -m "feat: belief-based dijkstra pathfinding, waypoint chains"`

---

### Task 6: Плотность душит, толпа несёт, личная зона, стресс

**Files:**
- Modify: `src/sim/steering.js`

- [ ] **Step 1: Вставить в stepAgent после блока seek (метка Task 6)**

```js
  // течение с толпой
  if (a.density >= T.alignmentThreshold) {
    let avx = 0, avy = 0, n = 0;
    for (const b of a.neighbors) if (b !== a) { avx += b.vx; avy += b.vy; n++; }
    if (n) {
      const w = Math.min(0.8, a.conformity * a.density / T.jamN);
      dx = dx * (1 - w) + (avx / n) * w;
      dy = dy * (1 - w) + (avy / n) * w;
    }
  }
  // личная зона
  for (const b of a.neighbors) if (b !== a) {
    const ox = a.x - b.x, oy = a.y - b.y, d = Math.hypot(ox, oy);
    const want = a.personalSpace + a.radius + b.radius;
    if (d > 1e-3 && d < want) {
      const f = T.personalSpaceForce * (1 - d / want);
      dx += ox / d * f; dy += oy / d * f;
    }
  }
```

- [ ] **Step 2: Стресс — добавить функцию и вызов в simTick (после pushOutOfWalls)**

```js
function updateStress(world, dt) {
  for (const a of world.agents) {
    let ds = -T.stressDecay;
    ds += T.stressFromDensity * Math.max(0, a.density - T.comfortN);
    if (a.contact) ds += T.stressFromContact;
    // «не могу продвинуться»
    const moving = Math.hypot(a.vx, a.vy);
    if (a.activity === 'goto' && moving < 0.2 * a.maxSpeed) a.blockedTime += dt;
    else a.blockedTime = 0;
    if (a.blockedTime > T.blockedStressAfter) ds += T.blockedStressRate;
    a.stress = Math.max(0, Math.min(100, a.stress + ds * dt));
  }
}
// в simTick: updateStress(world, dt);
```

- [ ] **Step 3: Проверка в браузере** — в заторе у двери: толпа замедляется (не вибрирует), отдельных проносит мимо двери и они возвращаются; редкие агенты держат вокруг себя пустоту; у застрявших появляется белая пульсирующая обводка (стресс).

- [ ] **Step 4: Commit** — `git add -A && git commit -m "feat: density effects, crowd flow, personal space, stress"`

---

### Task 7: Рефлекс уступания

**Files:**
- Modify: `src/sim/steering.js`

- [ ] **Step 1: Вставить в stepAgent (метка Task 7), после личной зоны**

```js
  // уступание: TTC < 1с и чужой приоритет выше — шаг вбок + сброс скорости
  if (a.perception > 0) {
    for (const b of a.neighbors) {
      if (b === a) continue;
      const rx = b.x - a.x, ry = b.y - a.y;
      const rvx = b.vx - a.vx, rvy = b.vy - a.vy;
      const closing = -(rx * rvx + ry * rvy);
      if (closing <= 0) continue;
      const d = Math.hypot(rx, ry);
      const ttc = d / (closing / d);
      if (ttc < 1) {
        const myP = a.mass * Math.hypot(a.vx, a.vy) * (a.activity === 'goto' ? 1.5 : 1);
        const theirP = b.mass * Math.hypot(b.vx, b.vy) * (b.activity === 'goto' ? 1.5 : 1);
        if (theirP > myP * (2 - a.politeness)) {
          dx += -ry / d * 1.5;  // перпендикуляр от его курса
          dy +=  rx / d * 1.5;
          dx *= 0.5; dy *= 0.5;
          break;
        }
      }
    }
  }
```

- [ ] **Step 2: Проверка** — во встречных потоках видны боковые шаги; два «грубых» (politeness≈0) могут застрять лоб в лоб и собрать пробку — это фича.

- [ ] **Step 3: Commit** — `git add -A && git commit -m "feat: yield reflex with priority and politeness"`

---

### Task 8: Слой знания: правда, убеждения, глаза, осмос, цвет

**Files:**
- Create: `src/sim/knowledge.js`
- Modify: `src/sim/agent.js`, `src/sim/steering.js`, `src/main.js`, `src/render/draw.js`

- [ ] **Step 1: src/sim/knowledge.js**

```js
import { T, gameClock } from '../data/tuning.js';

export function makeWorldFacts() {
  return {
    concert: { time: 14 * 3600, place: 'stage', status: 'on', changedAt: 0 },
    doorS:   { open: true, changedAt: 0 },   // южная дверь сцены = ребро e10
  };
}

export function makeBeliefs(map, mapKnown) {
  const E = map.edges.length;
  const known = new Uint8Array(E), passable = new Uint8Array(E).fill(1), congestion = new Uint8Array(E);
  for (let i = 0; i < E; i++) known[i] = Math.random() < mapKnown ? 1 : 0;
  known[0] = known[1] = 1; // вход знают все
  return {
    edgeKnown: known, edgePassable: passable, edgeCongestion: congestion,
    events: { concert: { time: 14 * 3600, place: 'stage', status: 'on', learnedAt: 0 } },
  };
}

// правда о загрузке рёбер, пересчёт ~раз в секунду
export function updateEdgeCongestion(world) {
  world.map.edges.forEach((e, i) => {
    const n = world.hash.queryCircle(e.mid.x, e.mid.y, 2).length;
    world.edgeCongestion[i] = Math.min(255, n * 20);
  });
}

// глаза: рёбра в радиусе видимости — узнаю правду
export function eyesUpdate(a, world) {
  const B = a.beliefs;
  world.map.edges.forEach((e, i) => {
    if ((e.mid.x - a.x) ** 2 + (e.mid.y - a.y) ** 2 < T.sightRadius ** 2) {
      B.edgeKnown[i] = 1;
      B.edgePassable[i] = world.edgePassable[i];
      B.edgeCongestion[i] = world.edgeCongestion[i];
    }
  });
}

// осмос: шанс перенять более свежий факт у случайного соседа, с мутацией
export function osmosis(a, world) {
  if (a.neighbors.length < 2 || Math.random() > T.osmosisChance * a.neighbors.length) return;
  const b = a.neighbors[(Math.random() * a.neighbors.length) | 0];
  if (b === a || !b.beliefs) return;
  const mine = a.beliefs.events.concert, theirs = b.beliefs.events.concert;
  if (theirs.learnedAt > mine.learnedAt) {
    a.beliefs.events.concert = { ...theirs };
    if (Math.random() < T.rumorMutation) { // слух искажается на ступень
      const m = a.beliefs.events.concert;
      if (Math.random() < 0.5) m.time += 600; else m.status = 'cancelled';
    }
  }
}

// табло: вещание правды всем видящим в радиусе
export function boardBroadcast(world, board, applyFn) {
  world.flashes.push({ x: board.x, y: board.y, t: world.t });
  for (const a of world.hash.queryCircle(board.x, board.y, T.boardRadius)) {
    if (a.perception > 0 && a.beliefs) applyFn(a, world);
  }
}

// отставание знания агента от правды (для цвета), в реальных секундах
export function knowledgeLag(a, world) {
  const f = world.facts.concert, b = a.beliefs.events.concert;
  const stale = f.time !== b.time || f.place !== b.place || f.status !== b.status;
  return stale ? world.t - f.changedAt : 0;
}
```

- [ ] **Step 2: agent.js — подключить beliefs**

В `makeAgent` заменить `beliefs: null` на:

```js
    beliefs: makeBeliefs(world.map, p.mapKnown),
```

и добавить импорт `import { makeBeliefs } from './knowledge.js';`

- [ ] **Step 3: steering.js — вызовы знания в simTick**

```js
import { updateEdgeCongestion, eyesUpdate, osmosis } from './knowledge.js';
// в world нужен счётчик: в main.js world.congTimer = 0;
// в simTick после rebuild:
  world.congTimer -= dt;
  if (world.congTimer <= 0) { world.congTimer = 1; updateEdgeCongestion(world); }
// в цикле по агентам (после density):
  if (a.perception > 0) eyesUpdate(a, world);
  osmosis(a, world);
```

- [ ] **Step 4: main.js — правда мира**

```js
import { makeWorldFacts } from './sim/knowledge.js';
// в world: facts: makeWorldFacts(), edgePassable: new Uint8Array(MAP.edges.length).fill(1),
//          edgeCongestion: new Uint8Array(MAP.edges.length), congTimer: 0,
```

Убрать временный `full`-beliefs из спавна (Task 5 Step 5) — теперь путь по СВОИМ убеждениям:

```js
a.path = findPath(world.map, a.beliefs, nearestWaypoint(world.map, a.x, a.y), poi.wp) || [];
```

- [ ] **Step 5: draw.js — цвет = возраст знания**

Заменить `agentColor`:

```js
import { knowledgeLag } from '../sim/knowledge.js';
export function agentColor(a, world) {
  if (world.t < a.deceivedUntil) return '#b06ee8';            // обманутый — фиолетовый
  const lag = Math.min(1, knowledgeLag(a, world) / T.lagRed); // 0 зел → 1 красн
  const r = Math.round(80 + 175 * lag), g = Math.round(200 - 140 * lag);
  return `rgb(${r},${g},80)`;
}
```

- [ ] **Step 6: Проверка** — все зелёные (правда ещё не менялась). Временно в консоли браузера: `world.facts.concert.time = 14.5*3600; world.facts.concert.changedAt = world.t` (для этого в main.js: `window.world = world`) — толпа за `lagRed` секунд краснеет; агенты возле друг друга... остаются красными (осмосу нечего нести — никто не узнал правду). Это корректно: правда приходит только с табло/глазами.

- [ ] **Step 7: Commit** — `git add -A && git commit -m "feat: knowledge layer - truth, beliefs, eyes, osmosis, knowledge-age color"`

---

### Task 9: Utility-мозг: GoTo / Wander / Phone / Rest

**Files:**
- Modify: `src/sim/agent.js`, `src/sim/steering.js`

- [ ] **Step 1: agent.js — нужды и think()**

```js
import { T, gameClock } from '../data/tuning.js';
import { findPath, nearestWaypoint } from './pathfinding.js';

export function setGoal(a, world, poiKey) {
  const poi = world.map.pois[poiKey];
  const from = nearestWaypoint(world.map, a.x, a.y);
  const p = findPath(world.map, a.beliefs, from, poi.wp);
  if (!p) return false;
  a.path = p; a.pathI = 0;
  const wpt = world.map.waypoints[poi.wp];
  a.target = { x: wpt.x + (Math.random() - 0.5) * 3, y: wpt.y + (Math.random() - 0.5) * 3, poi: poiKey };
  return true;
}

function inZone(a, world, zoneId) {
  const z = world.map.zones.find(z => z.id === zoneId).rect;
  return a.x >= z[0] && a.x <= z[0] + z[2] && a.y >= z[1] && a.y <= z[1] + z[3];
}

export function think(a, world) {
  const dt = T.utilityTickEvery;
  // нужды
  const moving = Math.hypot(a.vx, a.vy) > 0.3;
  a.fatigue  = Math.min(100, a.fatigue + (moving ? T.fatigueRate : -T.fatigueRate) * dt);
  a.boredom  = Math.min(100, a.boredom + (a.activity === 'wander' || a.activity === 'rest' ? T.boredomRate : -T.boredomRate) * dt);
  a.phoneItch = Math.min(100, a.phoneItch + (a.activity === 'phone' ? -8 : T.phoneItchRate) * dt);

  // utility GoTo: срочность концерта по МОЕМУ убеждению
  const bel = a.beliefs.events.concert;
  let goto_ = 0;
  if (a.wantsConcert && bel.status === 'on' && !inZone(a, world, bel.place)) {
    const left = bel.time - gameClock(world.t); // игровых секунд до начала
    goto_ = Math.max(0, Math.min(1.5, 1.5 * (1 - left / 1800)));
  }
  const u = {
    goto: a.weights[0] * goto_,
    wander: a.weights[1] * (0.3 + a.boredom / 200),
    phone: a.weights[2] * (a.phoneItch / 100),
    rest: a.weights[3] * ((a.fatigue + a.stress * 0.7) / 120),
  };
  if (u[a.activity] !== undefined) u[a.activity] *= T.hysteresis;

  let best = 'wander', bv = -1;
  for (const k in u) if (u[k] > bv) { bv = u[k]; best = k; }

  if (best === a.activity && a.path.length) return;
  switch (best) {
    case 'goto':
      if (!setGoal(a, world, bel.place)) { enterLost(a, world); return; } // enterLost — Task 10
      break;
    case 'wander': {
      const keys = Object.keys(world.map.pois);
      setGoal(a, world, keys[(Math.random() * keys.length) | 0]);
      // гуляние = изучение карты: пройденные рёбра пометит eyesUpdate по пути
      break;
    }
    case 'phone':
      a.path = []; a.target = null; break; // стоит; perception отключим ниже
    case 'rest': {
      // ближайшая спокойная зона = chill POI
      setGoal(a, world, 'chill');
      break;
    }
  }
  a.activity = best;
  a.perception = best === 'phone' ? 0 : 1;
}

export function enterLost(a, world) {} // заглушка, Task 10
```

- [ ] **Step 2: steering.js — вызывать think по сдвинутым фазам; phone-модификаторы**

В цикле агентов simTick:

```js
import { think } from './agent.js';
// после eyesUpdate/osmosis:
  a.nextThink -= dt;
  if (a.nextThink <= 0) { a.nextThink = T.utilityTickEvery; think(a, world); }
```

В stepAgent учесть phone (conformity ×2, ползёт):

```js
// заменить строку speed = ... на:
    let mods = 1;
    if (a.activity === 'wander') mods = 0.6;
    if (a.activity === 'phone') mods = 0.15;
    const speed = a.maxSpeed * speedFactor(a.density) * mods;
// в блоке alignment заменить вес:
      const conf = a.activity === 'phone' ? a.conformity * 2 : a.conformity;
      const w = Math.min(0.8, conf * a.density / T.jamN);
```

В main.js удалить временный блок целей при спавне (пути теперь раздаёт think): оставить только `world.agents.push(makeAgent(world, i))`.

- [ ] **Step 3: Проверка** — зомби стоят с голубым «телефоном» и их сносит потоком; гуляки бродят между POI; уставшие стягиваются в чилл-зону; rest-агенты потом снова уходят. Через 30–60 сек должна начаться миграция планировщиков к сцене (концерт в 14:00 приближается).

- [ ] **Step 4: Commit** — `git add -A && git commit -m "feat: utility brain - goto/wander/phone/rest with needs"`

---

### Task 10: Lost: вход, четыре выхода, каскад

**Files:**
- Modify: `src/sim/agent.js`

- [ ] **Step 1: Реализовать enterLost + ветку в think**

Заменить заглушку:

```js
export function enterLost(a, world) {
  a.activity = 'lost';
  a.path = []; a.target = null;
  a.lostSince = world.t;
  a.stress = Math.min(100, a.stress + T.lostStressSpike);
  for (const b of a.neighbors) if (b !== a && b.stress !== undefined)
    b.stress = Math.min(100, b.stress + T.lostNeighborStress); // паника заразна
  a.phoneDoneAt = world.t + T.phoneMapBase * (1 + T.phoneMapDensityK * a.density); // плотность = перегруз WiFi
}
```

В начало `think()` (до расчёта нужд добавить обработку lost):

```js
  if (a.activity === 'lost') {
    // 1) вижу табло — мгновенно
    for (const brd of world.map.boards) {
      if ((brd.x - a.x) ** 2 + (brd.y - a.y) ** 2 < T.sightRadius ** 2) {
        for (let i = 0; i < world.map.edges.length; i++) a.beliefs.edgeKnown[i] = 1;
        a.activity = 'wander'; return;
      }
    }
    // 2) сосед-знаток: у него известных рёбер больше
    for (const b of a.neighbors) {
      if (b !== a && b.beliefs && b.activity !== 'phone' &&
          countKnown(b.beliefs) > countKnown(a.beliefs) + 3) {
        for (let i = 0; i < world.map.edges.length; i++)
          if (b.beliefs.edgeKnown[i]) { a.beliefs.edgeKnown[i] = 1; a.beliefs.edgePassable[i] = b.beliefs.edgePassable[i]; }
        a.activity = 'wander'; return;
      }
    }
    // 3) скачал карту (медленнее в толпе)
    if (world.t >= a.phoneDoneAt) {
      for (let i = 0; i < world.map.edges.length; i++) { a.beliefs.edgeKnown[i] = 1; a.beliefs.edgePassable[i] = world.edgePassable[i]; }
      a.activity = 'wander'; return;
    }
    // 4) таймаут — плюнул
    if (world.t - a.lostSince > T.lostTimeout) { a.wantsConcert = false; a.activity = 'wander'; return; }
    return; // стоит на месте, тело собирает пробку само
  }
  function countKnown(B) { let n = 0; for (const k of B.edgeKnown) n += k; return n; }
```

(вынести `countKnown` на уровень модуля, не внутрь think).

- [ ] **Step 2: Обман ожиданий — прибытие к недоступной цели**

В `think`, в utility GoTo: если believed place достигнут, а правда другая — уже покрыто eyes (passable обновится и path пересчитается). Явный случай «пришёл, а концерт отменён»: в начале think после lost-блока:

```js
  const f = world.facts.concert, belC = a.beliefs.events.concert;
  if (a.activity === 'goto' && inZone(a, world, belC.place) &&
      (f.status !== belC.status || f.time !== belC.time)) {
    a.beliefs.events.concert = { ...f, learnedAt: world.t }; // узнал глазами
    a.deceivedUntil = world.t + 15;
    a.stress = Math.min(100, a.stress + 25);
    a.activity = 'wander'; a.path = [];
  }
```

- [ ] **Step 3: Проверка** — у зомби (mapKnown 0.3) при попытке goto к сцене часто нет пути → «?!» жёлтые маркеры в холле, вокруг них уплотнение; через секунды они отмирают (табло/сосед/телефон). В плотной толпе Lost живёт дольше (телефон не грузит).

- [ ] **Step 4: Commit** — `git add -A && git commit -m "feat: lost state with four recovery channels and stress cascade"`

---

### Task 11: Табло: клик, карточки, вещание

**Files:**
- Create: `src/data/messages.js`, `src/ui/boards.js`
- Modify: `src/main.js`

- [ ] **Step 1: src/data/messages.js**

```js
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
```

- [ ] **Step 2: src/ui/boards.js**

```js
import { T } from '../data/tuning.js';
import { boardBroadcast } from '../sim/knowledge.js';
import { messagesFor } from '../data/messages.js';

export function initBoards(canvas, world) {
  const cardsEl = document.getElementById('cards');
  canvas.addEventListener('click', e => {
    const r = canvas.getBoundingClientRect();
    const mx = (e.clientX - r.left) / T.pxPerMeter, my = (e.clientY - r.top) / T.pxPerMeter;
    const board = world.map.boards.find(b => Math.hypot(b.x - mx, b.y - my) < 2);
    cardsEl.style.display = 'none'; cardsEl.innerHTML = '';
    if (!board) return;
    cardsEl.style.left = e.clientX + 'px'; cardsEl.style.top = e.clientY + 'px';
    cardsEl.style.display = 'flex';
    for (const msg of messagesFor(world)) {
      const btn = document.createElement('button');
      btn.textContent = msg.label;
      btn.onclick = () => { boardBroadcast(world, board, msg.apply); cardsEl.style.display = 'none'; };
      cardsEl.appendChild(btn);
    }
  });
}
```

- [ ] **Step 3: main.js** — `import { initBoards } from './ui/boards.js'; initBoards(canvas, world);`

- [ ] **Step 4: Проверка** — клик по синему квадрату → 3 карточки → выбор → зелёное кольцо-вспышка; в консоли поменять правду (`world.facts.concert.time += 1800; world.facts.concert.changedAt = world.t`) → толпа краснеет → карточка №1 у табло лечит зелёным пятном, и зелень переносится осмосом дальше.

- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat: clickable boards with message cards and broadcast"`

---

### Task 12: Расписание дня + HUD

**Files:**
- Create: `src/data/schedule.js`, `src/ui/hud.js`
- Modify: `src/main.js`, `src/sim/agent.js`

- [ ] **Step 1: src/data/schedule.js**

```js
import { T } from './tuning.js';
import { makeAgent } from '../sim/agent.js';

const h = (hh, mm) => ((hh - 13) * 3600 + mm * 60) / T.timeScale; // игровое время → world.t

export const SCHEDULE = [
  { at: h(13, 10), name: 'Поезд: +120 человек', fire(world) {
      for (let i = 0; i < 120; i++) world.agents.push(makeAgent(world, world.agents.length));
  }},
  { at: h(13, 40), name: 'Южная дверь сцены закрыта', fire(world) {
      world.edgePassable[10] = 0;
      world.facts.doorS = { open: false, changedAt: world.t };
  }},
  { at: h(14, 0), name: 'Концерт начался', fire(world) {
      world.facts.concert = { ...world.facts.concert, status: 'started', changedAt: world.t };
  }},
];

export function tickSchedule(world) {
  for (const ev of SCHEDULE) {
    if (!ev.done && world.t >= ev.at) { ev.done = true; ev.fire(world); world.banner = { text: ev.name, t: world.t }; }
  }
}
```

В agent.js, utility GoTo: считать концерт целью и при `status === 'started'` (опоздавшие бегут), но не при `'cancelled'`:

```js
  if (a.wantsConcert && (bel.status === 'on' || bel.status === 'started') && !inZone(a, world, bel.place)) {
```

- [ ] **Step 2: src/ui/hud.js**

```js
import { T, gameClock, fmtClock } from '../data/tuning.js';

export function drawHud(ctx, world) {
  // часы
  ctx.fillStyle = '#fff'; ctx.font = 'bold 18px monospace';
  ctx.fillText(fmtClock(gameClock(world.t)), 12, 26);
  // средний стресс
  const avg = world.agents.reduce((s, a) => s + a.stress, 0) / (world.agents.length || 1);
  ctx.fillStyle = '#333'; ctx.fillRect(100, 12, 200, 14);
  ctx.fillStyle = avg > 60 ? '#e55' : avg > 30 ? '#ea3' : '#5c5';
  ctx.fillRect(100, 12, 2 * avg, 14);
  ctx.fillStyle = '#fff'; ctx.font = '11px monospace';
  ctx.fillText('стресс ' + avg.toFixed(0), 105, 23);
  // баннер события
  if (world.banner && world.t - world.banner.t < 4) {
    ctx.font = 'bold 16px monospace'; ctx.fillStyle = '#ffd34d';
    ctx.fillText(world.banner.text, 340, 26);
  }
}
```

- [ ] **Step 3: main.js**

```js
import { tickSchedule } from './data/schedule.js';
import { drawHud } from './ui/hud.js';
// в sim-цикле перед simTick: tickSchedule(world);
// в render после draw: drawHud(ctx, world);
```

- [ ] **Step 4: Проверка полной партии (≈3 мин)** — 13:10 вливается поезд (вход пухнет); к 13:40 миграция к сцене + баннер о двери; не предупреждённые табло ломятся в южную дверь, утыкаются, краснеют/обходят; 14:00 концерт. Полоска стресса дышит и реагирует на табло.

- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat: day schedule (train, door closure, concert) and HUD"`

---

### Task 13: Дебаг-оверлей + приёмка по спеке

**Files:**
- Create: `src/render/debug.js`
- Modify: `src/main.js`

- [ ] **Step 1: src/render/debug.js**

```js
import { T } from '../data/tuning.js';
const S = T.pxPerMeter;

export function drawDebug(ctx, world) {
  // тепло плотности
  for (const a of world.agents) {
    if (a.density > T.comfortN) {
      ctx.fillStyle = `rgba(255,60,30,${Math.min(0.25, (a.density - T.comfortN) * 0.03)})`;
      ctx.beginPath(); ctx.arc(a.x * S, a.y * S, T.densityRadius * S, 0, 7); ctx.fill();
    }
  }
  // граф: рёбра по правде загрузки
  world.map.edges.forEach((e, i) => {
    const wa = world.map.waypoints[e.a], wb = world.map.waypoints[e.b];
    const c = world.edgeCongestion[i];
    ctx.strokeStyle = world.edgePassable[i] ? `rgba(${c},${255 - c},120,0.7)` : 'rgba(255,0,0,0.9)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(wa.x * S, wa.y * S); ctx.lineTo(wb.x * S, wb.y * S); ctx.stroke();
  });
  world.map.waypoints.forEach((w, i) => {
    ctx.fillStyle = '#fff'; ctx.font = '9px monospace'; ctx.fillText(String(i), w.x * S + 3, w.y * S - 3);
  });
  // вектора скоростей
  ctx.strokeStyle = 'rgba(120,180,255,0.5)';
  for (const a of world.agents) {
    ctx.beginPath(); ctx.moveTo(a.x * S, a.y * S); ctx.lineTo((a.x + a.vx) * S, (a.y + a.vy) * S); ctx.stroke();
  }
}
```

main.js: `import { drawDebug } from './render/debug.js';` и в render: `if (world.debug) drawDebug(ctx, world);`

- [ ] **Step 2: Приёмка по спеке §8 (вся партия с нуля, секундомер 3 мин)**

1. Толпа 400+ течёт, в дверях честные заторы — да/нет.
2. Миграция к сцене к 14:00; волна цвета от табло и осмосом — да/нет.
3. Клик → карточка → вспышка → потоки меняются (особенно карточка про южную дверь после 13:40) — да/нет.
4. Хотя бы один Lost устроил пробку и она рассосалась/переросла — да/нет.
5. Полоска стресса реагирует на действия — да/нет.

Если пункт «нет» — крутить ТОЛЬКО `tuning.js` (это и есть балансировка), не код.

- [ ] **Step 3: Run `node tests/run.js`** — Expected: все ok (регрессий нет).

- [ ] **Step 4: Финальный коммит** — `git add -A && git commit -m "feat: debug overlay; prototype acceptance vs spec"`

---

## Покрытие спеки

| Спека | Таск |
|---|---|
| §2 движок (силы, PBD, стены, плотность, стресс) | 4, 6 |
| §2 рефлекс уступания | 7 |
| §3 utility-мозг, 4 активности, гистерезис, фазы | 9 |
| §3/§4.4 Lost + каскад + WiFi-через-плотность | 10 |
| §4.1 карта-убеждения, Дейкстра по убеждениям, обход пробок | 5, 8 |
| §4.2 личная программа (wantsConcert, спектр mapKnown) | 4, 9 |
| §4.3 осмос + мутация слухов | 8 |
| §4 каналы: табло/осмос/глаза, обманутые (фиолетовый) | 8, 10, 11 |
| §5 карта, расписание, сообщения в данных | 2, 11, 12 |
| §6 цвет двухканальный, вспышки, HUD, дебаг-оверлей | 2, 8, 12, 13 |
| §7 структура файлов | все |
| §8 критерии готовности | 13 |

Вне среза (по спеке §1): доверие, волонтёры, глобальные объявления, отчёт-история — не реализуются.

# Crowd v4 «Хайп и сарафан» Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Реализовать спеку v4 (docs/superpowers/specs/2026-06-13-crowd-v4-attractions-design.md): whisker-навигация, аттракционы бутики+эвенты (хайп×качество), частичное знание эвентов, радость, таймлайн, слухи/приколы, мобильный волонтёр, лидеры групп, драг всех, lost-на-барьере, легенда/дебаг/баланс.

**Architecture:** Чистые JS-модули (sim/ без DOM), баланс в src/data/tuning.js. Единичный концерт-беляф v3 (`facts.concert` / `beliefs.events.concert`) заменяется на множество эвентов: `world.events` (истина, виден организатору) + `a.beliefs.knownEvents` (Set id, частичное знание) + `a.beliefs.eventTime` (поверенное время для устаревания). Блоки карты становятся бутиками-POI с осями `hype`(=weight) и `quality`(скрытая дельта радости). Новая метрика `a.joy`. Target-seek получает локальный обход препятствий (whisker).

**Tech Stack:** Vanilla JS (ES modules), Canvas 2D, node:assert (`node tests/run.js`). Браузер цел только после Task 16; гейт каждой задачи — node-тесты зелёные.

**ВАЖНО:** ветка `proto`. HEAD на старте — b32d0b5 (v3 завершён, 21/21). Между задачами браузер может быть нерабочим; гейт = `node tests/run.js`.

---

### Task 1: tuning v4, метрика радости, баланс, экстраверт-релиф

**Files:**
- Modify: `src/data/tuning.js`
- Modify: `src/sim/agent.js` (makeAgent: joy + новые поля; bigChance из tuning)
- Modify: `src/sim/knowledge.js` (makeBeliefs: knownEvents/eventTime)
- Modify: `src/sim/steering.js` (updateStress: дрейф joy)
- Modify: `src/sim/dialogue.js` (finishTalk: экстраверт-релиф + joy)
- Test: `tests/run.js`

- [ ] **Step 1: Падающие тесты**

Добавить в tests/run.js (рядом с импортами уже есть makeAgent):

```js
test('joy: дрейф к базису сверху, снизу не падает сам', () => {
  const world = { t: 0, map: MAP, agents: [], hash: new SpatialHash(1),
    facts: makeWorldFacts(), fields: new Fields(MAP), obstMask: 0, events: [] };
  const a = makeAgent(world, 1);
  a.joy = 80; updateNeedsJoy(a, 1); assert.ok(a.joy < 80 && a.joy >= 35, 'сполз к базису: ' + a.joy);
  a.joy = 20; updateNeedsJoy(a, 1); assert.equal(a.joy, 20, 'ниже базиса сам не падает');
});

test('экстраверт: болтовня снимает стресс и растит joy, замкнутому — нет', () => {
  const mk = ps => ({ id: ps, kind: 'visitor', x: 0, y: 0, personalSpace: ps, stress: 50, joy: 50,
    boredom: 50, activity: 'talk', talkWith: -1, talkWalk: false, perception: 1,
    beliefs: { knownPois: new Set(), jamMarks: [], knownEvents: new Set(), eventTime: {},
      events: { concert: { time: 1, place: 'stage', status: 'on', learnedAt: 0 } } }, obstMask: 0 });
  const ext = mk(0.5), intr = mk(1.2);
  const world = { t: 100, agents: [ext, intr], hash: { queryCircle: () => [] }, flashes: [],
    volunteers: [], map: { pois: {} }, obstMask: 0, talksFinished: 0 };
  finishTalk(world, ext, undefined);
  finishTalk(world, intr, undefined);
  assert.ok(ext.stress < 50 && ext.joy > 50, 'экстраверт повеселел');
  assert.equal(intr.stress, 50, 'замкнутому болтовня стресс не снимает');
});
```

Импорт `updateNeedsJoy` и `finishTalk` сверху run.js (finishTalk не экспортируется — экспортировать в Step 4). Run: `node tests/run.js` — FAIL.

- [ ] **Step 2: tuning.js — добавить/изменить константы**

В объект `T` добавить (и ИЗМЕНИТЬ перечисленные):

```js
  // баланс v4
  wallRepel: 2.1,            // было 3.0 (−30%)
  bigChance: 0.036,          // было 0.06 (−40% толстых)
  // радость
  joyStart: 50, joyJitter: 10, joyBaseline: 35, joyDecay: 0.5,
  // экстраверт
  extrovertSpace: 0.7, talkRelief: 8, talkJoy: 6,
  // навигация
  whiskerLen: 1.6,
  // аттракционы/эвенты
  evangelistTime: 30, eventBonus: 15, eventKnowChance: 0.35,
  rescheduleEvery: 45, rescheduleJitter: 15,
  // фейк-ажиотаж
  lureTtl: 20, lureInjectCount: 20, lureRadius: 2, lureJoyHit: 12, lureStress: 5,
  // волонтёр-NPC и лидеры
  volRelief: 6, leaderGroupSize: 5,
  // драг
  dragCooldown: 10,
```

Изменить существующие значения: `wallRepel` (если уже есть — заменить на 2.1), `incidentDensity: 12` → `10`. Оставить `volunteerRadius: 6`, `volunteerMax: 2`.

- [ ] **Step 3: agent.js — makeAgent поля + bigChance**

Заменить `const big = Math.random() < 0.06;` на `const big = Math.random() < T.bigChance;`.
В возвращаемый объект makeAgent добавить:

```js
    joy: T.joyStart + Math.random() * T.joyJitter,
    attendedEvents: new Set(),
    evangelBooth: null, evangelistUntil: 0, complainBooth: null, complainUntil: 0,
    lureTarget: null,
```

- [ ] **Step 4: knowledge.js — makeBeliefs knownEvents/eventTime**

В `makeBeliefs(world, mapKnown)` перед `return` добавить наполнение известных эвентов:

```js
  const knownEvents = new Set(), eventTime = {};
  for (const ev of (world.events ?? [])) {
    if (Math.random() < T.eventKnowChance) { knownEvents.add(ev.id); eventTime[ev.id] = ev.time; }
  }
```

и в возвращаемый объект добавить `knownEvents, eventTime,` (рядом с knownPois). НЕ удалять пока `events: { concert: {...} }` — это снимет Task 5.

- [ ] **Step 5: steering.js — дрейф joy (updateNeedsJoy)**

Добавить экспортируемую функцию и звать её в updateStress по каждому агенту:

```js
export function updateNeedsJoy(a, dt) {
  if (a.joy > T.joyBaseline) a.joy = Math.max(T.joyBaseline, a.joy - T.joyDecay * dt);
  a.joy = Math.max(0, Math.min(100, a.joy));
}
```

В `updateStress`, в теле цикла по агентам (после dragged-guard) добавить `updateNeedsJoy(a, dt);`.

- [ ] **Step 6: dialogue.js — экстраверт-релиф + экспорт finishTalk**

Сделать `export function finishTalk(...)`. В конце finishTalk, в цикле `for (const x of peers)` после `x.boredom = Math.max(0, x.boredom - 25);` добавить:

```js
    if (x.personalSpace < T.extrovertSpace) {
      x.stress = Math.max(0, x.stress - T.talkRelief);
      x.joy = Math.min(100, (x.joy ?? 50) + T.talkJoy);
    }
```

- [ ] **Step 7: Тесты зелёные**

Run: `node tests/run.js` — PASS (старые + 2 новых).

- [ ] **Step 8: Commit**

```bash
git add src/data/tuning.js src/sim/agent.js src/sim/knowledge.js src/sim/steering.js src/sim/dialogue.js tests/run.js
git commit -m "feat(v4): joy metric + drift, extrovert talk relief, balance (repulsion/fat/incidents)"
```

---

### Task 2: Whisker-обход препятствий для target-seek

**Files:**
- Modify: `src/sim/steering.js`
- Test: `tests/run.js`

- [ ] **Step 1: Падающие тесты**

```js
import { segmentHitsRect, steerAround } from '../src/sim/steering.js';

test('segmentHitsRect: прямая сквозь прямоугольник и мимо', () => {
  const r = { x: 5, y: 0, w: 2, h: 10 };
  assert.ok(segmentHitsRect(0, 5, 1, 0, 8, r, 0.2), 'луч вправо пробивает стену');
  assert.ok(!segmentHitsRect(0, 5, 0, 1, 8, r, 0.2), 'луч вверх мимо');
});

test('steerAround: цель за стеной → направление повёрнуто в обход', () => {
  const world = { obstacles: [{ x: 5, y: 0, w: 2, h: 10 }] };
  const a = { x: 0, y: 5, radius: 0.3 };
  const out = steerAround(a, 1, 0, world);          // хочет прямо в стену
  assert.ok(Math.abs(out.x) + Math.abs(out.y) > 0, 'есть направление');
  assert.ok(!segmentHitsRect(a.x, a.y, out.x, out.y, 1.6, world.obstacles[0], a.radius),
    'итоговое направление не бьёт в стену');
});
```

Run: `node tests/run.js` — FAIL.

- [ ] **Step 2: Реализация в steering.js**

```js
export function segmentHitsRect(x, y, dx, dy, len, r, pad) {
  const ex = r.x - pad, ey = r.y - pad, ew = r.w + 2 * pad, eh = r.h + 2 * pad; // расширенный rect
  // параметрический отрезок (x,y)+(dx,dy)*t, t∈[0,len]; slab-тест
  let t0 = 0, t1 = len;
  for (const [p, q, lo, hi] of [[dx, x, ex, ex + ew], [dy, y, ey, ey + eh]]) {
    if (Math.abs(p) < 1e-9) { if (q < lo || q > hi) return false; continue; }
    let a = (lo - q) / p, b = (hi - q) / p; if (a > b) [a, b] = [b, a];
    t0 = Math.max(t0, a); t1 = Math.min(t1, b);
    if (t0 > t1) return false;
  }
  return t1 >= 0 && t0 <= len;
}

export function steerAround(a, dx, dy, world) {
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) return { x: dx, y: dy };
  let ux = dx / len, uy = dy / len;
  const obs = world.obstacles ?? world.map?.blocks ?? [];
  const blocked = dir => obs.some(r => segmentHitsRect(a.x, a.y, dir.x, dir.y, T.whiskerLen, r, a.radius));
  if (!blocked({ x: ux, y: uy })) return { x: dx, y: dy };
  for (const deg of [30, -30, 60, -60, 90, -90]) {     // ищем ближайший свободный угол
    const r = deg * Math.PI / 180, c = Math.cos(r), s = Math.sin(r);
    const nd = { x: ux * c - uy * s, y: ux * s + uy * c };
    if (!blocked(nd)) return { x: nd.x * len, y: nd.y * len };
  }
  return { x: dx, y: dy }; // всё заблокировано — пусть wallRepel/pushOut разрулят
}
```

- [ ] **Step 3: Подключить в stepAgent (ветка target-seek)**

В `stepAgent`, где считается `sx/sy` из target (ветка `if (!hasGoal && a.target)`), после установки `sx,sy` и до применения скорости — обвести через whisker. Конкретно: заменить блок
```js
    if (d > 0.3) { sx = ex / d; sy = ey / d; hasGoal = true; }
```
на
```js
    if (d > 0.3) { const s = steerAround(a, ex / d, ey / d, world); sx = s.x; sy = s.y; hasGoal = true; }
```

- [ ] **Step 4: Тесты + Commit**

Run: `node tests/run.js` — PASS.

```bash
git add src/sim/steering.js tests/run.js
git commit -m "feat(v4): whisker obstacle avoidance for target-seekers"
```

---

### Task 3: Карта — бутики как аттракционы

**Files:**
- Modify: `src/data/map.js`
- Test: `tests/run.js`

- [ ] **Step 1: Падающие тесты**

```js
test('booths: острова стали бутиками-POI с хайпом и качеством', () => {
  const booths = Object.values(MAP.pois).filter(p => p.booth);
  assert.ok(booths.length >= 12, 'много бутиков: ' + booths.length);
  for (const b of booths) {
    assert.ok(b.w && b.h && b.face && b.fx !== undefined, 'у бутика есть тело и фронт');
    assert.ok(b.hype > 0 && b.weight === b.hype, 'хайп = вес');
    assert.ok(b.quality >= -1 && b.quality <= 1, 'качество в [-1,1]');
  }
  const g = buildGrid(MAP, [null,null,null,null,null], 0);
  for (const b of booths) assert.equal(isWalkable(g, b.fx, b.fy), true, 'фронт проходим');
});
```

Run: `node tests/run.js` — FAIL.

- [ ] **Step 2: map.js — превратить острова и boothA/B/C в бутики**

Убрать 12 безымянных островов из `blocks` (массив `blocks` станет пустым `[]` — все твёрдые объекты теперь POI, solidRects их подхватит). Добавить в `pois` 15 бутиков (12 бывших островов + boothA/B/C), формат как у booth: `{ x, y, w, h, face, label, booth: true }` без явных hype/quality (генерим ниже). Координаты островов из v3 (3 ряда × 5, w6 h3): x ∈ {6,15,24,33,42}, y ∈ {15,21,27}. Грань `face` — в проход: верхний ряд (y15) → 'S' (вниз, в проход y18-21); средний (y21) → 'N'; нижний (y27) → 'S'. Имена: `b_<col>_<row>` кроме именованных boothA(15,15)/boothB(33,21)/boothC(24,27).

Пример блока pois (вставить, прежние boothA/B/C-точки удалить):

```js
    boothA: { x: 15, y: 15, w: 6, h: 3, face: 'S', label: 'Стенд студии',   booth: true },
    boothB: { x: 33, y: 21, w: 6, h: 3, face: 'N', label: 'Стенд издателя', booth: true },
    boothC: { x: 24, y: 27, w: 6, h: 3, face: 'S', label: 'Инди-уголок',    booth: true },
    b1: { x: 6,  y: 15, w: 6, h: 3, face: 'S', label: 'Бутик 1',  booth: true },
    b2: { x: 24, y: 15, w: 6, h: 3, face: 'S', label: 'Бутик 2',  booth: true },
    b3: { x: 33, y: 15, w: 6, h: 3, face: 'S', label: 'Бутик 3',  booth: true },
    b4: { x: 42, y: 15, w: 6, h: 3, face: 'S', label: 'Бутик 4',  booth: true },
    b5: { x: 6,  y: 21, w: 6, h: 3, face: 'N', label: 'Бутик 5',  booth: true },
    b6: { x: 15, y: 21, w: 6, h: 3, face: 'N', label: 'Бутик 6',  booth: true },
    b7: { x: 24, y: 21, w: 6, h: 3, face: 'N', label: 'Бутик 7',  booth: true },
    b8: { x: 42, y: 21, w: 6, h: 3, face: 'N', label: 'Бутик 8',  booth: true },
    b9: { x: 6,  y: 27, w: 6, h: 3, face: 'S', label: 'Бутик 9',  booth: true },
    b10:{ x: 15, y: 27, w: 6, h: 3, face: 'S', label: 'Бутик 10', booth: true },
    b11:{ x: 33, y: 27, w: 6, h: 3, face: 'S', label: 'Бутик 11', booth: true },
    b12:{ x: 42, y: 27, w: 6, h: 3, face: 'S', label: 'Бутик 12', booth: true },
```

Установить `blocks: [],`.

- [ ] **Step 3: map.js — рандом хайпа/качества бутиков (детерминированно к загрузке)**

После цикла `for (const p of Object.values(MAP.pois)) { ... fx/fy ... }` добавить генерацию осей. ВАЖНО: тесты не должны требовать сид; рандом при загрузке ок (как big-cosplayer). Но чтобы значения были стабильны в пределах сессии — задаём один раз здесь:

```js
for (const p of Object.values(MAP.pois)) {
  if (!p.booth) continue;
  p.hype = 0.5 + Math.random() * 2.5;
  p.quality = Math.random() * 2 - 1;
  p.weight = p.hype;
}
```

(Сервисные/прочие POI оставляют свой weight из определения.)

- [ ] **Step 4: Тесты + Commit**

Run: `node tests/run.js` — PASS. (Существующие field/grid-тесты используют booth-координаты как проходимые проходы — проверить, что точки тестов `(13,22)`,`(8,16)` всё ещё корректны: 8,16 теперь внутри b1 (booth) — остаётся непроходимым ✓; 13,22 — проход ✓.)

```bash
git add src/data/map.js tests/run.js
git commit -m "feat(v4): map blocks become booth attractions with hype/quality"
```

---

### Task 4: Эвенты — данные, статусы, переносы; знание в beliefs

**Files:**
- Create: `src/data/events.js`
- Modify: `src/sim/knowledge.js` (makeWorldFacts: убрать concert; world.events — истина)
- Test: `tests/run.js`

- [ ] **Step 1: Падающие тесты**

```js
import { makeEvents, eventStatusTick, eventRescheduleTick, knownEventUrgency } from '../src/data/events.js';

test('events: makeEvents даёт расписание со статусами upcoming', () => {
  const evs = makeEvents(MAP);
  assert.ok(evs.length >= 3);
  assert.ok(evs.every(e => e.status === 'upcoming' && e.id && e.poi && e.hype > 0));
});

test('events: статус upcoming→live→over по истинному времени', () => {
  const world = { t: 0, map: MAP, events: makeEvents(MAP), agents: [], banner: null };
  const ev = world.events[0];
  world.t = (ev.time + 60) / T.timeScale;            // позже старта
  eventStatusTick(world);
  assert.equal(ev.status, 'live');
  world.t = (ev.time + ev.dur + 60) / T.timeScale;   // позже конца
  eventStatusTick(world);
  assert.equal(ev.status, 'over');
});

test('events: reschedule двигает время upcoming, не трогает поверенное', () => {
  const world = { t: 0, map: MAP, events: makeEvents(MAP) };
  const ev = world.events.find(e => e.status === 'upcoming');
  const before = ev.time;
  eventRescheduleTick(world, ev.id);                 // форс конкретного
  assert.notEqual(ev.time, before);
  assert.ok(ev.changedAt === world.t);
});
```

Run: `node tests/run.js` — FAIL.

- [ ] **Step 2: Создать src/data/events.js**

```js
import { T, gameClock } from './tuning.js';

// Стартовое расписание (организатор видит все, агенты — частично). time/dur в игр. сек от 13:00.
export function makeEvents(map) {
  const h = (hh, mm) => (hh - 13) * 3600 + mm * 60;
  const base = [
    { id: 'autograph', poi: 'autograph', time: h(13, 30), dur: 30 * 60, hype: 4, quality: 0.6,  title: 'Автограф-сессия' },
    { id: 'concert',   poi: 'stage',     time: h(14, 30), dur: 30 * 60, hype: 6, quality: 0.8,  title: 'Главный концерт' },
    { id: 'drop',      poi: 'merch2',    time: h(15, 0),  dur: 20 * 60, hype: 4, quality: 0.4,  title: 'Дроп лимитки' },
  ];
  // 2 сюрприза на случайных бутиках (один может быть хайп+помойка)
  const booths = Object.keys(map.pois).filter(k => map.pois[k].booth);
  for (let i = 0; i < 2; i++) {
    const poi = booths[(Math.random() * booths.length) | 0];
    base.push({ id: 'surprise' + i, poi, time: h(13, 45) + i * 40 * 60,
      dur: 20 * 60, hype: 2 + Math.random() * 4, quality: Math.random() * 2 - 1,
      title: 'Анонс на ' + (map.pois[poi].label ?? poi) });
  }
  for (const e of base) { e.status = 'upcoming'; e.changedAt = 0; }
  return base;
}

export function eventStatusTick(world) {
  const gc = gameClock(world.t);
  for (const e of world.events) {
    if (e.status === 'upcoming' && gc >= e.time) {
      e.status = 'live'; e.changedAt = world.t;
      world.banner = { text: '🔴 ' + e.title + ' началось', t: world.t };
    } else if (e.status === 'live' && gc >= e.time + e.dur) {
      e.status = 'over'; e.changedAt = world.t;
      world.banner = { text: '✓ ' + e.title + ' завершилось', t: world.t };
    }
  }
}

// перенос: если forceId не задан — случайный upcoming, иначе конкретный
export function eventRescheduleTick(world, forceId) {
  const ups = world.events.filter(e => e.status === 'upcoming');
  if (!ups.length) return;
  const e = forceId ? world.events.find(x => x.id === forceId) : ups[(Math.random() * ups.length) | 0];
  if (!e || e.status !== 'upcoming') return;
  const delta = (15 + Math.random() * 15) * 60 * (Math.random() < 0.5 ? -1 : 1);
  e.time = Math.max(0, e.time + delta);
  e.changedAt = world.t;
}

// срочность известного агенту эвента в [0..1.5] и его POI (для утилити/желаний)
export function knownEventUrgency(a, world) {
  let best = 0, poi = null;
  for (const ev of world.events) {
    if (!a.beliefs.knownEvents.has(ev.id) || ev.status === 'over' || a.attendedEvents?.has(ev.id)) continue;
    if (!a.beliefs.knownPois.has(ev.poi)) continue;
    const bt = a.beliefs.eventTime[ev.id] ?? ev.time;
    const left = bt - gameClock(world.t);
    let u = Math.max(0, Math.min(1.5, 1.5 * (1 - left / 1800)));
    if (ev.status === 'live') u = Math.max(u, 1.2);
    const score = u * ev.hype;
    if (score > best) { best = score; poi = ev.poi; }
  }
  return { urgency: best, poi };
}
```

- [ ] **Step 3: knowledge.js — makeWorldFacts без concert**

`makeWorldFacts()` теперь возвращает пустой служебный объект (истина об эвентах живёт в world.events):

```js
export function makeWorldFacts() { return {}; }
```

(Ссылки на `facts.concert` снимутся в Task 5; node-тесты, что их используют, тоже правит Task 5. Здесь после правки часть тестов может временно падать — НЕ страшно? Нет: гейт зелёный. Поэтому: в этой задаче НЕ удалять makeBeliefs.events.concert и НЕ ломать существующие тесты — оставить makeWorldFacts возвращающим `{ concert: { time: 14.5*3600, place:'stage', status:'on', changedAt:0 } }` КАК БЫЛО. world.events добавляется параллельно. Полное удаление concert — Task 5.)

Итог Step 3: makeWorldFacts НЕ трогаем в этой задаче. events.js самодостаточен и тестируется отдельно.

- [ ] **Step 4: Тесты + Commit**

Run: `node tests/run.js` — PASS.

```bash
git add src/data/events.js tests/run.js
git commit -m "feat(v4): event schedule data, status + reschedule ticks"
```

---

### Task 5: Миграция концерт→эвенты во всех потребителях

**Files:**
- Modify: `src/sim/agent.js` (think utility, superfan, deceived), `src/sim/knowledge.js` (makeWorldFacts, eyesUpdate, knowledgeLag), `src/data/schedule.js` (убрать concert-переходы — их ведёт eventStatusTick), `src/sim/score.js` (capture по эвентам), `src/sim/dialogue.js` ('event' topic по world.events), `src/ui/inspector.js`
- Test: `tests/run.js`

- [ ] **Step 1: Обновить тесты под новую модель**

В tests/run.js удалить/переписать тесты, завязанные на `beliefs.events.concert` как единственном источнике. Конкретно тест диалога «тема из объединения…»: заменить мок-беляф на новую форму (`knownEvents: new Set(['concert']), eventTime: { concert: 1 }`, без `events.concert`). Добавить:

```js
import { knownEventUrgency } from '../src/data/events.js';
test('миграция: агент без знания эвентов не имеет срочности', () => {
  const world = { t: 0, map: MAP, events: makeEvents(MAP),
    agents: [], obstMask: 0, };
  const a = makeAgent(world, 1);
  a.beliefs.knownEvents = new Set();
  assert.equal(knownEventUrgency(a, world).urgency, 0);
});
```

Run: `node tests/run.js` — FAIL (после правок ниже станет PASS).

- [ ] **Step 2: knowledge.js — финальное удаление concert**

- `makeWorldFacts()` → `return {};`
- `makeBeliefs`: удалить из возвращаемого объекта `events: { concert: {...} }` (оставить knownEvents/eventTime из Task 1).
- `eyesUpdate`: блок «вижу место события» переписать на обучение live-эвенту на месте:
  ```js
  for (const ev of (world.events ?? [])) {
    if (ev.status === 'over') continue;
    const p = world.map.pois[ev.poi];
    if (!p) continue;
    if ((p.fx - a.x) ** 2 + (p.fy - a.y) ** 2 < T.sightRadius ** 2) {
      B.knownEvents.add(ev.id); B.eventTime[ev.id] = ev.time;   // увидел вживую — узнал правду
    }
  }
  ```
- `knowledgeLag(a, world)`: обобщить на максимум устаревания по известным эвентам:
  ```js
  export function knowledgeLag(a, world) {
    let lag = 0;
    for (const ev of (world.events ?? [])) {
      if (!a.beliefs.knownEvents.has(ev.id)) continue;
      const bt = a.beliefs.eventTime[ev.id];
      if (bt !== undefined && bt !== ev.time) lag = Math.max(lag, world.t - ev.changedAt);
    }
    return lag;
  }
  ```

- [ ] **Step 3: agent.js — утилити и суперфан на эвентах**

- Импорт: `import { knownEventUrgency } from '../data/events.js';`
- Удалить старый concert-блок в начале think (deceived по `belC`/`f.status`). Заменить deceived-логику на проверку прибытия к эвенту с устаревшим временем (см. arrive в Task 6) — в think убрать обращения к `world.facts.concert`/`a.beliefs.events.concert`.
- Утилити goto: заменить вычисление `goto_` и `bel`:
  ```js
  const ev = knownEventUrgency(a, world);
  const goto_ = Math.min(1.5, ev.urgency * 0.3);
  ```
  и в `case 'goto':` цель — `ev.poi`:
  ```js
    case 'goto':
      if (ev.poi && a.beliefs.knownPois.has(ev.poi)) { a.goalPoi = ev.poi; a.target = null; }
      else { a.activity = 'wander'; a.goalPoi = null; }   // знал эвент, но не место — побредёт/исследует
      break;
  ```
  (enterLost при незнании места больше не нужен — событие необязательно; убрать ветку enterLost из goto.)
- Суперфан: переписать на эвент 'concert':
  ```js
  if (a.superfan) {
    const ce = world.events.find(e => e.id === 'concert');
    const over = !ce || ce.status === 'over';
    if (over) { a.superfan = false; if (a.browseUntil > world.t + 60) a.browseUntil = 0; }
    else {
      const bt = a.beliefs.eventTime['concert'] ?? ce.time;
      const soon = ce.status === 'live' || gameClock(world.t) >= bt - 1800;
      a.beliefs.knownEvents.add('concert');           // суперфан всегда знает про концерт
      if (soon) {
        if (nearPoi(a, world, 'stage')) { a.activity = 'browse'; a.browseUntil = world.t + 9999; a.goalPoi = null; return; }
        if (a.activity !== 'queue' && a.activity !== 'mobbing') { a.activity = 'goto'; a.goalPoi = 'stage'; a.target = null; return; }
      } else if (!a.visitedPois?.has('autograph') && a.activity !== 'queue' && a.activity !== 'mobbing' && a.goalPoi !== 'autograph') {
        a.activity = 'goto'; a.goalPoi = 'autograph'; a.target = null; return;
      }
    }
  }
  ```
- Удалить поле `wantsConcert` из makeAgent и все его использования (заменено knownEvents). (grep `wantsConcert` → пусто после задачи.)

- [ ] **Step 4: schedule.js — снять concert-переходы**

Из `tickSchedule` удалить блок динамического концерта (`f.status === 'on' ... started ... over` и score capture внутри) — теперь это делает `eventStatusTick` (вызывается из main, Task 16) и score capture переезжает в score.js (Step 5). Скриптовые SCHEDULE-эвенты автографа/дропа УДАЛИТЬ (их роль играют world.events). Оставить только волну открытия и ручеёк/закрытие (`world.closing` по времени 15:20). Убедиться, что `world.facts` больше не читается здесь.

- [ ] **Step 5: score.js — capture посещения концерта по эвенту**

В scoreTick добавить разовый захват при старте концерта:
```js
  const ce = world.events?.find(e => e.id === 'concert');
  if (ce && ce.status === 'live' && !s.concertCaptured) {
    s.concertCaptured = true;
    const st = world.map.pois.stage;
    s.concertWant = world.agents.filter(a => a.beliefs?.knownEvents?.has('concert')).length;
    s.concertHit = world.agents.filter(a => (a.x - st.fx) ** 2 + (a.y - st.fy) ** 2 < 225).length;
  }
```
(initScore: добавить `concertCaptured: false`.)

- [ ] **Step 6: dialogue.js — тема event по world.events**

- `pickTopic`: заменить `topics.push({ kind: 'event', ev: {...src.beliefs.events.concert} })` на эмиссию известных эвентов:
  ```js
  for (const id of src.beliefs.knownEvents) topics.push({ kind: 'event', id, time: src.beliefs.eventTime[id] });
  ```
- `applyTopic` ветка 'event':
  ```js
  case 'event': {
    const cur = agent.beliefs.eventTime[topic.id];
    if (cur === undefined || (topic.learnedAt ?? 0) >= 0) {  // принимаем знание
      agent.beliefs.knownEvents.add(topic.id);
      if (topic.time !== undefined) agent.beliefs.eventTime[topic.id] = topic.time;
    }
    break;
  }
  ```
  (Мутация слуха концерта переезжает в инструмент вброса/спонтанные слухи — Task 12; здесь диалог просто делится знанием времени.)

- [ ] **Step 7: inspector.js — показать эвенты вместо concert**

Заменить строки «концерт: верит … / правда …» на сводку известных эвентов:
```js
const evLines = (world.events ?? []).filter(e => a.beliefs.knownEvents.has(e.id)).map(e => {
  const bt = a.beliefs.eventTime[e.id] ?? e.time;
  const stale = bt !== e.time ? '⚠' : '';
  return `  ${e.title.slice(0,14)} ${fmtClock(13*3600+bt)} ${stale}`;
}).join('\n') || '  (не знает эвентов)';
```
и вставить блок `─ эвенты ─\n${evLines}` в textContent. Убрать обращения к bel/f concert.

- [ ] **Step 8: Тесты + grep + Commit**

Run: `node tests/run.js` — PASS.
Run: `grep -rn "facts.concert\|beliefs.events\|wantsConcert" src/` — пусто.

```bash
git add -A src/ tests/run.js
git commit -m "feat(v4): migrate single-concert belief to multi-event knowledge model"
```

---

### Task 6: Качество бутиков/эвентов, радость, евангелисты, computeDesires

**Files:**
- Modify: `src/sim/agent.js` (arrive: booth-quality + event-attend + evangelist/complainer; computeDesires; weightedPickPoi event-aware)
- Test: `tests/run.js`

- [ ] **Step 1: Падающие тесты**

```js
import { computeDesires } from '../src/sim/agent.js';

function boothWorld() {
  const world = { t: 100, map: MAP, agents: [], hash: new SpatialHash(1),
    facts: makeWorldFacts(), fields: new Fields(MAP), obstMask: 0, events: makeEvents(MAP),
    served: 0 };
  return world;
}

test('booth quality: крутой бутик радует и делает евангелистом, помойка — стресс/нытик', () => {
  const world = boothWorld();
  const good = makeAgent(world, 1); good.joy = 50; good.goalPoi = 'boothA';
  MAP.pois.boothA.quality = 0.9;
  good.x = MAP.pois.boothA.fx; good.y = MAP.pois.boothA.fy;
  arrive(good, world);
  assert.ok(good.joy > 50 && good.evangelistUntil > world.t && good.evangelBooth === 'boothA');
  const bad = makeAgent(world, 2); bad.joy = 50; bad.stress = 10; bad.goalPoi = 'boothB';
  MAP.pois.boothB.quality = -0.9;
  bad.x = MAP.pois.boothB.fx; bad.y = MAP.pois.boothB.fy;
  arrive(bad, world);
  assert.ok(bad.joy < 50 && bad.stress > 10 && bad.complainUntil > world.t);
});

test('event attend: знал live-эвент → бонус радости и attended', () => {
  const world = boothWorld();
  const ev = world.events[0]; ev.status = 'live';
  const a = makeAgent(world, 3); a.joy = 50;
  a.beliefs.knownEvents.add(ev.id);
  a.goalPoi = ev.poi; a.x = MAP.pois[ev.poi].fx; a.y = MAP.pois[ev.poi].fy;
  arrive(a, world);
  assert.ok(a.attendedEvents.has(ev.id) && a.joy > 50 + ev.quality * 25 - 1);
});

test('computeDesires: сортировка по убыванию, промо поднимает', () => {
  const world = boothWorld();
  const a = makeAgent(world, 4);
  a.beliefs.knownPois = new Set(['boothA', 'boothB']);
  MAP.pois.boothA.weight = 1; MAP.pois.boothB.weight = 1;
  a.poiPromo = { boothB: world.t + 60 };
  const d = computeDesires(a, world);
  assert.equal(d[0].key, 'boothB', 'промо-бутик первый');
  assert.ok(d[0].score >= d[d.length - 1].score);
});
```

(импорт `arrive` из agent.js — экспортировать; `makeEvents` уже импортирован.) Run: FAIL.

- [ ] **Step 2: agent.js — экспорт arrive + booth/event в arrive**

Сделать `export function arrive(...)`. Переписать `arrive(a, world)`:

```js
export function arrive(a, world) {
  const p = world.map.pois[a.goalPoi];
  // эвент на этом POI, который агент знал и ещё не посещал
  for (const ev of (world.events ?? [])) {
    if (ev.poi !== a.goalPoi || ev.status !== 'live') continue;
    if (!a.beliefs.knownEvents.has(ev.id) || a.attendedEvents.has(ev.id)) continue;
    a.attendedEvents.add(ev.id);
    a.joy = Math.min(100, a.joy + ev.quality * 25 + T.eventBonus);
  }
  // качество бутика
  if (p && p.booth) {
    const dJoy = p.quality * 25;
    a.joy = Math.max(0, Math.min(100, a.joy + dJoy));
    if (dJoy > 15) { a.evangelBooth = a.goalPoi; a.evangelistUntil = world.t + T.evangelistTime; }
    else if (dJoy < -15) { a.stress = Math.min(100, a.stress + 8); a.complainBooth = a.goalPoi; a.complainUntil = world.t + T.evangelistTime; }
  }
  (a.visitedPois ??= new Set()).add(a.goalPoi);
  a.visitedCount++;
  a.poiCooldown[a.goalPoi] = world.t + T.poiCooldownTime;
  a.browseUntil = world.t + T.browseMin + Math.random() * (T.browseMax - T.browseMin);
  a.target = randomWalkableNear(world.fields.gridFor(0), a.x, a.y, 2);
  a.goalPoi = null;
  a.activity = 'browse';
}
```

- [ ] **Step 3: agent.js — computeDesires + event-aware weightedPickPoi**

Импорт: `import { knownEventUrgency } from '../data/events.js';` (уже добавлен в Task 5). Добавить:

```js
export function computeDesires(a, world) {
  const out = [];
  for (const k of a.beliefs.knownPois) {
    const p = world.map.pois[k];
    if (!p || p.exit || p.staff || p.weight <= 0) continue;
    if ((a.poiCooldown[k] ?? 0) > world.t) continue;
    let s = p.weight * ((a.poiPromo[k] ?? 0) > world.t ? T.promoFactor : 1) * (a.visitedPois?.has(k) ? 0.3 : 1);
    for (const ev of (world.events ?? [])) {
      if (ev.poi !== k || !a.beliefs.knownEvents.has(ev.id) || ev.status === 'over' || a.attendedEvents.has(ev.id)) continue;
      const bt = a.beliefs.eventTime[ev.id] ?? ev.time;
      const left = bt - gameClock(world.t);
      if (left < 1800) s *= 1 + ev.hype * Math.max(0.2, 1 - left / 1800);
    }
    out.push({ key: k, score: s });
  }
  out.sort((x, y) => y.score - x.score);
  return out;
}
```

Переписать `weightedPickPoi` на выбор из computeDesires (взвешенный рандом):

```js
function weightedPickPoi(a, world) {
  const d = computeDesires(a, world);
  if (!d.length) return null;
  let sum = 0; for (const e of d) sum += e.score;
  if (sum <= 0) return d[0].key;
  let r = Math.random() * sum;
  for (const e of d) { r -= e.score; if (r <= 0) return e.key; }
  return d[d.length - 1].key;
}
```

- [ ] **Step 4: Тесты + Commit**

Run: `node tests/run.js` — PASS.

```bash
git add src/sim/agent.js tests/run.js
git commit -m "feat(v4): booth quality + joy, event attendance bonus, evangelists, computeDesires"
```

---

### Task 7: Диалоги — сарафан бутиков (boothGood/boothBad), приоритет евангелиста

**Files:**
- Modify: `src/sim/dialogue.js`
- Test: `tests/run.js`

- [ ] **Step 1: Падающие тесты**

```js
test('сарафан: boothGood учит+промо, boothBad ставит избегание', () => {
  const a = { beliefs: { knownPois: new Set(), jamMarks: [], knownEvents: new Set(), eventTime: {} },
    poiPromo: {}, poiCooldown: {}, obstMask: 0 };
  applyTopic(a, { kind: 'boothGood', key: 'boothA' }, 100);
  assert.ok(a.beliefs.knownPois.has('boothA') && a.poiPromo.boothA > 100);
  applyTopic(a, { kind: 'boothBad', key: 'boothB' }, 100);
  assert.ok(a.poiCooldown.boothB > 100);
});

test('pickTopic: евангелист эмитит boothGood своего бутика', () => {
  const ev = { evangelistUntil: 200, evangelBooth: 'boothA', complainUntil: 0,
    beliefs: { knownPois: new Set(['boothA']), jamMarks: [], knownEvents: new Set(), eventTime: {} }, obstMask: 0 };
  const other = { evangelistUntil: 0, complainUntil: 0,
    beliefs: { knownPois: new Set(), jamMarks: [], knownEvents: new Set(), eventTime: {} }, obstMask: 0 };
  const world = { t: 100, map: { pois: { boothA: {} } }, obstMask: 0 };
  let got = false;
  for (let i = 0; i < 20; i++) { const t = pickTopic(ev, other, world); if (t.kind === 'boothGood' && t.key === 'boothA') got = true; }
  assert.ok(got, 'евангелист хоть раз выдал boothGood');
});
```

Run: FAIL.

- [ ] **Step 2: dialogue.js — темы и приоритет**

В `pickTopic(a, b, world)` перед общим набором тем добавить приоритетную эмиссию сарафана:

```js
  for (const src of [a, b]) {
    if (src.evangelistUntil > world.t && src.evangelBooth) return { kind: 'boothGood', key: src.evangelBooth };
    if (src.complainUntil > world.t && src.complainBooth) return { kind: 'boothBad', key: src.complainBooth };
  }
```

(после этого — существующий сбор topics; оставить.)

В `applyTopic` добавить ветки:

```js
    case 'boothGood': agent.beliefs.knownPois.add(topic.key); agent.poiPromo[topic.key] = t + T.promoTime; break;
    case 'boothBad': agent.poiCooldown[topic.key] = t + T.poiCooldownTime; break;
```

- [ ] **Step 3: Тесты + Commit**

Run: PASS.

```bash
git add src/sim/dialogue.js tests/run.js
git commit -m "feat(v4): booth word-of-mouth topics, evangelist/complainer priority"
```

---

### Task 8: Фейк-ажиотаж (lures)

**Files:**
- Create: `src/sim/lures.js`
- Test: `tests/run.js`

- [ ] **Step 1: Падающий тест**

```js
import { luresTick } from '../src/sim/lures.js';

test('lure: прибытие в радиус роняет радость и снимает цель', () => {
  const world = { t: 0, agents: [], lures: [{ x: 10, y: 10, until: 100 }] };
  const a = { x: 10.5, y: 10.5, joy: 60, stress: 0, lureTarget: { x: 10, y: 10 } };
  world.agents.push(a);
  luresTick(world);
  assert.equal(a.lureTarget, null, 'разочаровался');
  assert.ok(a.joy < 60 && a.stress > 0);
});

test('lure: истёкший по TTL удаляется', () => {
  const world = { t: 200, agents: [], lures: [{ x: 10, y: 10, until: 100 }] };
  luresTick(world);
  assert.equal(world.lures.length, 0);
});
```

Run: FAIL.

- [ ] **Step 2: Создать src/sim/lures.js**

```js
import { T } from '../data/tuning.js';

export function luresTick(world) {
  world.lures = (world.lures ?? []).filter(l => world.t < l.until);
  for (const a of world.agents) {
    if (!a.lureTarget) continue;
    if ((a.lureTarget.x - a.x) ** 2 + (a.lureTarget.y - a.y) ** 2 < T.lureRadius ** 2) {
      a.joy = Math.max(0, (a.joy ?? 50) - T.lureJoyHit);
      a.stress = Math.min(100, (a.stress ?? 0) + T.lureStress);
      a.lureTarget = null;                       // пусто — расходится
      if (a.activity === 'goto') { a.activity = 'wander'; a.goalPoi = null; }
    }
  }
}
```

- [ ] **Step 3: steering.js — lureTarget как приоритетная target-цель**

В `stepAgent`, в начале выбора направления (перед field/target) добавить: если `a.lureTarget`, использовать его как target (через steerAround). Конкретно в начале функции:

```js
  if (a.lureTarget) { a.target = a.lureTarget; a.goalPoi = null; }
```

(так lureTarget едет по существующей target-ветке с whisker.)

- [ ] **Step 4: Тесты + Commit**

Run: PASS.

```bash
git add src/sim/lures.js src/sim/steering.js tests/run.js
git commit -m "feat(v4): fake-hype lures (crowd bait + disappointment)"
```

---

### Task 9: Волонтёр-NPC + лидеры групп

**Files:**
- Modify: `src/sim/special.js`
- Test: `tests/run.js`

- [ ] **Step 1: Падающие тесты**

```js
import { volunteerNpcTick, spawnLeader } from '../src/sim/special.js';

test('волонтёр-NPC снижает стресс соседей', () => {
  const v = { kind: 'volunteer', x: 10, y: 10, target: null, nextSeek: 0 };
  const n = { x: 11, y: 10, stress: 50 };
  const world = { t: 0, agents: [v, n], hash: new SpatialHash(1), fields: new Fields(MAP), obstMask: 0 };
  world.hash.rebuild(world.agents);
  volunteerNpcTick(world, 1);
  assert.ok(n.stress < 50, 'стресс снят: ' + n.stress);
});

test('лидер тащит группу follow', () => {
  const world = { t: 0, map: MAP, agents: [], hash: new SpatialHash(1),
    facts: makeWorldFacts(), fields: new Fields(MAP), obstMask: 0, events: makeEvents(MAP), flashes: [] };
  const L = spawnLeader(world);
  assert.equal(L.kind, 'leader');
  const followers = world.agents.filter(x => x.activity === 'follow' && x.followTarget === L.id);
  assert.ok(followers.length >= 3, 'группа набрана: ' + followers.length);
});
```

Run: FAIL.

- [ ] **Step 2: special.js — volunteerNpcTick**

Удалить старый статичный `volunteerTick` (объекты world.volunteers {x,y}). Добавить мобильный:

```js
export function volunteerNpcTick(world, dt) {
  for (const v of world.agents) {
    if (v.kind !== 'volunteer') continue;
    // снять стресс рядом + вылечить lost
    for (const o of world.hash.queryCircle(v.x, v.y, T.volunteerRadius)) {
      if (o === v) continue;
      if (o.stress !== undefined) o.stress = Math.max(0, o.stress - T.volRelief * dt);
      if (o.activity === 'lost' && o.beliefs) {
        for (const k of Object.keys(world.map.pois)) o.beliefs.knownPois.add(k);
        o.obstMask = world.obstMask ?? 0; o.activity = 'wander';
      }
    }
    // искать самый стрессовый кластер раз в 1.5с
    if ((v.nextSeek ?? 0) <= world.t) {
      v.nextSeek = world.t + 1.5;
      let best = null, bs = 15;
      for (const o of world.agents) {
        if (o.kind !== 'visitor' || o.stress < 50) continue;
        const c = world.hash.queryCircle(o.x, o.y, 2).reduce((s, x) => s + (x.stress ?? 0), 0);
        if (c > bs) { bs = c; best = o; }
      }
      v.target = best ? { x: best.x, y: best.y } : randomWalkableNear(world.fields.gridFor(0), v.x, v.y, 8);
    }
  }
}
```

(в `specialTick` заменить вызов старого волонтёра на `volunteerNpcTick(world, dt)`.)

- [ ] **Step 3: special.js — spawnLeader + лидеры в расписании**

```js
export function spawnLeader(world) {
  const L = spawnAt(world, 'exitMain');
  L.kind = 'leader';
  L.beliefs.knownPois = new Set(Object.keys(world.map.pois));
  pickPoiTarget(world, L);
  for (let i = 0; i < T.leaderGroupSize; i++) {
    const f = spawnAt(world, 'exitMain');
    f.activity = 'follow'; f.followTarget = L.id; f.goalPoi = null;
  }
  return L;
}
```

В SPAWNS добавить лидеров: `{ at: 0.5, kind: 'leader', n: 1 }` и `{ at: h(13, 40), kind: 'leader', n: 1 }`. В `spawnSpecial` добавить case `'leader': return spawnLeader(world)` ПЕРЕД общим spawnAt? — нет: spawnLeader сам спавнит. Сделать в spawnSpecial: `if (kind === 'leader') return spawnLeader(world);` первой строкой. Лидер роумит (как стример) — добавить в `streamerTick`-аналоге или в отдельном `leaderTick`: лидер с пустым/достигнутым goalPoi → pickPoiTarget; followers держат target = лидер (уже есть в streamerTick? нет — followTarget указывает на лидера, но обновление target follow-агентов делает только streamerTick для стримеров). Добавить `leaderTick`:

```js
function leaderTick(world) {
  for (const L of world.agents) {
    if (L.kind !== 'leader') continue;
    if (!L.goalPoi || (world.map.pois[L.goalPoi] &&
        (L.x - world.map.pois[L.goalPoi].fx) ** 2 + (L.y - world.map.pois[L.goalPoi].fy) ** 2 < 9)) pickPoiTarget(world, L);
    for (const f of world.agents)
      if (f.activity === 'follow' && f.followTarget === L.id) f.target = { x: L.x, y: L.y };
  }
}
```
и звать `leaderTick(world)` из specialTick.

- [ ] **Step 4: Тесты + Commit**

Run: PASS.

```bash
git add src/sim/special.js tests/run.js
git commit -m "feat(v4): mobile volunteer NPC, group leaders"
```

---

### Task 10: Lost при ударе в неизвестный барьер + распространение

**Files:**
- Modify: `src/sim/steering.js`
- Test: `tests/run.js`

- [ ] **Step 1: Падающий тест**

```js
test('память→барьер: visitor утыкается в неизвестный слот → lost + узнал бит', () => {
  const fl = new Fields(MAP);
  fl.setSlot(0, { x: 13, y: 20, w: 3, h: 3 });
  const world = { t: 0, map: MAP, fields: fl, obstMask: 1,
    obstacles: [...solidRects(MAP), fl.slots[0]], agents: [], hash: new SpatialHash(1) };
  const a = makeAgent(world, 1); a.kind = 'visitor'; a.obstMask = 0;     // не знает барьер
  a.x = 14.5; a.y = 21.5; a.radius = 0.3;                                 // внутри слота
  world.agents.push(a);
  applyBarrierLost(a, world);
  assert.ok(a.obstMask & 1, 'узнал бит');
  assert.equal(a.activity, 'lost');
});
```

(импорт `applyBarrierLost`, `solidRects`.) Run: FAIL.

- [ ] **Step 2: steering.js — раздельное выталкивание + applyBarrierLost**

Импорт `enterLost` из agent.js (циклов импорта нет: agent.js не импортирует steering). Добавить:

```js
export function applyBarrierLost(a, world) {
  let bit = 0;
  (world.fields?.slots ?? []).forEach((s, i) => { if (s && a._hitRect === s) bit = 1 << i; });
  if (!bit) return;
  if (a.obstMask & bit) return;          // уже знал — не теряется
  a.obstMask |= bit;
  a.stress = Math.min(100, a.stress + 10);
  enterLost(a, world, a.goalPoi);        // несёт obst в диалогах (тема obst уже спредит)
}
```

В цикле выталкивания simTick — отметить, об какой rect был контакт, и для активных слотов у visitor вызвать lost. Заменить блок:
```js
  for (const a of agents) {
    for (const r of obs) pushOutOfRect(a, r);
    ...clamp...
  }
```
на версию, разделяющую solid и слоты:
```js
  const solids = world.obstacles ?? solidRects(world.map);
  const slots = (world.fields?.slots ?? []);
  for (const a of agents) {
    if (a.dragged) continue;
    for (const r of solids) pushOutOfRect(a, r);
    for (const s of slots) {
      if (!s) continue;
      const before = (a.x - Math.max(s.x, Math.min(s.x + s.w, a.x))) ** 2 + (a.y - Math.max(s.y, Math.min(s.y + s.h, a.y))) ** 2;
      pushOutOfRect(a, s);
      if (before < a.radius * a.radius && a.kind === 'visitor') { a._hitRect = s; applyBarrierLost(a, world); a._hitRect = null; }
    }
    a.x = Math.max(a.radius + 1, Math.min(world.map.w - 1 - a.radius, a.x));
    a.y = Math.max(a.radius + 1, Math.min(world.map.h - 1 - a.radius, a.y));
  }
```
(Если `world.obstacles` уже включает слоты — убедиться, что solids = solidRects(map) БЕЗ слотов, а слоты обрабатываются отдельным циклом. main.js syncObstacles в Task 16 будет хранить world.obstacles = solidRects только? Нет — оставим world.obstacles = solidRects(map) + slots для wall-repel/whisker, но в этом цикле использовать solidRects(map) для solids и fields.slots для slots отдельно. Импортировать solidRects.)

- [ ] **Step 3: Тесты + Commit**

Run: PASS.

```bash
git add src/sim/steering.js tests/run.js
git commit -m "feat(v4): memory-routed agents get Lost on unknown barrier, then propagate it"
```

---

### Task 11: Тулбар — драг всех + глоб.кулдаун, удаление барьеров, спавн волонтёра

**Files:**
- Modify: `src/ui/tools.js`
- Test: (нет node-теста; DOM)

- [ ] **Step 1: Драг всех + кулдаун**

В `initTools`, в world.ui добавить `dragCooldownUntil: 0`. В mousedown (режим cursor): убрать фильтр `a.kind === 'visitor'` при выборе цели — теперь подхватываем любого агента; но запрет, если `world.t < world.ui.dragCooldownUntil`. При выборе ближайшего агента — без kind-фильтра. В mouseup: после дропа всегда `world.ui.dragCooldownUntil = world.t + T.dragCooldown;`. Lost только для visitor/пар:
```js
    if (world.ui.dragFrom && Math.hypot(a.x - world.ui.dragFrom.x, a.y - world.ui.dragFrom.y) > 1
        && (a.kind === 'visitor' || a.friendId)) enterLost(a, world, null);
```
(спец — просто релокация, что уже происходит: clamp на проходимую + vx/vy=0.)
В cooldown-setInterval тулбара добавить индикатор: если `world.ui.dragCooldownUntil > world.t`, показывать на кнопке «Курсор» остаток (`Курсор ⏳Nс`).

- [ ] **Step 2: Барьер — удалить + «снять все»**

В тулбар добавить кнопку «🧹 Снять барьеры» (id `clearBarriersBtn`): onclick снимает слоты 0–2:
```js
  document.getElementById('clearBarriersBtn').onclick = () => {
    for (let i = 0; i < T.barrierSlots; i++) if (world.fields.slots[i]) world.fields.clearSlot(i);
    world.syncObstacles();
  };
```
(placeBarrier уже снимает по клику на существующую — оставить.)

- [ ] **Step 3: Волонтёр — спавн мобильного NPC**

`placeVolunteer(world, m)` переписать: вместо объекта в world.volunteers — спавн агента kind 'volunteer'. Нужен доступ к makeAgent — импортировать. Макс T.volunteerMax среди agents с kind volunteer; клик рядом с существующим волонтёром (в 1 м) — убрать (despawn):
```js
import { makeAgent } from '../sim/agent.js';
function placeVolunteer(world, m) {
  const near = world.agents.find(a => a.kind === 'volunteer' && Math.hypot(a.x - m.x, a.y - m.y) < 1);
  if (near) { near.despawn = true; return; }
  if (world.agents.filter(a => a.kind === 'volunteer').length >= T.volunteerMax) {
    world.banner = { text: 'Волонтёры кончились (макс 2)', t: world.t }; return;
  }
  if (!isWalkable(world.fields.gridFor(0), m.x, m.y)) return;
  const v = makeAgent(world, world.nextId = (world.nextId ?? 0) + 1);
  v.kind = 'volunteer'; v.x = m.x; v.y = m.y; v.maxSpeed = 2.2; v.sociability = 0;
  v.beliefs.knownPois = new Set(Object.keys(world.map.pois));
  world.agents.push(v);
}
```
Удалить инициализацию `world.volunteers = []` из initTools (старая статика больше не нужна; но draw/dialogue могли читать world.volunteers — Task 9 удалил volunteerTick; убедиться, что ссылок на world.volunteers не осталось: grep).

- [ ] **Step 4: Проверка + Commit**

Run: `node tests/run.js` — 0 регрессий (DOM не тестируется).
Run: `grep -rn "world.volunteers" src/` — пусто (или только удаляемые места).

```bash
git add src/ui/tools.js tests/run.js
git commit -m "feat(v4): drag any NPC + global cooldown, barrier clear, volunteer NPC spawn"
```

---

### Task 12: Меню вброса слухов/приколов

**Files:**
- Modify: `src/ui/tools.js`, `src/data/messages.js`, `src/sim/special.js` (спонтанные booth-слухи)
- Test: `tests/run.js`

- [ ] **Step 1: Падающий тест (мета/фейк-логика в чистой функции)**

Вынести эффекты в тестируемые функции в messages.js:

```js
import { injectMeta, injectFakeHype } from '../src/data/messages.js';

test('фейк-ажиотаж: создаёт lure и наводит на него агентов', () => {
  const world = { t: 0, map: MAP, agents: [], lures: [] };
  for (let i = 0; i < 30; i++) { const a = makeAgent(world, i); a.kind = 'visitor'; world.agents.push(a); }
  injectFakeHype(world, { x: 30, y: 20 });
  assert.equal(world.lures.length, 1);
  assert.ok(world.agents.filter(a => a.lureTarget).length >= 10);
});

test('мета HL3: роняет радость слышащим', () => {
  const world = { t: 0, map: MAP, agents: [], lures: [], banner: null };
  for (let i = 0; i < 10; i++) { const a = makeAgent(world, i); a.kind = 'visitor'; a.joy = 60; world.agents.push(a); }
  injectMeta(world, 'hl3');
  assert.ok(world.agents.every(a => a.joy <= 60));
  assert.ok(world.agents.some(a => a.joy < 60));
});
```

Run: FAIL.

- [ ] **Step 2: messages.js — injectFakeHype + injectMeta + booth-сарафан в конструкторе**

```js
export function injectFakeHype(world, pt) {
  world.lures.push({ x: pt.x, y: pt.y, until: world.t + T.lureTtl });
  const cands = world.agents.filter(a => a.kind === 'visitor' && a.beliefs);
  for (let i = 0; i < T.lureInjectCount && cands.length; i++) {
    const a = cands.splice((Math.random() * cands.length) | 0, 1)[0];
    a.lureTarget = { x: pt.x, y: pt.y };
  }
  world.banner = { text: '🗣 «Там что-то раздают!»', t: world.t };
}

export function injectMeta(world, kind) {
  const vis = world.agents.filter(a => a.kind === 'visitor' && a.beliefs);
  if (kind === 'hl3') {
    for (const a of vis) if (a.perception > 0) a.joy = Math.max(0, a.joy - 8);
    world.banner = { text: '🗣 «Анонс отмены… все в трауре»', t: world.t };
  } else if (kind === 'wifi') {
    for (const a of vis) if (a.activity === 'phone') { const e = nearestExitPt(world, a); a.target = e; a.goalPoi = null; }
    world.banner = { text: '🗣 «Вайфай только у входа»', t: world.t };
  } else if (kind === 'starfood') {
    injectFakeHype(world, { x: world.map.pois.food.fx, y: world.map.pois.food.fy });
  } else if (kind === 'lostkid') {
    let n = 0; for (const a of vis) { if (n++ >= 15) break; a.goalPoi = 'info'; a.activity = 'goto'; a.target = null; }
    world.banner = { text: '🗣 «Потерялся ребёнок — все на инфостойку»', t: world.t };
  }
}
function nearestExitPt(world, a) {
  let best = null, bd = Infinity;
  for (const [k, p] of Object.entries(world.map.pois)) if (p.exit) {
    const d = (p.fx - a.x) ** 2 + (p.fy - a.y) ** 2; if (d < bd) { bd = d; best = p; }
  }
  return best ? { x: best.fx, y: best.fy } : null;
}
```

В `makeBoardMessages`/`composerOptions` добавить бутик-сарафан: вариант «Сарафан: бутик 🔥/🗑» — applyFn boothGood/boothBad для получателей (knownPois.add+promo / poiCooldown). И эвент-варианты строить из world.events (заменить старую concert-only логику в composerOptions на список world.events с вариантами «правда/перенос/отмена-слух»).

- [ ] **Step 3: tools.js — меню вброса**

Кнопку rumorBtn заменить на меню типов: «Эвент-слух» (выбор эвента+вариант через openComposer-подобный список), «Бутик 🔥», «Бутик 🗑» (выбор бутика), «Фейк-ажиотаж» (далее клик по карте ставит lure — режим one-shot), «Мета: HL3 / Вайфай / Звезда у фуда / Потеряшка». Кулдаун `T.rumorInjectCooldown`. Фейк-ажиотаж: после выбора — следующий клик по канвасу вызывает `injectFakeHype(world, {x,y})` (через временный флаг `world.ui.armFakeHype = true`, перехват в mousedown до прочих веток).

- [ ] **Step 4: special.js — спонтанный booth-сарафан**

В `injectSpontaneousRumor` с шансом 50/50 вместо концерт-мутации породить booth-сарафан: взять случайного евангелиста/нытика (если есть) или случайный бутик и пометить случайного visitor `evangelBooth/complainBooth` на 30 с, чтобы он разнёс. (Минимально: выбрать случайный бутик, случайному visitor задать `evangelBooth=key; evangelistUntil=now+30` или `complain...`.)

- [ ] **Step 5: Тесты + Commit**

Run: PASS.

```bash
git add src/ui/tools.js src/data/messages.js src/sim/special.js tests/run.js
git commit -m "feat(v4): rumor/joke injection menu - fake hype, booth gossip, meta jokes"
```

---

### Task 13: Таймлайн эвентов + легенда + index.html

**Files:**
- Create: `src/ui/timeline.js`, `src/ui/legend.js`
- Modify: `index.html`

- [ ] **Step 1: index.html — контейнеры**

Добавить в body `#timeline` (слева) и `#legend` (угол, hidden), стили: `#timeline{position:fixed;left:8px;top:8px;width:200px;background:rgba(20,22,30,.9);color:#cde;font:11px monospace;padding:8px;border-radius:8px;white-space:pre-wrap}` ; `#legend{position:fixed;left:8px;bottom:8px;width:230px;background:rgba(20,22,30,.94);color:#cde;font:11px monospace;padding:10px;border-radius:8px;display:none;white-space:pre-wrap}`.

- [ ] **Step 2: src/ui/timeline.js**

```js
import { fmtClock, gameClock } from '../data/tuning.js';
export function updateTimeline(world) {
  const el = document.getElementById('timeline'); if (!el) return;
  const gc = gameClock(world.t);
  const rows = (world.events ?? []).slice().sort((a, b) => a.time - b.time).map(e => {
    const icon = e.status === 'live' ? '🔴' : e.status === 'over' ? '✓' : '⏳';
    const moved = (world.t - e.changedAt < 6 && e.status === 'upcoming') ? ' ⏰' : '';
    const left = e.time - gc;
    const cd = e.status === 'upcoming' && left > 0 ? ` (−${Math.ceil(left / 60)}м)` : '';
    return `${icon} ${fmtClock(13 * 3600 + e.time)} ${e.title.slice(0, 16)}${cd}${moved}`;
  }).join('\n');
  el.textContent = '── ТАЙМЛАЙН ──\n' + rows;
}
```

- [ ] **Step 3: src/ui/legend.js**

```js
export function initLegend(world) {
  const el = document.getElementById('legend');
  el.textContent =
`── ЛЕГЕНДА ──  (L — скрыть)
зелёный→красный: свежесть знаний
мигает белым: высокий стресс
фиолетовый: обманут
🟠 грузчик  ⚪ журналист
🟡 стример  🩷 косплеер-звезда
⚙ серый: уборщик  🟦 волонтёр
лидер: с группой follow
💔(цвет): потерянная пара
🚧 барьер  ⚠ инцидент  · мусор`;
  window.addEventListener('keydown', e => {
    if (e.key === 'l' || e.key === 'L') el.style.display = el.style.display === 'none' ? 'block' : 'none';
  });
}
```

- [ ] **Step 4: Commit**

Run: `node tests/run.js` — 0 регрессий.

```bash
git add src/ui/timeline.js src/ui/legend.js index.html
git commit -m "feat(v4): event timeline sidebar + legend panel"
```

---

### Task 14: Рендер v4 — бутики, lures, волонтёр/лидер, цветные сердца, дебаг-желания

**Files:**
- Modify: `src/render/draw.js`, `src/render/debug.js`, `src/ui/inspector.js`

- [ ] **Step 1: draw.js — бутики, lures, новые kind, сердца**

- POI-рендер: для `p.booth` показывать индикатор хайпа (высота/яркость столбика или число hype) у фронта; качество НЕ показывать (скрыто).
- Цвета агентов: добавить `volunteer` бирюзовый (`#3ef`), `leader` (напр. `#fc6`). Удалить рендер статичных world.volunteers (теперь это агенты).
- Lures: рисовать пульсирующее кольцо в каждой `world.lures` точке (как приманка).
- Сердца пар: для `a.searching` рисовать 💔/кольцо цветом `hsl(${(Math.min(a.id, a.friendId)*47)%360},70%,60%)`; флеш воссоединения уже `kind:'heart'` — взять цвет из flash (добавить `hue` в flash при пуше в special.js pairTick: `world.flashes.push({..., kind:'heart', hue})`).

- [ ] **Step 2: debug.js — линии к топ-желаниям**

В drawDebug, если есть `world.selected`, вызвать `computeDesires(world.selected, world)` (импорт из agent.js) и нарисовать тонкие линии к топ-3 POI (затухание по рангу), плюс подписать score.

- [ ] **Step 3: inspector.js — блок «хочет» + joy bar**

Добавить в textContent строку радости (`joy ${bar(a.joy)} ${a.joy|0}`) рядом со стрессом и блок `─ хочет ─` с топ-3 из computeDesires:
```js
import { computeDesires } from '../sim/agent.js';
...
const wants = computeDesires(a, world).slice(0, 3)
  .map(d => `  ${world.map.pois[d.key].label.slice(0,14)} ${d.score.toFixed(1)}`).join('\n') || '  —';
```
(блок known-эвентов добавлен в Task 5.)

- [ ] **Step 4: Commit**

Run: `node tests/run.js` — 0 регрессий.

```bash
git add src/render/draw.js src/render/debug.js src/ui/inspector.js
git commit -m "feat(v4): render booths/lures/volunteers/leaders, colored pair hearts, desire debug"
```

---

### Task 15: Счёт с радостью + финал

**Files:**
- Modify: `src/sim/score.js`, `src/ui/finale.js`

- [ ] **Step 1: score.js — joyHist + панель**

В initScore добавить `joyHist: []`. В scoreTick, рядом со stressHist-веткой (раз в 1с), писать средний joy в joyHist (cap 60). В updateScorePanel добавить строку радости со спарклайном (как стресс) и `% эвентов`: доля посещённых известных эвентов среди живых (`Σ attended / Σ known` по агентам, 0 если нет known).

- [ ] **Step 2: finale.js — вердикт с радостью**

В maybeFinale считать `avgJoy = mean(joyHist)` и применить пороги §8 спеки:
```js
const verdict =
  avgJoy >= 60 && avgStress < 45 && s.incidents === 0 && angryShare < 0.10 && press >= 2 ? '🏆 Образцовый конвент' :
  avgJoy < 35 || s.incidents > 2 || press <= -3 || angryShare > 0.35 ? '🔥 Позор в прессе' :
  '😮‍💨 Выжили';
```
Добавить в метрики строку «средняя радость: …».

- [ ] **Step 3: Commit**

Run: `node tests/run.js` — 0 регрессий.

```bash
git add src/sim/score.js src/ui/finale.js
git commit -m "feat(v4): joy in scoring panel and finale verdict"
```

---

### Task 16: Интеграция main.js, смоук, приёмка

**Files:**
- Modify: `src/main.js`
- Smoke: `tests/smoke.js` (временный)

- [ ] **Step 1: main.js — события, тики, init**

- world: добавить `events: makeEvents(MAP)` (импорт из data/events.js), `lures: []`. Убрать `world.volunteers` если осталось.
- syncObstacles: `world.obstacles = [...solidRects(MAP), ...world.fields.slots.filter(Boolean)]` (для wall-repel/whisker), но цикл lost-на-барьере (Task 10) использует solidRects(map)+slots отдельно — согласовать: оставить world.obstacles как есть для whisker, а в simTick push-цикле использовать solidRects(world.map) и fields.slots.
- init: `initLegend(world)`, и в кадре `updateTimeline(world)`.
- Порядок тиков в while-цикле: `tickSchedule(world)` → `eventStatusTick(world)` → `maybeReschedule(world)` → `specialTick(world, dt)` → `logisticsTick(world)` → `incidentsTick(world, dt)` → `luresTick(world)` → `simTick(world, dt)` → `scoreTick(world, dt)`.
  `maybeReschedule`: локальный таймер `world.nextReschedule ??= T.rescheduleEvery; if (world.t >= world.nextReschedule) { world.nextReschedule = world.t + T.rescheduleEvery + (Math.random()*2-1)*T.rescheduleJitter; eventRescheduleTick(world); }`.
- В кадре после draw: `updateTimeline(world); updateInspector(world); updateScorePanel(world); maybeFinale(world);`.
- Импорты: makeEvents/eventStatusTick/eventRescheduleTick, luresTick, volunteerNpcTick уже в specialTick, updateTimeline, initLegend.

- [ ] **Step 2: grep + тесты**

Run: `grep -rn "facts.concert\|beliefs.events\|wantsConcert\|world.volunteers\|doorMask\|doorsClosed" src/` — пусто.
Run: `node tests/run.js` — все зелёные.

- [ ] **Step 3: Headless-смоук (185 сим-сек)**

Создать ВРЕМЕННЫЙ tests/smoke.js: DOM-less мир как main.js (makeEvents, lures:[], initScore/Queues/Logistics, syncObstacles), тот же порядок тиков (без UI/draw), 185 сим-сек dt=1/30, срезы каждые 30с: clock, agents, NaN, in-walls, served, talks, angry, incidents, **avg joy**, **avg stress**, depot reserve, активности-гистограмма, и счётчики: сколько evangelist/complain активно, сколько lured, сколько lost. КРИТЕРИИ: NaN=0, in-walls=0 на каждом срезе; пик ≥300; served>50; есть посещения бутиков (visitedCount растёт); avg joy в разумном коридоре (20..80) — не залипает в 0 и не 100; concert capture сработал (concertWant>0). Вставить полный вывод в отчёт. Удалить smoke.js после.

- [ ] **Step 4: Commit**

```bash
git add src/main.js
git commit -m "feat(v4): integrate attractions - events/lures/joy/timeline in main loop"
```

- [ ] **Step 5: Браузерная приёмка** — контроллер/пользователь по спеке §18 (сервер на :8000 уже крутится; жёсткий рефреш).

---

## Self-Review (выполнен)

**Покрытие спеки:** §1 whisker→T2; §2 бутики/эвенты→T3,T4,T5,T6; §3 joy→T1(+источники T6); §4 таймлайн→T13; §5 слухи/приколы→T7,T12; §6 волонтёр→T9,T11; §7 лидеры→T9; §8 счёт/финал→T15; §9 драг→T11; §10 убрать барьер→T11; §11 lost-на-барьере→T10; §12 дебаг→T14; §13 легенда→T13; §14 сердца→T14; §15 баланс→T1; §17 тесты распределены; §19 future — не реализуется (зафиксировано).

**Типы/сигнатуры согласованы:** `world.events[{id,poi,time,dur,hype,quality,title,status,changedAt}]`; `a.beliefs.knownEvents:Set`, `a.beliefs.eventTime:{}`; `a.joy`, `a.attendedEvents:Set`, `a.evangelBooth/evangelistUntil/complainBooth/complainUntil`, `a.lureTarget`; `makeEvents(map)`, `eventStatusTick(world)`, `eventRescheduleTick(world, forceId?)`, `knownEventUrgency(a,world)→{urgency,poi}`; `computeDesires(a,world)→[{key,score}]` (экспорт из agent.js, юзают dialogue? нет — debug/inspector); `arrive` экспортирован; `finishTalk` экспортирован; `segmentHitsRect/steerAround/applyBarrierLost/updateNeedsJoy` экспортированы из steering; `injectFakeHype/injectMeta` из messages; `luresTick`, `volunteerNpcTick`, `spawnLeader`.

**Известные риски (приняты):** booth hype/quality рандомятся при загрузке (стабильны в сессии, как big-cosplayer) — тесты не зависят от значений, кроме тех, что сами их выставляют; whisker — локальный обход (не полный pathfind), для коротких target достаточно; lost-на-барьере только для visitor.

**Компромисс изоляции:** steering.js импортирует enterLost из agent.js; agent.js НЕ импортирует steering — цикла нет.


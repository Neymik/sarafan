import assert from 'node:assert';
import { SpatialHash } from '../src/sim/spatialHash.js';
import { resolveCollisions, pushOutOfRect } from '../src/sim/steering.js';
import { MAP } from '../src/data/map.js';
import { buildGrid, computeField, fieldDir, Fields, isWalkable, randomWalkableNear } from '../src/sim/flowfield.js';

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

test('PBD: пересекающиеся кружки раздвигаются, тяжёлый сдвигается меньше', () => {
  const a = { id: 0, x: 0,   y: 0, radius: 0.3, mass: 1, neighbors: [] };
  const b = { id: 1, x: 0.3, y: 0, radius: 0.3, mass: 3, neighbors: [] };
  a.neighbors = [b]; b.neighbors = [a];
  resolveCollisions({ agents: [a, b] });
  const d = Math.hypot(b.x - a.x, b.y - a.y);
  assert.ok(d >= 0.59, 'разведены: ' + d);
  assert.ok(Math.abs(b.x - 0.3) < Math.abs(a.x - 0), 'тяжёлый сдвинулся меньше');
});

test('rect: изнутри выталкивает через ближайшую грань', () => {
  const a = { x: 5.1, y: 7, radius: 0.3 };
  pushOutOfRect(a, { x: 5, y: 5, w: 4, h: 4 });
  assert.ok(a.x <= 5 - 0.3 + 1e-9, 'вытолкнут влево: ' + a.x);
  const b = { x: 7, y: 5.2, radius: 0.3 };
  pushOutOfRect(b, { x: 5, y: 5, w: 4, h: 4 });
  assert.ok(b.y <= 5 - 0.3 + 1e-9, 'через верхнюю грань: ' + b.y);
});

test('rect: снаружи отодвигает на радиус от грани', () => {
  const c = { x: 4.8, y: 7, radius: 0.3 }; // центр снаружи, пересекается с левой гранью
  pushOutOfRect(c, { x: 5, y: 5, w: 4, h: 4 });
  assert.ok(Math.abs(c.x - (5 - 0.3)) < 1e-9, 'ровно на радиус от грани: ' + c.x);
  assert.equal(c.y, 7);
});

test('grid v3: проход проходим, POI-объект и остров — нет', () => {
  const g = buildGrid(MAP, [null, null, null, null, null], 0);
  assert.equal(isWalkable(g, 13, 22), true);    // вертикальный проход между будками
  assert.equal(isWalkable(g, 8, 16), false);    // безымянный остров
  assert.equal(isWalkable(g, 2, 21), false);    // merch1 — POI-объект твёрд
  assert.equal(isWalkable(g, 30, 8), true);     // площадь сцены открыта
});

test('field: градиент ведёт к POI и обтекает будки', () => {
  const g = buildGrid(MAP, [null, null, null, null, null], 0);
  const f = computeField(g, MAP.pois.food.fx, MAP.pois.food.fy, null);
  assert.ok(isFinite(f[(34 | 0) * g.W + (56 | 0)]), 'food достижим справа');
  let x = 56.5, y = 34.5;
  const d0 = f[(y | 0) * g.W + (x | 0)];
  const dir = fieldDir(g, f, x, y);
  assert.ok(dir, 'градиент есть');
  const d1 = f[((y + dir.y) | 0) * g.W + ((x + dir.x) | 0)];
  assert.ok(d1 < d0, 'градиент спускается');
});

test('smartField: плотный кластер дорожает', () => {
  const g = buildGrid(MAP, [null, null, null, null, null], 0);
  const dens = new Float32Array(g.W * g.H);
  for (let x = 18; x < 24; x++) dens[19 * g.W + x] = 10;
  const cost = i => 1 + 0.35 * dens[i];
  const fSmart = computeField(g, MAP.pois.merch1.fx, MAP.pois.merch1.fy, cost);
  const fClear = computeField(g, MAP.pois.merch1.fx, MAP.pois.merch1.fy, null);
  const i = 19 * g.W + 30;
  assert.ok(fSmart[i] > fClear[i], 'через толпу дороже');
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

test('randomWalkableNear: всегда проходимая клетка', () => {
  const g = buildGrid(MAP, [null, null, null, null, null], 0);
  for (let k = 0; k < 50; k++) {
    const p = randomWalkableNear(g, 8, 19, 6);
    assert.ok(isWalkable(g, p.x, p.y), `(${p.x},${p.y})`);
  }
});

import { bystanderChance, pickTopic, applyTopic } from '../src/sim/dialogue.js';
import { initQueues, queueTick, queueSlotPos } from '../src/sim/queue.js';

test('dialogue: шанс зеваки падает с расстоянием до нуля', () => {
  assert.ok(Math.abs(bystanderChance(0) - 0.1) < 1e-9);
  assert.ok(bystanderChance(1.5) > 0 && bystanderChance(1.5) < 0.1);
  assert.equal(bystanderChance(3), 0);
  assert.equal(bystanderChance(5), 0);
});

test('dialogue: тема из объединения знаний, applyTopic учит', () => {
  const mk = () => ({ kind: 'visitor', beliefs: { knownPois: new Set(), jamMarks: [], events: { concert: { time: 1, place: 'stage', status: 'on', learnedAt: 5 } } }, obstMask: 0 });
  const a = mk(), b = mk();
  a.beliefs.knownPois.add('food');
  const t = pickTopic(a, b, { map: { pois: { food: {} } }, obstMask: 0 });
  assert.ok(t, 'тема нашлась');
  applyTopic(b, t, 10);
  if (t.kind === 'poi') assert.ok(b.beliefs.knownPois.has('food'));
  if (t.kind === 'event') assert.ok(b.beliefs.events.concert.learnedAt >= 5);
});

test('queue: слоты вдоль грани от front-точки', () => {
  const poi = { x: 9, y: 19, w: 2, h: 2, face: 'E', service: { rate: 4 } };
  poi.fx = 11.7; poi.fy = 20;            // face E → front справа, очередь вдоль [0,1]
  const p0 = queueSlotPos(poi, 0), p2 = queueSlotPos(poi, 2);
  assert.ok(Math.abs(p0.y - 20.6) < 1e-9 && Math.abs(p2.y - 21.8) < 1e-9);
  assert.equal(p0.x, 11.7);
});

test('queue: обслуживание двигает очередь, обслуженный доволен', () => {
  const poi = { x: 9, y: 19, w: 2, h: 2, face: 'E', fx: 10, fy: 20, service: { rate: 0.0001 } }; // мгновенное
  const world = { t: 100, map: { pois: { q: poi } }, agents: [], hash: { queryCircle: () => [] } };
  initQueues(world);
  const mk = id => ({ id, kind: 'visitor', x: 10 + id, y: 20, stress: 50, boredom: 50, visitedCount: 0,
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

let fail = 0;
for (const [name, fn] of tests) {
  try { fn(); console.log('ok -', name); }
  catch (e) { fail++; console.error('FAIL -', name, '\n', e.message); }
}
process.exit(fail ? 1 : 0);

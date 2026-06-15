import assert from 'node:assert';
import { SpatialHash } from '../src/sim/spatialHash.js';
import { resolveCollisions, pushOutOfRect } from '../src/sim/steering.js';
import { findPath, nearestWaypoint } from '../src/sim/pathfinding.js';
import { MAP } from '../src/data/map.js';
import { buildGrid, computeField, fieldDir, Fields, isWalkable, randomWalkableNear } from '../src/sim/flowfield.js';

function fullBeliefs() {
  const E = MAP.edges.length;
  return { edgeKnown: new Uint8Array(E).fill(1), edgePassable: new Uint8Array(E).fill(1), edgeCongestion: new Uint8Array(E) };
}

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

test('rect: выталкивает сбоку и из центра', () => {
  const a = { x: 5.1, y: 7, radius: 0.3 };
  pushOutOfRect(a, { x: 5, y: 5, w: 4, h: 4 });
  assert.ok(a.x <= 5 - 0.3 + 1e-9, 'вытолкнут влево: ' + a.x);
  const b = { x: 7, y: 5.2, radius: 0.3 };
  pushOutOfRect(b, { x: 5, y: 5, w: 4, h: 4 });
  assert.ok(b.y <= 5 - 0.3 + 1e-9, 'из центра через верхнюю грань: ' + b.y);
});

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
  assert.ok(isFinite(f[(12 | 0) * g.W + (56 | 0)]), 'food достижим справа сверху');
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
  const i = (12 | 0) * gOpen.W + (10 | 0);
  assert.ok(fClosed[i] > fOpen[i] + 5, 'обход через восточную дверь дороже');
  assert.ok(isFinite(fClosed[i]), 'но путь существует');
});

test('smartField: плотный кластер дорожает', () => {
  const g = buildGrid(MAP, 0);
  const dens = new Float32Array(g.W * g.H);
  for (let x = 18; x < 24; x++) dens[17 * g.W + x] = 10;
  const cost = i => 1 + 0.35 * dens[i];
  const fSmart = computeField(g, MAP.pois.merch1.x, MAP.pois.merch1.y, cost);
  const fClear = computeField(g, MAP.pois.merch1.x, MAP.pois.merch1.y, null);
  const i = 17 * g.W + 30;
  assert.ok(fSmart[i] > fClear[i], 'через толпу дороже');
});

test('randomWalkableNear: всегда проходимая клетка', () => {
  const g = buildGrid(MAP, 0);
  for (let k = 0; k < 50; k++) {
    const p = randomWalkableNear(g, 8, 21, 6);
    assert.ok(isWalkable(g, p.x, p.y), `(${p.x},${p.y})`);
  }
});

let fail = 0;
for (const [name, fn] of tests) {
  try { fn(); console.log('ok -', name); }
  catch (e) { fail++; console.error('FAIL -', name, '\n', e.message); }
}
process.exit(fail ? 1 : 0);

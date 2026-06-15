import assert from 'node:assert';
import { SpatialHash } from '../src/sim/spatialHash.js';
import { resolveCollisions, pushOutOfWalls } from '../src/sim/steering.js';
import { findPath, nearestWaypoint } from '../src/sim/pathfinding.js';
import { MAP } from '../src/data/map.js';

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

test('walls: агента выталкивает из стены', () => {
  const a = { x: 5, y: 0.1, radius: 0.3 };
  pushOutOfWalls(a, [[0, 0, 10, 0]]);
  assert.ok(Math.abs(a.y) >= 0.3 - 1e-9);
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

let fail = 0;
for (const [name, fn] of tests) {
  try { fn(); console.log('ok -', name); }
  catch (e) { fail++; console.error('FAIL -', name, '\n', e.message); }
}
process.exit(fail ? 1 : 0);

import { T } from './data/tuning.js';
import { MAP } from './data/map.js';
import { draw } from './render/draw.js';
import { makeAgent } from './sim/agent.js';
import { SpatialHash } from './sim/spatialHash.js';
import { simTick } from './sim/steering.js';
import { findPath, nearestWaypoint } from './sim/pathfinding.js';

const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');

export const world = { t: 0, map: MAP, agents: [], flashes: [], debug: false, hash: new SpatialHash(1) };

window.addEventListener('keydown', e => { if (e.key === 'd') world.debug = !world.debug; });

for (let i = 0; i < T.agentCount; i++) {
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
}

let acc = 0, last = performance.now();
function frame(now) {
  acc += Math.min(0.1, (now - last) / 1000); last = now;
  const dt = 1 / T.simHz;
  while (acc >= dt) { simTick(world, dt); world.t += dt; acc -= dt; }
  render();
  requestAnimationFrame(frame);
}
function render() { draw(ctx, world); }
requestAnimationFrame(frame);
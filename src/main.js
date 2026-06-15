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
world.closeDoor = idx => closeDoor(world, idx);
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

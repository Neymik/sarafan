import { T } from './data/tuning.js';
import { MAP } from './data/map.js';
import { draw } from './render/draw.js';
import { makeAgent } from './sim/agent.js';
import { SpatialHash } from './sim/spatialHash.js';
import { simTick } from './sim/steering.js';
import { makeWorldFacts } from './sim/knowledge.js';

const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');

export const world = { t: 0, map: MAP, agents: [], flashes: [], debug: false, hash: new SpatialHash(1),
  facts: makeWorldFacts(), edgePassable: new Uint8Array(MAP.edges.length).fill(1),
  edgeCongestion: new Uint8Array(MAP.edges.length), congTimer: 0 };
window.world = world;

window.addEventListener('keydown', e => { if (e.key === 'd') world.debug = !world.debug; });

for (let i = 0; i < T.agentCount; i++) world.agents.push(makeAgent(world, i));

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
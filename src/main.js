import { T } from './data/tuning.js';
import { MAP } from './data/map.js';
import { draw } from './render/draw.js';
import { makeAgent } from './sim/agent.js';
import { SpatialHash } from './sim/spatialHash.js';
import { simTick } from './sim/steering.js';

const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');

export const world = { t: 0, map: MAP, agents: [], flashes: [], debug: false, hash: new SpatialHash(1) };

window.addEventListener('keydown', e => { if (e.key === 'd') world.debug = !world.debug; });

for (let i = 0; i < T.agentCount; i++) {
  const a = makeAgent(world, i);
  const z = world.map.zones[(Math.random() * world.map.zones.length) | 0].rect;
  a.target = { x: z[0] + Math.random() * z[2], y: z[1] + Math.random() * z[3] }; // ВРЕМЕННО, уберётся в Task 5
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
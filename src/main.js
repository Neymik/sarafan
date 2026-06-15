import { T } from './data/tuning.js';
import { MAP } from './data/map.js';
import { draw } from './render/draw.js';

const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');

export const world = { t: 0, map: MAP, agents: [], flashes: [], debug: false };

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
function render() { draw(ctx, world); }
requestAnimationFrame(frame);
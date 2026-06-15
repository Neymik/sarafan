import { T } from './data/tuning.js';
import { MAP, solidRects } from './data/map.js';
import { draw } from './render/draw.js';
import { drawDebug } from './render/debug.js';
import { SpatialHash } from './sim/spatialHash.js';
import { simTick } from './sim/steering.js';
import { makeWorldFacts } from './sim/knowledge.js';
import { Fields } from './sim/flowfield.js';
import { initBoards } from './ui/boards.js';
import { initInspector, updateInspector } from './ui/inspector.js';
import { drawHud } from './ui/hud.js';
import { tickSchedule } from './data/schedule.js';
import { initQueues } from './sim/queue.js';
import { initLogistics, logisticsTick } from './sim/logistics.js';
import { specialTick } from './sim/special.js';
import { incidentsTick } from './sim/incidents.js';
import { initScore, scoreTick, updateScorePanel } from './sim/score.js';
import { maybeFinale } from './ui/finale.js';
import { initTools } from './ui/tools.js';
import { initSimPanel } from './ui/simpanel.js';
import { makeEvents, eventStatusTick, eventRescheduleTick } from './data/events.js';
import { luresTick } from './sim/lures.js';
import { updateTimeline } from './ui/timeline.js';
import { initLegend } from './ui/legend.js';

const canvas = document.getElementById('c');
canvas.width = MAP.w * T.pxPerMeter; canvas.height = MAP.h * T.pxPerMeter;
const ctx = canvas.getContext('2d');

export const world = {
  t: 0, map: MAP, agents: [], flashes: [], litter: [],
  events: makeEvents(MAP), lures: [],
  debug: false, selected: null, paused: false, speedMul: 1, over: false, closing: false,
  hash: new SpatialHash(1), facts: makeWorldFacts(),
  obstMask: 0, fields: new Fields(MAP),
};
world.syncObstacles = () => {
  world.obstMask = world.fields.activeMask();
  world.obstacles = [...solidRects(MAP), ...world.fields.slots.filter(Boolean)];
};
world.syncObstacles();
initQueues(world); initLogistics(world); initScore(world);
window.world = world;

window.addEventListener('keydown', e => { if (e.key === 'd') world.debug = !world.debug; });
initTools(canvas, world);          // ДО boards/inspector: режимы фильтруют клики
initBoards(canvas, world);
initInspector(canvas, world);
initSimPanel(world);
initLegend(world);

// мир стартует пустым — волна открытия заходит через tickSchedule

let acc = 0, last = performance.now();
function frame(now) {
  acc += Math.min(0.1, (now - last) / 1000); last = now;
  const dt = 1 / T.simHz;
  while (acc >= dt) {
    acc -= dt;
    if (world.paused || world.over) continue;
    for (let s = 0; s < (world.speedMul ?? 1); s++) {
      tickSchedule(world);
      eventStatusTick(world);
      // maybeReschedule: локальный таймер
      if ((world.nextReschedule ?? 0) === 0) world.nextReschedule = T.rescheduleEvery;
      if (world.t >= world.nextReschedule) {
        world.nextReschedule = world.t + T.rescheduleEvery + (Math.random() * 2 - 1) * T.rescheduleJitter;
        eventRescheduleTick(world);
      }
      specialTick(world, dt);
      logisticsTick(world);
      incidentsTick(world, dt);
      luresTick(world);
      simTick(world, dt);
      scoreTick(world, dt);
      world.t += dt;
    }
  }
  draw(ctx, world);
  if (world.debug) drawDebug(ctx, world);
  drawHud(ctx, world);
  updateTimeline(world);
  updateInspector(world);
  updateScorePanel(world);
  maybeFinale(world);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

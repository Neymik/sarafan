import { T, gameClock, fmtClock } from '../data/tuning.js';

export function drawHud(ctx, world) {
  // часы
  ctx.fillStyle = '#fff'; ctx.font = 'bold 18px monospace';
  ctx.fillText(fmtClock(gameClock(world.t)), 12, 26);
  // средний стресс
  const avg = world.agents.reduce((s, a) => s + a.stress, 0) / (world.agents.length || 1);
  ctx.fillStyle = '#333'; ctx.fillRect(100, 12, 200, 14);
  ctx.fillStyle = avg > 60 ? '#e55' : avg > 30 ? '#ea3' : '#5c5';
  ctx.fillRect(100, 12, 2 * avg, 14);
  ctx.fillStyle = '#fff'; ctx.font = '11px monospace';
  ctx.fillText('стресс ' + avg.toFixed(0), 105, 23);
  // баннер события
  if (world.banner && world.t - world.banner.t < 4) {
    ctx.font = 'bold 16px monospace'; ctx.fillStyle = '#ffd34d';
    ctx.fillText(world.banner.text, 340, 26);
  }
}

import { T } from '../data/tuning.js';
const S = T.pxPerMeter;

export function drawDebug(ctx, world) {
  const g = world.fields.gridFor(world.obstMask ?? 0);
  // непроходимые клетки
  ctx.fillStyle = 'rgba(255,80,80,0.12)';
  for (let y = 0; y < g.H; y++) for (let x = 0; x < g.W; x++)
    if (!g.walk[y * g.W + x]) ctx.fillRect(x * S, y * S, S, S);
  // тепло плотности (из smart-полей)
  if (world.fields.density) {
    const d = world.fields.density;
    ctx.fillStyle = 'rgba(255,140,30,0.5)';
    for (let y = 0; y < g.H; y++) for (let x = 0; x < g.W; x++) {
      const v = d[y * g.W + x];
      if (v > 2) { ctx.globalAlpha = Math.min(0.5, v * 0.06); ctx.fillRect(x * S, y * S, S, S); }
    }
    ctx.globalAlpha = 1;
  }
  // поле выбранного агента: стрелки его clear-градиента
  const a = world.selected;
  if (a && a.goalPoi) {
    const mask = (a.obstMask ?? 0) & (world.obstMask ?? 0);
    ctx.strokeStyle = 'rgba(120,220,255,0.6)';
    for (let y = 1; y < g.H; y += 2) for (let x = 1; x < g.W; x += 2) {
      const dir = world.fields.dir(a.smartUntil > world.t ? 'smart' : 'clear', mask, a.goalPoi, x + 0.5, y + 0.5);
      if (!dir) continue;
      ctx.beginPath();
      ctx.moveTo((x + 0.5) * S, (y + 0.5) * S);
      ctx.lineTo((x + 0.5 + dir.x * 0.8) * S, (y + 0.5 + dir.y * 0.8) * S);
      ctx.stroke();
    }
  }
  // вектора скоростей
  ctx.strokeStyle = 'rgba(120,180,255,0.4)';
  for (const ag of world.agents) {
    ctx.beginPath(); ctx.moveTo(ag.x * S, ag.y * S); ctx.lineTo((ag.x + ag.vx) * S, (ag.y + ag.vy) * S); ctx.stroke();
  }
}

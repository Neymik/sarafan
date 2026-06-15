import { T } from '../data/tuning.js';
import { computeDesires } from '../sim/agent.js';
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
  // линии к топ-3 желаниям выбранного агента
  if (world.selected && !world.selected.despawn) {
    const desires = computeDesires(world.selected, world).slice(0, 3);
    desires.forEach((d, rank) => {
      const p = world.map.pois[d.key];
      if (!p) return;
      const alpha = 0.7 - rank * 0.2; // fade by rank
      ctx.strokeStyle = `rgba(255,220,80,${alpha})`; ctx.lineWidth = 1.5 - rank * 0.4;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(world.selected.x * S, world.selected.y * S);
      ctx.lineTo(p.fx * S, p.fy * S);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = `rgba(255,220,80,${alpha})`; ctx.font = '9px monospace';
      ctx.fillText(d.score.toFixed(1), (p.fx + 0.2) * S, (p.fy - 0.3) * S);
    });
  }
}

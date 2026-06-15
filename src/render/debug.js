import { T } from '../data/tuning.js';
const S = T.pxPerMeter;

export function drawDebug(ctx, world) {
  if (!world.map.edges) return; // v1-оверлей; переписывается в v2 Task 11
  // тепло плотности
  for (const a of world.agents) {
    if (a.density > T.comfortN) {
      ctx.fillStyle = `rgba(255,60,30,${Math.min(0.25, (a.density - T.comfortN) * 0.03)})`;
      ctx.beginPath(); ctx.arc(a.x * S, a.y * S, T.densityRadius * S, 0, 7); ctx.fill();
    }
  }
  // граф: рёбра по правде загрузки
  world.map.edges.forEach((e, i) => {
    const wa = world.map.waypoints[e.a], wb = world.map.waypoints[e.b];
    const c = world.edgeCongestion[i];
    ctx.strokeStyle = world.edgePassable[i] ? `rgba(${c},${255 - c},120,0.7)` : 'rgba(255,0,0,0.9)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(wa.x * S, wa.y * S); ctx.lineTo(wb.x * S, wb.y * S); ctx.stroke();
  });
  world.map.waypoints.forEach((w, i) => {
    ctx.fillStyle = '#fff'; ctx.font = '9px monospace'; ctx.fillText(String(i), w.x * S + 3, w.y * S - 3);
  });
  // вектора скоростей
  ctx.strokeStyle = 'rgba(120,180,255,0.5)';
  for (const a of world.agents) {
    ctx.beginPath(); ctx.moveTo(a.x * S, a.y * S); ctx.lineTo((a.x + a.vx) * S, (a.y + a.vy) * S); ctx.stroke();
  }
}

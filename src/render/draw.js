import { T } from '../data/tuning.js';
import { knowledgeLag } from '../sim/knowledge.js';
const S = T.pxPerMeter;

export function draw(ctx, world) {
  const { map } = world;
  ctx.fillStyle = '#10131a';
  ctx.fillRect(0, 0, map.w * S, map.h * S);
  ctx.fillStyle = '#262b38';
  for (const b of map.blocks) ctx.fillRect(b.x * S, b.y * S, b.w * S, b.h * S);
  ctx.strokeStyle = '#3a4356'; ctx.lineWidth = 1;
  for (const b of map.blocks) ctx.strokeRect(b.x * S, b.y * S, b.w * S, b.h * S);
  if (world.doorsClosed) map.doors.forEach((d, i) => {
    if (world.doorsClosed & (1 << i)) { ctx.fillStyle = '#a33'; ctx.fillRect(d.x * S, d.y * S, d.w * S, d.h * S); }
  });
  ctx.fillStyle = '#5a6478'; ctx.font = '10px monospace';
  for (const b of map.blocks) if (b.label) ctx.fillText(b.label, (b.x + 0.4) * S, (b.y + b.h / 2) * S);
  ctx.fillStyle = '#8fa';
  for (const [k, p] of Object.entries(map.pois)) { ctx.fillRect(p.x * S - 2, p.y * S - 2, 4, 4); ctx.fillText(p.label, p.x * S + 4, p.y * S - 4); }
  for (const b of map.boards) {
    ctx.fillStyle = '#4af'; ctx.fillRect(b.x * S - 5, b.y * S - 5, 10, 10);
  }
  drawAgents(ctx, world);
  drawFlashes(ctx, world);
}

export function agentColor(a, world) {
  if (world.t < a.deceivedUntil) return '#b06ee8';            // обманутый — фиолетовый
  const lag = Math.min(1, knowledgeLag(a, world) / T.lagRed); // 0 зел → 1 красн
  const r = Math.round(80 + 175 * lag), g = Math.round(200 - 140 * lag);
  return `rgb(${r},${g},80)`;
}

function drawAgents(ctx, world) {
  for (const a of world.agents) {
    ctx.fillStyle = agentColor(a, world);
    ctx.beginPath(); ctx.arc(a.x * S, a.y * S, a.radius * S, 0, 7); ctx.fill();
    if (a.stress > 60) {           // стресс-обводка, пульс
      ctx.strokeStyle = `rgba(255,255,255,${0.4 + 0.4 * Math.sin(world.t * 8 + a.id)})`;
      ctx.lineWidth = 1.5; ctx.stroke();
    }
    if (a.activity === 'lost') { ctx.fillStyle = '#ff0'; ctx.font = '12px monospace'; ctx.fillText('?!', a.x * S + 4, a.y * S - 4); }
    if (a.activity === 'phone') { ctx.fillStyle = '#0cf'; ctx.fillRect(a.x * S - 1, a.y * S - 6, 3, 4); }
  }
}
function drawFlashes(ctx, world) {
  world.flashes = world.flashes.filter(f => world.t - f.t < 1.2);
  for (const f of world.flashes) {
    const age = (world.t - f.t) / 1.2;
    ctx.strokeStyle = `rgba(120,255,160,${1 - age})`; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(f.x * S, f.y * S, age * T.boardRadius * S, 0, 7); ctx.stroke();
  }
}

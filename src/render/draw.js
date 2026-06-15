import { T, gameClock } from '../data/tuning.js';
const S = T.pxPerMeter;

export function draw(ctx, world) {
  const { map } = world;
  ctx.clearRect(0, 0, map.w * S, map.h * S);
  for (const z of map.zones) {
    const [x, y, w, h] = z.rect;
    ctx.fillStyle = z.color; ctx.fillRect(x * S, y * S, w * S, h * S);
  }
  ctx.strokeStyle = '#aab'; ctx.lineWidth = 2;
  for (const [x1, y1, x2, y2] of map.walls) {
    ctx.beginPath(); ctx.moveTo(x1 * S, y1 * S); ctx.lineTo(x2 * S, y2 * S); ctx.stroke();
  }
  for (const b of map.boards) {
    ctx.fillStyle = '#4af'; ctx.fillRect(b.x * S - 5, b.y * S - 5, 10, 10);
  }
  drawAgents(ctx, world);
  drawFlashes(ctx, world);
}

export function agentColor(a, world) { return '#7c7'; } // заменится в Task 8

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

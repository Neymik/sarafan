import { T } from '../data/tuning.js';
import { knowledgeLag } from '../sim/knowledge.js';
const S = T.pxPerMeter;

export function draw(ctx, world) {
  const { map } = world;
  ctx.fillStyle = '#10131a';
  ctx.fillRect(0, 0, map.w * S, map.h * S);
  // безымянные острова
  ctx.fillStyle = '#262b38';
  for (const b of map.blocks) ctx.fillRect(b.x * S, b.y * S, b.w * S, b.h * S);
  ctx.strokeStyle = '#3a4356'; ctx.lineWidth = 1;
  for (const b of map.blocks) ctx.strokeRect(b.x * S, b.y * S, b.w * S, b.h * S);
  // POI-объекты
  for (const [k, p] of Object.entries(map.pois)) {
    if (p.exit) {
      ctx.fillStyle = '#4f8'; ctx.font = '10px monospace';
      ctx.fillText('⌄ ' + p.label, p.x * S - 20, p.y * S);
      continue;
    }
    ctx.fillStyle = p.soldOut ? '#3a2a33' : p.staff ? '#33404d' : '#2c3a52';
    ctx.fillRect(p.x * S, p.y * S, p.w * S, p.h * S);
    ctx.strokeStyle = '#4a5d80'; ctx.strokeRect(p.x * S, p.y * S, p.w * S, p.h * S);
    ctx.fillStyle = '#9fc1e8'; ctx.font = '10px monospace';
    ctx.fillText(p.label, (p.x + 0.3) * S, (p.y + p.h / 2 + 0.2) * S);
    ctx.fillStyle = '#8fa'; ctx.fillRect(p.fx * S - 2, p.fy * S - 2, 4, 4); // прилавок
    if (p.stock !== undefined) {
      ctx.font = 'bold 10px monospace';
      ctx.fillStyle = p.soldOut ? '#e55' : p.stock === 0 ? '#fa3' : '#9fa';
      ctx.fillText(p.soldOut ? 'РАСПРОДАНО' : p.stock === 0 ? 'НЕТ ТОВАРА' : '×' + p.stock, p.fx * S + 6, p.fy * S - 6);
    }
  }
  // табло
  for (const b of map.boards) { ctx.fillStyle = '#4af'; ctx.fillRect(b.x * S - 5, b.y * S - 5, 10, 10); }
  // слоты препятствий: 0–2 ленты, 3–4 инциденты
  (world.fields?.slots ?? []).forEach((s, i) => {
    if (!s) return;
    ctx.fillStyle = i < 3 ? 'rgba(255,210,60,.55)' : 'rgba(255,70,70,.45)';
    ctx.fillRect(s.x * S, s.y * S, s.w * S, s.h * S);
    ctx.fillStyle = '#fff'; ctx.font = '12px monospace';
    ctx.fillText(i < 3 ? '🚧' : '⚠', (s.x + s.w / 2 - 0.4) * S, (s.y + s.h / 2 + 0.3) * S);
  });
  // мусор
  ctx.fillStyle = '#777';
  for (const l of world.litter ?? []) ctx.fillRect(l.x * S - 1, l.y * S - 1, 2, 2);
  // волонтёры
  for (const v of world.volunteers ?? []) {
    ctx.strokeStyle = '#3ef'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(v.x * S, v.y * S, 6, 0, 7); ctx.stroke();
    ctx.fillStyle = '#3ef'; ctx.font = 'bold 9px monospace'; ctx.fillText('V', v.x * S - 3, v.y * S + 3);
  }
  drawAgents(ctx, world);
  drawFlashes(ctx, world);
  if (world.selected && !world.selected.despawn) {
    const a = world.selected;
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(a.x * S, a.y * S, (a.radius + 0.4) * S, 0, 7); ctx.stroke();
    const goal = a.goalPoi ? { x: world.map.pois[a.goalPoi].fx, y: world.map.pois[a.goalPoi].fy } : a.target;
    if (goal) {
      ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(a.x * S, a.y * S); ctx.lineTo(goal.x * S, goal.y * S); ctx.stroke();
    }
  }
}

export function agentColor(a, world) {
  if (a.kind === 'carrier') return '#f80';
  if (a.kind === 'janitor') return '#889';
  if (a.kind === 'streamer') return '#fd4';
  if (a.kind === 'cosplayStar') return '#f6a';
  if (a.kind === 'journalist') return '#eee';
  if (world.t < a.deceivedUntil) return '#b06ee8';
  const lag = Math.min(1, knowledgeLag(a, world) / T.lagRed);
  const r = Math.round(80 + 175 * lag), g = Math.round(200 - 140 * lag);
  return `rgb(${r},${g},80)`;
}

function drawAgents(ctx, world) {
  ctx.font = '10px monospace';
  for (const a of world.agents) {
    if (a.dragged) {  // тень под поднятым
      ctx.fillStyle = 'rgba(0,0,0,.5)';
      ctx.beginPath(); ctx.arc(a.x * S + 3, a.y * S + 5, a.radius * S, 0, 7); ctx.fill();
    }
    ctx.fillStyle = agentColor(a, world);
    ctx.beginPath(); ctx.arc(a.x * S, a.y * S, a.radius * S * (a.dragged ? 1.3 : 1), 0, 7); ctx.fill();
    if (a.superfan) { ctx.strokeStyle = '#f44'; ctx.lineWidth = 1.5; ctx.stroke(); }
    else if (a.stress > 60) {
      ctx.strokeStyle = `rgba(255,255,255,${0.4 + 0.4 * Math.sin(world.t * 8 + a.id)})`;
      ctx.lineWidth = 1.5; ctx.stroke();
    }
    const icon =
      a.activity === 'lost' ? '?!' :
      a.searching ? '💔' :
      a.kind === 'carrier' ? '📦' :
      a.kind === 'streamer' ? '📷' :
      a.kind === 'cosplayStar' ? '⭐' :
      a.kind === 'janitor' ? '🧹' :
      a.kind === 'journalist' ? '✎' :
      a.activity === 'talk' ? '💬' : null;
    if (icon) { ctx.fillStyle = '#ff0'; ctx.fillText(icon, a.x * S + 4, a.y * S - 4); }
    if (a.activity === 'phone') { ctx.fillStyle = '#0cf'; ctx.fillRect(a.x * S - 1, a.y * S - 6, 3, 4); }
  }
}

function drawFlashes(ctx, world) {
  world.flashes = world.flashes.filter(f => world.t - f.t < 1.2);
  for (const f of world.flashes) {
    const age = (world.t - f.t) / 1.2;
    if (f.kind === 'heart') {
      ctx.fillStyle = `rgba(255,120,170,${1 - age})`; ctx.font = '16px monospace';
      ctx.fillText('💗', f.x * S - 8, (f.y - age * 1.5) * S);
      continue;
    }
    ctx.strokeStyle = `rgba(120,255,160,${1 - age})`; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(f.x * S, f.y * S, age * (f.r ?? T.boardRadius) * S, 0, 7); ctx.stroke();
  }
}

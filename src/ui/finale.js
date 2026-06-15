import { gameClock } from '../data/tuning.js';

export function maybeFinale(world) {
  if (world.over || gameClock(world.t) < 16 * 3600) return;
  world.over = true;
  const s = world.score;
  const avg = s.stressHist.reduce((a, b) => a + b, 0) / (s.stressHist.length || 1);
  const press = s.press.pos - s.press.neg;
  const total = Math.max(1, world.nextId ?? world.agents.length);
  const angryShare = s.angry / total;
  const verdict =
    s.incidents === 0 && press >= 3 && angryShare < 0.10 && avg < 45 ? '🏆 Образцовый конвент' :
    s.incidents > 2 || press <= -3 || angryShare > 0.35 ? '🔥 Позор в прессе' :
    '😮‍💨 Выжили';
  const el = document.getElementById('finale');
  el.innerHTML = `<div>
    <h1>${verdict}</h1>
    <p>средний стресс часа пик: ${avg.toFixed(0)}</p>
    <p>обслужено: ${world.served ?? 0} · на концерт успели: ${s.concertWant ? Math.round(100 * s.concertHit / s.concertWant) + '%' : '—'}</p>
    <p>ушли злыми: ${s.angry} (${Math.round(100 * angryShare)}%) · инциденты: ${s.incidents} · пресса: ${press > 0 ? '+' : ''}${press}</p>
    <p style="opacity:.6">F5 — новый день</p>
  </div>`;
  el.style.display = 'flex';
}

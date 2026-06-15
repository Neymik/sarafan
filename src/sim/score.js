import { T } from '../data/tuning.js';

export function initScore(world) {
  world.score = {
    incidents: 0, angry: 0,
    press: { pos: 0, neg: 0 },
    concertWant: 0, concertHit: 0,
    stressHist: [],
  };
}

export function scoreTick(world, dt) {
  const s = world.score;
  s.histTimer = (s.histTimer ?? 0) - dt;
  if (s.histTimer <= 0) {
    s.histTimer = 1;
    const avg = world.agents.reduce((sum, a) => sum + a.stress, 0) / (world.agents.length || 1);
    s.stressHist.push(avg);
    if (s.stressHist.length > 60) s.stressHist.shift();
  }
  // журналист «снимает кадр»
  s.pressTimer = (s.pressTimer ?? 0) - dt;
  if (s.pressTimer <= 0) {
    s.pressTimer = T.pressCheckEvery;
    const j = world.agents.find(a => a.kind === 'journalist');
    if (j) {
      const around = world.hash.queryCircle(j.x, j.y, 8).filter(a => a !== j);
      const incidentNear = [3, 4].some(i => {
        const s = world.fields?.slots?.[i];
        return s && (s.x + s.w / 2 - j.x) ** 2 + (s.y + s.h / 2 - j.y) ** 2 < 64;
      });
      if (incidentNear || around.some(a => a.activity === 'mobbing')) s.press.neg++;
      else if (around.length > 3) {
        const avg = around.reduce((sum, a) => sum + a.stress, 0) / around.length;
        if (avg < 40 && around.some(a => a.activity === 'browse' || a.activity === 'queue')) s.press.pos++;
      }
    }
  }
}

export function updateScorePanel(world) {
  const el = document.getElementById('score');
  if (!el) return;
  const s = world.score;
  const avg = s.stressHist[s.stressHist.length - 1] ?? 0;
  const spark = s.stressHist.map(v => '▁▂▃▄▅▆▇█'[Math.min(7, (v / 12.5) | 0)]).join('');
  const press = s.press.pos - s.press.neg;
  el.textContent =
`── СЧЁТ ──
стресс ${avg.toFixed(0)}
${spark}
обслужено: ${world.served ?? 0}
концерт: ${s.concertWant ? Math.round(100 * s.concertHit / s.concertWant) + '%' : '—'}
ушли злыми: ${s.angry}
инциденты: ${s.incidents}
пресса 📰: ${press > 0 ? '+' : ''}${press}`;
}

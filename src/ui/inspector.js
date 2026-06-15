import { T, fmtClock } from '../data/tuning.js';
import { knowledgeLag } from '../sim/knowledge.js';

export function initInspector(canvas, world) {
  const el = document.getElementById('inspector');
  canvas.addEventListener('click', e => {
    if (world.ui && world.ui.mode !== 'cursor') return;
    const r = canvas.getBoundingClientRect();
    const mx = (e.clientX - r.left) / T.pxPerMeter, my = (e.clientY - r.top) / T.pxPerMeter;
    // табло в приоритете
    if (world.map.boards.some(b => Math.hypot(b.x - mx, b.y - my) < 2)) return;
    let best = null, bd = 1;
    for (const a of world.agents) {
      const d = Math.hypot(a.x - mx, a.y - my);
      if (d < bd) { bd = d; best = a; }
    }
    world.selected = best;
    el.style.display = best ? 'block' : 'none';
  });
  window.addEventListener('keydown', e => { if (e.key === 'Escape') { world.selected = null; el.style.display = 'none'; } });
}

export function updateInspector(world) {
  const el = document.getElementById('inspector');
  const a = world.selected;
  if (!a) { el.style.display = 'none'; return; }
  const bel = a.beliefs.events.concert, f = world.facts.concert;
  const bar = v => '█'.repeat(Math.round(v / 10)).padEnd(10, '·');
  const totalPois = Object.keys(world.map.pois).length;
  el.style.display = 'block';
  el.textContent =
`#${a.id} ${a.preset}  [${a.activity}]
stress  ${bar(a.stress)} ${a.stress | 0}
fatigue ${bar(a.fatigue)} ${a.fatigue | 0}
boredom ${bar(a.boredom)} ${a.boredom | 0}
phone   ${bar(a.phoneItch)} ${a.phoneItch | 0}
─ характер ─
sociability ${a.sociability.toFixed(2)}  stubborn ${a.stubborn.toFixed(2)}
politeness ${a.politeness.toFixed(2)}  conformity ${a.conformity.toFixed(2)}
mass ${a.mass.toFixed(1)}  speed ${a.maxSpeed.toFixed(1)}  agility ${a.agility.toFixed(1)}
─ знание ─
POI: ${a.beliefs.knownPois.size}/${totalPois}  jamMarks: ${a.beliefs.jamMarks.length}  двери: ${a.doorMask}
концерт: верит ${fmtClock(bel.time)}/${bel.status}
правда:  ${fmtClock(f.time)}/${f.status} ${knowledgeLag(a, world) > 0 ? '⚠ ОТСТАЛ' : '✓'}
─ цель ─
${a.goalPoi ? world.map.pois[a.goalPoi].label + (a.smartUntil > world.t ? ' [обходит]' : ' [по памяти]') : (a.target ? 'локальная точка' : '—')}
visited ${a.visitedCount}/${a.satThreshold}`;
}

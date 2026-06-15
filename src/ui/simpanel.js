import { spawnAt } from '../data/schedule.js';
import { EXITS } from '../data/map.js';

export function initSimPanel(world) {
  const el = document.getElementById('simpanel');
  el.innerHTML = `<b>сим:</b>
    <button id="spPlus">+50</button><button id="spMinus">−50</button><button id="spWave">волна 100</button>
    <button id="spPause">⏸</button><button id="spSpeed">×1</button>
    <button id="spCalm">сброс стресса</button>
    <label><input type="checkbox" id="spDebug"> debug</label>
    <span id="spPois"></span>`;
  const sp = id => document.getElementById(id);
  const rndExit = () => EXITS[(Math.random() * EXITS.length) | 0];
  sp('spPlus').onclick = () => { for (let i = 0; i < 50; i++) spawnAt(world, rndExit()); };
  sp('spWave').onclick = () => { for (let i = 0; i < 100; i++) spawnAt(world, rndExit()); };
  sp('spMinus').onclick = () => {
    const vis = world.agents.filter(a => a.kind === 'visitor');
    for (let i = 0; i < 50 && vis.length; i++) vis.splice((Math.random() * vis.length) | 0, 1)[0].despawn = true;
  };
  sp('spPause').onclick = () => { world.paused = !world.paused; sp('spPause').textContent = world.paused ? '▶' : '⏸'; };
  sp('spSpeed').onclick = () => { world.speedMul = world.speedMul === 2 ? 1 : 2; sp('spSpeed').textContent = '×' + world.speedMul; };
  sp('spCalm').onclick = () => { for (const a of world.agents) a.stress = 0; };
  sp('spDebug').onchange = e => { world.debug = e.target.checked; };
  // чекбоксы POI: weight→0 на лету; сервисные — роспуск очереди (обратимый)
  const box = sp('spPois');
  for (const [k, p] of Object.entries(world.map.pois)) {
    if (p.exit || p.staff || p.weight <= 0) continue;
    const lb = document.createElement('label');
    const cb = document.createElement('input');
    cb.type = 'checkbox'; cb.checked = true;
    cb.onchange = () => {
      if (!cb.checked) {
        p.weight0 = p.weight; p.weight = 0;
        const q = world.queues?.[k];
        if (q) { for (const a of q.line) { a.activity = 'wander'; a.target = null; } q.line = []; }
      } else if (!p.soldOut) p.weight = p.weight0 ?? p.weight;
    };
    lb.append(cb, document.createTextNode(p.label.slice(0, 8)));
    box.appendChild(lb);
  }
}

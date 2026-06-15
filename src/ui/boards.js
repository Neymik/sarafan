import { T } from '../data/tuning.js';
import { boardBroadcast } from '../sim/knowledge.js';
import { makeBoardMessages, composerOptions } from '../data/messages.js';

// Общий конструктор: рисует формы в #cards, onPick(applyFn, label) — что делать с выбором.
export function openComposer(world, screenX, screenY, onPick, withLocal = null) {
  const el = document.getElementById('cards');
  el.innerHTML = '';
  el.style.left = Math.min(screenX, innerWidth - 280) + 'px';
  el.style.top = Math.min(screenY, innerHeight - 240) + 'px';
  el.style.display = 'flex';
  const M = makeBoardMessages(world);
  const opts = composerOptions(world);

  const row = (labelText, selectOpts, makeFn) => {
    const div = document.createElement('div');
    const sel = document.createElement('select');
    for (const o of selectOpts) { const op = document.createElement('option'); op.value = o.key; op.textContent = o.label; sel.appendChild(op); }
    const btn = document.createElement('button');
    btn.textContent = labelText;
    btn.onclick = () => { onPick(makeFn(sel.value), `${labelText}: ${sel.selectedOptions[0].textContent}`); el.style.display = 'none'; };
    div.append(btn, sel);
    el.appendChild(div);
  };
  row('Продвинуть', opts.pois, M.promote);
  row('Затор у', opts.pois, M.jam);
  for (const c of opts.concert) {
    const btn = document.createElement('button');
    btn.textContent = c.label;
    btn.onclick = () => { onPick(M.concert(c.kind), c.label); el.style.display = 'none'; };
    el.appendChild(btn);
  }
  if (withLocal) {
    const btn = document.createElement('button');
    btn.textContent = 'Карта участка (POI/ленты/заторы рядом)';
    btn.onclick = () => { onPick(M.local(withLocal), 'Карта участка'); el.style.display = 'none'; };
    el.appendChild(btn);
  }
}

export function initBoards(canvas, world) {
  const cardsEl = document.getElementById('cards');
  canvas.addEventListener('click', e => {
    const r = canvas.getBoundingClientRect();
    const mx = (e.clientX - r.left) / T.pxPerMeter, my = (e.clientY - r.top) / T.pxPerMeter;
    const board = world.map.boards.find(b => Math.hypot(b.x - mx, b.y - my) < 2);
    cardsEl.style.display = 'none';
    if (!board) return;
    openComposer(world, e.clientX, e.clientY,
      applyFn => boardBroadcast(world, board, applyFn), board);
  });
}

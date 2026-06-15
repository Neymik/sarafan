import { T } from '../data/tuning.js';
import { boardBroadcast } from '../sim/knowledge.js';
import { messagesFor } from '../data/messages.js';

export function initBoards(canvas, world) {
  const cardsEl = document.getElementById('cards');
  canvas.addEventListener('click', e => {
    const r = canvas.getBoundingClientRect();
    const mx = (e.clientX - r.left) / T.pxPerMeter, my = (e.clientY - r.top) / T.pxPerMeter;
    const board = world.map.boards.find(b => Math.hypot(b.x - mx, b.y - my) < 2);
    cardsEl.style.display = 'none'; cardsEl.innerHTML = '';
    if (!board) return;
    cardsEl.style.left = e.clientX + 'px'; cardsEl.style.top = e.clientY + 'px';
    cardsEl.style.display = 'flex';
    for (const msg of messagesFor(world, board)) {
      const btn = document.createElement('button');
      btn.textContent = msg.label;
      btn.onclick = () => { boardBroadcast(world, board, msg.apply); cardsEl.style.display = 'none'; };
      cardsEl.appendChild(btn);
    }
  });
}

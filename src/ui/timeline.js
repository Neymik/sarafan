import { fmtClock, gameClock } from '../data/tuning.js';
export function updateTimeline(world) {
  const el = document.getElementById('timeline'); if (!el) return;
  const gc = gameClock(world.t) - 13 * 3600;  // offset from 13:00 matches event.time
  const rows = (world.events ?? []).slice().sort((a, b) => a.time - b.time).map(e => {
    const icon = e.status === 'live' ? '🔴' : e.status === 'over' ? '✓' : '⏳';
    const moved = (world.t - e.changedAt < 6 && e.status === 'upcoming') ? ' ⏰' : '';
    const left = e.time - gc;
    const cd = e.status === 'upcoming' && left > 0 ? ` (−${Math.ceil(left / 60)}м)` : '';
    return `${icon} ${fmtClock(13 * 3600 + e.time)} ${e.title.slice(0, 16)}${cd}${moved}`;
  }).join('\n');
  el.textContent = '── ТАЙМЛАЙН ──\n' + rows;
}

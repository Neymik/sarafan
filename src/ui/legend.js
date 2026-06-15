export function initLegend(world) {
  const el = document.getElementById('legend');
  el.textContent =
`── ЛЕГЕНДА ──  (L — скрыть)
зелёный→красный: свежесть знаний
мигает белым: высокий стресс
фиолетовый: обманут
🟠 грузчик  ⚪ журналист
🟡 стример  🩷 косплеер-звезда
⚙ серый: уборщик  🟦 волонтёр
лидер: с группой follow
💔(цвет): потерянная пара
🚧 барьер  ⚠ инцидент  · мусор`;
  window.addEventListener('keydown', e => {
    if (e.key === 'l' || e.key === 'L') el.style.display = el.style.display === 'none' ? 'block' : 'none';
  });
}

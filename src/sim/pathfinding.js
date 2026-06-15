export function nearestWaypoint(map, x, y) {
  let best = 0, bd = Infinity;
  map.waypoints.forEach((w, i) => {
    const d = (w.x - x) ** 2 + (w.y - y) ** 2;
    if (d < bd) { bd = d; best = i; }
  });
  return best;
}

// Дейкстра по убеждениям агента. Возвращает [wpId,...] или null.
export function findPath(map, beliefs, from, to) {
  const N = map.waypoints.length;
  const dist = new Array(N).fill(Infinity), prev = new Array(N).fill(-1), done = new Array(N).fill(false);
  dist[from] = 0;
  for (;;) {
    let u = -1, ud = Infinity;
    for (let i = 0; i < N; i++) if (!done[i] && dist[i] < ud) { u = i; ud = dist[i]; }
    if (u === -1) break;
    if (u === to) break;
    done[u] = true;
    for (const ei of map.adj[u]) {
      if (!beliefs.edgeKnown[ei] || !beliefs.edgePassable[ei]) continue;
      const e = map.edges[ei];
      const v = e.a === u ? e.b : e.a;
      const cost = e.len * (1 + 0.02 * beliefs.edgeCongestion[ei]); // congestion 0..255
      if (dist[u] + cost < dist[v]) { dist[v] = dist[u] + cost; prev[v] = u; }
    }
  }
  if (dist[to] === Infinity) return null;
  const path = [];
  for (let v = to; v !== -1; v = prev[v]) path.unshift(v);
  return path;
}

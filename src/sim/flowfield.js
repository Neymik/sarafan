import { T } from '../data/tuning.js';
import { solidRects } from '../data/map.js';

const DIRS = [[1,0,1],[-1,0,1],[0,1,1],[0,-1,1],[1,1,1.4],[1,-1,1.4],[-1,1,1.4],[-1,-1,1.4]];

function stamp(walk, W, H, r) {
  const x0 = Math.max(0, Math.floor(r.x)), x1 = Math.min(W, Math.ceil(r.x + r.w));
  const y0 = Math.max(0, Math.floor(r.y)), y1 = Math.min(H, Math.ceil(r.y + r.h));
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) walk[y * W + x] = 0;
}

export function buildGrid(map, slots, mask) {
  const W = map.w, H = map.h;
  const walk = new Uint8Array(W * H).fill(1);
  for (let x = 0; x < W; x++) { walk[x] = 0; walk[(H - 1) * W + x] = 0; }
  for (let y = 0; y < H; y++) { walk[y * W] = 0; walk[y * W + W - 1] = 0; }
  for (const b of solidRects(map)) stamp(walk, W, H, b);
  (slots ?? []).forEach((s, i) => { if (s && (mask & (1 << i))) stamp(walk, W, H, s); });
  // clearance: BFS от всех стен, капаем на 3
  const clear = new Uint8Array(W * H).fill(255);
  const q = [];
  for (let i = 0; i < W * H; i++) if (!walk[i]) { clear[i] = 0; q.push(i); }
  for (let h = 0; h < q.length; h++) {
    const i = q[h], c = clear[i];
    if (c >= 3) continue;
    const x = i % W, y = (i / W) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const ni = ny * W + nx;
      if (clear[ni] > c + 1) { clear[ni] = c + 1; q.push(ni); }
    }
  }
  return { W, H, walk, clear };
}

export function isWalkable(grid, x, y) {
  const cx = x | 0, cy = y | 0;
  if (cx < 0 || cy < 0 || cx >= grid.W || cy >= grid.H) return false;
  return !!grid.walk[cy * grid.W + cx];
}

export function randomWalkableNear(grid, x, y, r) {
  for (let k = 0; k < 30; k++) {
    const px = x + (Math.random() - 0.5) * 2 * r, py = y + (Math.random() - 0.5) * 2 * r;
    if (isWalkable(grid, px, py)) return { x: px, y: py };
  }
  for (let rad = 1; rad < Math.max(grid.W, grid.H); rad++)
    for (let dy = -rad; dy <= rad; dy++) for (let dx = -rad; dx <= rad; dx++)
      if (isWalkable(grid, x + dx, y + dy)) return { x: (x + dx | 0) + 0.5, y: (y + dy | 0) + 0.5 };
  return { x, y };
}

// Дейкстра от клетки POI по всей сетке. cellCost(i) >= 1 или null (все клетки = 1).
export function computeField(grid, tx, ty, cellCost) {
  const { W, H, walk } = grid;
  const dist = new Float32Array(W * H).fill(Infinity);
  const start = (ty | 0) * W + (tx | 0);
  if (!walk[start]) return dist;
  dist[start] = 0;
  const heap = [[0, start]];
  const push = (d, i) => {
    heap.push([d, i]);
    let c = heap.length - 1;
    while (c > 0) { const p = (c - 1) >> 1; if (heap[p][0] <= heap[c][0]) break; [heap[p], heap[c]] = [heap[c], heap[p]]; c = p; }
  };
  const pop = () => {
    const top = heap[0], last = heap.pop();
    if (heap.length) {
      heap[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1; let m = i;
        if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
        if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
        if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m;
      }
    }
    return top;
  };
  while (heap.length) {
    const [d, i] = pop();
    if (d > dist[i]) continue;
    const cx = i % W, cy = (i / W) | 0;
    for (const [dx, dy, w] of DIRS) {
      const nx = cx + dx, ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const ni = ny * W + nx;
      if (!walk[ni]) continue;
      if (dx && dy && (!walk[cy * W + nx] || !walk[ny * W + cx])) continue; // не срезать углы
      const base = grid.clear[ni] === 1 ? 1.8 : grid.clear[ni] === 2 ? 1.3 : 1;
      const nd = d + w * base * (cellCost ? cellCost(ni) : 1);
      if (nd < dist[ni]) { dist[ni] = nd; push(dist[ni], ni); } // push stored f32 value to avoid f64/f32 precision mismatch in stale check
    }
  }
  return dist;
}

// Нормированный шаг к соседней клетке с минимальной дистанцией.
export function fieldDir(grid, field, x, y) {
  const { W, H, walk } = grid;
  const cx = x | 0, cy = y | 0;
  if (cx < 0 || cy < 0 || cx >= W || cy >= H) return null;
  let best = walk[cy * W + cx] ? field[cy * W + cx] : Infinity, bx = 0, by = 0;
  for (const [dx, dy] of DIRS) {
    const nx = cx + dx, ny = cy + dy;
    if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
    const ni = ny * W + nx;
    if (!walk[ni]) continue;
    if (dx && dy && (!walk[cy * W + nx] || !walk[ny * W + cx])) continue;
    if (field[ni] < best) { best = field[ni]; bx = dx; by = dy; }
  }
  if (!bx && !by) return null;
  const l = Math.hypot(bx, by);
  return { x: bx / l, y: by / l };
}

// Менеджер полей: clear по маскам активных слотов-препятствий (лениво) + smart на правде.
// Слоты 0–2 — барьеры игрока, 3–4 — инциденты.
export class Fields {
  constructor(map) {
    this.map = map;
    this.slots = [null, null, null, null, null];
    this.grids = new Map(); this.clear = new Map();
    this.smart = {}; this.smartMask = 0;
    this.gridFor(0);
  }
  activeMask() { let m = 0; this.slots.forEach((s, i) => { if (s) m |= 1 << i; }); return m; }
  setSlot(i, rect) { this.slots[i] = rect; this.invalidate(); }
  clearSlot(i) { this.slots[i] = null; this.invalidate(); }
  invalidate() { this.grids.clear(); this.clear.clear(); this.smart = {}; this.gridFor(0); }
  _cap(map) { if (map.size > T.fieldCacheMax) map.delete(map.keys().next().value); }
  gridFor(mask) {
    if (!this.grids.has(mask)) { this.grids.set(mask, buildGrid(this.map, this.slots, mask)); this._cap(this.grids); }
    return this.grids.get(mask);
  }
  clearFor(mask) {
    if (!this.clear.has(mask)) {
      const g = this.gridFor(mask), set = {};
      for (const [k, p] of Object.entries(this.map.pois)) set[k] = computeField(g, p.fx, p.fy, null);
      this.clear.set(mask, set); this._cap(this.clear);
    }
    return this.clear.get(mask);
  }
  recomputeSmart(agents, actualMask) {
    const g = this.gridFor(actualMask);
    this.smartMask = actualMask;
    const d = this.density = new Float32Array(g.W * g.H);
    for (const a of agents) {
      const i = (a.y | 0) * g.W + (a.x | 0);
      if (i >= 0 && i < d.length) d[i]++;
    }
    const cost = i => 1 + T.smartFieldK * d[i];
    for (const [k, p] of Object.entries(this.map.pois)) this.smart[k] = computeField(g, p.fx, p.fy, cost);
  }
  dir(mode, mask, poi, x, y) {
    if (mode === 'smart' && this.smart[poi]) return fieldDir(this.gridFor(this.smartMask ?? 0), this.smart[poi], x, y);
    const set = this.clearFor(mask);
    return set[poi] ? fieldDir(this.gridFor(mask), set[poi], x, y) : null;
  }
}

export class SpatialHash {
  constructor(cell) { this.cell = cell; this.map = new Map(); }
  key(cx, cy) { return cx * 100003 + cy; }
  rebuild(agents) {
    this.map.clear();
    for (const a of agents) {
      const k = this.key(Math.floor(a.x / this.cell), Math.floor(a.y / this.cell));
      let arr = this.map.get(k);
      if (!arr) { arr = []; this.map.set(k, arr); }
      arr.push(a);
    }
  }
  queryCircle(x, y, r) {
    const out = [], r2 = r * r;
    const x0 = Math.floor((x - r) / this.cell), x1 = Math.floor((x + r) / this.cell);
    const y0 = Math.floor((y - r) / this.cell), y1 = Math.floor((y + r) / this.cell);
    for (let cx = x0; cx <= x1; cx++) for (let cy = y0; cy <= y1; cy++) {
      const arr = this.map.get(this.key(cx, cy));
      if (arr) for (const a of arr) {
        const dx = a.x - x, dy = a.y - y;
        if (dx * dx + dy * dy <= r2) out.push(a);
      }
    }
    return out;
  }
}

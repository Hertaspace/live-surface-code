if (typeof require !== "undefined" && typeof minWeightPerfectMatching === "undefined") {
  var minWeightPerfectMatching = require("./mwpm.js").minWeightPerfectMatching;
}
// Planar surface code. One layer holds rows x cols parity checks. h(r, c) joins check (r, c-1) to (r, c),
// where c = 0 and c = cols are legs that end on the left and right boundaries. v(r, c) joins (r, c) to (r+1, c).
class PlanarCode {
  constructor(rows, cols) {
    this.rows = rows; this.cols = cols;
    this.h = new Uint8Array(rows * (cols + 1));
    this.v = new Uint8Array(Math.max(0, rows - 1) * cols);
  }
  hid(r, c) { return r * (this.cols + 1) + c; }
  vid(r, c) { return r * this.cols + c; }
  check(r, c) { return r * this.cols + c; }
  flip(kind, r, c) { if (kind === "h") this.h[this.hid(r, c)] ^= 1; else this.v[this.vid(r, c)] ^= 1; }
  has(kind, r, c) { return kind === "h" ? this.h[this.hid(r, c)] : this.v[this.vid(r, c)]; }
  clearEdge(kind, r, c) { if (kind === "h") this.h[this.hid(r, c)] = 0; else this.v[this.vid(r, c)] = 0; }
  ends(kind, r, c) {
    if (kind === "v") return [[r, c], [r + 1, c]];
    const out = [];
    if (c > 0) out.push([r, c - 1]);
    if (c < this.cols) out.push([r, c]);
    return out;
  }
  syndrome() {
    const out = [];
    for (let r = 0; r < this.rows; r++) for (let c = 0; c < this.cols; c++) {
      let p = this.has("h", r, c) ^ this.has("h", r, c + 1);
      if (r > 0) p ^= this.has("v", r - 1, c);
      if (r < this.rows - 1) p ^= this.has("v", r, c);
      if (p) out.push({ r, c });
    }
    return out;
  }
  boundaryDistance(c) { return Math.min(c + 1, this.cols - c); }
  // lattice path as a list of steps, each with the edge it uses and the check it starts from
  path(a, b) {
    const steps = [];
    let { r, c } = a;
    while (c !== b.c) {
      const s = Math.sign(b.c - c), n = c + s;
      steps.push({ kind: "h", r, c: s > 0 ? n : c, from: { r, c }, to: { r, c: n } });
      c = n;
    }
    while (r !== b.r) {
      const s = Math.sign(b.r - r), n = r + s;
      steps.push({ kind: "v", r: s > 0 ? r : n, c, from: { r, c }, to: { r: n, c } });
      r = n;
    }
    return steps;
  }
  pathToBoundary(a) {
    const steps = [];
    const left = a.c + 1 <= this.cols - a.c;
    let c = a.c;
    if (left) { while (c >= 0) { steps.push({ kind: "h", r: a.r, c, from: { r: a.r, c }, to: c > 0 ? { r: a.r, c: c - 1 } : null }); c--; } }
    else { while (c < this.cols) { steps.push({ kind: "h", r: a.r, c: c + 1, from: { r: a.r, c }, to: c < this.cols - 1 ? { r: a.r, c: c + 1 } : null }); c++; } }
    return steps;
  }
  // Components of active edges touching the given checks. A component with no odd check is a cycle
  // relative to the boundary. It is a logical error when it uses an odd number of left-boundary legs.
  cycles(vertices) {
    const seen = new Uint8Array(this.rows * this.cols), out = [];
    const links = (r, c) => {
      const e = [];
      if (this.has("h", r, c)) e.push(["h", r, c, c > 0 ? [r, c - 1] : null]);
      if (this.has("h", r, c + 1)) e.push(["h", r, c + 1, c + 1 < this.cols ? [r, c + 1] : null]);
      if (r > 0 && this.has("v", r - 1, c)) e.push(["v", r - 1, c, [r - 1, c]]);
      if (r < this.rows - 1 && this.has("v", r, c)) e.push(["v", r, c, [r + 1, c]]);
      return e;
    };
    for (const s of vertices) {
      if (seen[this.check(s.r, s.c)] || !links(s.r, s.c).length) continue;
      const stack = [[s.r, s.c]], edges = new Map();
      let closed = true;
      seen[this.check(s.r, s.c)] = 1;
      while (stack.length) {
        const [r, c] = stack.pop(), e = links(r, c);
        if (e.length % 2) closed = false;
        for (const [kind, er, ec, nb] of e) {
          edges.set(kind + er + "," + ec, { kind, r: er, c: ec });
          if (nb && !seen[this.check(nb[0], nb[1])]) { seen[this.check(nb[0], nb[1])] = 1; stack.push(nb); }
        }
      }
      if (!closed) continue;
      let cross = 0;
      for (const e of edges.values()) if (e.kind === "h" && e.c === 0) cross ^= 1;
      out.push({ edges: [...edges.values()], winds: cross === 1, cross });
    }
    return out;
  }
  allChecks() { const a = []; for (let r = 0; r < this.rows; r++) for (let c = 0; c < this.cols; c++) a.push({ r, c }); return a; }
  logicalParity() { let x = 0; for (let r = 0; r < this.rows; r++) x ^= this.has("h", r, 0); return x; }
}
// Exact matching with a boundary: every event has a private boundary node, and boundary nodes pair freely at no cost.
function matchWithBoundary(code, events) {
  const N = events.length;
  if (!N) return [];
  const sep = (a, b) => Math.abs(a.r - b.r) + Math.abs(a.c - b.c) + Math.abs((a.t || 0) - (b.t || 0));
  const FAR = 4 * (code.rows + code.cols) + 8;
  const d = (i, j) => {
    if (i > j) [i, j] = [j, i];
    if (j < N) return sep(events[i], events[j]);
    if (i >= N) return 0;
    return j - N === i ? code.boundaryDistance(events[i].c) : FAR;
  };
  const mate = minWeightPerfectMatching(2 * N, d), out = [];
  for (let i = 0; i < N; i++) {
    if (mate[i] >= N) out.push([events[i], null]);
    else if (i < mate[i]) out.push([events[i], events[mate[i]]]);
  }
  return out;
}
// Streaming spacetime decoder for one layer: same idea as on the torus, with boundary matches added.
class SurfaceDecoder {
  constructor(code, age = 2, pm = 0) {
    this.code = code; this.age = age; this.pm = pm; this.round = 0; this.cap = Infinity; this.window = Infinity; this.buffer = 3;
    const n = code.rows * code.cols;
    this.syn = new Uint8Array(n); this.prev = new Uint8Array(n);
    this.shown = new Map(); this.busy = new Set(); this.nextId = 1;
  }
  error(kind, r, c) {
    const { code } = this;
    code.flip(kind, r, c);
    for (const [a, b] of code.ends(kind, r, c)) this.syn[code.check(a, b)] ^= 1;
  }
  remove(cycles) { for (const y of cycles) for (const e of y.edges) this.code.clearEdge(e.kind, e.r, e.c); return cycles; }
  measure(rnd = Math.random) {
    this.round++;
    const { code } = this, cycles = this.remove(code.cycles(code.allChecks())), fired = [];
    for (let i = 0; i < this.syn.length; i++) {
      const m = this.syn[i] ^ (rnd() < this.pm ? 1 : 0);
      if (m !== this.prev[i]) {
        const ev = { id: this.nextId++, r: Math.floor(i / code.cols), c: i % code.cols, t: this.round };
        this.shown.set(ev.id, ev); fired.push(ev);
      }
      this.prev[i] = m;
    }
    // Sliding window: match only the oldest stretch of time. Events near its far edge may be overlapped by
    // later rounds, so they help decide the pairing but are committed only once the window has moved past them.
    let free = [...this.shown.values()].filter(d => !this.busy.has(d.id)), limit = Infinity;
    const launches = [];
    if (free.length) {
      const oldest = free[0].t, within = free.filter(d => d.t <= oldest + this.window).slice(0, this.cap);
      if (within.length < free.length) { limit = Math.max(oldest + 2, within[within.length - 1].t - this.buffer); free = within; }   // always advance two rounds, faster than events arrive
    }
    const commit = (a, b) => {
      this.busy.add(a.id); if (b) this.busy.add(b.id);
      const path = b ? code.path(a, b) : code.pathToBoundary(a);
      launches.push({ a, b, path, weight: path.length + (b ? Math.abs(a.t - b.t) : 0) });
    };
    const held = [];
    for (const [a, b] of matchWithBoundary(code, free)) {
      if (this.round - a.t < this.age || (b && this.round - b.t < this.age)) continue;
      if (Math.min(a.t, b ? b.t : a.t) > limit) { held.push([a, b]); continue; }   // the older end decides
      commit(a, b);
    }
    // Progress guarantee: if the window committed nothing, the pair holding the oldest event goes through,
    // otherwise a pair spanning the buffer could pin the window in place for ever.
    if (!launches.length && held.length) commit(...held.reduce((x, y) => (Math.min(x[0].t, x[1] ? x[1].t : Infinity) <= Math.min(y[0].t, y[1] ? y[1].t : Infinity) ? x : y)));
    return { fired, launches, cycles };
  }
  finish(job) {
    for (const s of job.path) this.code.flip(s.kind, s.r, s.c);
    for (const d of [job.a, job.b]) if (d) { this.busy.delete(d.id); this.shown.delete(d.id); }
    const touched = job.path.map(s => s.from).concat(job.b ? [job.a, job.b] : [job.a]);
    return this.remove(this.code.cycles(touched));
  }
}
if (typeof module !== "undefined") module.exports = { PlanarCode, SurfaceDecoder, matchWithBoundary };

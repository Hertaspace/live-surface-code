const { PlanarCode, SurfaceDecoder } = require("../src/surface.js");
const rng = a => () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
function run(rows, cols, p, pm, rounds, seed) {
  const q = new PlanarCode(rows, cols), s = new PlanarCode(rows, cols), d = new SurfaceDecoder(q, 2, pm), r = rng(seed);
  let cross = 0, jobs = [], fails = 0, sum = 0, peak = 0;
  const tally = cs => { for (const c of cs) { cross ^= c.cross; if (c.winds) fails++; } };
  const land = j => { for (const st of j.path) s.flip(st.kind, st.r, st.c); tally(d.finish(j)); };
  const noise = (k, a, b) => { if (r() < p) { d.error(k, a, b); s.flip(k, a, b); } };
  for (let t = 0; t < rounds; t++) {
    for (let a = 0; a < rows; a++) for (let b = 0; b <= cols; b++) noise("h", a, b);
    for (let a = 0; a < rows - 1; a++) for (let b = 0; b < cols; b++) noise("v", a, b);
    const o = d.measure(r); tally(o.cycles); jobs.forEach(land); jobs = o.launches;
    peak = Math.max(peak, d.shown.size); let n = 0; for (const x of q.h) n += x; for (const x of q.v) n += x; sum += n;
  }
  d.pm = 0;
  for (let t = 0; t < 800 && (jobs.length || d.shown.size || q.h.some(x => x) || q.v.some(x => x)); t++) { jobs.forEach(land); jobs = []; const o = d.measure(r); tally(o.cycles); jobs = o.launches; }
  jobs.forEach(land); tally(d.measure(r).cycles);
  if (q.h.some(x => x) || q.v.some(x => x) || d.busy.size || d.shown.size) throw new Error("did not drain");
  return { agree: s.logicalParity() === cross, fails, peak, mean: sum / rounds };
}
console.log("rows cols p       pm      episodes agree failures peak events mean edges");
for (const [rw, c, p, pm, n, R] of [[18, 27, .0027, .003, 40, 400], [28, 17, .0027, .003, 40, 400], [28, 28, .0027, .003, 16, 400], [9, 9, .01, .01, 200, 300]]) {
  let ok = 0, f = 0, pk = 0, me = 0;
  for (let i = 0; i < n; i++) { const e = run(rw, c, p, pm, R, rw * 31 + i * 3); ok += e.agree; f += e.fails; pk = Math.max(pk, e.peak); me += e.mean; }
  console.log(`${String(rw).padEnd(4)} ${String(c).padEnd(4)} ${String(p).padEnd(7)} ${String(pm).padEnd(7)} ${String(n).padEnd(8)} ${String(ok).padEnd(5)} ${String(f).padEnd(8)} ${String(pk).padEnd(11)} ${(me / n).toFixed(2)}`);
}

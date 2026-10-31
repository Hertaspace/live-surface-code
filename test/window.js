// Sliding-window truncation against the untruncated decoder, on the same noise, with a shadow check.
const { PlanarCode, SurfaceDecoder } = require("../src/surface.js");
const rng = a => () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
function run(rows, cols, p, pm, rounds, seed, window, cap) {
  const q = new PlanarCode(rows, cols), s = new PlanarCode(rows, cols), d = new SurfaceDecoder(q, 2, pm), r = rng(seed);
  d.window = window; d.cap = cap;
  let cross = 0, jobs = [], fails = 0, peak = 0, worst = 0;
  const tally = cs => { for (const c of cs) { cross ^= c.cross; if (c.winds) fails++; } };
  const land = j => { for (const st of j.path) s.flip(st.kind, st.r, st.c); tally(d.finish(j)); };
  const noise = (k, a, b) => { if (r() < p) { d.error(k, a, b); s.flip(k, a, b); } };
  for (let t = 0; t < rounds; t++) {
    for (let a = 0; a < rows; a++) for (let b = 0; b <= cols; b++) noise("h", a, b);
    for (let a = 0; a < rows - 1; a++) for (let b = 0; b < cols; b++) noise("v", a, b);
    const t0 = performance.now(), o = d.measure(r); worst = Math.max(worst, performance.now() - t0);
    tally(o.cycles); jobs.forEach(land); jobs = o.launches;
    peak = Math.max(peak, d.shown.size);
  }
  d.pm = 0;
  for (let t = 0; t < 3000 && (jobs.length || d.shown.size || q.h.some(x => x) || q.v.some(x => x)); t++) { jobs.forEach(land); jobs = []; const o = d.measure(r); tally(o.cycles); jobs = o.launches; }
  jobs.forEach(land); tally(d.measure(r).cycles);
  if (q.h.some(x => x) || q.v.some(x => x) || d.busy.size || d.shown.size) throw new Error("did not drain");
  return { agree: s.logicalParity() === cross, fails, peak, worst };
}
console.log("rows cols p      pm     decoder            agree failures peak open  worst match ms");
for (const [rw, c, p, pm, n, R] of [[18, 27, .0067, .0067, 6, 300], [18, 27, .015, .015, 3, 200], [18, 27, .03, .03, 2, 150]]) {
  for (const [name, w, cap] of [["no truncation", Infinity, Infinity], ["window 8 cap 110", 8, 110], ["window 6 cap 80", 6, 80]]) {
    if (p > .02 && w === Infinity) { console.log(`${rw}   ${c}   ${p}  ${pm}  ${name.padEnd(18)} skipped, too slow to be usable`); continue; }
    let ok = 0, f = 0, pk = 0, wst = 0;
    for (let i = 0; i < n; i++) { const e = run(rw, c, p, pm, R, rw * 7 + i, w, cap); ok += e.agree; f += e.fails; pk = Math.max(pk, e.peak); wst = Math.max(wst, e.worst); }
    console.log(`${rw}   ${c}   ${String(p).padEnd(6)} ${String(pm).padEnd(6)} ${name.padEnd(18)} ${ok}/${n}  ${String(f).padEnd(8)} ${String(pk).padEnd(10)} ${wst.toFixed(0)}`);
  }
}

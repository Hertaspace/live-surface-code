const { PlanarCode, SurfaceDecoder, matchWithBoundary } = require("../src/surface.js");
const rng = a => () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
// units
{ const q = new PlanarCode(5, 5);
  q.flip("h", 2, 0); let s = q.syndrome(); if (s.length !== 1 || s[0].c !== 0) throw new Error("boundary leg must fire one check");
  for (let c = 1; c <= 5; c++) q.flip("h", 2, c);
  if (q.syndrome().length || q.logicalParity() !== 1) throw new Error("spanning chain is a logical");
  const y = q.cycles(q.allChecks()); if (y.length !== 1 || !y[0].winds) throw new Error("spanning chain must count as winding"); }
{ const q = new PlanarCode(6, 6); q.flip("h", 2, 2); q.flip("h", 3, 2); q.flip("v", 2, 1); q.flip("v", 2, 2);
  if (q.syndrome().length) throw new Error("plaquette loop"); const y = q.cycles(q.allChecks()); if (y.length !== 1 || y[0].winds) throw new Error("plaquette must be trivial"); }
{ const q = new PlanarCode(6, 6); q.flip("h", 1, 0); q.flip("v", 1, 0); q.flip("h", 2, 0);
  if (q.syndrome().length) throw new Error("left-left arc"); const y = q.cycles(q.allChecks()); if (y.length !== 1 || y[0].winds) throw new Error("same-side arc must be trivial"); }
{ const q = new PlanarCode(7, 7), d = new SurfaceDecoder(q, 1, 0); d.error("h", 3, 0); d.measure(); const o = d.measure();
  if (o.launches.length !== 1 || o.launches[0].b !== null || o.launches[0].path.length !== 1) throw new Error("edge event must match the boundary"); d.finish(o.launches[0]); if (q.h.some(x => x)) throw new Error("not corrected"); }
{ const q = new PlanarCode(7, 7), d = new SurfaceDecoder(q, 1, 0); d.error("h", 3, 3); d.measure(); const o = d.measure();
  if (o.launches.length !== 1 || !o.launches[0].b || o.launches[0].path.length !== 1) throw new Error("interior pair"); }
// boundary matching is exact against brute force
{ const rnd = rng(4); let n = 0;
  for (let k = 0; k < 4000; k++) {
    const q = new PlanarCode(9, 9), N = 1 + Math.floor(rnd() * 7), ev = Array.from({ length: N }, () => ({ r: Math.floor(rnd() * 9), c: Math.floor(rnd() * 9), t: Math.floor(rnd() * 4) }));
    const sep = (a, b) => Math.abs(a.r - b.r) + Math.abs(a.c - b.c) + Math.abs(a.t - b.t), bd = a => q.boundaryDistance(a.c);
    const f = new Map(); const best = m => { if (m === (1 << N) - 1) return 0; if (f.has(m)) return f.get(m); let i = 0; while (m >> i & 1) i++; let b = bd(ev[i]) + best(m | 1 << i); for (let j = i + 1; j < N; j++) if (!(m >> j & 1)) b = Math.min(b, sep(ev[i], ev[j]) + best(m | 1 << i | 1 << j)); f.set(m, b); return b; };
    const got = matchWithBoundary(q, ev).reduce((a, [u, v]) => a + (v ? sep(u, v) : bd(u)), 0);
    if (got !== best(0)) throw new Error(`boundary matching ${got} vs ${best(0)}`);
    n++;
  }
  console.log(`boundary matching exact on ${n} instances`); }
console.log("unit checks passed");
function capacity(L, p, seed, T) { const r = rng(seed); let f = 0;
  for (let k = 0; k < T; k++) { const q = new PlanarCode(L, L - 1);
    for (let i = 0; i < q.h.length; i++) if (r() < p) q.h[i] ^= 1;
    for (let i = 0; i < q.v.length; i++) if (r() < p) q.v[i] ^= 1;
    for (const [a, b] of matchWithBoundary(q, q.syndrome())) for (const s of b ? q.path(a, b) : q.pathToBoundary(a)) q.flip(s.kind, s.r, s.c);
    if (q.syndrome().length) throw new Error("residual"); f += q.logicalParity(); }
  return f / T; }
console.log("code capacity. Published threshold about 0.103");
console.log("d     p=0.07   p=0.09   p=0.10   p=0.11   p=0.13");
for (const [L, T] of [[7, 3000], [11, 1500], [15, 500], [21, 150]]) { let line = String(L).padEnd(6); for (const p of [.07, .09, .10, .11, .13]) line += capacity(L, p, L * 90 + p * 1e3, T).toFixed(4).padEnd(9); console.log(line); }
function pheno(L, p, seed, T) { const r = rng(seed); let f = 0;
  for (let k = 0; k < T; k++) { const q = new PlanarCode(L, L - 1), d = new SurfaceDecoder(q, 1e9, p);
    for (let t = 0; t <= L; t++) {
      if (t < L) { for (let a = 0; a < L; a++) for (let b = 0; b < L; b++) if (r() < p) d.error("h", a, b); for (let a = 0; a < L - 1; a++) for (let b = 0; b < L - 1; b++) if (r() < p) d.error("v", a, b); } else d.pm = 0;
      d.measure(r);
    }
    for (const [a, b] of matchWithBoundary(q, [...d.shown.values()])) for (const s of b ? q.path(a, b) : q.pathToBoundary(a)) q.flip(s.kind, s.r, s.c);
    if (q.syndrome().length) throw new Error("residual"); f += q.logicalParity(); }
  return f / T; }
console.log("with measurement errors, d rounds. Published threshold about 0.029");
console.log("d     p=0.020  p=0.025  p=0.030  p=0.035  p=0.040");
for (const [L, T] of [[5, 1500], [7, 500], [9, 160]]) { let line = String(L).padEnd(6); for (const p of [.02, .025, .03, .035, .04]) line += pheno(L, p, L * 70 + p * 1e4, T).toFixed(4).padEnd(9); console.log(line); }

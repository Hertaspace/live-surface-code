// How often is a pair in time really a misread check, at the on-screen rates?
const { PlanarCode, SurfaceDecoder } = require("../src/surface.js");
const rng = a => () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
function run(rows, cols, p, pm, rounds, seed) {
  const q = new PlanarCode(rows, cols), d = new SurfaceDecoder(q, 2, pm), noise = rng(seed), read = rng(seed + 1), mis = new Set();
  d.window = 8; d.cap = 110;
  let i = 0;
  const rnd = () => { const v = read(); if (v < pm) mis.add((d.round) + ":" + i); i++; return v; };
  let pairs = 0, ringAll = 0, ringTrue = 0, ringGapOne = 0, boundary = 0, spatial = 0, jobs = [], waits = [];
  for (let t = 0; t < rounds; t++) {
    for (let a = 0; a < rows; a++) for (let b = 0; b <= cols; b++) if (noise() < p) d.error("h", a, b);
    for (let a = 0; a < rows - 1; a++) for (let b = 0; b < cols; b++) if (noise() < p) d.error("v", a, b);
    i = 0;
    const o = d.measure(rnd);
    jobs.forEach(j => d.finish(j)); jobs = o.launches;
    for (const j of o.launches) {
      waits.push(d.round - Math.min(j.a.t, j.b ? j.b.t : j.a.t));
      if (!j.b) { boundary++; continue; }
      if (j.path.length) { spatial++; continue; }
      ringAll++;
      const lo = Math.min(j.a.t, j.b.t), gap = Math.abs(j.a.t - j.b.t);
      if (gap === 1) ringGapOne++;
      if (gap === 1 && mis.has(lo + ":" + q.check(j.a.r, j.a.c))) ringTrue++;
    }
  }
  waits.sort((a, b) => a - b);
  return { ringAll, ringGapOne, ringTrue, boundary, spatial, medianWait: waits[waits.length >> 1], p95Wait: waits[Math.floor(waits.length * .95)], misreads: mis.size };
}
console.log("Bit-flip rate on one lattice is 2/3 of the Pauli rate. Lattice 16 x 25.");
for (const [name, p, pm] of [["reading", .004 * 2 / 3, .003], ["full screen", .01 * 2 / 3, .0067]]) {
  const r = run(16, 25, p, pm, 40000, 11);
  console.log(`${name}: rings ${r.ringAll}, one round apart ${(100 * r.ringGapOne / r.ringAll).toFixed(1)}%, really a misread ${(100 * r.ringTrue / r.ringAll).toFixed(1)}% | spatial pairs ${r.spatial}, boundary ${r.boundary} | committed after a median of ${r.medianWait} rounds, 95% within ${r.p95Wait}`);
}

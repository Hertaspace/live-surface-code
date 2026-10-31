const { minWeightPerfectMatching: mw } = require("../src/mwpm.js");
const rng = a => () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const rnd = rng(9);
function brute(n, d) { const f = new Float64Array(1 << n).fill(Infinity); f[0] = 0;
  for (let m = 0; m < 1 << n; m++) { if (f[m] === Infinity) continue; let i = 0; while (i < n && m >> i & 1) i++; if (i === n) continue;
    for (let j = i + 1; j < n; j++) if (!(m >> j & 1)) { const k = m | 1 << i | 1 << j; f[k] = Math.min(f[k], f[m] + d(i, j)); } }
  return f[(1 << n) - 1]; }
function cost(mate, d) { let c = 0; mate.forEach((m, i) => { if (mate[m] !== i || m === i || m < 0) throw new Error("not a perfect matching"); if (i < m) c += d(i, m); }); return c; }
let blossomy = 0, greedyWorse = 0, N = 0;
for (const n of [2, 4, 6, 8, 10, 12, 14, 16]) for (let k = 0; k < (n > 12 ? 800 : 6000); k++) {
  const kind = k % 3, W = [];
  for (let i = 0; i < n; i++) { W.push(new Array(n).fill(0)); }
  if (kind === 0) for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) W[i][j] = W[j][i] = 1 + Math.floor(rnd() * 40);       // arbitrary weights force real blossoms
  else { const P = Array.from({ length: n }, () => [Math.floor(rnd() * 24), Math.floor(rnd() * 24)]), per = (a, b) => { const x = Math.abs(a - b); return Math.min(x, 24 - x); };
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) W[i][j] = W[j][i] = per(P[i][0], P[j][0]) + per(P[i][1], P[j][1]) + (kind === 2 ? 0 : 1); }
  const d = (i, j) => W[i][j], best = brute(n, d), got = cost(mw(n, d), d);
  if (got !== best) throw new Error(`n=${n} got ${got} best ${best}`);
  N++;
}
console.log(`exact against brute force on ${N} graphs, n up to 16`);

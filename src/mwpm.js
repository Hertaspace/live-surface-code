// Minimum-weight perfect matching on a complete graph, by Edmonds' blossom algorithm with duals, O(n^3).
// Input: even n and an integer distance d(i, j). Output: mate[i] for i in 0..n-1.
function minWeightPerfectMatching(n, d) {
  if (n === 0) return [];
  if (n % 2) throw new Error("odd vertex count");
  const N = n + n / 2 + 2 + n, size = 2 * n + 4;
  let dmax = 0;
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) dmax = Math.max(dmax, d(i, j));
  const BIG = (dmax + 1) * (n + 1);
  const gu = [], gv = [], gw = [];
  for (let i = 0; i < size; i++) { gu.push(new Int32Array(size)); gv.push(new Int32Array(size)); gw.push(new Float64Array(size)); }
  for (let u = 1; u < size; u++) for (let v = 1; v < size; v++) { gu[u][v] = u; gv[u][v] = v; }
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) { const w = BIG - d(i, j); gw[i + 1][j + 1] = gw[j + 1][i + 1] = w; }
  const lab = new Float64Array(size), match = new Int32Array(size), slack = new Int32Array(size), st = new Int32Array(size);
  const pa = new Int32Array(size), S = new Int32Array(size), vis = new Int32Array(size), from = [], flower = [];
  for (let i = 0; i < size; i++) { from.push(new Int32Array(size)); flower.push([]); }
  let nx = n, q = [], stamp = 0;
  const dist = (u, v) => lab[gu[u][v]] + lab[gv[u][v]] - gw[gu[u][v]][gv[u][v]] * 2;
  const updateSlack = (u, x) => { if (!slack[x] || dist(u, x) < dist(slack[x], x)) slack[x] = u; };
  const setSlack = x => { slack[x] = 0; for (let u = 1; u <= n; u++) if (gw[u][x] > 0 && st[u] !== x && S[st[u]] === 0) updateSlack(u, x); };
  const push = x => { if (x <= n) q.push(x); else for (const y of flower[x]) push(y); };
  const setSt = (x, b) => { st[x] = b; if (x > n) for (const y of flower[x]) setSt(y, b); };
  const getPr = (b, xr) => {
    const f = flower[b], pr = f.indexOf(xr);
    if (pr % 2 === 1) { const t = f.slice(1).reverse(); for (let i = 0; i < t.length; i++) f[i + 1] = t[i]; return f.length - pr; }
    return pr;
  };
  const setMatch = (u, v) => {
    match[u] = gv[u][v];
    if (u <= n) return;
    const eu = gu[u][v], xr = from[u][eu], pr = getPr(u, xr);
    for (let i = 0; i < pr; i++) setMatch(flower[u][i], flower[u][i ^ 1]);
    setMatch(xr, v);
    flower[u] = flower[u].slice(pr).concat(flower[u].slice(0, pr));
  };
  const augment = (u, v) => {
    for (;;) {
      const xnv = st[match[u]];
      setMatch(u, v);
      if (!xnv) return;
      setMatch(xnv, st[pa[xnv]]);
      u = st[pa[xnv]]; v = xnv;
    }
  };
  const lca = (u, v) => {
    stamp++;
    while (u || v) {
      if (u) {
        if (vis[u] === stamp) return u;
        vis[u] = stamp;
        u = st[match[u]];
        if (u) u = st[pa[u]];
      }
      [u, v] = [v, u];
    }
    return 0;
  };
  const addBlossom = (u, l, v) => {
    let b = n + 1;
    while (b <= nx && st[b]) b++;
    if (b > nx) nx++;
    lab[b] = 0; S[b] = 0; match[b] = match[l];
    const f = [l];
    for (let x = u, y; x !== l; x = st[pa[y]]) { f.push(x); y = st[match[x]]; f.push(y); push(y); }
    const tail = f.slice(1).reverse(); for (let i = 0; i < tail.length; i++) f[i + 1] = tail[i];
    for (let x = v, y; x !== l; x = st[pa[y]]) { f.push(x); y = st[match[x]]; f.push(y); push(y); }
    flower[b] = f;
    setSt(b, b);
    for (let x = 1; x <= nx; x++) gw[b][x] = gw[x][b] = 0;
    from[b].fill(0);
    for (const xs of f) {
      for (let x = 1; x <= nx; x++) if (gw[b][x] === 0 || dist(xs, x) < dist(b, x)) {
        gu[b][x] = gu[xs][x]; gv[b][x] = gv[xs][x]; gw[b][x] = gw[xs][x];
        gu[x][b] = gu[x][xs]; gv[x][b] = gv[x][xs]; gw[x][b] = gw[x][xs];
      }
      for (let x = 1; x <= n; x++) if (from[xs][x]) from[b][x] = xs;
    }
    setSlack(b);
  };
  const expandBlossom = b => {
    for (const x of flower[b]) setSt(x, x);
    const xr = from[b][gu[b][pa[b]]], pr = getPr(b, xr);
    for (let i = 0; i < pr; i += 2) {
      const xs = flower[b][i], xns = flower[b][i + 1];
      pa[xs] = gu[xns][xs]; S[xs] = 1; S[xns] = 0;
      slack[xs] = 0; setSlack(xns); push(xns);
    }
    S[xr] = 1; pa[xr] = pa[b];
    for (let i = pr + 1; i < flower[b].length; i++) { const xs = flower[b][i]; S[xs] = -1; setSlack(xs); }
    st[b] = 0;
  };
  const onEdge = (eu, ev) => {
    const u = st[eu], v = st[ev];
    if (S[v] === -1) {
      pa[v] = eu; S[v] = 1;
      const nu = st[match[v]];
      slack[v] = slack[nu] = 0; S[nu] = 0; push(nu);
    } else if (S[v] === 0) {
      const l = lca(u, v);
      if (!l) { augment(u, v); augment(v, u); return true; }
      addBlossom(u, l, v);
    }
    return false;
  };
  const matching = () => {
    S.fill(-1, 1, nx + 1); slack.fill(0, 1, nx + 1); q = [];
    for (let x = 1; x <= nx; x++) if (st[x] === x && !match[x]) { pa[x] = 0; S[x] = 0; push(x); }
    if (!q.length) return false;
    for (;;) {
      for (let h = 0; h < q.length; h++) {
        const u = q[h];
        if (S[st[u]] === 1) continue;
        for (let v = 1; v <= n; v++) if (gw[u][v] > 0 && st[u] !== st[v]) {
          if (dist(u, v) === 0) { if (onEdge(gu[u][v], gv[u][v])) return true; }
          else updateSlack(u, st[v]);
        }
      }
      let delta = Infinity;
      for (let b = n + 1; b <= nx; b++) if (st[b] === b && S[b] === 1) delta = Math.min(delta, lab[b] / 2);
      for (let x = 1; x <= nx; x++) if (st[x] === x && slack[x]) {
        if (S[x] === -1) delta = Math.min(delta, dist(slack[x], x));
        else if (S[x] === 0) delta = Math.min(delta, dist(slack[x], x) / 2);
      }
      for (let u = 1; u <= n; u++) {
        if (S[st[u]] === 0) { if (lab[u] <= delta) return false; lab[u] -= delta; }
        else if (S[st[u]] === 1) lab[u] += delta;
      }
      for (let b = n + 1; b <= nx; b++) if (st[b] === b) {
        if (S[b] === 0) lab[b] += delta * 2; else if (S[b] === 1) lab[b] -= delta * 2;
      }
      q = [];
      for (let x = 1; x <= nx; x++) if (st[x] === x && slack[x] && st[slack[x]] !== x && dist(slack[x], x) === 0)
        if (onEdge(gu[slack[x]][x], gv[slack[x]][x])) return true;
      for (let b = n + 1; b <= nx; b++) if (st[b] === b && S[b] === 1 && lab[b] === 0) expandBlossom(b);
    }
  };
  for (let i = 0; i <= n; i++) { st[i] = i; flower[i] = []; }
  let wmax = 0;
  for (let u = 1; u <= n; u++) for (let v = 1; v <= n; v++) { from[u][v] = u === v ? u : 0; wmax = Math.max(wmax, gw[u][v]); }
  for (let u = 1; u <= n; u++) lab[u] = wmax;
  while (matching());
  const mate = new Array(n);
  for (let u = 1; u <= n; u++) mate[u - 1] = match[u] - 1;
  return mate;
}
// Pair defects on a torus by MWPM. A busy defect can leave the free set odd, so the newest waits a round.
function matchDefects(code, free) {
  const list = free.slice().sort((a, b) => a.born - b.born);
  if (list.length % 2) list.pop();
  if (list.length < 2) return [];
  const step = code.constructor.step;
  const d = (i, j) => Math.abs(step(list[i].c, list[j].c, code.cols)) + Math.abs(step(list[i].r, list[j].r, code.rows)) + Math.abs((list[i].t || 0) - (list[j].t || 0));
  const mate = minWeightPerfectMatching(list.length, d), pairs = [];
  mate.forEach((m, i) => { if (i < m) pairs.push([list[i], list[m]]); });
  return pairs;
}
if (typeof module !== "undefined") module.exports = { minWeightPerfectMatching, matchDefects };

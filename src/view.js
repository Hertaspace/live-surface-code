// One canvas, two views. The manager decides which runs, so the light page does no work at all.
window.bgViews = {};
window.bgShared = (() => {
  const canvas = document.getElementById("bg-canvas");
  const ctx = canvas ? canvas.getContext("2d") : null;
  const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
  function fit() {
    const dpr = Math.min(devicePixelRatio || 1, 2), W = innerWidth, H = innerHeight;
    const pw = Math.round(W * dpr), ph = Math.round(H * dpr);
    if (canvas.width !== pw || canvas.height !== ph) { canvas.width = pw; canvas.height = ph; }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { W, H, dpr };
  }
  function layer(W, H, dpr, paint) {
    const c = document.createElement("canvas");
    c.width = Math.round(W * dpr); c.height = Math.round(H * dpr);
    const g = c.getContext("2d");
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    paint(g);
    return c;
  }
  return { canvas, ctx, still, fit, layer, C: { bg: "#2f0f2d", x: "#a9e5c3", z: "#b598ee", cream: "#f5ecdc", coral: "#fa7a68" } };
})();

// A planar surface code, decoded by spacetime minimum-weight perfect matching.
// Reading keeps it quiet. With the text hidden it plays at full strength, with a legend and a failure notice.
(() => {
  const { canvas, ctx, still, fit, layer, C } = window.bgShared;
  if (!canvas) return;
  const hud = document.getElementById("hud");
  const ROUND_READ = 1000, ROUND_SHOW = 750, P_READ = 0.004, P_SHOW = 0.01, PM_READ = 0.003, PM_SHOW = 0.0067, GROW_STEP = 170, CORRECT = 260, FADE = 300, BIRTH = 130, DELAY = 700;
  const DECIDE = 650, DECIDE_PAIR = 180, NEAR = 6, RIVALS = 2, FRAME = 31, WARM = 40, PRESS_P = .12, POP = 220, POP_SPREAD = 160, MATCH_CAP = 110, MATCH_WINDOW = 8, HISTORY = 13, VIEW_TIME = 1000, TRAIL = 620, RING = 520, STRIDE = 70;
  const AGE = ["#fa7a68", "#ea5f55", "#d24c50", "#b93c4c"];
  let W, H, dpr, sx, sy, grid, layers, t = 0, last = 0, lastFrame = 0, nextReport = 0, ready = false;
  let running = false, raf = 0, pending = [], jobs = [], ghosts = [], dirty = true, show = false, trail = [], rings = [], idle = 0, leaving = [], popUntil = 0;
  let solid = false, yaw = -.62, pitch = .74, past = [], links = [], mixRaw = 0, mix = 0, paused = false, glide = null;
  const defaults = { p: P_SHOW, pm: PM_SHOW, round: ROUND_SHOW }, tuned = { ...defaults };
  const roundLength = () => show ? tuned.round : ROUND_READ, rateP = () => show ? tuned.p : P_READ, ratePM = () => show ? tuned.pm : PM_READ;
  const legend = document.createElement("div");
  legend.className = "legend"; legend.setAttribute("aria-hidden", "true");
  legend.innerHTML = `<p class="legend-title">Surface code, spacetime MWPM <a href="https://hertaspace.github.io/how-it-works.html">How it works</a></p>
    <ul>
      <li><i class="k-x"></i>bit-flip error</li><li><i class="k-z"></i>phase-flip error</li>
      <li><i class="k-fired"></i>fired check, deeper is older</li><li><i class="k-long"></i>candidate match and weight</li>
      <li><i class="k-msg"></i>correction</li><li><i class="k-fix"></i>misread check</li>
    </ul><p class="legend-solid">Height is time, newest on top. Drag to turn.</p><p class="legend-stats" id="legend-stats"></p>`;
  const toast = document.createElement("div");
  toast.className = "toast"; toast.setAttribute("aria-hidden", "true"); toast.textContent = "logical failure";
  // Demo controls. Native range inputs, so they work by keyboard and touch as well.
  const tune = document.createElement("form");
  tune.className = "tune"; tune.setAttribute("aria-label", "Simulation settings");
  const percent = v => (v * 100).toFixed(2).replace(/0$/, "") + "%", ms = v => (v / 1000).toFixed(2) + " s";
  const SLIDERS = [
    { key: "p", label: "Data error rate", min: 0, max: .03, step: .0005, show: percent },
    { key: "pm", label: "Measurement error rate", min: 0, max: .03, step: .0005, show: percent },
    { key: "round", label: "Round length", min: 300, max: 1500, step: 50, show: ms },
  ];
  const VIEWS = [
    { key: "flat", label: "2D", tip: "Flat view" },
    { key: "tilt", label: "3D", tip: "Tilted spacetime view", at: [-.62, .74] },
    { key: "time", label: "Time", tip: "Look along time, from now into the past", at: [0, Math.PI / 2] },
    { key: "side", label: "Side", tip: "Side view of the time direction", at: [0, .03] },
  ];
  tune.innerHTML = SLIDERS.map(c => `<label><span>${c.label}<output id="t-${c.key}-v"></output></span><input type="range" id="t-${c.key}" min="${c.min}" max="${c.max}" step="${c.step}"></label>`).join("") +
    `<div class="tune-views" role="group" aria-label="View">${VIEWS.map(v => `<button type="button" data-view="${v.key}" title="${v.tip}" aria-pressed="${v.key === "flat"}">${v.label}</button>`).join("")}</div>` +
    `<div class="tune-row"><button type="button" id="t-pause" aria-pressed="false">Pause</button><button type="button" id="t-reset">Reset</button></div>`;
  const syncTune = () => SLIDERS.forEach(c => { tune.querySelector(`#t-${c.key}`).value = tuned[c.key]; tune.querySelector(`#t-${c.key}-v`).textContent = c.show(tuned[c.key]); });
  const applyTune = () => { syncTune(); if (ready) for (const L of layers) L.dec.pm = ratePM(); };
  tune.addEventListener("input", e => { const c = SLIDERS.find(x => `t-${x.key}` === e.target.id); if (c) { tuned[c.key] = +e.target.value; applyTune(); } });
  const viewButtons = [...tune.querySelectorAll("[data-view]")];
  const markView = key => viewButtons.forEach(b => b.setAttribute("aria-pressed", b.dataset.view === key));
  // camera moves glide there, and work while the simulation is paused
  const flyTo = (y, p) => { glide = { from: [yaw, pitch], to: [y, p], left: VIEW_TIME * .8 }; glide.span = glide.left; dirty = true; };
  const setView = key => {
    const v = VIEWS.find(x => x.key === key);
    solid = key !== "flat"; dirty = true;
    if (still) { mixRaw = mix = solid ? 1 : 0; }
    markView(key);
    legend.classList.toggle("solid", solid);
    if (v.at) flyTo(...v.at);
    if (ready && running) draw();
  };
  viewButtons.forEach(b => b.addEventListener("click", () => setView(b.dataset.view)));
  const pauseButton = tune.querySelector("#t-pause");
  const setPaused = on => { paused = on; dirty = true; pauseButton.textContent = on ? "Resume" : "Pause"; pauseButton.setAttribute("aria-pressed", on); };
  pauseButton.addEventListener("click", () => setPaused(!paused));
  tune.querySelector("#t-reset").addEventListener("click", () => { Object.assign(tuned, defaults); if (solid) setView("tilt"); applyTune(); });
  tune.addEventListener("submit", e => e.preventDefault());
  syncTune();
  document.body.append(legend, toast, tune);
  const stats = { errors: 0, matches: 0, boundary: 0, readouts: 0, failed: 0 };

  function layout() {
    ({ W, H, dpr } = fit());
    const s = Math.max(36, Math.min(58, W / 26));
    const cols = Math.max(6, Math.round(W / s) - 1), rows = Math.max(6, Math.round(H / s));
    sx = W / (cols + 1); sy = H / rows;
    const make = (q, color, shape, phase, xy, edge, side) => ({ q, dec: Object.assign(new SurfaceDecoder(q, 2, ratePM()), { cap: MATCH_CAP, window: MATCH_WINDOW }), color, shape, next: t + phase, born: new Map(), since: new Map(), xy, edge, side });
    layers = [
      make(new PlanarCode(rows, cols), C.x, "square", ROUND_READ * .3,
        (r, c) => [(c + 1) * sx, (r + .5) * sy],
        (k, r, c) => k === "h" ? [c * sx, (r + .5) * sy, (c + 1) * sx, (r + .5) * sy] : [(c + 1) * sx, (r + .5) * sy, (c + 1) * sx, (r + 1.5) * sy],
        d => [d.c + 1 <= cols - d.c ? 0 : W, (d.r + .5) * sy]),
      make(new PlanarCode(cols + 1, rows - 1), C.z, "diamond", ROUND_READ * .8,
        (r, c) => [(r + .5) * sx, (c + 1) * sy],
        (k, r, c) => k === "h" ? [(r + .5) * sx, c * sy, (r + .5) * sx, (c + 1) * sy] : [(r + .5) * sx, (c + 1) * sy, (r + 1.5) * sx, (c + 1) * sy],
        d => [(d.r + .5) * sx, d.c + 1 <= rows - 1 - d.c ? 0 : H]),
    ];
    pending = []; jobs = []; ghosts = []; trail = []; rings = []; leaving = [];
    grid = layer(W, H, dpr, g => paintLattice(g, false));
    setupWaves();
    ready = true;
  }
  function paintLattice(g, moving) {
    const { rows, cols } = layers[0].q;
    const at = (x, y) => { if (moving) { warp(x, y); x += wx; y += wy; } return [x, y]; };
    g.fillStyle = C.bg; g.fillRect(0, 0, W, H);
    g.strokeStyle = `rgba(181,152,238,${moving ? .13 + .3 * Math.min(1, wavePeak * 2.2 / wave.limit) : .13})`; g.lineWidth = 1; g.beginPath();
    const stepX = moving ? sx : sx / 2, stepY = moving ? sy : sy / 2;
    for (let c = 0; c < cols; c++) {
      const x = (c + 1) * sx;
      for (let y = .5 * sy, first = true; y <= H - .5 * sy + 1; y += stepY, first = false) { const [a, b] = at(x, y); first ? g.moveTo(a, b) : g.lineTo(a, b); }
    }
    for (let r = 0; r < rows; r++) {
      const y = (r + .5) * sy;
      for (let x = 0, first = true; x <= W + 1; x += stepX, first = false) { const [a, b] = at(x, y); first ? g.moveTo(a, b) : g.lineTo(a, b); }
    }
    g.stroke();
    g.fillStyle = "rgba(205,185,245,.22)"; g.beginPath();
    for (let r = 0; r < rows - 1; r++) for (let c = 0; c <= cols; c++) { const [x, y] = at((c + .5) * sx, (r + 1) * sy); if (moving) g.rect(x - 1.15, y - 1.15, 2.3, 2.3); else { g.moveTo(x + 1.3, y); g.arc(x, y, 1.3, 0, 6.3); } }
    g.fill();
    // the two kinds of boundary, where X chains and Z chains may end. The net is pinned here, so these never move.
    g.lineWidth = 3;
    g.strokeStyle = "rgba(169,229,195,.4)"; g.beginPath(); g.moveTo(1, 0); g.lineTo(1, H); g.moveTo(W - 1, 0); g.lineTo(W - 1, H); g.stroke();
    g.strokeStyle = "rgba(181,152,238,.4)"; g.beginPath(); g.moveTo(0, 1); g.lineTo(W, 1); g.moveTo(0, H - 1); g.lineTo(W, H - 1); g.stroke();
  }
  // ---- wind on the net: a damped wave equation on the lattice, purely visual, with pinned edges ----
  let wave = null, waving = false, waveDebt = 0, wavePeak = 0, wx = 0, wy = 0, gustX = 0, gustY = 0;
  function setupWaves() {
    const h = Math.min(sx, sy) / 2, nx = Math.ceil(W / h) + 2, ny = Math.ceil(H / h) + 2, n = nx * ny;
    wave = { h, nx, ny, ux: new Float32Array(n), uy: new Float32Array(n), vx: new Float32Array(n), vy: new Float32Array(n), limit: Math.min(sx, sy) * .34 };
    waving = false;
  }
  function warp(x, y) {
    const { h, nx, ny, ux, uy } = wave;
    const fx = Math.max(0, Math.min(nx - 1.001, x / h)), fy = Math.max(0, Math.min(ny - 1.001, y / h)), i = fx | 0, j = fy | 0, a = fx - i, b = fy - j, d = j * nx + i, keep = 1 - mix;
    wx = (ux[d] * (1 - a) * (1 - b) + ux[d + 1] * a * (1 - b) + ux[d + nx] * (1 - a) * b + ux[d + nx + 1] * a * b) * keep;
    wy = (uy[d] * (1 - a) * (1 - b) + uy[d + 1] * a * (1 - b) + uy[d + nx] * (1 - a) * b + uy[d + nx + 1] * a * b) * keep;
  }
  // push the net near (x, y): along (fx, fy) for a moving gust, outward for a press
  function gust(x, y, fx, fy, outward) {
    const { h, nx, ny, vx, vy } = wave, spread = 3.2, reach = Math.ceil(spread * 2.5), ci = Math.round(x / h), cj = Math.round(y / h);
    for (let j = Math.max(1, cj - reach); j <= Math.min(ny - 2, cj + reach); j++) for (let i = Math.max(1, ci - reach); i <= Math.min(nx - 2, ci + reach); i++) {
      const dx = i - x / h, dy = j - y / h, r2 = dx * dx + dy * dy, power = Math.exp(-r2 / (2 * spread * spread)), id = j * nx + i;
      if (outward) { const r = Math.sqrt(r2) || 1; vx[id] += 3.2 * power * dx / r; vy[id] += 3.2 * power * dy / r; }
      else { vx[id] += fx * power; vy[id] += fy * power; }
    }
    waving = true;
  }
  function stepWaves(dt) {
    if (!waving) return;
    waveDebt = Math.min(2, waveDebt + dt / 16.7);
    const { nx, ny, ux, uy, vx, vy, limit } = wave, TENSION = .06, RESTORE = .006, DRAG = .028;
    while (waveDebt >= 1) {
      waveDebt--;
      let peak = 0, reach = 0;
      for (let j = 1; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) {
        const d = j * nx + i;
        vx[d] += TENSION * (ux[d - 1] + ux[d + 1] + ux[d - nx] + ux[d + nx] - 4 * ux[d]) - RESTORE * ux[d] - DRAG * vx[d];
        vy[d] += TENSION * (uy[d - 1] + uy[d + 1] + uy[d - nx] + uy[d + nx] - 4 * uy[d]) - RESTORE * uy[d] - DRAG * vy[d];
      }
      for (let d = 0; d < ux.length; d++) {
        ux[d] = Math.max(-limit, Math.min(limit, ux[d] + vx[d])); uy[d] = Math.max(-limit, Math.min(limit, uy[d] + vy[d]));
        reach = Math.max(reach, Math.abs(ux[d]), Math.abs(uy[d]));
        peak = Math.max(peak, Math.abs(ux[d]), Math.abs(uy[d]), Math.abs(vx[d]) * 4, Math.abs(vy[d]) * 4);
      }
      wavePeak = reach;
      if (peak < .12) { ux.fill(0); uy.fill(0); vx.fill(0); vy.fill(0); waving = false; dirty = true; return; }
    }
  }
  const key = (k, r, c) => k + r + "," + c;
  const randomPauli = () => "XYZ"[Math.floor(Math.random() * 3)];
  function flip(L, kind, r, c, quiet) {
    L.dec.error(kind, r, c);
    const k = key(kind, r, c);
    if (L.q.has(kind, r, c)) L.since.set(k, L.dec.round + 1); else L.since.delete(k);
    if (!quiet) { L.born.set(k, t); past.push({ L, kind, r, c, t: L.dec.round + 1 }); }
    dirty = true;
  }
  // a Z error acts on the dual edge crossing the same qubit, which is the transposed index
  function apply(pauli, kind, r, c, quiet) {
    if (pauli !== "Z") flip(layers[0], kind, r, c, quiet);
    if (pauli !== "X") flip(layers[1], kind, c, r, quiet);
    if (!quiet) stats.errors++;
  }
  function randomQubit() {
    const q = layers[0].q, total = q.h.length + q.v.length, i = Math.floor(Math.random() * total);
    if (i < q.h.length) return ["h", Math.floor(i / (q.cols + 1)), i % (q.cols + 1)];
    const j = i - q.h.length;
    return ["v", Math.floor(j / q.cols), j % q.cols];
  }
  const qubits = () => layers[0].q.h.length + layers[0].q.v.length;
  function queue(L, launches) {
    for (const job of launches) {
      const rivals = candidates(L, job);
      jobs.push({ L, job, rivals, decide: rivals.length ? DECIDE : DECIDE_PAIR, t0: t + Math.random() * DELAY, grow: job.path.length ? Math.min(1100, Math.max(260, job.path.length * GROW_STEP)) : 360 });
    }
  }
  // Start in motion: run some rounds unseen, so the first frame already shows a living lattice
  function warm() {
    const held = [[], []];
    for (let k = 0; k < WARM; k++) {
      const n = qubits() * P_READ;
      for (let i = Math.floor(n) + (Math.random() < n % 1 ? 1 : 0); i > 0; i--) apply(randomPauli(), ...randomQubit(), true);
      layers.forEach((L, i) => {
        const { launches, cycles } = L.dec.measure();
        forget(L, cycles);
        held[i].forEach(j => { forget(L, L.dec.finish(j)); settle(L, j); });
        held[i] = launches;
      });
    }
    layers.forEach((L, i) => queue(L, held[i]));
  }
  function advance(dt) {
    const expected = qubits() * rateP() * dt / roundLength();   // can exceed one per frame on large screens
    for (let k = Math.floor(expected) + (Math.random() < expected % 1 ? 1 : 0); k > 0; k--) apply(randomPauli(), ...randomQubit());
    for (let k = pending.length - 1; k >= 0; k--) if (pending[k].at <= t) {
      const e = pending[k]; pending.splice(k, 1); apply(e.pauli, e.kind, e.r, e.c);
      // each ring marks one qubit that really was disturbed, coloured by the Pauli it received
      const [a, b, c, d] = layers[0].edge(e.kind, e.r, e.c);
      rings.push({ x: (a + c) / 2, y: (b + d) / 2, t0: t, color: e.pauli === "X" ? C.x : e.pauli === "Z" ? C.z : C.cream });
    }
    for (const L of layers) if (t >= L.next) {
      L.next += roundLength();
      const { launches, cycles, fired } = L.dec.measure();
      if (fired.length || launches.length || cycles.length) dirty = true;
      for (const d of fired) d.seen = t + Math.random() * POP_SPREAD;
      if (fired.length) popUntil = t + POP_SPREAD + POP;
      addGhosts(L, cycles);
      queue(L, launches);
    }
    for (let k = jobs.length - 1; k >= 0; k--) {
      const j = jobs[k];
      if (t - j.t0 < j.decide + j.grow + CORRECT) continue;
      jobs.splice(k, 1);
      if (!j.job.path.length) stats.readouts++; else if (j.job.b) stats.matches++; else stats.boundary++;
      links.push({ L: j.L, job: j.job, t: Math.max(j.job.a.t, j.job.b ? j.job.b.t : 0) });
      for (const d of j.job.b ? [j.job.a, j.job.b] : [j.job.a]) leaving.push({ L: j.L, d, t0: t, level: Math.min(3, j.L.dec.round - d.t) });
      addGhosts(j.L, j.L.dec.finish(j.job));
      settle(j.L, j.job);
      dirty = true;
    }
    if (t >= nextReport) {
      nextReport = t + 1000; report();
      const floor = clock() - HISTORY - 1;
      past = past.filter(e => e.t > floor); links = links.filter(e => e.t > floor);
    }
  }
  const sep = (a, b) => Math.abs(a.r - b.r) + Math.abs(a.c - b.c) + Math.abs(a.t - b.t);
  function candidates(L, { a, b }) {
    const anchors = b ? [a, b] : [a], near = d => Math.min(...anchors.map(x => sep(d, x)));
    const others = [...L.dec.shown.values()].filter(d => !anchors.includes(d) && near(d) <= NEAR).sort((u, v) => near(u) - near(v)).slice(0, RIVALS);
    const group = [...anchors, ...others], out = [];
    for (let i = 0; i < group.length; i++) for (let j = i + 1; j < group.length; j++) if (!(b && i === 0 && j === 1)) out.push([group[i], group[j]]);
    for (const d of group) if (!(d === a && !b) && L.q.boundaryDistance(d.c) <= NEAR) out.push([d, null]);
    return out;
  }
  const forget = (L, cycles) => { for (const y of cycles) for (const e of y.edges) L.since.delete(key(e.kind, e.r, e.c)); };
  // a correction can leave an edge switched on, and that edge belongs to the time of the match
  const settle = (L, job) => {
    for (const s of job.path) {
      const k = key(s.kind, s.r, s.c);
      if (!L.q.has(s.kind, s.r, s.c)) L.since.delete(k); else L.since.set(k, Math.max(job.a.t, job.b ? job.b.t : 0));
    }
  };
  function addGhosts(L, cycles) {
    for (const y of cycles) {
      for (const e of y.edges) { const k = key(e.kind, e.r, e.c); e.round = L.since.get(k); L.born.delete(k); }
      forget(L, [y]);
      ghosts.push({ L, edges: y.edges, t0: t, winds: y.winds });
      if (y.winds) {
        stats.failed++;
        if (show) { toast.classList.remove("show"); void toast.offsetWidth; toast.classList.add("show"); }
      }
    }
  }
  function curve(L, a, b) {
    const [x0, y0] = L.xy(a.r, a.c), [x1, y1] = b ? L.xy(b.r, b.c) : L.side(a);
    const mx = (x0 + x1) / 2 + (y1 - y0) * .16, my = (y0 + y1) / 2 - (x1 - x0) * .16;
    ctx.moveTo(x0, y0);
    ctx.quadraticCurveTo(mx, my, x1, y1);
    return [(x0 + 2 * mx + x1) / 4, (y0 + 2 * my + y1) / 4];
  }
  function label(x, y, value, alpha) {
    ctx.globalAlpha = alpha;
    ctx.font = "500 11px ui-monospace, Menlo, monospace"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillStyle = C.bg; ctx.fillRect(x - 7, y - 7, 14, 14);
    ctx.fillStyle = C.cream; ctx.fillText(String(value), x, y);
  }
  function diamond(x, y, rx, ry) { ctx.moveTo(x - rx, y); ctx.lineTo(x, y - ry); ctx.lineTo(x + rx, y); ctx.lineTo(x, y + ry); ctx.closePath(); }
  // ---- spacetime view: each round is a slice, newest on top, sinking as time passes ----
  const clock = () => { const L = layers[0]; return L.dec.round + Math.max(0, 1 - (L.next - t) / roundLength()); };
  // One camera for both views. mix = 0 looks straight down with time collapsed, which is exactly the 2D view.
  // lift is how far the stack has opened up, and it is 0 in 2D.
  // Looking straight down the stack with lift = 1 runs along the time axis: now is nearest, the past recedes.
  let cam = {}, lift = 0, along = 0;
  function camera() {
    const turn = yaw * mix, tilt = Math.PI / 2 + (pitch - Math.PI / 2) * mix;
    lift = mix;
    along = (Math.sin(tilt) * Math.cos(turn)) ** 8 * lift;
    const rise = Math.min(H / 900, 1) * 34 * lift, reach = 1400 - 800 * Math.sin(tilt) ** 6 * mix;
    const base = 1 + (Math.min(W / 1500, H / 1000) * .62 - 1) * lift, fill = (reach - HISTORY / 2 * rise) / reach;   // the now slice fills the screen
    cam = { c: Math.cos(turn), n: Math.sin(turn), sinT: Math.sin(tilt), cosT: Math.cos(tilt), scale: base + (fill - base) * along, rise, reach };
  }
  function project(x, y, age) {
    if (waving) { warp(x, y); x += wx; y += wy; }
    const { c, n, sinT, cosT, scale, rise, reach } = cam;
    const u = (x - W / 2) * scale, v = (y - H / 2) * scale, h = (age - HISTORY / 2) * rise;
    const X = u * c - v * n, Z = u * n + v * c;
    // lower on screen is nearer the viewer, and lower in the stack (older) is further away
    const up = Z * sinT + h * cosT, depth = (h * sinT - Z * cosT) * mix, k = reach / Math.max(60, reach + depth);
    return [W / 2 + X * k, H * .5 + up * k, k];
  }
  // Everything live, in one list. Both views draw from it, so they cannot show different patterns.
  // a soft arrival with a slight overshoot
  const easeBack = f => { if (f <= 0) return 0; if (f >= 1) return 1; const k = f - 1; return 1 + 2.2 * k * k * k + 1.2 * k * k; };
  const ageOf = (now, round) => Math.min(HISTORY, Math.max(0, now - round));
  function scene() {
    const now = clock(), edges = [], events = [];
    for (const L of layers) {
      const { q } = L;
      const add = (kind, r, c) => {
        const k = key(kind, r, c);
        if (!L.since.has(k)) L.since.set(k, L.dec.round);
        edges.push({ L, kind, r, c, k, age: ageOf(now, L.since.get(k)) });
      };
      for (let r = 0; r < q.rows; r++) for (let c = 0; c <= q.cols; c++) if (q.has("h", r, c)) add("h", r, c);
      for (let r = 0; r < q.rows - 1; r++) for (let c = 0; c < q.cols; c++) if (q.has("v", r, c)) add("v", r, c);
      for (const d of L.dec.shown.values()) events.push({ L, d, age: ageOf(now, d.t), level: Math.min(3, L.dec.round - d.t), grow: d.seen === undefined ? 1 : easeBack((t - d.seen) / POP) });
    }
    leaving = leaving.filter(e => t - e.t0 < POP);
    for (const e of leaving) { const f = 1 - (t - e.t0) / POP; events.push({ L: e.L, d: e.d, age: ageOf(now, e.d.t), level: e.level, grow: f * f }); }
    return { now, edges, events };
  }
  function growth(L, k) {
    const b = L.born.get(k);
    if (b === undefined) return 1;
    const g = (t - b) / BIRTH;
    if (g >= 1) { L.born.delete(k); return 1; }
    return g;
  }
  function draw3D() {
    camera();
    const { now, edges, events } = scene(), top = Math.floor(now);
    ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H);
    if (lift < 1) { ctx.globalAlpha = (1 - lift) * (1 - lift); if (waving) paintLattice(ctx, true); else ctx.drawImage(grid, 0, 0, W, H); ctx.globalAlpha = 1; }
    ctx.lineCap = "round"; ctx.lineJoin = "round";
    const fade = age => Math.max(0, 1 - age / HISTORY) * lift;
    if (lift > 0) for (let k = top - HISTORY; k <= top; k++) {
      const age = now - k;
      if (age < 0 || age > HISTORY) continue;
      const a = fade(age), corners = [[0, 0], [W, 0], [W, H], [0, H]].map(([x, y]) => project(x, y, age));
      ctx.strokeStyle = "rgba(205,185,245,1)"; ctx.fillStyle = "rgba(205,185,245,1)";
      ctx.globalAlpha = .035 * a; ctx.beginPath(); corners.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.closePath(); ctx.fill();
      ctx.globalAlpha = (k === top ? .5 : .2) * a; ctx.lineWidth = 1; ctx.stroke();
      if (k === top) {
        const { q } = layers[0];
        ctx.globalAlpha = .13 * a; ctx.beginPath();
        for (let c = 0; c < q.cols; c++) { const [x0, y0] = project((c + 1) * sx, .5 * sy, age), [x1, y1] = project((c + 1) * sx, H - .5 * sy, age); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); }
        for (let r = 0; r < q.rows; r++) { const [x0, y0] = project(0, (r + .5) * sy, age), [x1, y1] = project(W, (r + .5) * sy, age); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); }
        ctx.stroke();
      }
    }
    // What has already been repaired stays as a faint trace, so it never reads as part of the live pattern
    ctx.lineWidth = 1;
    if (lift > 0) for (const e of past) {
      const age = now - e.t;
      if (age > HISTORY || (e.L.q.has(e.kind, e.r, e.c) && e.L.since.get(key(e.kind, e.r, e.c)) === e.t)) continue;
      const [a0, b0, c0, d0] = e.L.edge(e.kind, e.r, e.c), [x0, y0] = project(a0, b0, Math.max(0, age)), [x1, y1] = project(c0, d0, Math.max(0, age));
      ctx.strokeStyle = e.L.color; ctx.globalAlpha = (.17 + .3 * along) * fade(Math.max(0, age));
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
    }
    ctx.strokeStyle = C.cream;
    if (lift > 0) for (const { L, job, t: round } of links) {
      const a = .13 * fade(Math.max(0, now - round));
      if (a <= 0) continue;
      const [x0, y0] = project(...L.xy(job.a.r, job.a.c), ageOf(now, job.a.t)), [x1, y1] = job.b ? project(...L.xy(job.b.r, job.b.c), ageOf(now, job.b.t)) : project(...L.side(job.a), ageOf(now, job.a.t));
      ctx.globalAlpha = a; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    // live error chains, each on the slice of the round it happened in
    const wide = show ? 5 : 4;
    ctx.lineWidth = wide + (2.6 - wide) * lift;
    for (const L of layers) {
      ctx.strokeStyle = L.color; ctx.beginPath();
      for (const e of edges) if (e.L === L) {
        const g = growth(L, e.k), [a0, b0, c0, d0] = L.edge(e.kind, e.r, e.c), mx = (a0 + c0) / 2, my = (b0 + d0) / 2;
        const [x0, y0] = project(mx + (a0 - mx) * g, my + (b0 - my) * g, e.age), [x1, y1] = project(mx + (c0 - mx) * g, my + (d0 - my) * g, e.age);
        ctx.moveTo(x0, y0); ctx.lineTo(x1, y1);
      }
      ctx.stroke();
    }
    const bow = ([x0, y0], [x1, y1]) => {
      const mx = (x0 + x1) / 2 + (y1 - y0) * .16, my = (y0 + y1) / 2 - (x1 - x0) * .16;
      ctx.moveTo(x0, y0); ctx.quadraticCurveTo(mx, my, x1, y1);
      return [(x0 + 2 * mx + x1) / 4, (y0 + 2 * my + y1) / 4];
    };
    for (const { L, job, rivals, decide, t0, grow } of jobs) {
      const total = t - t0;
      if (total < 0) continue;
      const age = total - decide, into = Math.min(1, total / decide), appear = Math.min(1, into / .35), settled = Math.max(0, (into - .55) / .45);
      const place = d => project(...L.xy(d.r, d.c), ageOf(now, d.t)), rim = d => project(...L.side(d), ageOf(now, d.t));
      const dimRival = (show ? .75 : .32) * appear * (1 - settled), winner = (show ? .95 : .5) * appear * (age > 0 ? Math.max(0, 1 - age / (grow * .7)) : 1);
      if (dimRival > 0 && rivals.length) {
        ctx.setLineDash([3, 6]); ctx.strokeStyle = C.cream; ctx.lineWidth = show ? 1.5 : 1; ctx.globalAlpha = dimRival; ctx.beginPath();
        const marks = [];
        for (const [u, v] of rivals) if (L.dec.shown.has(u.id) && (!v || L.dec.shown.has(v.id))) marks.push([...bow(place(u), v ? place(v) : rim(u)), v ? sep(u, v) : L.q.boundaryDistance(u.c)]);
        ctx.stroke(); ctx.setLineDash([]);
        if (show) for (const [x, y, w] of marks) label(x, y, w, dimRival);
      }
      if (winner > 0 && job.path.length) {
        ctx.strokeStyle = C.cream; ctx.lineWidth = show ? 2 : 1.2; ctx.globalAlpha = winner; ctx.beginPath();
        const [x, y] = bow(place(job.a), job.b ? place(job.b) : rim(job.a)); ctx.stroke();
        if (show) label(x, y, job.weight, winner);
      }
      ctx.globalAlpha = 1;
      if (age < 0) continue;
      if (!job.path.length) {   // a misread check: the same ring as in 2D, and a short column joining its two rounds in time
        const f = Math.min(1, age / (grow + CORRECT)), [cx, cy] = L.xy(job.a.r, job.a.c), R = Math.min(sx, sy) * (.18 + .3 * f), base = ageOf(now, job.a.t);
        ctx.strokeStyle = C.cream; ctx.lineWidth = show ? 2 : 1.4; ctx.globalAlpha = (show ? .9 : .55) * (1 - f); ctx.beginPath();
        for (let i = 0; i <= 28; i++) { const [x, y] = project(cx + R * Math.cos(i * Math.PI / 14), cy + R * Math.sin(i * Math.PI / 14), base); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
        ctx.stroke();
        if (job.b) { ctx.lineWidth = 2.6; ctx.globalAlpha = 1 - f * f; ctx.beginPath(); ctx.moveTo(...place(job.a).slice(0, 2)); ctx.lineTo(...place(job.b).slice(0, 2)); ctx.stroke(); }
        ctx.globalAlpha = 1;
        continue;
      }
      // the 2D diamonds are the waists of these: a ball of constant spacetime distance is an octahedron
      const f = Math.min(1, age / grow), ease = 1 - (1 - f) * (1 - f), reach = (job.b ? job.path.length / 2 : job.path.length) * ease, gone = age > grow ? Math.max(0, 1 - (age - grow) / CORRECT) : 1;
      for (const d of job.b ? [job.a, job.b] : [job.a]) {
        const [cx, cy] = L.xy(d.r, d.c), base = ageOf(now, d.t);
        const P = [[cx - reach * sx, cy], [cx, cy - reach * sy], [cx + reach * sx, cy], [cx, cy + reach * sy]].map(([x, y]) => project(x, y, base));
        const up = project(cx, cy, base - reach), down = project(cx, cy, base + reach);
        ctx.fillStyle = L.color; ctx.globalAlpha = (show ? .2 : .1) * gone; ctx.beginPath(); P.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = L.color; ctx.lineWidth = show ? 2.2 : 1.4; ctx.globalAlpha = (show ? .95 : .6) * gone; ctx.stroke();
        ctx.lineWidth = 1.2; ctx.globalAlpha = .7 * gone * lift; ctx.beginPath();
        P.forEach(p => { ctx.moveTo(p[0], p[1]); ctx.lineTo(up[0], up[1]); ctx.moveTo(p[0], p[1]); ctx.lineTo(down[0], down[1]); });
        ctx.stroke();
      }
      if (age > grow) {
        // the correction walks the same lattice path as in 2D, drifting between the rounds of its two ends
        const from = ageOf(now, job.a.t), to = job.b ? ageOf(now, job.b.t) : from, n = job.path.length;
        const pts = [project(...L.xy(job.a.r, job.a.c), from), ...job.path.map((s, i) => project(...(s.to ? L.xy(s.to.r, s.to.c) : L.side(job.a)), from + (to - from) * (i + 1) / n))];
        const g = Math.min(1, (age - grow) / (CORRECT * .7)) * (pts.length - 1), w = Math.floor(g);
        ctx.strokeStyle = C.cream; ctx.lineWidth = wide + (3 - wide) * lift; ctx.globalAlpha = 1; ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
        for (let i = 1; i <= w && i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
        if (w + 1 < pts.length) { const k = g - w, [a, b] = pts[w], [c, d] = pts[w + 1]; ctx.lineTo(a + (c - a) * k, b + (d - b) * k); }
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
    for (const g of ghosts) {
      const f = (t - g.t0) / (g.winds ? FADE * 6 : FADE);
      if (f >= 1) continue;
      ctx.strokeStyle = g.winds ? C.coral : C.cream; ctx.lineWidth = wide + (2.6 - wide) * lift; ctx.globalAlpha = 1 - f; ctx.beginPath();
      for (const e of g.edges) { const [a, b, c, d] = g.L.edge(e.kind, e.r, e.c), age = ageOf(now, e.round === undefined ? now : e.round), [x0, y0] = project(a, b, age), [x1, y1] = project(c, d, age); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); }
      ctx.stroke();
    }
    if (!mix) drawTouch();
    else for (const g of rings) {
      const f = (t - g.t0) / RING;
      if (f >= 1) continue;
      const e = 1 - (1 - f) * (1 - f), [x, y, z] = project(g.x, g.y, 0);
      ctx.strokeStyle = g.color; ctx.lineWidth = 2.2 * (1 - f) + .5; ctx.globalAlpha = .9 * (1 - f);
      ctx.beginPath(); ctx.arc(x, y, (5 + e * Math.min(sx, sy) * .55) * z, 0, 6.3); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    // markers lie flat on their slice, and shrink as the camera tilts so the stack stays readable
    const big = Math.min(sx, sy) * .136, r = big + (big * .72 - big) * lift;
    const square = [[-r, -r], [r, -r], [r, r], [-r, r]], point = [[-r * 1.4375, 0], [0, -r * 1.4375], [r * 1.4375, 0], [0, r * 1.4375]];
    for (let level = 3; level >= 0; level--) {
      ctx.fillStyle = AGE[level]; ctx.beginPath();
      for (const e of events) if (e.level === level) {
        const [cx, cy] = e.L.xy(e.d.r, e.d.c);
        if (!e.grow) continue;
        (e.L.shape === "square" ? square : point).forEach(([ox, oy], i) => { const [x, y] = project(cx + ox * e.grow, cy + oy * e.grow, e.age); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
        ctx.closePath();
      }
      ctx.fill();
    }
    const [ax, ay] = project(0, H, 0), [bx, by] = project(0, H, HISTORY);
    ctx.strokeStyle = C.cream; ctx.fillStyle = C.cream; ctx.globalAlpha = .6 * lift; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
    ctx.font = "500 11px ui-monospace, Menlo, monospace"; ctx.textAlign = "right"; ctx.textBaseline = "middle";
    ctx.fillText("now", ax - 8, ay); ctx.fillText("past", bx - 8, by);
    ctx.globalAlpha = 1;
  }
  function draw() {
    if (mix > 0 || waving) { draw3D(); return; }
    ctx.drawImage(grid, 0, 0, W, H);
    ctx.lineCap = "round";
    const { edges, events } = scene();
    for (const L of layers) {
      ctx.strokeStyle = L.color; ctx.lineWidth = show ? 5 : 4; ctx.beginPath();
      for (const e of edges) if (e.L === L) {
        const g = growth(L, e.k), [x0, y0, x1, y1] = L.edge(e.kind, e.r, e.c), mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
        ctx.moveTo(mx + (x0 - mx) * g, my + (y0 - my) * g); ctx.lineTo(mx + (x1 - mx) * g, my + (y1 - my) * g);
      }
      ctx.stroke();
    }
    for (const { L, job, rivals, decide, t0, grow } of jobs) {
      const total = t - t0;
      if (total < 0) continue;
      const age = total - decide, into = Math.min(1, total / decide);
      const appear = Math.min(1, into / .35), settled = Math.max(0, (into - .55) / .45);
      const dimRival = (show ? .75 : .32) * appear * (1 - settled), winner = (show ? .95 : .5) * appear * (age > 0 ? Math.max(0, 1 - age / (grow * .7)) : 1);
      ctx.strokeStyle = C.cream; ctx.lineWidth = show ? 1.5 : 1;
      if (dimRival > 0 && rivals.length) {
        ctx.setLineDash([3, 6]); ctx.globalAlpha = dimRival; ctx.beginPath();
        const marks = [];
        for (const [u, v] of rivals) if (L.dec.shown.has(u.id) && (!v || L.dec.shown.has(v.id))) marks.push([...curve(L, u, v), v ? sep(u, v) : L.q.boundaryDistance(u.c)]);
        ctx.stroke(); ctx.setLineDash([]);
        if (show) for (const [x, y, w] of marks) label(x, y, w, dimRival);
      }
      if (winner > 0 && job.path.length) {
        ctx.strokeStyle = C.cream; ctx.lineWidth = show ? 2 : 1.2; ctx.globalAlpha = winner; ctx.beginPath();
        const [x, y] = curve(L, job.a, job.b); ctx.stroke();
        if (show) label(x, y, job.weight, winner);
      }
      ctx.globalAlpha = 1;
      if (age < 0) continue;
      if (!job.path.length) {   // a pair in time is a misread check, so nothing on the lattice needs fixing
        const f = Math.min(1, age / (grow + CORRECT)), [x, y] = L.xy(job.a.r, job.a.c);
        ctx.strokeStyle = C.cream; ctx.lineWidth = show ? 2 : 1.4; ctx.globalAlpha = (show ? .9 : .55) * (1 - f);
        ctx.beginPath(); ctx.arc(x, y, Math.min(sx, sy) * (.18 + .3 * f), 0, 6.3); ctx.stroke();
        ctx.globalAlpha = 1;
        continue;
      }
      const f = Math.min(1, age / grow), ease = 1 - (1 - f) * (1 - f), reach = (job.b ? job.path.length / 2 : job.path.length) * ease;
      const fade = age > grow ? Math.max(0, 1 - (age - grow) / CORRECT) : 1;
      ctx.beginPath();
      for (const d of job.b ? [job.a, job.b] : [job.a]) { const [x, y] = L.xy(d.r, d.c); diamond(x, y, reach * sx, reach * sy); }
      ctx.fillStyle = L.color; ctx.globalAlpha = (show ? .2 : .1) * fade; ctx.fill();
      ctx.strokeStyle = L.color; ctx.lineWidth = show ? 2.2 : 1.4; ctx.globalAlpha = (show ? .95 : .6) * fade; ctx.stroke();
      if (age > grow) {
        const pts = [L.xy(job.a.r, job.a.c), ...job.path.map(s => s.to ? L.xy(s.to.r, s.to.c) : L.side(job.a))];
        const g = Math.min(1, (age - grow) / (CORRECT * .7)) * (pts.length - 1), n = Math.floor(g);
        ctx.strokeStyle = C.cream; ctx.lineWidth = 4; ctx.globalAlpha = 1; ctx.beginPath(); ctx.moveTo(...pts[0]);
        for (let i = 1; i <= n && i < pts.length; i++) ctx.lineTo(...pts[i]);
        if (n + 1 < pts.length) { const k = g - n, [a, b] = pts[n], [c, d] = pts[n + 1]; ctx.lineTo(a + (c - a) * k, b + (d - b) * k); }
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
    for (let k = ghosts.length - 1; k >= 0; k--) {
      const g = ghosts[k], f = (t - g.t0) / (g.winds ? FADE * 6 : FADE);
      if (f >= 1) { ghosts.splice(k, 1); continue; }
      ctx.strokeStyle = g.winds ? C.coral : C.cream; ctx.lineWidth = 4; ctx.globalAlpha = 1 - f; ctx.beginPath();
      for (const e of g.edges) { const [a, b, c, d] = g.L.edge(e.kind, e.r, e.c); ctx.moveTo(a, b); ctx.lineTo(c, d); }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    drawTouch();
    // the longer an event has waited, the deeper its colour. Shape says X or Z.
    const size = Math.min(sx, sy) * .17;
    for (let level = 3; level >= 0; level--) {
      ctx.fillStyle = AGE[level]; ctx.beginPath();
      for (const e of events) if (e.level === level) {
        const [x, y] = e.L.xy(e.d.r, e.d.c);
        const z = size * e.grow;
        if (!z) continue;
        if (e.L.shape === "square") ctx.rect(x - z * .8, y - z * .8, z * 1.6, z * 1.6);
        else diamond(x, y, z * 1.15, z * 1.15);
      }
      ctx.fill();
    }
  }
  // the held pointer leaves a tapering wake, and disturbed qubits ring outward
  function drawTouch() {
    while (trail.length && t - trail[0].t > TRAIL) trail.shift();
    ctx.lineCap = "round"; ctx.lineJoin = "round";
    ctx.strokeStyle = C.cream;
    for (let band = 3; band >= 0; band--) {
      const life = 1 - (band + .5) / 4;
      ctx.beginPath();
      for (let i = 1; i < trail.length; i++) {
        const a = trail[i - 1], b = trail[i];
        if (b.start || Math.min(3, Math.floor(4 * (t - b.t) / TRAIL)) !== band) continue;
        ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
      }
      ctx.globalAlpha = .16 * life; ctx.lineWidth = 15 * life + 2; ctx.stroke();
      ctx.globalAlpha = .85 * life; ctx.lineWidth = 3.2 * life + .6; ctx.stroke();
    }
    for (let k = rings.length - 1; k >= 0; k--) {
      const g = rings[k], f = (t - g.t0) / RING;
      if (f >= 1) { rings.splice(k, 1); continue; }
      const e = 1 - (1 - f) * (1 - f);
      ctx.strokeStyle = g.color; ctx.lineWidth = 2.2 * (1 - f) + .5; ctx.globalAlpha = .9 * (1 - f);
      ctx.beginPath(); ctx.arc(g.x, g.y, 5 + e * Math.min(sx, sy) * .55, 0, 6.3); ctx.stroke();
      ctx.fillStyle = g.color; ctx.globalAlpha = .75 * (1 - f) * (1 - f);
      ctx.beginPath(); ctx.arc(g.x, g.y, 5, 0, 6.3); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
  function report() {
    const open = layers[0].dec.shown.size + layers[1].dec.shown.size;
    legend.querySelector("#legend-stats").textContent = `round ${layers[0].dec.round} · errors ${stats.errors} · matches ${stats.matches + stats.boundary} · misreads ${stats.readouts} · open ${open} · logical failures ${stats.failed}`;
    if (!hud) return;
    hud.innerHTML = `<span>Live surface code with spacetime minimum-weight matching</span>` +
      `<span>X and Z decoded separately, and checks can misread</span>` +
      `<span>round ${layers[0].dec.round} · errors ${stats.errors} · matches ${stats.matches} · to boundary ${stats.boundary} · misreads ${stats.readouts} · logical failures ${stats.failed}</span>` +
      `<span class="hint">Hold the left mouse button on the background to add errors</span>`;
  }
  // Redraw at most 30 times a second, and not at all while nothing on screen is changing
  const hurried = () => trail.length || rings.length || waving || glide || mixRaw !== (solid && show ? 1 : 0) || (!paused && (show || t < popUntil || leaving.length));
  function schedule() {
    if (!running) return;
    if (hurried()) raf = requestAnimationFrame(frame);
    else idle = setTimeout(() => { if (running) raf = requestAnimationFrame(frame); }, FRAME);
  }
  function frame(now) {
    const aim = solid && show ? 1 : 0, turningView = mixRaw !== aim;
    if (lastFrame && !hurried() && now - lastFrame < FRAME - 8) { schedule(); return; }
    lastFrame = now;
    const dt = Math.min(now - last, 60);
    last = now;
    if (glide) {
      glide.left = Math.max(0, glide.left - dt);
      const f = 1 - glide.left / glide.span, e = f * f * (3 - 2 * f);
      yaw = glide.from[0] + (glide.to[0] - glide.from[0]) * e; pitch = glide.from[1] + (glide.to[1] - glide.from[1]) * e;
      dirty = true;
      if (!glide.left) glide = null;
    }
    if (!paused) { t += dt; advance(dt); stepWaves(dt); }   // the camera keeps working while the simulation is held still
    if (turningView) {
      mixRaw = aim > mixRaw ? Math.min(1, mixRaw + dt / VIEW_TIME) : Math.max(0, mixRaw - dt / VIEW_TIME);
      mix = mixRaw * mixRaw * (3 - 2 * mixRaw);   // eased, and reversible from any point
      dirty = true;
    }
    schedule();
    if (dirty || (!paused && (waving || leaving.length || t < popUntil || jobs.length || ghosts.length || trail.length || rings.length || layers.some(L => L.born.size)))) { draw(); dirty = false; }
  }
  const turning = () => solid && show;
  const onBackground = e => running && !(e.target.closest && e.target.closest(".intro,.sheet,a,.topnav,main,.dock,.tune"));
  function press(e) {
    if (still) return;
    const q = layers[0].q, r0 = Math.floor(e.clientY / sy) - 1, c0 = Math.floor(e.clientX / sx) - 2;
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) for (const kind of ["h", "v"]) {
      const rr = Math.max(0, Math.min(q.rows - 2, r0 + r)), cc = Math.max(0, Math.min(q.cols - 1, c0 + c));
      if (Math.random() < PRESS_P) pending.push({ at: t + Math.random() * 900, pauli: randomPauli(), kind, r: rr, c: cc });
    }
  }
  let lastAdd = 0, lastX = 0, lastY = 0;
  const touch = (e, start) => {
    const moves = !start && e.getCoalescedEvents ? e.getCoalescedEvents() : [];
    (moves.length ? moves : [e]).forEach((m, i) => trail.push({ x: m.clientX, y: m.clientY, t, start: start && i === 0 }));
  };
  addEventListener("pointerdown", e => {
    if (e.button !== 0 || !onBackground(e)) return;
    lastAdd = performance.now(); lastX = e.clientX; lastY = e.clientY;
    if (turning() || mix > 0 || paused) return;
    gustX = e.clientX; gustY = e.clientY;
    if (!still) gust(e.clientX, e.clientY, 0, 0, true);
    clearTimeout(idle); cancelAnimationFrame(raf); raf = requestAnimationFrame(frame);
    touch(e, true); press(e);
  });
  addEventListener("pointermove", e => {
    if (!(e.buttons & 1) || !onBackground(e)) return;
    if (turning()) {   // in 3D the same gesture turns the stack instead of disturbing it
      glide = null; markView("tilt");
      yaw -= (e.clientX - lastX) * .006; yaw = Math.atan2(Math.sin(yaw), Math.cos(yaw));
      pitch = Math.max(0, Math.min(Math.PI / 2, pitch + (e.clientY - lastY) * .006));   // from side-on to straight down
      lastX = e.clientX; lastY = e.clientY;
      dirty = true;
      return;
    }
    if (mix > 0 || paused) return;
    const pushX = e.clientX - gustX, pushY = e.clientY - gustY, pushed = Math.hypot(pushX, pushY);
    if (pushed > 3 && !still) {
      const force = Math.min(pushed, 26) / 26 * 1.1;
      gust(e.clientX, e.clientY, pushX / pushed * force, pushY / pushed * force, false);
      gustX = e.clientX; gustY = e.clientY;
    }
    touch(e, false);
    const now = performance.now();
    // disturb by distance as well as time, so a fast stroke leaves errors all along its path
    if (now - lastAdd < 350 && Math.hypot(e.clientX - lastX, e.clientY - lastY) < STRIDE * 2) return;
    lastAdd = now; lastX = e.clientX; lastY = e.clientY;
    press(e);
  });
  addEventListener("mousedown", e => { if (e.button === 0 && onBackground(e)) e.preventDefault(); });
  let rt;
  addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(() => { if (!ready) return; layout(); warm(); if (running) { dirty = true; draw(); } else paintGrid(); }, 200); });
  function paintGrid() { if (!ready) { layout(); warm(); } fit(); ctx.drawImage(grid, 0, 0, W, H); }
  window.bgViews.surface = {
    start() {
      if (!ready) { layout(); warm(); }
      fit(); running = true; report();
      if (still) { draw(); return; }
      dirty = true; last = lastFrame = performance.now(); schedule();
    },
    stop() { running = false; cancelAnimationFrame(raf); clearTimeout(idle); },
    showMode(on) { show = on; if (!on) { trail = []; setPaused(false); } if (ready) { for (const L of layers) { L.dec.pm = ratePM(); L.next = t + Math.random() * roundLength(); } report(); } dirty = true; },
    paintGrid,
  };
})();

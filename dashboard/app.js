/* Launch Radar page. Re-runs RadarModel.build() on the raw snapshot in data.js, checks it against
   board.json's ranks (window.BOARD), then draws the board, a detail view per protocol, filters and the model. */
(function () {
  'use strict';
  const M = window.RadarModel, S = window.SNAPSHOT, $ = (id) => document.getElementById(id);
  if (!S || !M) { $('app').innerHTML = '<p class="empty">data.js or model.js is missing: run main.ts first.</p>'; return; }
  const R = M.build(S), rows = R.rows, bySlug = new Map(rows.map((r) => [r.slug, r]));
  const GC = { vault: '#3fe0b2', lend: '#79a8ff', dollar: '#f6bb45', trade: '#ff7f78', rwa: '#c49bff', stake: '#5fd3f3', infra: '#a3b1c2' };

  // board.json and the page must agree on every rank and value: the badge says whether they do.
  const B = window.BOARD || [];
  const agree = B.filter(([s, rk, v]) => bySlug.has(s) && bySlug.get(s).rank === rk && bySlug.get(s).implied_value_usd === v).length;
  const ok = agree === rows.length && B.length === rows.length;

  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const usd = (v) => (v >= 1e9 ? '$' + (v / 1e9).toFixed(2) + 'B' : v >= 1e6 ? '$' + (v / 1e6).toFixed(v >= 1e8 ? 0 : 1) + 'M' : v >= 1e3 ? '$' + (v / 1e3).toFixed(0) + 'K' : '$' + v.toFixed(2));
  const pct = (v) => (v === null ? '<span class="dim">n/a</span>' : '<span class="' + (v >= 0 ? 'pos' : 'neg') + '">' + (v >= 0 ? '+' : '') + v.toFixed(1) + '%</span>');
  const age = (d) => (d === null ? '<span class="dim">unknown</span>' : d >= 365 ? (d / 365).toFixed(1) + 'y' : d >= 60 ? Math.round(d / 30.4) + 'mo' : d + 'd');
  const x = (v, n) => '×' + v.toFixed(n === undefined ? 3 : n);
  const TIER = { watchlist: 'Watchlist', above: 'Above floor', early: 'Early' };
  const gname = (g) => R.groups[g][0];
  const vcls = (v) => v.split(' ')[0];
  const chains = [...new Set(rows.flatMap((r) => r.chains.slice(0, 3)))].sort();
  const lo = Math.log10(rows[rows.length - 1].low_usd), hi = Math.log10(rows[0].high_usd);
  const pos = (v) => ((Math.log10(v) - lo) / (hi - lo)) * 100;

  $('meta').innerHTML = 'Snapshot <b>' + esc(S.as_of) + '</b> · DefiLlama, ' + S.protocols.length + ' protocols ≥ $5M TVL<br><span class="check ' + (ok ? 'ok' : 'bad') + '">page = board.json: ' + agree + ' / ' + rows.length + ' ranks and values match</span>';
  $('foot').innerHTML = 'Implied value is this model\'s claim from DefiLlama\'s record as fetched (' + esc(S.source) + '): what a token would be worth if the record stayed as it is. A protocol here records no token in that record, which is not proof it has none. Nothing here predicts whether or when a token launches. Fees are typical per-chain costs, not quotes.';

  function parse() {
    const h = location.hash.replace(/^#\/?/, ''), [path, q] = h.split('?');
    const p = new URLSearchParams(q || ''), o = {};
    p.forEach((v, k) => (o[k] = v));
    return { path: path || 'board', q: o };
  }
  const link = (path, q) => '#/' + path + (q && Object.keys(q).length ? '?' + new URLSearchParams(q).toString() : '');
  const set = (k, v) => { const { path, q } = parse(); if (v) q[k] = v; else delete q[k]; location.hash = link(path === 'board' ? path : 'board', q); };

  function tabs(cur) {
    const t = [['board', 'Pre-token board', rows.length], ['trades', 'Token already trades', R.trades.length], ['aside', 'Set aside', R.aside.length], ['model', 'Model & calibration', R.fit.n + ' comps']];
    $('tabs').innerHTML = t.map(([p, l, n]) => '<a href="#/' + p + '" class="' + (cur === p || (cur === 'p' && p === 'board') ? 'on' : '') + '">' + l + '<b>' + n + '</b></a>').join('');
  }

  function kpis() {
    const w = rows.filter((r) => r.tier === 'watchlist').length, early = rows.filter((r) => r.tier === 'early').length, farm = rows.filter((r) => r.plan.verdict === 'Farm').length;
    const k = [
      ['Watchlist covered', w + ' / ' + S.watchlist.length, 'every house-list slug is ranked'],
      ['Pre-token launches', rows.length, R.aside.filter((a) => /^Counted/.test(a.why)).length + ' sibling products folded in'],
      ['Early finds', early, 'off the list, below $' + S.floor_usd / 1e6 + 'M'],
      ['Token already trades', R.trades.length, R.tokenRecords + ' records; ' + R.fit.n + ' families are comps'],
      ['Comps error, blind', x(R.fit.looFit, 2), 'leave-one-out; flat multiple ' + x(R.fit.looFlat, 2)],
      ['Worth farming now', farm, 'drop ≥ 3× the plan\'s fees'],
    ];
    return '<section class="kpis">' + k.map(([i, b, s]) => '<div class="kpi"><i>' + i + '</i><b>' + b + '</b><span>' + s + '</span></div>').join('') + '</section>' +
      '<div class="formula"><strong>implied value</strong> = launch TVL × <code>compsMultiple()</code> × <code>growthFactor()</code> × <code>ageFactor()</code> × <code>siblingFactor</code>, all in <code>build()</code> of model.js. ' +
      'compsMultiple: log mcap/TVL of the ' + R.fit.n + ' token families that trade, fitted as ' + x(10 ** R.fit.a) + ' at $100M TVL, slope ' + R.fit.b.toFixed(2) + ' per decade of TVL, plus a mechanism effect shrunk to the line with ' + R.k.shrink + ' pseudo-comps. ' +
      'growthFactor: (1 + 7-day change)<sup>' + R.k.growthWeight + '</sup>, change clamped ' + R.k.growthFloor + '% to +' + R.k.growthCap + '%. ageFactor: ' + R.k.ageFloor + ' rising to 1.00 after ' + R.k.ageFullDays + ' days with no token. Range = P25–P75 of the comps\' scatter (σ ' + R.fit.sigma.toFixed(2) + ' in log10). No name is special-cased.</div>';
  }

  const COLS = [
    ['rank', '#', (r) => r.rank], ['name', 'Protocol', (r) => r.name.toLowerCase()], ['tier', 'Tier', (r) => r.tier], ['tvl', 'TVL', (r) => r.launch_tvl_usd],
    ['c7', '7d TVL', (r) => r.change_7d ?? -1e9], ['age', 'No token for', (r) => r.age_days ?? -1], ['mult', 'Comps ×', (r) => r.multiple],
    ['implied', 'Implied value · P25–P75', (r) => r.implied_value_usd], ['drop', 'Drop / $1k', (r) => r.drop_per_1k], ['farm', 'Farm plan', (r) => r.plan.drop / r.plan.cost],
  ];

  function board(q) {
    const sk = q.s || 'implied', asc = q.d === 'asc', col = COLS.find((c) => c[0] === sk) || COLS[7];
    const text = (q.q || '').toLowerCase();
    const list = rows.filter((r) =>
      (!q.tier || r.tier === q.tier) && (!q.g || r.group === q.g) && (!q.ch || r.chains.includes(q.ch)) &&
      (!q.m || (q.m === 'up' ? (r.change_7d ?? 0) > 0 : (r.change_7d ?? 0) < 0)) && (!q.v || r.plan.verdict === q.v) &&
      (!text || (r.name + ' ' + r.category + ' ' + r.chains.join(' ') + ' ' + gname(r.group)).toLowerCase().includes(text)));
    list.sort((a, b) => { const p = col[2](a), o = col[2](b); return (p < o ? -1 : p > o ? 1 : a.rank - b.rank) * (asc ? 1 : -1) * (sk === 'rank' || sk === 'name' || sk === 'tier' ? -1 : 1); });
    const with_ = (k, v) => { const o = Object.assign({}, q); if (v) o[k] = v; else delete o[k]; return link('board', o); };
    const seg = (k, opts) => '<span class="seg">' + opts.map(([v, l]) => '<a href="' + with_(k, v) + '" class="' + ((q[k] || '') === v ? 'on' : '') + '">' + l + '</a>').join('') + '</span>';
    const sel = (k, label, opts) => '<label>' + label + '<select data-k="' + k + '"><option value="">' + opts[0] + '</option>' + opts.slice(1).map(([v, l]) => '<option value="' + esc(v) + '"' + (q[k] === v ? ' selected' : '') + '>' + esc(l) + '</option>').join('') + '</select></label>';
    const sumV = list.reduce((s, r) => s + r.implied_value_usd, 0);
    let h = kpis() + '<div class="filters">' +
      '<label>Search<input type="search" id="q" data-k="q" placeholder="name, category, chain" value="' + esc(q.q || '') + '"></label>' +
      '<label>Tier' + seg('tier', [['', 'All'], ['watchlist', 'Watchlist'], ['above', 'Above floor'], ['early', 'Early < $50M']]) + '</label>' +
      sel('g', 'Mechanism', ['All mechanisms'].concat(Object.keys(R.groups).map((g) => [g, gname(g)]))) +
      sel('ch', 'Chain', ['All chains'].concat(chains.map((c) => [c, c]))) +
      sel('m', '7-day TVL', ['Any move', ['up', 'Gaining'], ['down', 'Falling']]) +
      sel('v', 'Farm verdict', ['Any verdict', ['Farm', 'Farm'], ['Thin edge', 'Thin edge'], ['Watch only', 'Watch only']]) +
      '<span class="count"><b>' + list.length + '</b> of ' + rows.length + ' shown · ' + usd(sumV) + ' implied · click a column to sort, a row for its plan</span></div>';
    h += '<div class="grid"><table><thead><tr>' + COLS.map(([k, l]) => '<th data-s="' + k + '" class="' + (['tvl', 'c7', 'age', 'mult', 'drop'].includes(k) ? 'n ' : '') + (k === sk ? 'sorted' + (asc ? ' asc' : '') : '') + '">' + l + '</th>').join('') + '</tr></thead><tbody>';
    for (const r of list) {
      h += '<tr data-p="' + r.slug + '"><td class="rk">' + r.rank + '</td><td class="pn"><b>' + esc(r.name) + '</b><span>' + esc(r.category || 'No category') + ' · ' + esc(r.chains.slice(0, 3).join(', ')) + (r.chains.length > 3 ? ' +' + (r.chains.length - 3) : '') + '</span></td>' +
        '<td><span class="tier ' + r.tier + '">' + TIER[r.tier] + '</span></td><td class="n">' + usd(r.launch_tvl_usd) + '</td><td class="n">' + pct(r.change_7d) + '</td><td class="n">' + age(r.age_days) + '</td><td class="n mono">' + x(r.multiple) + '</td>' +
        '<td class="iv"><b>' + usd(r.implied_value_usd) + '</b> <span class="dim">' + usd(r.low_usd) + '–' + usd(r.high_usd) + '</span><div class="bar"><i style="left:' + pos(r.low_usd) + '%;right:' + (100 - pos(r.high_usd)) + '%"></i><em style="left:' + pos(r.implied_value_usd) + '%"></em></div></td>' +
        '<td class="n">$' + r.drop_per_1k.toFixed(2) + '</td><td><span class="verdict ' + vcls(r.plan.verdict) + '">' + r.plan.verdict + '</span><br><span class="dim">$' + r.plan.ticket + ' · ' + M.money(r.plan.cost) + ' fees · ' + r.plan.hold + 'd · ' + esc(r.plan.chain) + '</span></td></tr>';
    }
    return h + (list.length ? '' : '<tr><td colspan="10" class="empty">No protocol matches these filters.</td></tr>') + '</tbody></table></div>';
  }

  function nearest(r, n) {
    const lx = Math.log10(r.launch_tvl_usd) - 8;
    return R.fit.comps.filter((c) => c.g === r.group).sort((a, b) => Math.abs(a.x - lx) - Math.abs(b.x - lx)).slice(0, n);
  }

  function detail(slug) {
    const r = bySlug.get(slug);
    if (!r) return '<p class="empty">No ranked protocol has the slug ' + esc(slug) + '. It may be set aside: see that tab.</p>';
    const p = r.plan, prev = rows[r.rank - 2], next = rows[r.rank];
    const term = (lab, v, fn) => '<span class="t"><small>' + fn + '</small><b>' + v + '</b><br><span class="dim">' + lab + '</span></span>';
    let h = '<a class="back" href="#/board">← Board</a>' + (prev ? ' · <a class="back" href="#/p/' + prev.slug + '">↑ #' + prev.rank + ' ' + esc(prev.name) + '</a>' : '') + (next ? ' · <a class="back" href="#/p/' + next.slug + '">↓ #' + next.rank + ' ' + esc(next.name) + '</a>' : '');
    h += '<div class="dhead"><h1>' + esc(r.name) + '</h1><span class="tier ' + r.tier + '">' + TIER[r.tier] + '</span><span class="rkb">Rank <b>#' + r.rank + '</b> of ' + rows.length + ' · ' + esc(r.category || 'No category') + ' → ' + gname(r.group) + ' · ' + esc(r.chains.join(', ')) + '</span></div>';
    h += '<div class="detail"><div><section class="card"><h3>Implied value if the record stays as it is</h3><div class="big">' + usd(r.implied_value_usd) + '</div><div class="muted">P25–P75 ' + usd(r.low_usd) + ' – ' + usd(r.high_usd) + ' · records no token (no market cap, ticker or CoinGecko id)</div>' +
      '<div class="eq">' + term('launch TVL', usd(r.launch_tvl_usd), 'TVL') + '<span class="op">×</span>' + term(gname(r.group), x(r.multiple), 'compsMultiple()') + '<span class="op">×</span>' + term('7d ' + (r.change_7d === null ? 'n/a' : (r.change_7d >= 0 ? '+' : '') + r.change_7d.toFixed(1) + '%'), x(r.growth_factor), 'growthFactor()') + '<span class="op">×</span>' + term(r.age_days === null ? 'age unknown' : M.fmtAge(r.age_days) + ' no token', x(r.age_factor), 'ageFactor()') +
      (r.sibling_factor !== 1 ? '<span class="op">×</span>' + term(r.sibling_of + ' trades', x(r.sibling_factor, 2), 'siblingFactor') : '') + '<span class="op">=</span>' + term('implied', usd(r.implied_value_usd), 'build()') + '</div>' +
      '<div class="facts"><div><i>Airdrop per $1k</i><b>$' + r.drop_per_1k.toFixed(2) + '</b></div><div><i>Listed by DefiLlama</i><b>' + esc(r.listed_at || 'unknown') + '</b></div><div><i>Share of board value</i><b>' + ((100 * r.implied_value_usd) / rows.reduce((s, q) => s + q.implied_value_usd, 0)).toFixed(2) + '%</b></div><div><i>Value / TVL</i><b>' + x(r.implied_value_usd / r.launch_tvl_usd) + '</b></div></div>' +
      (r.products.length ? '<p class="note">Launch TVL folds in ' + r.products.length + ' sibling product' + (r.products.length > 1 ? 's' : '') + ' that would share one token: ' + r.products.map((q) => esc(q.name) + ' (' + usd(q.tvl) + ')').join(', ') + '.</p>' : '') + '</section>';
    h += '<section class="card" style="margin-top:16px"><h3>Priced against: nearest ' + gname(r.group).toLowerCase() + ' comps by size</h3><table class="mini"><tbody>' +
      nearest(r, 5).map((c) => '<tr><td>' + esc(c.name) + ' <span class="dim mono">' + esc(c.symbol || '') + '</span></td><td class="n">TVL ' + usd(c.tvl) + '</td><td class="n">mcap ' + usd(c.mcap) + '</td><td class="n mono">' + x(c.mcap / c.tvl) + '</td></tr>').join('') +
      '</tbody></table>' + chart(r) + '</section></div>';
    h += '<section class="card"><h3>Farm plan · ' + esc(p.chain) + ' · <span class="verdict ' + vcls(p.verdict) + '">' + p.verdict + '</span></h3><ol class="steps">' +
      p.steps.map((s) => '<li>' + esc(s.do) + '<div class="tags"><span class="tag ph ' + s.phase.split(' ')[0] + '">' + (s.phase === 'After launch' ? 'After the token' : 'Before · ' + s.phase) + '</span><span class="tag c">Cost: ' + esc(s.cost) + '</span><span class="tag t">Time: ' + esc(s.time) + '</span></div></li>').join('') + '</ol>' +
      '<div class="totals"><div><i>Ticket</i><b>$' + p.ticket.toLocaleString('en-US') + '</b></div><div><i>All fees</i><b>' + M.money(p.cost) + '</b></div><div><i>Hands-on</i><b>' + (p.minutes / 60).toFixed(1) + ' h</b></div><div><i>Hold</i><b>' + p.hold + ' days</b></div><div><i>Expected drop</i><b class="val">' + M.money(p.drop) + '</b></div></div>' +
      '<p class="note">Expected drop = implied value × ' + R.k.airdropShare * 100 + '% to farmers × ticket ÷ launch TVL. Verdict: Farm when the drop is at least 3× all fees, Thin edge at 1–3×, Watch only below. Gas is a typical ' + esc(p.chain) + ' fee of ' + M.money(p.gas) + ' a transaction.</p></section></div>';
    return h;
  }

  function chart(hl) {
    const W = 640, H = hl ? 250 : 380, L = 46, T = 12, Rr = 12, Bm = 32, cs = R.fit.comps;
    const xs = [-1.5, 2.4], ys = [-3, 1.5];
    const sx = (v) => L + ((v - xs[0]) / (xs[1] - xs[0])) * (W - L - Rr), sy = (v) => T + ((ys[1] - v) / (ys[1] - ys[0])) * (H - T - Bm);
    let s = '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '">';
    for (let v = -1; v <= 2; v++) s += '<line class="gl" x1="' + sx(v) + '" x2="' + sx(v) + '" y1="' + T + '" y2="' + (H - Bm) + '"/><text x="' + sx(v) + '" y="' + (H - Bm + 15) + '" text-anchor="middle">' + usd(10 ** (v + 8)).replace('.00', '') + '</text>';
    for (let v = -3; v <= 1; v++) s += '<line class="gl" x1="' + L + '" x2="' + (W - Rr) + '" y1="' + sy(v) + '" y2="' + sy(v) + '"/><text x="' + (L - 6) + '" y="' + (sy(v) + 4) + '" text-anchor="end">×' + 10 ** v + '</text>';
    s += '<text x="' + (W - Rr) + '" y="' + (H - 4) + '" text-anchor="end">TVL (log) →</text><text x="' + L + '" y="' + (T + 10) + '" dx="6">mcap / TVL (log)</text>';
    s += '<path class="fit" d="M' + sx(xs[0]) + ' ' + sy(R.fit.a + R.fit.b * xs[0]) + ' L' + sx(xs[1]) + ' ' + sy(R.fit.a + R.fit.b * xs[1]) + '"/>';
    if (!hl) for (const r of rows) s += '<circle cx="' + sx(Math.log10(r.launch_tvl_usd) - 8) + '" cy="' + sy(Math.log10(r.implied_value_usd / r.launch_tvl_usd)) + '" r="3" fill="none" stroke="#f6bb45" stroke-opacity=".55"/>';
    for (const c of cs) s += '<circle cx="' + sx(c.x) + '" cy="' + sy(c.y) + '" r="' + (hl && c.g !== hl.group ? 3 : 4.2) + '" fill="' + GC[c.g] + '" fill-opacity="' + (hl && c.g !== hl.group ? 0.18 : 0.85) + '"><title>' + esc(c.name) + ' ' + x(c.mcap / c.tvl) + '</title></circle>';
    if (hl) { const cx = sx(Math.log10(hl.launch_tvl_usd) - 8), cy = sy(Math.log10(hl.implied_value_usd / hl.launch_tvl_usd)); s += '<circle cx="' + cx + '" cy="' + cy + '" r="8" fill="none" stroke="#f6bb45" stroke-width="2.5"/><text x="' + (cx + 12) + '" y="' + (cy + 4) + '" style="fill:#f6bb45;font-weight:600">' + esc(hl.name) + '</text>'; }
    return s + '</svg><div class="legend">' + Object.keys(GC).map((g) => '<span><i style="background:' + GC[g] + '"></i>' + gname(g) + '</span>').join('') + '<span><i style="border:2px solid #f6bb45;background:none"></i>' + (hl ? 'this protocol' : 'pre-token rows at their implied multiple') + '</span><span style="color:#f6bb45">- - fitted line, no group effect</span></div>';
  }

  function model() {
    const f = R.fit, gs = Object.keys(R.groups);
    let h = kpis() + '<div class="lab"><section class="card"><h3>The comps: every priced token family, and the line the board is priced on</h3>' + chart(null) +
      '<p class="note">Each dot is one token family (records joined by ticker, TVL summed, largest market cap kept) that is not an exchange or chain token and has a market cap of at least $1M. ' + f.trimmed.length + ' families beyond ' + R.k.trimSigma + 'σ were trimmed before the refit: ' + f.trimmed.map((c) => esc(c.name)).join(', ') + '.</p></section><div>';
    h += '<section class="card"><h3>Blind test (leave one out)</h3><div class="k"><span>Median miss, fitted model</span><b class="pos">' + x(f.looFit, 2) + '</b><span>Median miss, one flat multiple</span><b>' + x(f.looFlat, 2) + '</b><span>Rank correlation, blind mcap vs actual</span><b>' + f.spearman.toFixed(2) + '</b><span>Scatter σ (log10)</span><b>' + f.sigma.toFixed(3) + '</b><span>Comps used</span><b>' + f.n + '</b></div><p class="note">Each comp is priced by a model fitted without it. The fit misses by ' + x(f.looFit, 2) + ' at the median against ' + x(f.looFlat, 2) + ' for a single median multiple, so size and mechanism carry real information.</p></section>';
    const mech = '<section class="card" style="margin-top:16px"><h3>Mechanism effects (shrunk)</h3><table class="mini"><tbody>' + gs.map((g) => { const n = f.comps.filter((c) => c.g === g).length, b = rows.filter((r) => r.group === g).length; return '<tr><td><i style="display:inline-block;width:9px;height:9px;border-radius:50%;background:' + GC[g] + '"></i> ' + gname(g) + '</td><td class="n">' + n + ' comps</td><td class="n">' + b + ' rows</td><td class="n mono">' + x(10 ** (f.g[g] || 0), 2) + '</td></tr>'; }).join('') + '</tbody></table></section>';
    h += '<section class="card" style="margin-top:16px"><h3>Levers: move one and the board is rebuilt</h3><div id="lab">' + LEVERS.map(([k, l, a, b, st]) => '<label class="lever">' + l + ' <code>' + k + '</code><input type="range" data-lever="' + k + '" min="' + a + '" max="' + b + '" step="' + st + '" value="' + R.k[k] + '"><b id="lv-' + k + '">' + R.k[k] + '</b></label>').join('') + '</div><div id="labout">' + labOut(R) + '</div></section>' + mech + '</div></div>';
    return h;
  }

  // The lab re-runs build() with the levers moved and compares the new top 10 with the board's.
  const LEVERS = [['growthWeight', 'Weight of the 7-day move', 0, 1, 0.05], ['ageFloor', 'Credit for a brand-new protocol', 0.2, 1, 0.05], ['ageFullDays', 'Days to full age credit', 180, 1460, 10], ['shrink', 'Pseudo-comps per mechanism', 0, 20, 1], ['airdropShare', 'Share of supply to farmers', 0.02, 0.3, 0.01]];
  function labOut(T) {
    const moved = T.rows.slice(0, 10).map((r) => { const d = bySlug.get(r.slug).rank - r.rank; return '<tr><td class="rk">' + r.rank + '</td><td>' + esc(r.name) + '</td><td class="n val">' + usd(r.implied_value_usd) + '</td><td class="n">' + (d > 0 ? '<span class="pos">▲' + d + '</span>' : d < 0 ? '<span class="neg">▼' + -d + '</span>' : '<span class="dim">=</span>') + '</td></tr>'; });
    const kept = T.rows.slice(0, 20).filter((r) => bySlug.get(r.slug).rank <= 20).length;
    return '<p class="note">Top 20 kept: <b>' + kept + ' / 20</b> · board value ' + usd(T.rows.reduce((s, r) => s + r.implied_value_usd, 0)) + ' · rows worth farming ' + T.rows.filter((r) => r.plan.verdict === 'Farm').length + '</p><table class="mini"><tbody>' + moved.join('') + '</tbody></table>';
  }

  function simple(kind) {
    const isT = kind === 'trades', list = isT ? R.trades : R.aside;
    let h = kpis() + '<p class="note">' + (isT ? 'Protocols whose token already trades, joined into token families. They are the comps the board is priced on, never ranked on it: their value is the market\'s, not the model\'s.' : 'Pre-token records the board does not rank, with the rule that set each aside. The watchlist is never set aside; sibling products are folded into one launch.') + '</p><div class="grid" style="margin-top:10px"><table><thead><tr>' +
      (isT ? '<th>Token family</th><th>Ticker</th><th>Category</th><th class="n">Records</th><th class="n">TVL</th><th class="n">Market cap</th><th class="n">mcap / TVL</th><th>Used as comp</th>' : '<th>Protocol</th><th>Category</th><th class="n">TVL</th><th>Why it is not ranked</th>') + '</tr></thead><tbody>';
    for (const t of list) h += isT
      ? '<tr><td><b>' + esc(t.name) + '</b></td><td class="mono">' + esc(t.symbol || '') + '</td><td>' + esc(t.cat || '') + '</td><td class="n">' + t.members + '</td><td class="n">' + usd(t.tvl) + '</td><td class="n">' + usd(t.mcap) + '</td><td class="n mono">' + x(t.mcap / t.tvl) + '</td><td>' + (t.comp ? '<span class="pos">yes</span>' : '<span class="dim">no</span>') + '</td></tr>'
      : '<tr><td><b>' + esc(t.name) + '</b></td><td>' + esc(t.category || '') + '</td><td class="n">' + usd(t.tvl) + '</td><td>' + esc(t.why) + '</td></tr>';
    return h + '</tbody></table></div>';
  }

  function render() {
    const { path, q } = parse(), [view, arg] = path.split('/');
    tabs(view);
    $('app').innerHTML = view === 'p' ? detail(decodeURIComponent(arg || '')) : view === 'model' ? model() : view === 'trades' || view === 'aside' ? simple(view) : board(q);
    window.scrollTo(0, 0);
  }

  $('app').addEventListener('click', (e) => {
    const th = e.target.closest('th[data-s]');
    if (th) { const { q } = parse(), s = th.dataset.s; set('d', q.s === s && q.d !== 'asc' ? 'asc' : ''); return set('s', s); }
    const tr = e.target.closest('tr[data-p]');
    if (tr) location.hash = '#/p/' + tr.dataset.p;
  });
  $('app').addEventListener('change', (e) => { if (e.target.dataset.k) set(e.target.dataset.k, e.target.value); });
  $('app').addEventListener('input', (e) => {
    if (!e.target.dataset.lever) return;
    const k = {};
    document.querySelectorAll('[data-lever]').forEach((i) => { k[i.dataset.lever] = Number(i.value); $('lv-' + i.dataset.lever).textContent = i.value; });
    $('labout').innerHTML = labOut(M.build(S, k));
  });
  $('app').addEventListener('keydown', (e) => { if (e.target.id === 'q' && e.key === 'Enter') set('q', e.target.value.trim()); });
  window.addEventListener('hashchange', render);
  render();
})();

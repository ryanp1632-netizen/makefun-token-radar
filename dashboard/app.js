/* Launch Radar page. Re-runs RadarModel.build() on the raw snapshot in data.js, checks every row against board.json
   (verifyBoard), then draws the board with traded anchors, a detail view per protocol and the set-aside list. */
(function () {
  'use strict';
  const M = window.RadarModel, S = window.SNAPSHOT, $ = (id) => document.getElementById(id);
  if (!S || !M) { $('app').innerHTML = '<p class="empty">data.js or model.js is missing: run main.ts first.</p>'; return; }
  const R = M.build(S), rows = R.rows, bySlug = new Map(rows.map((r) => [r.slug, r])), F = R.fit;
  const GC = { vault: '#3fe0b2', lend: '#79a8ff', dollar: '#f6bb45', trade: '#ff7f78', rwa: '#c49bff', stake: '#5fd3f3', infra: '#a3b1c2' };

  /** verifyBoard: board.json against this page, field by field: rank, value, 50% band, rank range, verdict, net. */
  function verifyBoard(B) {
    const ok = B.filter((b) => { const r = bySlug.get(b[0]); return r && [r.rank, r.implied_value_usd, r.low_usd, r.high_usd, r.rank_lo, r.rank_hi, r.plan.verdict, Math.round(r.plan.net * 100)].every((v, i) => v === b[i + 1]); }).length;
    return { ok, all: ok === rows.length && B.length === rows.length };
  }
  const V = verifyBoard(window.BOARD || []);

  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const usd = (v) => (v >= 1e9 ? '$' + (v / 1e9).toFixed(2) + 'B' : v >= 1e6 ? '$' + (v / 1e6).toFixed(v >= 1e8 ? 0 : 1) + 'M' : v >= 1e4 ? '$' + (v / 1e3).toFixed(0) + 'K' : v >= 1e3 ? '$' + (v / 1e3).toFixed(1).replace('.0', '') + 'K' : v >= 100 ? '$' + Math.round(v) : '$' + v.toFixed(2));
  const sgn = (v) => (v >= 0 ? '+' : '−') + usd(Math.abs(v));
  const odds = (o) => '<b class="' + (o <= 0.5 ? 'pos' : o <= 1 ? 'val' : 'neg') + '">' + (o > 1 ? '>100%' : Math.round(o * 100) + '%') + '</b>';
  const pct = (v) => (v === null ? '<span class="dim">n/a</span>' : '<span class="' + (v >= 0 ? 'pos' : 'neg') + '">' + (v >= 0 ? '+' : '') + v.toFixed(1) + '%</span>');
  const age = (d) => (d === null ? '<span class="dim">unknown</span>' : d >= 365 ? (d / 365).toFixed(1) + 'y' : d >= 60 ? Math.round(d / 30.4) + 'mo' : d + 'd');
  const x = (v, n) => '×' + v.toFixed(n === undefined ? 3 : n);
  const pc = (v) => Math.round(v * 100) + '%';
  const TIER = { watchlist: 'Watchlist', above: 'Above floor', early: 'Early' };
  const gname = (g) => R.groups[g][0];
  const vtag = (v) => '<span class="vt ' + v.split(' ')[0] + '">' + (v === 'Thin edge' ? 'Thin' : v) + '</span>';
  const curveAt = (tvl, g) => tvl * M.compsMultiple(F, tvl, g); // what a traded token of this size and mechanism is worth
  const chains = [...new Set(rows.flatMap((r) => r.chains.slice(0, 3)))].sort();
  const lo = Math.log10(rows[rows.length - 1].low_usd), hi = Math.log10(rows[0].high_usd);
  const pos = (v) => Math.max(0, Math.min(100, ((Math.log10(v) - lo) / (hi - lo)) * 100));

  $('meta').innerHTML = 'Snapshot <b>' + esc(S.as_of) + '</b> · DefiLlama, ' + S.protocols.length + ' protocols ≥ $5M TVL<br><span class="check ' + (V.all ? 'ok' : 'bad') + '">verifyBoard(): ' + V.ok + ' / ' + rows.length + ' rows = board.json</span>';
  $('foot').innerHTML = 'Implied value is this model\'s claim from DefiLlama\'s record as fetched (' + esc(S.source) + '): what a token would be worth if the record stayed as it is. A protocol here records no token in that record, which is not proof it has none. Nothing here predicts whether or when a token launches. Fees are typical per-chain costs, not quotes; nothing here is financial advice.';

  function parse() {
    const [path, q] = location.hash.replace(/^#\/?/, '').split('?'), o = {};
    new URLSearchParams(q || '').forEach((v, k) => (o[k] = v));
    return { path: path || 'board', q: o };
  }
  const link = (path, q) => '#/' + path + (q && Object.keys(q).length ? '?' + new URLSearchParams(q).toString() : '');
  const set = (k, v) => { const { q } = parse(); if (v) q[k] = v; else delete q[k]; location.hash = link('board', q); };

  function tabs(cur) {
    const t = [['board', 'Board', rows.length + ' to come'], ['aside', 'Set aside', R.aside.length]];
    $('tabs').innerHTML = t.map(([p, l, n]) => '<a href="#/' + p + '" class="' + (cur === p || (cur === 'p' && p === 'board') ? 'on' : '') + '">' + l + '<b>' + n + '</b></a>').join('');
  }

  // Board scatter: every traded token family at its market cap, every launch still to come at its implied value.
  function fieldChart() {
    const W = 470, H = 236, L = 44, T = 8, Rr = 8, Bm = 26, xs = [6.6, 10.4], ys = [5.6, 10.8];
    const sx = (v) => L + ((Math.min(xs[1], Math.max(xs[0], v)) - xs[0]) / (xs[1] - xs[0])) * (W - L - Rr), sy = (v) => T + ((ys[1] - Math.min(ys[1], Math.max(ys[0], v))) / (ys[1] - ys[0])) * (H - T - Bm);
    let s = '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '">';
    for (let v = 7; v <= 10; v++) s += '<line class="gl" x1="' + sx(v) + '" x2="' + sx(v) + '" y1="' + T + '" y2="' + (H - Bm) + '"/><text x="' + sx(v) + '" y="' + (H - Bm + 14) + '" text-anchor="middle">' + usd(10 ** v) + '</text>';
    for (let v = 6; v <= 10; v++) s += '<line class="gl" x1="' + L + '" x2="' + (W - Rr) + '" y1="' + sy(v) + '" y2="' + sy(v) + '"/><text x="' + (L - 5) + '" y="' + (sy(v) + 4) + '" text-anchor="end">' + usd(10 ** v) + '</text>';
    for (const c of F.comps) s += '<circle cx="' + sx(c.x + 8) + '" cy="' + sy(c.x + c.y + 8) + '" r="3.2" fill="#8b9bb0" fill-opacity=".55"/>';
    for (const r of rows) s += '<rect x="' + (sx(Math.log10(r.launch_tvl_usd)) - 2.5) + '" y="' + (sy(Math.log10(r.implied_value_usd)) - 2.5) + '" width="5" height="5" fill="#f6bb45" fill-opacity=".8"/>';
    s += '<path class="fit" style="stroke:#3fe0b2" d="M' + sx(xs[0]) + ' ' + sy(xs[0] + F.a + F.b * (xs[0] - 8)) + ' L' + sx(xs[1]) + ' ' + sy(xs[1] + F.a + F.b * (xs[1] - 8)) + '"/>';
    return s + '<text x="' + (W - Rr) + '" y="' + (H - 2) + '" text-anchor="end">TVL →</text></svg><div class="legend"><span><i style="background:#8b9bb0"></i>' + F.n + ' traded families, market cap</span><span><i style="background:#f6bb45;border-radius:1px"></i>' + rows.length + ' still to come, implied value</span><span class="pos">- - fitted curve</span></div>';
  }

  // What a reader sees first: coverage and the page check, the field on one chart, and the blind test.
  function hero() {
    const n = (v) => rows.filter((r) => r.plan.verdict === v).length;
    const best = rows.filter((r) => r.tier === 'watchlist' && r.plan.net > 0).sort((a, b) => b.plan.perHour - a.plan.perHour).slice(0, 3);
    const tile = (b, l) => '<div class="tile"><b>' + b + '</b><span>' + l + '</span></div>';
    const tr = (l, v, w) => '<tr><td>' + l + '</td><td class="n"><b class="pos">' + v + '</b></td><td class="n dim">' + w + '</td></tr>';
    return '<section class="hero"><div class="lead"><h1>Every protocol with no token, priced off the ' + F.n + ' that trade, with a costed farm plan each.</h1>' +
      '<div class="tiles">' + tile(rows.filter((r) => r.tier === 'watchlist').length + '/' + S.watchlist.length, 'watchlist ranked') + tile(rows.length, 'record no token, ranked') + tile(R.trades.length, 'already trade: anchors, never ranked') + tile(R.aside.length, 'set aside, each with its rule') + '</div>' +
      '<div class="check ' + (V.all ? 'ok' : 'bad') + '">' + (V.all ? '✓ ' : '✗ ') + 'board.json = this page: verifyBoard() re-derived ' + V.ok + ' / ' + rows.length + ' ranks, values, bands, rank ranges, verdicts and nets</div>' +
      '<div class="fx">value = TVL × curve(TVL) × mechanism × growth(7d) × age(days with no token) × sibling</div>' +
      '<p class="note">' + vtag('Farm') + ' ' + n('Farm') + ' · ' + vtag('Thin edge') + ' ' + n('Thin edge') + ' · ' + vtag('Skip') + ' ' + n('Skip') + ' at ' + usd(R.k.capital) + '. Best net per hands-on hour on the watchlist: ' + best.map((r) => '<a href="#/p/' + r.slug + '" class="val">' + esc(r.name) + ' ' + sgn(r.plan.perHour) + '/h</a>').join(' · ') + '</p></div>' +
      '<div><h3>Traded tokens and the launches to come</h3>' + fieldChart() + '</div>' +
      '<div><h3>Out of sample · <code>compsFit()</code></h3><table class="mini"><thead><tr><th>Each traded token priced blind</th><th class="n">ours</th><th class="n">flat multiple</th></tr></thead><tbody>' +
      tr('Median miss, left out of the fit', x(F.looFit, 2), x(F.looFlat, 2)) + tr('Within 3× of its real cap', pc(F.within3), pc(F.within3Flat)) +
      tr('Time split: ' + F.split.nTrain + ' older fit, ' + F.split.nTest + ' newer priced', x(F.split.fit, 2), x(F.split.flat, 2)) +
      tr('Newer tokens inside the 50% / 80% band', pc(F.split.cover50) + ' / ' + pc(F.split.cover80), 'aim 50 / 80') + tr('Rank correlation, blind price vs cap', F.spearman.toFixed(2), '') +
      '</tbody></table><p class="note">Factor check: blind misses vs 7-day move r = ' + F.rC7.toFixed(2) + ', vs token age r = ' + F.rAge.toFixed(2) + ', so both factors stay small. Rank range under each rank: P10–P90 over ' + R.k.refits + ' bootstrap refits.</p></div></section>';
  }

  const COLS = [
    ['rank', '#', (r) => r.rank], ['name', 'Protocol', (r) => r.name.toLowerCase()], ['tvl', 'TVL', (r) => r.launch_tvl_usd], ['c7', '7d', (r) => r.change_7d ?? -1e9],
    ['age', 'No token for', (r) => r.age_days ?? -1], ['implied', 'Implied value · 50% band', (r) => r.implied_value_usd], ['slice', '$1K slice', (r) => r.plan.slice],
    ['net', 'Net if it launches', (r) => r.plan.net], ['odds', 'Break-even odds', (r) => -r.plan.odds], ['hour', 'Farm · fees · hold', (r) => r.plan.perHour],
  ];

  // A traded family shown among the launches at its market cap: an anchor for the eye, never ranked.
  const anchor = (c) => '<tr class="anc"><td class="rk">–</td><td class="pn"><b>' + esc(c.name) + ' <span class="tier tr">trades</span></b><span>' + esc(c.symbol || '') + ' · ' + esc(c.cat || '') + '</span></td><td class="n">' + usd(c.tvl) + '</td><td class="n">' + pct(c.c7) + '</td><td class="n">' + age(c.age) + '</td>' +
    '<td class="iv"><b>' + usd(c.mcap) + '</b><div class="dim">market cap</div></td><td colspan="4" class="dim">trades, so not ranked · the fitted curve would price it at ' + usd(curveAt(c.tvl, c.g)) + '</td></tr>';

  function board(q) {
    const sk = q.s || 'implied', asc = q.d === 'asc', col = COLS.find((c) => c[0] === sk) || COLS[5], text = (q.q || '').toLowerCase(), t = q.t || '';
    const hit = (s) => !text || s.toLowerCase().includes(text);
    const list = rows.filter((r) =>
      (!q.tier || r.tier === q.tier) && (!q.g || r.group === q.g) && (!q.ch || r.chains.includes(q.ch)) &&
      (!q.m || (q.m === 'up' ? (r.change_7d ?? 0) > 0 : (r.change_7d ?? 0) < 0)) && (!q.v || r.plan.verdict === q.v) &&
      hit(r.name + ' ' + r.category + ' ' + r.chains.join(' ') + ' ' + gname(r.group)));
    const dir = (asc ? 1 : -1) * (sk === 'rank' || sk === 'name' ? -1 : 1);
    list.sort((a, b) => { const p = col[2](a), o = col[2](b); return p < o ? -dir : p > o ? dir : a.rank - b.rank; });
    const seg = (k, opts) => '<span class="seg">' + opts.map(([v, l]) => { const o = Object.assign({}, q); if (v) o[k] = v; else delete o[k]; return '<a href="' + link('board', o) + '" class="' + ((q[k] || '') === v ? 'on' : '') + '">' + l + '</a>'; }).join('') + '</span>';
    const cnt = (f) => ' <small>' + rows.filter(f).length + '</small>';
    const sel = (k, label, opts, def) => '<label>' + label + '<select data-k="' + k + '">' + (def ? '<option value="">' + def + '</option>' : '') + opts.map(([v, l]) => '<option value="' + esc(v) + '"' + (q[k] === String(v) ? ' selected' : '') + '>' + esc(l) + '</option>').join('') + '</select></label>';
    let h = (Object.keys(q).some((k) => k !== 's' && k !== 'd') ? '' : hero()) + '<div class="filters">' +
      '<label>Show' + seg('t', [['', 'To come + traded anchors'], ['pre', 'Still to come' + ' <small>' + rows.length + '</small>'], ['tr', 'Already trades <small>' + R.trades.length + '</small>']]) + '</label>' +
      '<label>Search<input type="search" data-k="q" placeholder="name, category, chain" value="' + esc(q.q || '') + '"></label>' +
      '<label>Tier' + seg('tier', [['', 'All'], ['watchlist', 'Watchlist' + cnt((r) => r.tier === 'watchlist')], ['above', 'Above floor' + cnt((r) => r.tier === 'above')], ['early', 'Early' + cnt((r) => r.tier === 'early')]]) + '</label>' +
      '<label>Verdict at $1K' + seg('v', [['', 'Any'], ['Farm', 'Farm' + cnt((r) => r.plan.verdict === 'Farm')], ['Thin edge', 'Thin' + cnt((r) => r.plan.verdict === 'Thin edge')], ['Skip', 'Skip' + cnt((r) => r.plan.verdict === 'Skip')]]) + '</label>' +
      sel('g', 'Mechanism', Object.keys(R.groups).map((g) => [g, gname(g) + ' (' + rows.filter((r) => r.group === g).length + ')']), 'All') + sel('ch', 'Chain', chains.map((c) => [c, c]), 'All') + sel('m', '7-day TVL', [['up', 'Gaining'], ['down', 'Falling']], 'Any') +
      '<span class="count"><b>' + list.length + '</b> of ' + rows.length + ' ranked · ' + usd(list.reduce((s, r) => s + r.implied_value_usd, 0)) + ' implied · click a column to sort, a row for its plan</span></div>';
    if (t === 'tr') return h + traded(hit);
    // Anchors join only the default value order, and only under filters a traded token can meet.
    const anc = !t && sk === 'implied' && !asc && !q.tier && !q.v && !q.ch && !q.m ? F.comps.filter((c) => (!q.g || c.g === q.g) && hit(c.name + ' ' + (c.cat || '') + ' ' + gname(c.g))).sort((a, b) => b.mcap - a.mcap) : [];
    h += '<div class="grid"><table><thead><tr>' + COLS.map(([k, l]) => '<th data-s="' + k + '" class="' + (['tvl', 'c7', 'age', 'slice', 'net', 'odds'].includes(k) ? 'n ' : '') + (k === sk ? 'sorted' + (asc ? ' asc' : '') : '') + '">' + l + '</th>').join('') + '</tr></thead><tbody>';
    let ai = 0, gap = 0; // at most one anchor every 4 ranked rows, the traded token just above the next row's value
    for (const r of list) {
      const p = r.plan;
      let a = null;
      while (ai < anc.length && anc[ai].mcap > r.implied_value_usd) a = anc[ai++];
      if (a && a.mcap < rows[0].implied_value_usd * 1.5 && gap >= 3) { h += anchor(a); gap = 0; } else gap++;
      h += '<tr data-p="' + r.slug + '"><td class="rk">' + r.rank + '<small>' + r.rank_lo + '–' + r.rank_hi + '</small></td><td class="pn"><b>' + esc(r.name) + ' <span class="tier ' + r.tier + '">' + TIER[r.tier] + '</span></b><span><i class="dot" style="background:' + GC[r.group] + '"></i>' + esc(r.category || 'No category') + ' · ' + esc(r.chains.slice(0, 2).join(', ')) + (r.chains.length > 2 ? ' +' + (r.chains.length - 2) : '') + '</span></td>' +
        '<td class="n">' + usd(r.launch_tvl_usd) + '</td><td class="n">' + pct(r.change_7d) + '</td><td class="n">' + age(r.age_days) + '</td>' +
        '<td class="iv"><b>' + usd(r.implied_value_usd) + '</b><div class="bar"><i style="left:' + pos(r.low_usd) + '%;right:' + (100 - pos(r.high_usd)) + '%"></i><em style="left:' + pos(r.implied_value_usd) + '%"></em></div></td>' +
        '<td class="n">' + usd(p.slice) + '</td><td class="n net">' + vtag(p.verdict) + ' <b class="' + (p.net > 0 ? 'pos' : 'neg') + '">' + sgn(p.net) + '</b><br><span class="dim">' + sgn(p.perHour) + '/h · ' + (p.paysFrom ? 'pays from ' + usd(p.paysFrom) : 'never beats a T-bill') + '</span></td>' +
        '<td class="n">' + odds(p.odds) + '</td><td><span class="play">' + gname(r.group).split(' ')[0] + ' · ' + esc(p.chain) + '</span><br><span class="dim">' + usd(p.fees) + ' fees · ' + p.hold + 'd · ' + (p.minutes / 60).toFixed(1) + 'h work</span></td></tr>';
    }
    return h + (list.length ? '' : '<tr><td colspan="10" class="empty">No protocol matches these filters.</td></tr>') + '</tbody></table></div>';
  }

  function traded(hit) {
    let h = '<div class="grid"><table><thead><tr><th>Token family</th><th>Ticker</th><th>Category</th><th class="n">Records</th><th class="n">TVL</th><th class="n">Market cap</th><th class="n">mcap / TVL</th><th>Comp</th></tr></thead><tbody>';
    for (const t of R.trades.filter((t) => hit(t.name + ' ' + (t.cat || '')))) h += '<tr><td><b>' + esc(t.name) + '</b></td><td class="mono">' + esc(t.symbol || '') + '</td><td>' + esc(t.cat || '') + '</td><td class="n">' + t.members + '</td><td class="n">' + usd(t.tvl) + '</td><td class="n">' + usd(t.mcap) + '</td><td class="n mono">' + x(t.mcap / t.tvl) + '</td><td>' + (t.comp ? '<span class="pos">fits the curve</span>' : '<span class="dim">no</span>') + '</td></tr>';
    return h + '</tbody></table></div>';
  }

  function nearest(r, n) {
    const lx = Math.log10(r.launch_tvl_usd) - 8;
    return F.comps.filter((c) => c.g === r.group).sort((a, b) => Math.abs(a.x - lx) - Math.abs(b.x - lx)).slice(0, n);
  }

  /** timeline: the plan on a day axis: day-0 steps, weekly upkeep, the stop line, launch and the unwind. */
  function timeline(p) {
    const W = 640, L = 16, Rr = 110, y = 30, d = (v) => L + (v / p.hold) * (W - L - Rr);
    let s = '<svg class="chart tl" viewBox="0 0 ' + W + ' 86"><line x1="' + L + '" x2="' + d(p.hold) + '" y1="' + y + '" y2="' + y + '" stroke="#2c3e52" stroke-width="2"/>';
    const dot = (cx, n, c) => '<circle cx="' + cx + '" cy="' + y + '" r="9" fill="' + c + '"/><text x="' + cx + '" y="' + (y + 4) + '" text-anchor="middle" style="fill:#06221a;font-weight:700">' + n + '</text>';
    for (let w = 1; w <= p.weeks; w++) s += '<circle cx="' + d(w * 7) + '" cy="' + y + '" r="4" fill="#79a8ff"/>' + (w % 2 && w < p.weeks ? '<text x="' + d(w * 7) + '" y="' + (y + 22) + '" text-anchor="middle">wk ' + w + '</text>' : '');
    s += dot(d(0), 1, '#3fe0b2') + dot(d(0) + 21, 2, '#3fe0b2') + dot(d(0) + 42, 3, '#3fe0b2') + '<text x="' + (d(7) - 8) + '" y="' + (y - 14) + '">4 upkeep, weekly</text>' + dot(d(p.hold), 8, '#c49bff');
    s += '<text x="' + L + '" y="' + (y + 22) + '">day 0</text><text x="' + d(p.hold) + '" y="' + (y + 24) + '" text-anchor="middle">day ' + p.hold + '</text>';
    s += '<line x1="' + L + '" x2="' + d(p.hold) + '" y1="' + (y + 32) + '" y2="' + (y + 32) + '" stroke="#ff7f78" stroke-dasharray="5 4"/><text x="' + (L + 4) + '" y="' + (y + 48) + '" style="fill:#ff7f78">6 any day: exit if TVL closes under ' + usd(p.stop) + '</text>';
    return s + '<path d="M' + (W - 40) + ' ' + (y - 10) + ' l10 10 l-10 10 l-10 -10z" fill="#c49bff"/><text x="' + (W - 40) + '" y="' + (y + 4) + '" text-anchor="middle" style="fill:#06221a;font-weight:700">7</text><text x="' + (W - 40) + '" y="' + (y + 24) + '" text-anchor="middle">at launch</text></svg>';
  }

  function detail(slug) {
    const r = bySlug.get(slug);
    if (!r) return '<p class="empty">No ranked protocol has the slug ' + esc(slug) + '. It may be set aside: see that tab.</p>';
    const p = r.plan, prev = rows[r.rank - 2], next = rows[r.rank], tvl = r.launch_tvl_usd;
    const curve = tvl * 10 ** (F.a + F.b * (Math.log10(tvl) - 8)), mech = 10 ** (F.g[r.group] || 0);
    const kpi = (l, v, s) => '<div class="kpi"><i>' + l + '</i><b>' + v + '</b><span>' + s + '</span></div>';
    let h = '<a class="back" href="#/board">← Board</a>' + (prev ? ' · <a class="back" href="#/p/' + prev.slug + '">↑ #' + prev.rank + ' ' + esc(prev.name) + '</a>' : '') + (next ? ' · <a class="back" href="#/p/' + next.slug + '">↓ #' + next.rank + ' ' + esc(next.name) + '</a>' : '');
    h += '<div class="dhead"><h1>' + esc(r.name) + '</h1><span class="tier ' + r.tier + '">' + TIER[r.tier] + '</span><span class="tier tr">records no token</span><span class="rkb">Rank <b>#' + r.rank + '</b> of ' + rows.length + ' (P10–P90 over ' + R.k.refits + ' refits: ' + r.rank_lo + '–' + r.rank_hi + ') · ' + esc(r.category || 'No category') + ' → ' + gname(r.group) + ' · ' + esc(r.chains.join(', ')) + '</span></div>';
    h += '<section class="kpis k5">' + kpi('Implied value', '<span class="val">' + usd(r.implied_value_usd) + '</span>', '50% band ' + usd(r.low_usd) + '–' + usd(r.high_usd)) + kpi('Launch TVL', usd(tvl), '7d ' + pct(r.change_7d)) +
      kpi('No token for', age(r.age_days), 'tracked since ' + esc(r.listed_at || 'unknown')) + kpi(usd(p.ticket) + ' slice', usd(p.slice), R.k.airdropShare * 100 + '% to depositors, pro rata') +
      kpi('Break-even odds', odds(p.odds), vtag(p.verdict) + ' net if it launches ' + sgn(p.net)) + '</section>';
    const chip = (v, l, cls) => '<div class="fc' + (cls ? ' ' + cls : '') + '"><b>' + v + '</b><span>' + l + '</span></div>';
    h += '<div class="detail"><div><section class="card"><h3>How ' + usd(r.implied_value_usd) + ' is built · <code>build()</code></h3><div class="chainx">' +
      chip(usd(curve), 'size curve at ' + usd(tvl) + ' TVL') + '×' + chip(x(mech, 2), gname(r.group) + ', ' + F.comps.filter((c) => c.g === r.group).length + ' comps, shrunk') + '×' +
      chip(x(r.growth_factor, 2), '7d ' + (r.change_7d === null ? 'n/a' : (r.change_7d >= 0 ? '+' : '') + r.change_7d.toFixed(1) + '%') + ', half carried') + '×' +
      chip(x(r.age_factor, 2), (r.age_days === null ? 'age unknown: 1y' : M.fmtAge(r.age_days)) + ' with no token') + '×' + chip(x(r.sibling_factor, 1), r.sibling_of ? 'sibling ' + esc(r.sibling_of) + ' trades' : 'no traded sibling') + '=' +
      chip(usd(r.implied_value_usd), '80% band ' + usd(r.p10_usd) + '–' + usd(r.p90_usd), 'tot') + '</div>' +
      (r.products.length ? '<p class="note">Launch TVL folds in ' + r.products.map((q) => esc(q.name) + ' (' + usd(q.tvl) + ')').join(', ') + ': products that would share one token.</p>' : '') +
      '<p class="note">DefiLlama records no market cap, ticker or CoinGecko id for ' + esc(r.name) + ' as of ' + esc(S.as_of) + ' (not proof: check its own channels). Recomputed here from the snapshot; board.json carries the same value at rank ' + r.rank + '.</p></section>';
    h += '<section class="card" style="margin-top:14px"><h3>Against traded peers: nearest ' + gname(r.group).toLowerCase() + ' tokens by TVL</h3>' + chart(r) + '<table class="mini"><thead><tr><th>Token that trades</th><th class="n">TVL</th><th class="n">Market cap</th><th class="n">× TVL</th><th class="n">At this TVL</th></tr></thead><tbody>' +
      nearest(r, 4).map((c) => '<tr><td>' + esc(c.name) + ' <span class="dim mono">' + esc(c.symbol || '') + '</span></td><td class="n">' + usd(c.tvl) + '</td><td class="n">' + usd(c.mcap) + '</td><td class="n mono">' + x(c.mcap / c.tvl, 2) + '</td><td class="n">' + usd((c.mcap / c.tvl) * tvl) + '</td></tr>').join('') + '</tbody></table></section></div>';
    h += '<section class="card"><h3>Farm plan · ' + esc(gname(r.group).toLowerCase()) + ' on ' + esc(p.chain) + ' · ' + usd(p.ticket) + ' for ' + p.hold + ' days · ' + vtag(p.verdict) + '</h3>' + timeline(p) + '<table class="plan"><thead><tr><th></th><th>When</th><th>Step</th><th class="n">Cost</th><th class="n">Time</th></tr></thead><tbody>' +
      p.steps.map((s, i) => '<tr><td class="rk">' + (i + 1) + '</td><td class="when">' + s.when + '</td><td><b class="' + (s.after ? 'aft' : 'bef') + '">' + s.name + '.</b> ' + esc(s.do) + '<div class="dim">' + esc(s.cost) + '</div></td><td class="n">' + (s.usd ? M.money(s.usd) : s.name === 'Hold' ? M.money(p.forgone) : 'none') + '</td><td class="n">' + esc(s.time.replace(' on launch day', '').replace('inside the weekly visit', 'weekly')) + '</td></tr>').join('') +
      '</tbody></table><div class="sum"><span>Slice <b>' + usd(p.slice) + '</b></span><span>Fees <b class="neg">−' + usd(p.fees) + '</b></span><span>T-bill forgone <b class="neg">−' + usd(p.forgone) + '</b></span><span>Net <b class="' + (p.net > 0 ? 'pos' : 'neg') + '">' + sgn(p.net) + '</b></span><span>Work <b>' + (p.minutes / 60).toFixed(1) + ' h</b></span><span>Per hour <b>' + sgn(p.perHour) + '</b></span><span>Break-even odds ' + odds(p.odds) + '</span></div>' +
      '<table class="mini netat"><thead><tr><th>Net at</th>' + [0.05, 0.1, 0.2].map((s) => '<th class="n">' + s * 100 + '% drop</th>').join('') + '</tr></thead><tbody>' +
      [1e3, 1e4, 1e5].map((c) => '<tr><td>' + usd(c) + '</td>' + [0.05, 0.1, 0.2].map((s) => { const v = (p.perDollar * s) / R.k.airdropShare * c - p.fees - c * p.carry; return '<td class="n ' + (v > 0 ? 'pos' : 'neg') + (c === p.ticket && s === R.k.airdropShare ? ' cur' : '') + '">' + sgn(v) + '</td>'; }).join('') + '</tr>').join('') + '</tbody></table>' +
      '<p class="note">Slice = ' + usd(r.implied_value_usd) + ' × ' + pc(R.k.airdropShare) + ' × ' + usd(p.ticket) + ' ÷ ' + usd(tvl) + ' TVL = ' + usd(p.slice) + ', paid only if a token launches. Break-even odds = (' + usd(p.fees) + ' fees + ' + usd(p.forgone) + ' forgone) ÷ ' + usd(p.slice) + ' = ' + odds(p.odds) + ': ' + vtag('Farm') + ' at 50% or less, ' + vtag('Thin edge') + ' up to 100%, ' + vtag('Skip') + ' above. ' + (p.paysFrom ? 'Nets above zero from ' + usd(p.paysFrom) + ' of capital.' : 'No deposit size beats a T-bill here.') + ' Gas: a typical ' + esc(p.chain) + ' fee of ' + M.money(p.gas) + '.</p></section></div>';
    return h;
  }

  function chart(hl) {
    const W = 640, H = 200, L = 46, T = 12, Rr = 12, Bm = 30, xs = [-1.5, 2.4], ys = [-3, 1.5];
    const sx = (v) => L + ((v - xs[0]) / (xs[1] - xs[0])) * (W - L - Rr), sy = (v) => T + ((ys[1] - v) / (ys[1] - ys[0])) * (H - T - Bm);
    let s = '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '">';
    for (let v = -1; v <= 2; v++) s += '<line class="gl" x1="' + sx(v) + '" x2="' + sx(v) + '" y1="' + T + '" y2="' + (H - Bm) + '"/><text x="' + sx(v) + '" y="' + (H - Bm + 15) + '" text-anchor="middle">' + usd(10 ** (v + 8)) + '</text>';
    for (let v = -3; v <= 1; v++) s += '<line class="gl" x1="' + L + '" x2="' + (W - Rr) + '" y1="' + sy(v) + '" y2="' + sy(v) + '"/><text x="' + (L - 6) + '" y="' + (sy(v) + 4) + '" text-anchor="end">×' + 10 ** v + '</text>';
    s += '<text x="' + (W - Rr) + '" y="' + (H - 4) + '" text-anchor="end">TVL (log) →</text><text x="' + L + '" y="' + (T + 10) + '" dx="6">mcap / TVL (log)</text>';
    const band = (w, o) => '<path d="M' + sx(xs[0]) + ' ' + sy(F.a + F.b * xs[0] + w) + ' L' + sx(xs[1]) + ' ' + sy(F.a + F.b * xs[1] + w) + ' L' + sx(xs[1]) + ' ' + sy(F.a + F.b * xs[1] - w) + ' L' + sx(xs[0]) + ' ' + sy(F.a + F.b * xs[0] - w) + 'Z" fill="#f6bb45" fill-opacity="' + o + '"/>';
    s += band(F.band80, 0.05) + band(F.band50, 0.08) + '<path class="fit" d="M' + sx(xs[0]) + ' ' + sy(F.a + F.b * xs[0]) + ' L' + sx(xs[1]) + ' ' + sy(F.a + F.b * xs[1]) + '"/>';
    for (const c of F.comps) { const dim = hl && c.g !== hl.group; s += '<circle cx="' + sx(c.x) + '" cy="' + sy(c.y) + '" r="' + (dim ? 3 : 4.2) + '" fill="' + GC[c.g] + '" fill-opacity="' + (dim ? 0.18 : 0.85) + '"><title>' + esc(c.name) + '</title></circle>'; }
    const cx = sx(Math.log10(hl.launch_tvl_usd) - 8), cy = sy(Math.log10(hl.implied_value_usd / hl.launch_tvl_usd));
    s += '<circle cx="' + cx + '" cy="' + cy + '" r="8" fill="none" stroke="#f6bb45" stroke-width="2.5"/><text x="' + (cx + 12) + '" y="' + (cy + 4) + '" style="fill:#f6bb45;font-weight:600">' + esc(hl.name) + '</text>';
    return s + '</svg><div class="legend">' + Object.keys(GC).map((g) => '<span><i style="background:' + GC[g] + '"></i>' + gname(g) + '</span>').join('') + '<span class="val">○ this protocol · - - curve, 50% / 80% blind band</span></div>';
  }

  function aside() {
    let h = '<p class="note">Pre-token records the board does not rank, each with the rule that set it aside (<code>asideReason()</code>). The watchlist is never set aside.</p><div class="grid" style="margin-top:10px"><table><thead><tr><th>Protocol</th><th>Category</th><th class="n">TVL</th><th>Why it is not ranked</th></tr></thead><tbody>';
    for (const t of R.aside) h += '<tr><td><b>' + esc(t.name) + '</b></td><td>' + esc(t.category || '') + '</td><td class="n">' + usd(t.tvl) + '</td><td>' + esc(t.why) + '</td></tr>';
    return h + '</tbody></table></div>';
  }

  function render() {
    const { path, q } = parse(), [view, arg] = path.split('/');
    tabs(view);
    $('app').innerHTML = view === 'p' ? detail(decodeURIComponent(arg || '')) : view === 'aside' ? aside() : board(q);
    window.scrollTo(0, 0);
  }

  $('app').addEventListener('click', (e) => {
    const th = e.target.closest('th[data-s]');
    if (th) { const { q } = parse(), s = th.dataset.s; q.d = q.s === s && q.d !== 'asc' ? 'asc' : ''; q.s = s; if (!q.d) delete q.d; location.hash = link('board', q); return; }
    const tr = e.target.closest('tr[data-p]');
    if (tr) location.hash = '#/p/' + tr.dataset.p;
  });
  $('app').addEventListener('change', (e) => { if (e.target.dataset.k) set(e.target.dataset.k, e.target.value.trim()); });
  window.addEventListener('hashchange', render);
  render();
})();

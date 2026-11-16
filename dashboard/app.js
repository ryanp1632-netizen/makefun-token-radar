/* Launch Radar page. Re-runs RadarModel.build() on the raw snapshot in data.js, checks it against board.json
   (window.BOARD), then draws the board, a detail view per protocol, the filters and the model's own tests. */
(function () {
  'use strict';
  const M = window.RadarModel, S = window.SNAPSHOT, $ = (id) => document.getElementById(id);
  if (!S || !M) { $('app').innerHTML = '<p class="empty">data.js or model.js is missing: run main.ts first.</p>'; return; }
  const R0 = M.build(S), base = new Map(R0.rows.map((r) => [r.slug, r]));
  const GC = { vault: '#3fe0b2', lend: '#79a8ff', dollar: '#f6bb45', trade: '#ff7f78', rwa: '#c49bff', stake: '#5fd3f3', infra: '#a3b1c2' };

  // board.json and the page must agree on every rank and value: the badge says whether they do.
  const B = window.BOARD || [];
  const agree = B.filter(([s, rk, v]) => base.has(s) && base.get(s).rank === rk && base.get(s).implied_value_usd === v).length;
  const ok = agree === R0.rows.length && B.length === R0.rows.length;

  // Capital and airdrop share re-cost every plan (values and ranks do not move); one build per setting.
  let R = R0, rows = R0.rows, bySlug = base, key = '';
  function use(q) {
    const k = { capital: Number(q.cap) || R0.k.capital, airdropShare: Number(q.sh) || R0.k.airdropShare };
    if (k.capital + '/' + k.airdropShare === key) return;
    key = k.capital + '/' + k.airdropShare;
    R = k.capital === R0.k.capital && k.airdropShare === R0.k.airdropShare ? R0 : M.build(S, k);
    rows = R.rows; bySlug = new Map(rows.map((r) => [r.slug, r]));
  }

  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const usd = (v) => (v >= 1e9 ? '$' + (v / 1e9).toFixed(2) + 'B' : v >= 1e6 ? '$' + (v / 1e6).toFixed(v >= 1e8 ? 0 : 1) + 'M' : v >= 1e4 ? '$' + (v / 1e3).toFixed(0) + 'K' : v >= 1e3 ? '$' + (v / 1e3).toFixed(1).replace('.0', '') + 'K' : v >= 100 ? '$' + Math.round(v) : '$' + v.toFixed(2));
  const sgn = (v) => (v >= 0 ? '+' : '−') + usd(Math.abs(v));
  const odds = (o) => '<b class="' + (o <= 0.5 ? 'pos' : o <= 1 ? 'val' : 'neg') + '">' + (o > 1 ? '>100%' : Math.round(o * 100) + '%') + '</b>';
  const pct = (v) => (v === null ? '<span class="dim">n/a</span>' : '<span class="' + (v >= 0 ? 'pos' : 'neg') + '">' + (v >= 0 ? '+' : '') + v.toFixed(1) + '%</span>');
  const age = (d) => (d === null ? '<span class="dim">unknown</span>' : d >= 365 ? (d / 365).toFixed(1) + 'y' : d >= 60 ? Math.round(d / 30.4) + 'mo' : d + 'd');
  const x = (v, n) => '×' + v.toFixed(n === undefined ? 3 : n);
  const TIER = { watchlist: 'Watchlist', above: 'Above floor', early: 'Early' };
  const gname = (g) => R0.groups[g][0];
  const vtag = (v) => '<span class="vt ' + v.split(' ')[0] + '">' + (v === 'Thin edge' ? 'Thin' : v) + '</span>';
  const chains = [...new Set(R0.rows.flatMap((r) => r.chains.slice(0, 3)))].sort();
  const lo = Math.log10(R0.rows[R0.rows.length - 1].low_usd), hi = Math.log10(R0.rows[0].high_usd);
  const pos = (v) => Math.max(0, Math.min(100, ((Math.log10(v) - lo) / (hi - lo)) * 100));
  const F = R0.fit;

  $('meta').innerHTML = 'Snapshot <b>' + esc(S.as_of) + '</b> · DefiLlama, ' + S.protocols.length + ' protocols ≥ $5M TVL<br><span class="check ' + (ok ? 'ok' : 'bad') + '">page = board.json: ' + agree + ' / ' + R0.rows.length + ' ranks and values match</span>';
  $('foot').innerHTML = 'Implied value is this model\'s claim from DefiLlama\'s record as fetched (' + esc(S.source) + '): what a token would be worth if the record stayed as it is. A protocol here records no token in that record, which is not proof it has none. Nothing here predicts whether or when a token launches. Fees are typical per-chain costs, not quotes; nothing here is financial advice.';

  function parse() {
    const [path, q] = location.hash.replace(/^#\/?/, '').split('?'), o = {};
    new URLSearchParams(q || '').forEach((v, k) => (o[k] = v));
    return { path: path || 'board', q: o };
  }
  const link = (path, q) => '#/' + path + (q && Object.keys(q).length ? '?' + new URLSearchParams(q).toString() : '');
  const set = (k, v) => { const { q } = parse(); if (v) q[k] = v; else delete q[k]; location.hash = link('board', q); };

  function tabs(cur) {
    const t = [['board', 'No token yet', R0.rows.length], ['trades', 'Token already trades', R0.trades.length], ['aside', 'Set aside', R0.aside.length], ['model', 'Method & tests', F.n + ' comps']];
    $('tabs').innerHTML = t.map(([p, l, n]) => '<a href="#/' + p + '" class="' + (cur === p || (cur === 'p' && p === 'board') ? 'on' : '') + '">' + l + '<b>' + n + '</b></a>').join('');
  }

  // The summary a reader sees first: what the board is, how a value is made, and how well that held up blind.
  function hero() {
    const n = (v) => rows.filter((r) => r.plan.verdict === v).length;
    const best = rows.filter((r) => r.tier === 'watchlist' && r.plan.net > 0).sort((a, b) => b.plan.perHour - a.plan.perHour).slice(0, 3);
    return '<section class="hero"><div class="lead"><h1>' + rows.length + ' protocols record no token. Here is what each launch would be worth, and what farming it costs.</h1>' +
      '<p>Each value is read off a curve fitted to the ' + F.n + ' token families that already trade here, then moved by the 7-day TVL change and the time with no token. No name is hand-picked. Every farm plan is costed step by step and turned into break-even odds: the launch chance it needs to pay its way.</p>' +
      '<div class="tally"><span><b>' + rows.filter((r) => r.tier === 'watchlist').length + ' / ' + S.watchlist.length + '</b> watchlist ranked</span><span><b>' + rows.filter((r) => r.tier !== 'watchlist').length + '</b> found off the list</span><span><b>' + R0.trades.length + '</b> trading tokens kept apart</span><span><b>' + R0.aside.length + '</b> set aside by rule</span>' +
      '<span class="vts">' + vtag('Farm') + ' ' + n('Farm') + ' ' + vtag('Thin edge') + ' ' + n('Thin edge') + ' ' + vtag('Skip') + ' ' + n('Skip') + ' at ' + usd(R.k.capital) + '</span></div>' +
      '<p class="note">Largest finds off the watchlist: ' + rows.filter((r) => r.tier !== 'watchlist').slice(0, 4).map((r) => '<a href="#/p/' + r.slug + '"><b>' + esc(r.name) + '</b> ' + usd(r.implied_value_usd) + '</a>').join(' · ') + '.</p></div>' +
      '<div class="how"><h3>How a launch is priced · <code>build()</code> in model.js</h3><div class="fx">value = TVL × ' + (10 ** F.a).toFixed(3) + ' × (TVL/$100M)<sup>' + F.b.toFixed(2) + '</sup> × mechanism × growth(7d) × age(no token) × sibling</div>' +
      '<table class="mini"><tbody><tr><td>Blind miss, each token left out</td><td class="n"><b class="pos">' + x(F.looFit, 2) + '</b> vs ' + x(F.looFlat, 2) + ' flat</td></tr>' +
      '<tr><td>Time split: fit ' + F.split.nTrain + ' older, test ' + F.split.nTest + ' listed from ' + F.split.cut + '</td><td class="n"><b class="pos">' + x(F.split.fit, 2) + '</b> vs ' + x(F.split.flat, 2) + ' flat</td></tr>' +
      '<tr><td>Blind price within 3× of the real cap</td><td class="n"><b>' + Math.round(F.within3 * 100) + '%</b> vs ' + Math.round(F.within3Flat * 100) + '% flat</td></tr>' +
      '<tr><td>Newer tokens inside the 50% / 80% band</td><td class="n"><b>' + Math.round(F.split.cover50 * 100) + '% / ' + Math.round(F.split.cover80 * 100) + '%</b></td></tr>' +
      '<tr><td>Rank range under each rank</td><td class="n"><b>P10–P90</b> over ' + R0.k.refits + ' refits</td></tr></tbody></table>' +
      '<p class="note">Best net per hands-on hour on the watchlist: ' + best.map((r) => '<a href="#/p/' + r.slug + '" class="val">' + esc(r.name) + ' ' + sgn(r.plan.perHour) + '/h</a>').join(' · ') + '</p></div></section>';
  }

  const COLS = [
    ['rank', '#', (r) => r.rank], ['name', 'Protocol', (r) => r.name.toLowerCase()], ['tvl', 'TVL', (r) => r.launch_tvl_usd], ['c7', '7d', (r) => r.change_7d ?? -1e9],
    ['age', 'No token for', (r) => r.age_days ?? -1], ['implied', 'Implied value · 50% band', (r) => r.implied_value_usd], ['slice', 'Slice', (r) => r.plan.slice],
    ['net', 'Net if it launches', (r) => r.plan.net], ['odds', 'Break-even odds', (r) => -r.plan.odds], ['hour', 'Farm · fees · hold', (r) => r.plan.perHour],
  ];

  function board(q) {
    use(q);
    const sk = q.s || 'implied', asc = q.d === 'asc', col = COLS.find((c) => c[0] === sk) || COLS[5], text = (q.q || '').toLowerCase();
    const list = rows.filter((r) =>
      (!q.tier || r.tier === q.tier) && (!q.g || r.group === q.g) && (!q.ch || r.chains.includes(q.ch)) &&
      (!q.m || (q.m === 'up' ? (r.change_7d ?? 0) > 0 : (r.change_7d ?? 0) < 0)) && (!q.v || r.plan.verdict === q.v) &&
      (!text || (r.name + ' ' + r.category + ' ' + r.chains.join(' ') + ' ' + gname(r.group)).toLowerCase().includes(text)));
    const dir = (asc ? 1 : -1) * (sk === 'rank' || sk === 'name' ? -1 : 1);
    list.sort((a, b) => { const p = col[2](a), o = col[2](b); return p < o ? -dir : p > o ? dir : a.rank - b.rank; });
    const seg = (k, opts) => '<span class="seg">' + opts.map(([v, l]) => { const o = Object.assign({}, q); if (v) o[k] = v; else delete o[k]; return '<a href="' + link('board', o) + '" class="' + ((q[k] || '') === v ? 'on' : '') + '">' + l + '</a>'; }).join('') + '</span>';
    const sel = (k, label, opts, def) => '<label>' + label + '<select data-k="' + k + '">' + (def ? '<option value="">' + def + '</option>' : '') + opts.map(([v, l]) => '<option value="' + esc(v) + '"' + (q[k] === String(v) ? ' selected' : '') + '>' + esc(l) + '</option>').join('') + '</select></label>';
    let h = hero() + '<div class="filters">' +
      '<label>Search<input type="search" id="q" data-k="q" placeholder="name, category, chain" value="' + esc(q.q || '') + '"></label>' +
      '<label>Tier' + seg('tier', [['', 'All'], ['watchlist', 'Watchlist'], ['above', 'Above floor'], ['early', 'Early < $50M']]) + '</label>' +
      sel('g', 'Mechanism', Object.keys(R0.groups).map((g) => [g, gname(g)]), 'All') + sel('ch', 'Chain', chains.map((c) => [c, c]), 'All') +
      sel('m', '7-day TVL', [['up', 'Gaining'], ['down', 'Falling']], 'Any') + sel('v', 'Verdict', [['Farm', 'Farm'], ['Thin edge', 'Thin'], ['Skip', 'Skip']], 'Any') +
      sel('cap', 'Capital', [['', '$1,000'], ['250', '$250'], ['10000', '$10,000'], ['100000', '$100,000']]) + sel('sh', 'Airdrop share', [['', '10% of value'], ['0.05', '5%'], ['0.2', '20%']]) +
      '<span class="count"><b>' + list.length + '</b> of ' + rows.length + ' · ' + usd(list.reduce((s, r) => s + r.implied_value_usd, 0)) + ' implied · click a column to sort, a row for its plan</span></div>';
    h += '<div class="grid"><table><thead><tr>' + COLS.map(([k, l]) => '<th data-s="' + k + '" class="' + (['tvl', 'c7', 'age', 'slice', 'net', 'odds'].includes(k) ? 'n ' : '') + (k === sk ? 'sorted' + (asc ? ' asc' : '') : '') + '">' + (k === 'slice' ? usd(R.k.capital) + ' slice' : l) + '</th>').join('') + '</tr></thead><tbody>';
    for (const r of list) {
      const p = r.plan;
      h += '<tr data-p="' + r.slug + '"><td class="rk">' + r.rank + '<small>' + r.rank_lo + '–' + r.rank_hi + '</small></td><td class="pn"><b>' + esc(r.name) + ' <span class="tier ' + r.tier + '">' + TIER[r.tier] + '</span></b><span><i class="dot" style="background:' + GC[r.group] + '"></i>' + esc(r.category || 'No category') + ' · ' + esc(r.chains.slice(0, 2).join(', ')) + (r.chains.length > 2 ? ' +' + (r.chains.length - 2) : '') + '</span></td>' +
        '<td class="n">' + usd(r.launch_tvl_usd) + '</td><td class="n">' + pct(r.change_7d) + '</td><td class="n">' + age(r.age_days) + '</td>' +
        '<td class="iv"><b>' + usd(r.implied_value_usd) + '</b><div class="bar"><i style="left:' + pos(r.low_usd) + '%;right:' + (100 - pos(r.high_usd)) + '%"></i><em style="left:' + pos(r.implied_value_usd) + '%"></em></div></td>' +
        '<td class="n">' + usd(p.slice) + '</td><td class="n net">' + vtag(p.verdict) + ' <b class="' + (p.net > 0 ? 'pos' : 'neg') + '">' + sgn(p.net) + '</b><br><span class="dim">' + sgn(p.perHour) + '/h · ' + (p.paysFrom ? 'pays from ' + usd(p.paysFrom) : 'never beats a T-bill') + '</span></td>' +
        '<td class="n">' + odds(p.odds) + '</td><td><span class="play">' + gname(r.group).split(' ')[0] + ' · ' + esc(p.chain) + '</span><br><span class="dim">' + usd(p.fees) + ' fees · ' + p.hold + 'd · ' + (p.minutes / 60).toFixed(1) + 'h work</span></td></tr>';
    }
    return h + (list.length ? '' : '<tr><td colspan="10" class="empty">No protocol matches these filters.</td></tr>') + '</tbody></table></div>';
  }

  function nearest(r, n) {
    const lx = Math.log10(r.launch_tvl_usd) - 8;
    return F.comps.filter((c) => c.g === r.group).sort((a, b) => Math.abs(a.x - lx) - Math.abs(b.x - lx)).slice(0, n);
  }

  function detail(slug) {
    const r = bySlug.get(slug);
    if (!r) return '<p class="empty">No ranked protocol has the slug ' + esc(slug) + '. It may be set aside: see that tab.</p>';
    const p = r.plan, prev = rows[r.rank - 2], next = rows[r.rank], tvl = r.launch_tvl_usd;
    const curve = tvl * 10 ** (F.a + F.b * (Math.log10(tvl) - 8)), mech = 10 ** (F.g[r.group] || 0);
    const kpi = (l, v, s) => '<div class="kpi"><i>' + l + '</i><b>' + v + '</b><span>' + s + '</span></div>';
    let h = '<a class="back" href="#/board">← Board</a>' + (prev ? ' · <a class="back" href="#/p/' + prev.slug + '">↑ #' + prev.rank + ' ' + esc(prev.name) + '</a>' : '') + (next ? ' · <a class="back" href="#/p/' + next.slug + '">↓ #' + next.rank + ' ' + esc(next.name) + '</a>' : '');
    h += '<div class="dhead"><h1>' + esc(r.name) + '</h1><span class="tier ' + r.tier + '">' + TIER[r.tier] + '</span><span class="rkb">Rank <b>#' + r.rank + '</b> of ' + rows.length + ' (P10–P90 over ' + R.k.refits + ' refits: ' + r.rank_lo + '–' + r.rank_hi + ') · ' + esc(r.category || 'No category') + ' → ' + gname(r.group) + ' · ' + esc(r.chains.join(', ')) + '</span></div>' +
      '<p class="note" style="margin:-6px 0 12px">DefiLlama records no token for ' + esc(r.name) + ' (no market cap, ticker or CoinGecko id) as of ' + esc(S.as_of) + '. A record is not proof: check its own channels before farming.</p>';
    h += '<section class="kpis k5">' + kpi('Implied value', '<span class="val">' + usd(r.implied_value_usd) + '</span>', '50% band ' + usd(r.low_usd) + '–' + usd(r.high_usd)) + kpi('Launch TVL', usd(tvl), '7d ' + pct(r.change_7d)) +
      kpi('No token for', age(r.age_days), 'tracked since ' + esc(r.listed_at || 'unknown')) + kpi(usd(p.ticket) + ' slice', usd(p.slice), R.k.airdropShare * 100 + '% to depositors, pro rata') +
      kpi('Break-even odds', odds(p.odds), vtag(p.verdict) + ' net if it launches ' + sgn(p.net)) + '</section>';
    const row = (l, v, s, cls) => '<tr' + (cls ? ' class="' + cls + '"' : '') + '><td>' + l + '</td><td class="n mono">' + v + '</td><td class="dim">' + s + '</td></tr>';
    h += '<div class="detail"><div><section class="card"><h3>How ' + usd(r.implied_value_usd) + ' is built</h3><table class="mini built"><tbody>' +
      row('Size curve', usd(curve), 'what a traded token with ' + usd(tvl) + ' of TVL is worth on the fitted curve') +
      row('Mechanism', x(mech, 2), gname(r.group) + ': ' + F.comps.filter((c) => c.g === r.group).length + ' comps, their mean residual shrunk toward the curve') +
      row('Growth', x(r.growth_factor), '7d TVL ' + (r.change_7d === null ? 'not reported' : (r.change_7d >= 0 ? '+' : '') + r.change_7d.toFixed(1) + '%, clamped, half carried') + ' · growthFactor()') +
      row('Age', x(r.age_factor), (r.age_days === null ? 'listing date unknown, taken as 1 year' : M.fmtAge(r.age_days) + ' on record with no token') + ' · ageFactor()') +
      row('Sibling', x(r.sibling_factor, 2), r.sibling_of ? r.sibling_of + ', a token of the same name, already trades' : 'no traded token shares its first word') +
      row('Implied value', '<b class="val">' + usd(r.implied_value_usd) + '</b>', '80% band ' + usd(r.p10_usd) + '–' + usd(r.p90_usd) + ': the blind test\'s own misses', 'tot') + '</tbody></table>' +
      (r.products.length ? '<p class="note">Launch TVL folds in ' + r.products.map((q) => esc(q.name) + ' (' + usd(q.tvl) + ')').join(', ') + ': products that would share one token.</p>' : '') +
      '<p class="note">Recomputed on this page from the snapshot; board.json carries the same ' + usd(r.implied_value_usd) + ' at rank ' + r.rank + '.</p></section>';
    h += '<section class="card" style="margin-top:14px"><h3>Against traded peers: nearest ' + gname(r.group).toLowerCase() + ' tokens by TVL</h3>' + chart(r) + '<table class="mini"><tbody>' +
      nearest(r, 4).map((c) => '<tr><td>' + esc(c.name) + ' <span class="dim mono">' + esc(c.symbol || '') + '</span></td><td class="n">TVL ' + usd(c.tvl) + '</td><td class="n">mcap ' + usd(c.mcap) + '</td><td class="n mono">' + x(c.mcap / c.tvl) + '</td></tr>').join('') + '</tbody></table></section></div>';
    h += '<section class="card"><h3>Farm plan · ' + esc(gname(r.group).toLowerCase()) + ' on ' + esc(p.chain) + ' · ' + usd(p.ticket) + ' for ' + p.hold + ' days</h3><table class="plan"><thead><tr><th></th><th>When</th><th>Step</th><th class="n">Cost</th><th class="n">Time</th></tr></thead><tbody>' +
      p.steps.map((s, i) => '<tr><td class="rk">' + (i + 1) + '</td><td class="when">' + s.when + '</td><td><b class="' + (s.after ? 'aft' : 'bef') + '">' + s.name + '.</b> ' + esc(s.do) + '<div class="dim">' + esc(s.cost) + '</div></td><td class="n">' + (s.usd ? M.money(s.usd) : s.name === 'Hold' ? M.money(p.forgone) : 'none') + '</td><td class="n">' + esc(s.time.replace(' on launch day', '').replace('inside the weekly visit', 'weekly')) + '</td></tr>').join('') +
      '</tbody></table><div class="sum"><span>Slice <b>' + usd(p.slice) + '</b></span><span>Fees <b class="neg">−' + usd(p.fees) + '</b></span><span>T-bill forgone <b class="neg">−' + usd(p.forgone) + '</b></span><span>Net <b class="' + (p.net > 0 ? 'pos' : 'neg') + '">' + sgn(p.net) + '</b></span><span>Work <b>' + (p.minutes / 60).toFixed(1) + ' h</b></span><span>Per hour <b>' + sgn(p.perHour) + '</b></span><span>Break-even odds ' + odds(p.odds) + '</span></div>' +
      '<table class="mini netat"><thead><tr><th>Net at</th>' + [0.05, 0.1, 0.2].map((s) => '<th class="n">' + s * 100 + '% drop</th>').join('') + '</tr></thead><tbody>' +
      [1e3, 1e4, 1e5].map((c) => '<tr><td>' + usd(c) + '</td>' + [0.05, 0.1, 0.2].map((s) => { const v = (p.perDollar * s) / R.k.airdropShare * c - p.fees - c * p.carry; return '<td class="n ' + (v > 0 ? 'pos' : 'neg') + (c === p.ticket && s === R.k.airdropShare ? ' cur' : '') + '">' + sgn(v) + '</td>'; }).join('') + '</tr>').join('') + '</tbody></table>' +
      '<p class="note">The slice is paid only if a token launches, so the plan pays its way when the chance of a launch beats (fees + forgone T-bill yield) ÷ slice = ' + odds(p.odds) + '. ' + vtag('Farm') + ' at 50% or less, ' + vtag('Thin edge') + ' up to 100%, ' + vtag('Skip') + ' above: not even a sure launch repays it. ' + (p.paysFrom ? 'This plan nets above zero from ' + usd(p.paysFrom) + ' of capital.' : 'At this value no deposit size beats a T-bill.') + ' Gas is a typical ' + esc(p.chain) + ' fee of ' + M.money(p.gas) + ' a transaction.</p></section></div>';
    return h;
  }

  function chart(hl) {
    const W = 640, H = 220, L = 46, T = 12, Rr = 12, Bm = 32, xs = [-1.5, 2.4], ys = [-3, 1.5];
    const sx = (v) => L + ((v - xs[0]) / (xs[1] - xs[0])) * (W - L - Rr), sy = (v) => T + ((ys[1] - v) / (ys[1] - ys[0])) * (H - T - Bm);
    let s = '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '">';
    for (let v = -1; v <= 2; v++) s += '<line class="gl" x1="' + sx(v) + '" x2="' + sx(v) + '" y1="' + T + '" y2="' + (H - Bm) + '"/><text x="' + sx(v) + '" y="' + (H - Bm + 15) + '" text-anchor="middle">' + usd(10 ** (v + 8)).replace('.00', '') + '</text>';
    for (let v = -3; v <= 1; v++) s += '<line class="gl" x1="' + L + '" x2="' + (W - Rr) + '" y1="' + sy(v) + '" y2="' + sy(v) + '"/><text x="' + (L - 6) + '" y="' + (sy(v) + 4) + '" text-anchor="end">×' + 10 ** v + '</text>';
    s += '<text x="' + (W - Rr) + '" y="' + (H - 4) + '" text-anchor="end">TVL (log) →</text><text x="' + L + '" y="' + (T + 10) + '" dx="6">mcap / TVL (log)</text>';
    const band = (w, o) => '<path d="M' + sx(xs[0]) + ' ' + sy(F.a + F.b * xs[0] + w) + ' L' + sx(xs[1]) + ' ' + sy(F.a + F.b * xs[1] + w) + ' L' + sx(xs[1]) + ' ' + sy(F.a + F.b * xs[1] - w) + ' L' + sx(xs[0]) + ' ' + sy(F.a + F.b * xs[0] - w) + 'Z" fill="#f6bb45" fill-opacity="' + o + '"/>';
    s += band(F.band80, 0.05) + band(F.band50, 0.08) + '<path class="fit" d="M' + sx(xs[0]) + ' ' + sy(F.a + F.b * xs[0]) + ' L' + sx(xs[1]) + ' ' + sy(F.a + F.b * xs[1]) + '"/>';
    for (const c of F.comps) { const dim = hl && c.g !== hl.group; s += '<circle cx="' + sx(c.x) + '" cy="' + sy(c.y) + '" r="' + (dim ? 3 : 4.2) + '" fill="' + GC[c.g] + '" fill-opacity="' + (dim ? 0.18 : 0.85) + '"><title>' + esc(c.name) + ' ' + x(c.mcap / c.tvl) + '</title></circle>'; }
    if (hl) { const cx = sx(Math.log10(hl.launch_tvl_usd) - 8), cy = sy(Math.log10(hl.implied_value_usd / hl.launch_tvl_usd)); s += '<circle cx="' + cx + '" cy="' + cy + '" r="8" fill="none" stroke="#f6bb45" stroke-width="2.5"/><text x="' + (cx + 12) + '" y="' + (cy + 4) + '" style="fill:#f6bb45;font-weight:600">' + esc(hl.name) + '</text>'; }
    return s + '</svg><div class="legend">' + Object.keys(GC).map((g) => '<span><i style="background:' + GC[g] + '"></i>' + gname(g) + '</span>').join('') + '<span class="val">○ this protocol · - - curve, shaded 50% / 80% blind band</span></div>';
  }

  // Out of sample: every traded token priced by a curve refitted without it, set against its real market cap.
  function oosChart() {
    const W = 560, H = 330, L = 48, T = 10, Rr = 10, Bm = 32, lo = 5.5, hi = 10.2, t3 = Math.log10(3);
    const sx = (v) => L + ((v - lo) / (hi - lo)) * (W - L - Rr), sy = (v) => T + ((hi - v) / (hi - lo)) * (H - T - Bm);
    let s = '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '"><path d="M' + sx(lo) + ' ' + sy(lo + t3) + ' L' + sx(hi - t3) + ' ' + sy(hi) + ' L' + sx(hi) + ' ' + sy(hi) + ' L' + sx(hi) + ' ' + sy(hi - t3) + ' L' + sx(lo + t3) + ' ' + sy(lo) + ' L' + sx(lo) + ' ' + sy(lo) + 'Z" fill="#3fe0b2" fill-opacity=".08"/>';
    for (let v = 6; v <= 10; v++) s += '<line class="gl" x1="' + sx(v) + '" x2="' + sx(v) + '" y1="' + T + '" y2="' + (H - Bm) + '"/><line class="gl" x1="' + L + '" x2="' + (W - Rr) + '" y1="' + sy(v) + '" y2="' + sy(v) + '"/><text x="' + sx(v) + '" y="' + (H - Bm + 15) + '" text-anchor="middle">' + usd(10 ** v).replace('.00', '') + '</text><text x="' + (L - 6) + '" y="' + (sy(v) + 4) + '" text-anchor="end">' + usd(10 ** v).replace('.00', '') + '</text>';
    s += '<path class="fit" d="M' + sx(lo) + ' ' + sy(lo) + ' L' + sx(hi) + ' ' + sy(hi) + '" style="stroke:#3fe0b2"/>';
    for (const o of F.oos) s += '<circle cx="' + sx(o.p) + '" cy="' + sy(o.a) + '" r="4" fill="' + GC[o.g] + '" fill-opacity=".85"><title>' + esc(o.name) + '</title></circle>';
    return s + '<text x="' + (W - Rr) + '" y="' + (H - 3) + '" text-anchor="end">blind price, the token left out of the fit →</text><text x="' + (L + 6) + '" y="' + (T + 12) + '">↑ real market cap</text></svg>';
  }

  function model() {
    const gs = Object.keys(R0.groups), pc = (v) => Math.round(v * 100) + '%', r2 = (v) => (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(2);
    const sec = (t, b) => '<h4>' + t + '</h4><p>' + b + '</p>';
    let h = '<div class="lab"><section class="card method"><h3>Method · every number here is computed by <code>build()</code> in model.js</h3>' +
      sec('Universe', S.protocols.length + ' protocols with at least $5M of TVL. Pre-token: no market cap, ticker or CoinGecko id. Exchanges, bridged and staked assets and siblings of a traded token are set aside with their rule (' + R0.aside.length + '); products that would share one token are folded into one launch. That leaves ' + R0.rows.length + ' rows, all ' + S.watchlist.length + ' watchlist names among them.') +
      sec('Curve', 'One point per token family: records that share a ticker are joined and their TVL summed. Exchange and chain tokens and caps under $1M are left out. log10(mcap/TVL) = ' + F.a.toFixed(3) + ' ' + (F.b < 0 ? '−' : '+') + ' ' + Math.abs(F.b).toFixed(3) + ' × log10(TVL/$100M) over ' + F.n + ' families (' + F.trimmed.length + ' trimmed past ' + R0.k.trimSigma + 'σ). A slope under zero means a small protocol trades at a higher multiple of its TVL.') +
      sec('Mechanism', 'Categories fold into seven mechanisms. Each one\'s mean residual is shrunk toward the curve as if ' + R0.k.shrink + ' extra tokens sat on it: ' + gs.map((g) => gname(g) + ' ' + x(10 ** (F.g[g] || 0), 2)).join(', ') + '.') +
      sec('Growth and age', 'growthFactor() carries half of the 7-day TVL move (clamped ' + R0.k.growthFloor + '% to +' + R0.k.growthCap + '%); ageFactor() credits time on record with no token, ' + R0.k.ageFloor + ' rising to 1.00 at ' + R0.k.ageFullDays + ' days. Factor check: the comps\' blind misses lean with the 7-day move by r = ' + r2(F.rC7) + ' (n ' + F.nC7 + ') and with token age by r = ' + r2(F.rAge) + ' (n ' + F.nAge + '). The snapshot cannot confirm either, so both stay small; size and mechanism carry the value.') +
      sec('Ranges', 'Value bands are the leave-one-out misses themselves (' + x(10 ** F.band50, 2) + ' holds half, ' + x(10 ** F.band80, 2) + ' four in five). Rank ranges refit the curve on ' + R0.k.refits + ' bootstrap resamples of the comps (fixed seed) and re-rank the board each time: the P10–P90 of each row\'s rank.') +
      sec('Farm plans', 'Eight steps (fund, position, track, upkeep, hold, guard, claim, unwind), each with dollars, minutes and a day; gas from one per-chain table, on the cheapest of the top three chains. Slice = implied value × ' + pc(R0.k.airdropShare) + ' to depositors × deposit ÷ TVL, paid only if a token launches. Break-even odds = (fees + ' + pc(R0.k.tbill) + ' T-bill yield forgone) ÷ slice: Farm at 50% or less, Thin up to 100%, Skip above.') +
      sec('Limits', 'One day of DefiLlama data. Nothing here says whether or when a token launches; read the board as a ranking and an order of magnitude, not a price.') + '</section><div>';
    const tr = (l, m, w, cls) => '<tr' + (cls ? ' class="' + cls + '"' : '') + '><td>' + l + '</td><td class="n mono">' + m + '</td><td class="n">' + w + '</td></tr>';
    h += '<section class="card"><h3>Out of sample: each traded token priced as if it had none</h3>' + oosChart() + '<table class="mini"><thead><tr><th>Test</th><th class="n">Median miss</th><th class="n">Within 3×</th></tr></thead><tbody>' +
      tr('Curve + mechanism (used)', x(F.looFit, 2), pc(F.within3), 'tot') + tr('Curve alone', x(F.looCurve, 2), pc(F.within3Curve)) + tr('One flat mcap/TVL', x(F.looFlat, 2), pc(F.within3Flat)) +
      tr('Time split: fit ' + F.split.nTrain + ' older, price ' + F.split.nTest + ' newer', x(F.split.fit, 2), pc(F.split.cover50) + ' in 50% band') + tr('Time split, flat multiple', x(F.split.flat, 2), pc(F.split.cover80) + ' in 80% band') +
      '</tbody></table><p class="note">Rank correlation of blind price and real cap: ' + F.spearman.toFixed(2) + '. Shaded: within 3× of the real cap. Colour: mechanism. Each dot is priced by a fit that never saw it.</p></section></div></div>';
    return h;
  }

  function simple(kind) {
    const isT = kind === 'trades', list = isT ? R0.trades : R0.aside;
    let h = '<p class="note">' + (isT ? 'Tokens that already trade, joined into families: the comps the board is priced on, never ranked on it.' : 'Pre-token records the board does not rank, each with the rule that set it aside. The watchlist is never set aside.') + '</p><div class="grid" style="margin-top:10px"><table><thead><tr>' +
      (isT ? '<th>Token family</th><th>Ticker</th><th>Category</th><th class="n">Records</th><th class="n">TVL</th><th class="n">Market cap</th><th class="n">mcap / TVL</th><th>Comp</th>' : '<th>Protocol</th><th>Category</th><th class="n">TVL</th><th>Why it is not ranked</th>') + '</tr></thead><tbody>';
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
    if (th) { const { q } = parse(), s = th.dataset.s; q.d = q.s === s && q.d !== 'asc' ? 'asc' : ''; q.s = s; if (!q.d) delete q.d; location.hash = link('board', q); return; }
    const tr = e.target.closest('tr[data-p]');
    if (tr) location.hash = '#/p/' + tr.dataset.p;
  });
  $('app').addEventListener('change', (e) => { if (e.target.dataset.k) set(e.target.dataset.k, e.target.value.trim()); });
  window.addEventListener('hashchange', render);
  render();
})();

/* Launch Radar model. One file, run twice: main.ts loads it (node:vm) to write board.json, and the page
   loads it to draw the board. The page re-runs build() on the raw snapshot and checks every rank and value
   against board.json, so what the screenshots show is what this code computes. No protocol is named here. */
(function (root) {
  'use strict';
  const DAY = 864e5;

  // Every lever the model has. The Model tab shows them; nothing else is tuned by hand.
  const K = {
    growthWeight: 0.5, growthFloor: -40, growthCap: 60, // half of a week's TVL move is assumed to stick
    ageFloor: 0.55, ageFullDays: 730, ageUnknownDays: 365, // young TVL is mercenary: full credit after 2y
    siblingHaircut: 0.3, // a watchlist row whose family token already trades keeps 30%
    shrink: 4, trimSigma: 2.5, // group effects shrink to the market line with 4 pseudo-comps
    airdropShare: 0.1, // share of the token assumed to go to users who farmed it
  };

  // DefiLlama categories folded into mechanisms, so each group has comps enough to fit.
  const GROUPS = {
    vault: ['Vault curation', 'Risk Curators|Onchain Capital Allocator|Yield Aggregator|Yield|Liquidity Manager|Leveraged Farming|Farm|Options Vault|Indexes'],
    lend: ['Lending & CDP', 'Lending|CDP|CDP Manager|Uncollateralized Lending|Collateral Management'],
    dollar: ['Synthetic dollars', 'Basis Trading|Stablecoin Wrapper|Dual-Token Stablecoin|Algo-Stables|Stablecoin Issuer|Reserve Currency|CeDeFi'],
    trade: ['Trading venues', 'Dexs|Derivatives|Options|Prediction Market|Interest Rate Derivatives|Synthetics|OTC Marketplace|NFT Marketplace|Launchpad'],
    rwa: ['Real-world assets', 'RWA'],
    stake: ['Staking & BTCfi', 'Liquid Staking|Staking Pool|Restaking|Liquid Restaking|Restaked BTC|Anchor BTC|Decentralized BTC|Collateral Markets|Governance Incentives'],
    infra: ['Chains & infra', ''],
  };
  const CAT2G = {};
  for (const g in GROUPS) for (const c of GROUPS[g][1].split('|')) if (c) CAT2G[c] = g;
  const groupOf = (cat) => CAT2G[cat] || 'infra';

  // The house's wrapped/staked rule, applied to rows the watchlist does not force onto the board.
  const WRAP_CATS = new Set(['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC']);
  const NOT_COMPS = new Set(['CEX', 'Canonical Bridge', 'Chain']); // exchange and chain tokens price the venue, not a protocol
  const EXCH = /^(binance|coinbase|bybit|kraken|bitget|okx|bitfinex|gemini)\b/i;
  const WRAPWORD = /\b(wrapped|staked|staking)\b/i;
  const VERSION = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
  const STOP = new Set(['the', 'project', 'protocol', 'finance', 'network', 'capital', 'labs', 'money']);

  const hasToken = (p) => p.gecko_id !== null || p.symbol !== null || p.mcap_usd !== null;
  const firstWord = (name) => {
    const w = name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(' ')[0] || '';
    return w.length >= 3 && !STOP.has(w) ? w : '';
  };
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const ageDays = (asOf, listed) => (listed ? Math.max(0, Math.floor((Date.parse(asOf + 'T00:00:00Z') - Date.parse(listed + 'T00:00:00Z')) / DAY)) : null);

  /** Token families: token-bearing records joined by ticker (else CoinGecko id), so Aave V3 (ticker only)
      and Aave V2 (ticker, id and market cap) are one token with their TVL summed. Comps = the priced ones. */
  function tokenFamilies(protocols) {
    const fam = new Map(), idOf = new Map();
    for (const p of protocols) if (p.symbol && p.gecko_id) idOf.set(p.gecko_id, p.symbol.toUpperCase());
    for (const p of protocols) {
      if (!hasToken(p)) continue;
      const id = p.symbol ? p.symbol.toUpperCase() : idOf.get(p.gecko_id) || p.gecko_id || p.slug;
      const f = fam.get(id) || { id, symbol: p.symbol, lead: p, members: [], tvl: 0, mcap: 0 };
      f.members.push(p.slug);
      f.tvl += p.tvl_usd;
      if ((p.mcap_usd || 0) > f.mcap) f.mcap = p.mcap_usd;
      if (p.tvl_usd > f.lead.tvl_usd) f.lead = p;
      if (!f.symbol) f.symbol = p.symbol;
      fam.set(id, f);
    }
    return [...fam.values()];
  }

  /** compsFit: log10(mcap/TVL) = a + b·(log10 TVL − 8) + groupEffect, fitted on the snapshot's own comps. */
  function compsFit(comps, k) {
    const run = (pts) => {
      const g = {};
      let a = 0, b = 0;
      for (let it = 0; it < 12; it++) {
        let sx = 0, sy = 0, sxx = 0, sxy = 0;
        for (const c of pts) { const y = c.y - (g[c.g] || 0); sx += c.x; sy += y; sxx += c.x * c.x; sxy += c.x * y; }
        const n = pts.length;
        b = (n * sxy - sx * sy) / (n * sxx - sx * sx);
        a = (sy - b * sx) / n;
        const sum = {}, cnt = {};
        for (const c of pts) { sum[c.g] = (sum[c.g] || 0) + c.y - a - b * c.x; cnt[c.g] = (cnt[c.g] || 0) + 1; }
        for (const key in sum) g[key] = sum[key] / (cnt[key] + k.shrink);
      }
      let ss = 0;
      for (const c of pts) ss += (c.y - a - b * c.x - (g[c.g] || 0)) ** 2;
      return { a, b, g, sigma: Math.sqrt(ss / Math.max(1, pts.length - 2)) };
    };
    let fit = run(comps);
    const kept = comps.filter((c) => Math.abs(c.y - fit.a - fit.b * c.x - (fit.g[c.g] || 0)) <= k.trimSigma * fit.sigma);
    const trimmed = comps.filter((c) => !kept.includes(c));
    fit = run(kept);
    // Leave-one-out: refit without each comp and price it blind, against a flat median multiple.
    const ys = kept.map((c) => c.y).sort((p, q) => p - q);
    let errFit = [], errFlat = [], pred = [], act = [];
    for (const c of kept) {
      const f = run(kept.filter((d) => d !== c));
      const yhat = f.a + f.b * c.x + (f.g[c.g] || 0);
      const others = ys.filter((y, i) => i !== ys.indexOf(c.y));
      errFit.push(Math.abs(c.y - yhat));
      errFlat.push(Math.abs(c.y - others[others.length >> 1]));
      pred.push(yhat + c.x); act.push(c.y + c.x);
    }
    const med = (v) => v.slice().sort((p, q) => p - q)[v.length >> 1];
    return Object.assign(fit, {
      n: kept.length, trimmed, comps: kept,
      looFit: 10 ** med(errFit), looFlat: 10 ** med(errFlat), spearman: spearman(pred, act),
      flat: 10 ** ys[ys.length >> 1],
    });
  }

  function spearman(u, v) {
    const rank = (w) => { const o = w.map((x, i) => [x, i]).sort((p, q) => p[0] - q[0]); const r = []; o.forEach((e, i) => (r[e[1]] = i)); return r; };
    const ru = rank(u), rv = rank(v), n = u.length;
    let d = 0;
    for (let i = 0; i < n; i++) d += (ru[i] - rv[i]) ** 2;
    return 1 - (6 * d) / (n * (n * n - 1));
  }

  /** compsMultiple: the fitted mcap/TVL a token of this size and mechanism trades at. */
  const compsMultiple = (fit, tvl, g) => 10 ** (fit.a + fit.b * (Math.log10(tvl) - 8) + (fit.g[g] || 0));
  /** growthFactor: (1 + 7-day change)^weight, the change clamped so one wild week cannot run the board. */
  const growthFactor = (c7, k) => (c7 === null ? 1 : (1 + clamp(c7, k.growthFloor, k.growthCap) / 100) ** k.growthWeight);
  /** ageFactor: credit for how long TVL has stayed with no token to pay it, full after ageFullDays. */
  const ageFactor = (days, k) => k.ageFloor + (1 - k.ageFloor) * Math.min(days === null ? k.ageUnknownDays : days, k.ageFullDays) / k.ageFullDays;

  /** Why a pre-token record is not ranked, or '' when it is. The watchlist is never set aside. */
  function asideReason(p, famWords, onList) {
    if (onList) return '';
    if (p.category === 'CEX') return 'Exchange: its value is the venue, not a launch';
    if (EXCH.test(p.name)) return 'Product of an exchange';
    if (WRAP_CATS.has(p.category)) return 'Bridged or staked asset (' + p.category + ')';
    if (WRAPWORD.test(p.name)) return 'Wrapped or staked product';
    const w = firstWord(p.name);
    if (w && famWords.has(w)) return 'Sibling of ' + famWords.get(w) + ', which trades';
    return '';
  }

  /** build: the whole radar from the snapshot. Same input, same bytes, in Node and in the browser. */
  function build(snap, kIn) {
    const k = Object.assign({}, K, kIn || {});
    const P = snap.protocols, onList = new Set(snap.watchlist);
    const fams = tokenFamilies(P);
    const famWords = new Map();
    for (const f of fams) for (const s of f.members) { const p = P.find((q) => q.slug === s); const w = firstWord(p.name); if (w && !famWords.has(w)) famWords.set(w, f.symbol || f.id); }
    const comps = fams
      .filter((f) => f.mcap >= 1e6 && f.tvl > 0 && !NOT_COMPS.has(f.lead.category))
      .map((f) => ({ id: f.id, name: f.lead.name.replace(VERSION, ''), symbol: f.symbol, tvl: f.tvl, mcap: f.mcap, cat: f.lead.category, g: groupOf(f.lead.category), x: Math.log10(f.tvl) - 8, y: Math.log10(f.mcap / f.tvl) }));
    const fit = compsFit(comps, k);

    // Pre-token records: rank, or set aside with a reason. Siblings with one name share one launch.
    const aside = [], cand = [];
    for (const p of P) {
      if (hasToken(p)) continue;
      const why = asideReason(p, famWords, onList.has(p.slug));
      if (why) aside.push({ slug: p.slug, name: p.name, category: p.category, tvl: p.tvl_usd, why });
      else cand.push(p);
    }
    const launches = new Map();
    for (const p of cand.slice().sort((a, b) => (onList.has(b.slug) - onList.has(a.slug)) || b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : 1))) {
      const w = firstWord(p.name);
      const lead = w && launches.get(w);
      if (lead && !onList.has(p.slug)) {
        lead.products.push({ slug: p.slug, name: p.name, tvl: p.tvl_usd });
        aside.push({ slug: p.slug, name: p.name, category: p.category, tvl: p.tvl_usd, why: 'Counted in ' + lead.p.name + "'s launch" });
      } else launches.set(w || p.slug, { p, products: [] });
    }

    const rows = [];
    for (const { p, products } of launches.values()) {
      const tvl = p.tvl_usd + products.reduce((s, q) => s + q.tvl, 0);
      const g = groupOf(p.category), age = ageDays(snap.as_of, p.listed_at);
      const sib = onList.has(p.slug) && famWords.get(firstWord(p.name));
      const m = compsMultiple(fit, tvl, g), gf = growthFactor(p.change_7d, k), af = ageFactor(age, k), ff = sib ? k.siblingHaircut : 1;
      const implied = Math.max(1, Math.round(tvl * m * gf * af * ff));
      rows.push({
        slug: p.slug, name: p.name, category: p.category, group: g, chains: p.chains, listed_at: p.listed_at,
        tier: onList.has(p.slug) ? 'watchlist' : p.tvl_usd >= snap.floor_usd ? 'above' : 'early',
        tvl_usd: p.tvl_usd, launch_tvl_usd: tvl, products, change_7d: p.change_7d, age_days: age, sibling_of: sib || null,
        multiple: m, growth_factor: gf, age_factor: af, sibling_factor: ff, implied_value_usd: implied,
        low_usd: Math.round(implied * 10 ** (-0.6745 * fit.sigma)), high_usd: Math.round(implied * 10 ** (0.6745 * fit.sigma)),
        drop_per_1k: (implied * k.airdropShare * 1000) / tvl,
      });
    }
    rows.sort((a, b) => b.implied_value_usd - a.implied_value_usd || (a.slug < b.slug ? -1 : 1));
    rows.forEach((r, i) => { r.rank = i + 1; r.plan = farmPlan(r, k); });

    const trades = fams.filter((f) => f.mcap > 0).map((f) => ({ id: f.id, name: f.lead.name, symbol: f.symbol, cat: f.lead.category, members: f.members.length, tvl: f.tvl, mcap: f.mcap, comp: comps.some((c) => c.id === f.id) && !fit.trimmed.some((c) => c.id === f.id) })).sort((a, b) => b.mcap - a.mcap);
    return { k, fit, rows, aside: aside.sort((a, b) => b.tvl - a.tvl), trades, groups: GROUPS, tokenRecords: P.filter(hasToken).length };
  }

  // Typical fee for one transaction, in USD, by chain. Anything unlisted is charged a cautious $0.25.
  const GAS = { Ethereum: 3.5, Bitcoin: 2.5, Tron: 1.2, Binance: 0.08, Polygon: 0.02, Arbitrum: 0.05, Base: 0.03, Optimism: 0.03, Avalanche: 0.08, Solana: 0.01, Sui: 0.01, Aptos: 0.01, Monad: 0.02, 'Hyperliquid L1': 0.05, Algorand: 0.002, Stellar: 0.001, Ripple: 0.001, Ink: 0.03, Plasma: 0.01, Katana: 0.03, Unichain: 0.03, Starknet: 0.05, Linea: 0.05, Sonic: 0.02, Berachain: 0.05, Mantle: 0.05, Bittensor: 0.01, Flare: 0.02, Sei: 0.01, Noble: 0.01, Pharos: 0.02, Arc: 0.02, Stable: 0.01, Mezo: 0.05, CORE: 0.02, 'Robinhood Chain': 0.03, Tempo: 0.01, Near: 0.01, Ton: 0.03, Cardano: 0.2, Hemi: 0.05, Scroll: 0.05, BSquared: 0.05 };
  const money = (v) => (v >= 100 ? '$' + Math.round(v).toLocaleString('en-US') : v >= 1 ? '$' + v.toFixed(2) : v >= 0.1 ? '$' + v.toFixed(2) : 'under $0.10');

  /** playbook: the mechanism's own position (what to do, transactions, setup minutes, weekly action) and the
      risk that position carries (what to watch, how long an exit takes). Chosen by category, then mechanism. */
  function playbook(r, n, t, chain) {
    const c = r.category || '', $t = '$' + t;
    const P = (act, tx, min, weekly, guard, exit) => ({ act, tx, min, weekly, guard, exit });
    if (/CDP/.test(c)) return P('Lock ' + $t + ' of ' + chain + "'s main collateral in " + n + ' and mint its stablecoin at no more than 40% LTV, then park the minted coins in its savings module if it has one.', 3, 20, 'check the collateral ratio and repay a little if LTV drifts over 50%', 'Set a price alert at the collateral price that takes LTV to 60%; repay first, then withdraw, if it fires.', 'repay and unlock: 2 transactions, minutes');
    if (/Lending/.test(c)) return P('Supply $' + Math.round(t * 0.7) + ' USDC to ' + n + ' on ' + chain + ', enable it as collateral, then borrow $' + Math.round(t * 0.25) + ' of a different stablecoin (about 35% LTV) so both supply and borrow count.', 4, 20, 'repay and re-borrow once so the account shows ongoing use', 'Keep the health factor above 2 and withdraw if utilization of the USDC market stays above 95% for a day (you may not get out later).', 'repay, then withdraw: 2 transactions, minutes unless utilization is pinned');
    if (/Basis|Stablecoin|Stable|Algo|Reserve|CeDeFi/.test(c)) return P('Mint ' + $t + ' of ' + n + "'s dollar with USDC on " + chain + " (or buy it on a DEX at or under $1.00), then stake it in the protocol's own savings vault.", 3, 15, 'compound or restake the savings yield once', "Exit if the dollar trades under $0.99 for 24 hours or the protocol's reserve report goes stale.", 'unstake (some vaults run a 7-day cooldown), then redeem');
    if (/Dexs/.test(c)) return P('Add ' + $t + ' to a stablecoin pair on ' + n + ' (' + chain + ') as a full-range position so it never falls out of range; avoid volatile pairs, where impermanent loss can exceed the drop.', 3, 20, 'claim fees and swap once on the venue', 'Exit if the pair depegs by more than 1% or the pool loses half its liquidity.', 'remove liquidity: 1 transaction');
    if (/Prediction/.test(c)) return P('Fund ' + $t + ' and hold positions in 3 to 5 liquid markets on ' + n + ', each under $' + Math.round(t / 4) + ', preferring markets that resolve within the hold period.', 5, 30, 'trade or roll one position', 'Never put more than a quarter of the ticket in one market; a resolved market is not a loss of farm activity, re-enter another.', 'sell positions or wait for resolution');
    if (/Derivatives|Options|Synthetics|Interest Rate/.test(c)) return P('Post ' + $t + ' USDC margin on ' + n + ' (' + chain + ') and trade about $' + (t * 10).toLocaleString('en-US') + ' notional a week in BTC or ETH at 1-2x, opening and closing in one session.', 4, 25, 'trade the week\'s notional: taker fees of about 0.05% are about $' + (t * 10 * 0.0005).toFixed(2), 'Never hold overnight above 2x; volume farmed with wash trades is usually excluded from drops.', 'close positions, withdraw margin');
    if (/RWA/.test(c)) return P('Pass ' + n + "'s eligibility check (KYC can take 1-3 days), then subscribe " + $t + ' to its tokenized fund or note on ' + chain + ' and hold the token in this wallet.', 3, 45, 'confirm the NAV and the yield paid', 'Read the redemption terms before subscribing: exits often settle in T+1 to T+5 days and some notes have a minimum.', 'redeem at NAV, often T+1 to T+5');
    if (/Payments/.test(c)) return P('Move ' + $t + ' through ' + n + ': open a wallet that supports it, fund it, and send and receive 3 small payments.', 3, 30, 'send and receive one payment', 'Keep the balance small: payment channels need the wallet online or a watchtower to stay safe.', 'close or drain the channel: 1 transaction');
    if (/Chain/.test(c)) return P('Bridge ' + $t + ' to ' + n + ' (' + chain + ') through its official bridge and use 2-3 of its apps: one swap, one lend, one stake.', 4, 30, 'one swap and one deposit in a different app', 'Exit through the official bridge only; check its withdrawal delay before you enter.', 'bridge back: delays vary from minutes to 7 days');
    if (/Insurance/.test(c)) return P('Provide ' + $t + ' of capital to ' + n + "'s underwriting pool, or buy cover for a position you already hold.", 2, 20, 'check open claims against the pool', 'Underwriting capital can be slashed by a covered hack; exit if a large claim is opened.', 'withdrawals from cover pools often queue for days');
    if (r.group === 'stake') return P('Stake ' + $t + ' of ' + chain + "'s native asset through " + n + ' and keep the receipt token in this wallet; do not sell or bridge it.', 2, 15, 'restake rewards once', 'Know the unbonding period before staking; exit if the receipt trades more than 2% under its backing.', 'unstake: wait out the unbonding period');
    if (r.group === 'vault' || /Capital Allocator|Curator|Yield|Farm|Indexes|Liquidity Manager/.test(c)) return P('Deposit ' + $t + ' USDC into ' + n + "'s largest USDC vault on " + chain + ' (its own site lists the vaults it curates or runs) and keep the vault shares in this wallet.', 2, 15, 'check the vault\'s markets and its share price', "Withdraw if the vault's share price falls, or if it moves into markets you would not lend to yourself.", 'withdraw: 1 transaction, unless the underlying markets are fully lent');
    return P('Use ' + n + ' with ' + $t + ' on ' + chain + ': one deposit plus one swap or transfer, so the wallet shows real activity.', 3, 20, 'one more transaction of the same kind', 'Exit if the app pauses withdrawals or changes its contracts without notice.', 'withdraw: 1-2 transactions');
  }

  /** farmPlan: eight steps, before and after the token, each with what it costs and how long it takes. */
  function farmPlan(r, k) {
    const top = r.chains.slice(0, 3);
    const chain = top.length ? top.reduce((best, c) => ((GAS[c] ?? 0.25) < (GAS[best] ?? 0.25) ? c : best), top[0]) : 'its main chain';
    const gas = GAS[chain] ?? 0.25, young = r.age_days !== null && r.age_days < 180;
    const ticket = r.launch_tvl_usd < 20e6 || young ? 250 : r.launch_tvl_usd < 100e6 ? 500 : r.launch_tvl_usd < 1e9 ? 750 : 1000;
    const hold = young ? 90 : r.age_days !== null && r.age_days < 365 ? 60 : 45, weeks = Math.round(hold / 7);
    const n = r.name, pb = playbook(r, n, ticket, chain);
    const S = (phase, text, cost, usd, time, min) => ({ phase, do: text, cost, usd, time, min });
    const steps = [
      S('Set up', 'Make a fresh wallet for ' + n + ' and withdraw $' + ticket + ' of ' + (chain === 'Bitcoin' ? 'BTC' : chain === 'Tron' ? 'USDT' : 'USDC') + ' plus a small fee float straight from an exchange to ' + chain + (chain === r.chains[0] ? '' : ', the lowest-fee of the three chains where it holds most TVL') + '.', 'about $1 exchange withdrawal fee', 1, '15 min', 15),
      S('Set up', pb.act, pb.tx + ' transactions, ' + money(gas * pb.tx), gas * pb.tx, pb.min + ' min', pb.min),
      S('Set up', 'Open ' + n + "'s points or rewards page from its official site, link this wallet if it asks, and note the starting balance in a farm log.", 'free; a signature, not a transaction', 0, '5 min', 5),
      S('Farm', 'Once a week, ' + pb.weekly + ', and log the points balance; skip a week when its fee would exceed a tenth of that week\'s points.', money(gas) + ' a week, ' + money(gas * weeks) + ' over ' + weeks + ' weeks', gas * weeks, '10 min a week', 10 * weeks),
      S('Farm', 'Hold the position for ' + hold + ' days' + (r.age_days === null ? '' : ': ' + n + ' has run ' + fmtAge(r.age_days) + ' with no token, and drops usually weigh how long capital stayed') + '.', '$' + ticket + ' stays at work; no extra fee', 0, hold + ' days', 0),
      S('Guard', pb.guard + ' Also exit if TVL falls more than 25% in a week on DefiLlama.', 'exit ' + money(gas * 2) + ' (' + pb.exit + ')', 0, '10 min a check, inside the weekly visit', 0),
      S('After launch', 'When a token is announced, claim only from the link on ' + n + "'s official site or account, never from a DM; sell enough at launch to repay this plan's fees, then decide on the rest.", 'claim ' + money(gas) + ', one sale ' + money(gas), gas * 2, '20 min on launch day', 20),
      S('After launch', 'If users get no allocation, or the claim window closes, unwind within a week: withdraw, revoke this wallet\'s approvals and close the log.', 'withdraw and revoke, ' + money(gas * 3), gas * 3, '15 min', 15),
    ];
    const cost = steps.reduce((s, x) => s + x.usd, 0);
    const drop = (r.implied_value_usd * k.airdropShare * ticket) / r.launch_tvl_usd;
    return {
      chain, gas, ticket, hold, steps, cost, minutes: steps.reduce((s, x) => s + x.min, 0), drop,
      verdict: drop >= 3 * cost ? 'Farm' : drop >= cost ? 'Thin edge' : 'Watch only',
      text: steps.map((x) => (x.phase === 'After launch' ? 'After the token: ' : 'Before the token, ' + x.phase.toLowerCase() + ': ') + x.do + ' Cost: ' + x.cost + '. Time: ' + x.time + '.'),
    };
  }
  function fmtAge(d) { return d >= 365 ? (d / 365).toFixed(1) + ' years' : d >= 60 ? Math.round(d / 30.4) + ' months' : d + ' days'; }

  root.RadarModel = { K, GROUPS, GAS, build, compsMultiple, growthFactor, ageFactor, farmPlan, fmtAge, money };
})(typeof window !== 'undefined' ? window : globalThis);

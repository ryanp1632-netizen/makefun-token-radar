# makefun-token-radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/ryanp1632-netizen/makefun-token-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/ryanp1632-netizen/makefun-token-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

**Launch Radar**: every DeFi protocol in a DefiLlama snapshot that records no token, priced off the snapshot's own
trading tokens and ranked by implied value, with a costed farm plan for each.

- `dashboard/model.js` is the whole model, and both `main.ts` (through `node:vm`) and the page run it. The page
  re-derives every rank and value from the raw snapshot and shows whether they match `board.json`.
- **Value**: implied = launch TVL × `compsMultiple()` × `growthFactor()` × `ageFactor()` × sibling factor.
  `compsMultiple` is a fit of log(mcap/TVL) against log TVL plus a shrunk mechanism effect, over the token families
  that already trade (records joined by ticker, TVL summed). A leave-one-out test compares it with one flat multiple.
- **Board**: the watchlist plus every other pre-token record that is not an exchange, a bridged or staked asset,
  or a product of a protocol whose token trades. Siblings that would share one token are folded into one launch.
- **Farm plans**: seven steps per protocol, each with a cost (typical per-chain fees) and a time, plus a ticket,
  hold period, expected airdrop and a verdict (Farm / Thin edge / Watch only).

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input path/to/snapshot.json
node tools/shoot.mjs out screenshots   # screenshots with headless Chrome
```

Node 22.18+, standard library only.

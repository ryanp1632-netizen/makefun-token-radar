// Launch Radar: token-radar-01 entry (Node 22, standard library only).
//
// Reads the sealed snapshot (/input/snapshot.json, or --input <file|dir>), runs the radar model in
// dashboard/model.js (the same file the page runs, loaded here through node:vm), and writes to /output
// (or MAKEFUN_OUTPUT_DIR / --output): board.json, data.js (the raw snapshot plus board.json's ranks, which
// the page re-derives and checks), dashboard/, screenshots/ and dossier.json from the vendored library.
//
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <kit>/input/snapshot.json

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { buildDossier } from './vendor/makefun-board.ts';

const here = fileURLToPath(new URL('.', import.meta.url));

function arg(name: string, fallback: string): string {
  const at = process.argv.indexOf(`--${name}`);
  if (at >= 0 && at + 1 < process.argv.length) return process.argv[at + 1]!;
  const eq = process.argv.find((a) => a.startsWith(`--${name}=`));
  return eq === undefined ? fallback : eq.slice(name.length + 3);
}
function fail(msg: string): never {
  process.stderr.write(`launch radar: ${msg}\n`);
  process.exit(1);
}

const inputArg = arg('input', '/input');
const inputFile = inputArg.endsWith('.json') ? inputArg : join(inputArg, 'snapshot.json');
if (!existsSync(inputFile)) fail(`no snapshot at ${inputFile}: pass --input <snapshot.json|dir> or mount /input`);
const out = arg('output', process.env.MAKEFUN_OUTPUT_DIR ?? '/output');

interface Protocol { slug: string; name: string; category: string | null; chains: string[]; tvl_usd: number; change_7d: number | null; mcap_usd: number | null; listed_at: string | null; gecko_id: string | null; symbol: string | null }
interface Snapshot { as_of: string; source: string; floor_usd: number; protocols: Protocol[]; watchlist: string[] }

const raw = JSON.parse(readFileSync(inputFile, 'utf8')) as Snapshot;
if (!Array.isArray(raw.protocols) || !Array.isArray(raw.watchlist) || typeof raw.as_of !== 'string') fail('snapshot.json is not the radar snapshot shape');
const str = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const snapshot: Snapshot = {
  as_of: raw.as_of,
  source: String(raw.source ?? ''),
  floor_usd: Number(raw.floor_usd),
  watchlist: raw.watchlist.filter((s) => typeof s === 'string'),
  protocols: raw.protocols
    .filter((p) => typeof p?.slug === 'string' && typeof p.name === 'string' && num(p.tvl_usd) !== null && p.tvl_usd > 0)
    .map((p) => ({
      slug: p.slug, name: p.name, category: str(p.category), chains: Array.isArray(p.chains) ? p.chains.filter((c) => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd, change_7d: num(p.change_7d), mcap_usd: num(p.mcap_usd), listed_at: str(p.listed_at), gecko_id: str(p.gecko_id), symbol: str(p.symbol),
    })),
};

// One model for the board and the page: dashboard/model.js, run in a fresh context.
const sandbox: { RadarModel?: any } = {};
runInNewContext(readFileSync(join(here, 'dashboard', 'model.js'), 'utf8'), sandbox, { filename: 'dashboard/model.js' });
const radar = sandbox.RadarModel!.build(snapshot);
const rows: any[] = radar.rows;

// The gate's rules, checked before anything is written.
const slugs = new Set(rows.map((r) => r.slug));
const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
if (missing.length) fail(`board misses watchlist slugs: ${missing.slice(0, 5).join(', ')}`);
if (rows.length < 100 || rows.length > 4000) fail(`board has ${rows.length} rows; the gate takes 100 to 4000`);
rows.forEach((r, i) => {
  if (r.rank !== i + 1) fail(`row ${i} has rank ${r.rank}`);
  if (i && r.implied_value_usd > rows[i - 1].implied_value_usd) fail(`${r.slug} outranks the row above it`);
  if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd < 1 || r.implied_value_usd > 1e14) fail(`${r.slug} implied ${r.implied_value_usd}`);
  const steps: string[] = r.plan.text;
  if (steps.length < 3 || steps.length > 12 || steps.some((s) => s.trim().length < 20 || s.trim().length > 600)) fail(`${r.slug} farm steps out of bounds`);
});
if (rows[0].implied_value_usd === rows[rows.length - 1].implied_value_usd) fail('every row has the same implied value');

const r2 = (v: number) => Math.round(v * 1e4) / 1e4;
const board = {
  model: 'launch-radar comps-1: implied = launch TVL x compsMultiple(TVL, mechanism) x growthFactor(7d) x ageFactor(days with no token) x siblingFactor',
  as_of: snapshot.as_of,
  source: snapshot.source,
  comps: {
    n: radar.fit.n, a: r2(radar.fit.a), b: r2(radar.fit.b), sigma_log10: r2(radar.fit.sigma), loo_error_x: r2(radar.fit.looFit), flat_error_x: r2(radar.fit.looFlat),
    spearman: r2(radar.fit.spearman), within_3x: r2(radar.fit.within3), within_3x_flat: r2(radar.fit.within3Flat), band50_x: r2(10 ** radar.fit.band50), band80_x: r2(10 ** radar.fit.band80),
    time_split: { cut: radar.fit.split.cut, train: radar.fit.split.nTrain, test: radar.fit.split.nTest, error_x: r2(radar.fit.split.fit), flat_error_x: r2(radar.fit.split.flat), cover50: r2(radar.fit.split.cover50), cover80: r2(radar.fit.split.cover80) },
  },
  rows: rows.map((r) => ({
    rank: r.rank, slug: r.slug, name: r.name, implied_value_usd: r.implied_value_usd,
    implied_range_usd: [r.low_usd, r.high_usd], token_status: 'pre-token', tier: r.tier,
    category: r.category, mechanism: r.group, chains: r.chains, tvl_usd: r.tvl_usd, launch_tvl_usd: r.launch_tvl_usd,
    products: r.products.map((p: { slug: string }) => p.slug), change_7d: r.change_7d, listed_at: r.listed_at, days_without_token: r.age_days,
    factors: { comps_multiple: r2(r.multiple), growth: r2(r.growth_factor), age: r2(r.age_factor), sibling: r.sibling_factor },
    airdrop_per_1k_usd: r2(r.drop_per_1k),
    implied_p10_p90_usd: [r.p10_usd, r.p90_usd],
    farm: {
      chain: r.plan.chain, capital_usd: r.plan.ticket, hold_days: r.plan.hold, hands_on_minutes: r.plan.minutes,
      slice_usd: r2(r.plan.slice), fees_usd: r2(r.plan.fees), tbill_forgone_usd: r2(r.plan.forgone), net_usd: r2(r.plan.net),
      net_per_hour_usd: r2(r.plan.perHour), pays_from_usd: r.plan.paysFrom, verdict: r.plan.verdict,
    },
    farm_steps: r.plan.text,
  })),
  set_aside: radar.aside.map((a: { slug: string; why: string }) => ({ slug: a.slug, why: a.why })),
};

mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'board.json'), JSON.stringify(board) + '\n');
// The page gets the raw snapshot and board.json's [slug, rank, value] triples, and checks one against the other.
writeFileSync(join(out, 'data.js'), `window.SNAPSHOT=${JSON.stringify(snapshot)};\nwindow.BOARD=${JSON.stringify(rows.map((r) => [r.slug, r.rank, r.implied_value_usd]))};\n`);

function copyFiles(from: string, to: string): string[] {
  if (!existsSync(from)) return [];
  mkdirSync(to, { recursive: true });
  const names = readdirSync(from).filter((n) => !n.startsWith('.') && statSync(join(from, n)).isFile()).sort();
  for (const n of names) copyFileSync(join(from, n), join(to, n));
  return names;
}
copyFiles(join(here, 'dashboard'), join(out, 'dashboard'));
const shots = copyFiles(join(here, 'screenshots'), join(out, 'screenshots'));
if (shots.length < 3) fail(`screenshots/ holds ${shots.length} images: hand in the board, a detail view and a filtered view`);

const dossier = buildDossier(out, { text_max_bytes: 65_536, screenshots: { max: 4, max_bytes: 524_288 }, dashboard: { max_files: 400, max_bytes: 4_194_304 } });
if (dossier.length > 1_572_864) fail(`dossier.json is ${dossier.length} bytes; the gate takes 1.5 MiB: shrink the screenshots`);
writeFileSync(join(out, 'dossier.json'), dossier);

const tiers = (t: string) => rows.filter((r) => r.tier === t).length;
process.stdout.write(
  `launch radar: ${snapshot.protocols.length} protocols, ${rows.length} pre-token launches ranked (${tiers('watchlist')} watchlist, ${tiers('above')} above floor, ${tiers('early')} early), ${radar.aside.length} set aside, ${radar.fit.n} comps\n`,
);

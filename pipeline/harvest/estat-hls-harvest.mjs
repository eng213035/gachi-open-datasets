#!/usr/bin/env node
/**
 * Harvests municipality-level vacancy counts from Japan's Housing and Land
 * Survey (住宅・土地統計調査) via the e-Stat API into pipeline/cache/estat-hls.json.
 * Re-run any time to refresh; build-vacancy.mjs reads only from the cache.
 *
 * Source table per year: the compact 「居住世帯の有無」 dwelling-count table, which
 * carries all three target counts at full 市区町村 granularity in one small table
 * (総数=total dwellings, 空き家=total vacant, その他の住宅=neglected-vacancy series).
 * We select exactly those three cat01 codes (server-side cdCat01 filter).
 *
 * 1998 has NO municipality-level table (finest published unit is 市部 + 大都市区 +
 * larger towns/villages), so the municipality dataset spans 2003–2023 (5 surveys).
 *
 * English municipality names come from e-Stat's own lang=E metadata (official
 * romanisation, e.g. "Sapporo-shi", "Chuo-ku") — not machine transliteration.
 * Only the 2023 table exposes English metadata (2003–2018 return no lang=E), so
 * we fetch the English area-name map ONCE from 2023 and reuse it by code across
 * years. Municipalities dissolved before 2023 have no official English name and
 * carry name_source="ja" (Japanese only) — an honest, documented gap.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = path.join(__dirname, "..", "cache");

const APP_ID = process.env.ESTAT_APP_ID;
if (!APP_ID) {
  console.error("ESTAT_APP_ID env var is required (source ~/gachi-mcp-run/secrets/app.env)");
  process.exit(1);
}

// Per-survey-year config. `codes` are the cat01 (居住世帯の有無) class codes that
// select each measure in that year's table (they differ by year — verified live
// against getMetaInfo). See housing-vacancy/README.md for the mapping table.
const YEARS = [
  { year: 2003, statsDataId: "0000083299", codes: { total: "000", vacant_total: "006", vacant_other: "010" } },
  { year: 2008, statsDataId: "0003009773", codes: { total: "00",  vacant_total: "06",  vacant_other: "12"  } },
  { year: 2013, statsDataId: "0003099766", codes: { total: "00000", vacant_total: "00008", vacant_other: "00014" } },
  { year: 2018, statsDataId: "0003355290", codes: { total: "0",   vacant_total: "22",  vacant_other: "224" } },
  { year: 2023, statsDataId: "0004021421", codes: { total: "0",   vacant_total: "22",  vacant_other: "221" } },
];

const BASE = "https://api.e-stat.go.jp/rest/3.0/app/json";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function estat(endpoint, params, attempt = 1) {
  const qs = new URLSearchParams({ appId: APP_ID, ...params });
  try {
    const res = await fetch(`${BASE}/${endpoint}?${qs}`);
    if (!res.ok) throw new Error(`${endpoint} HTTP ${res.status}`);
    const json = await res.json();
    const root = json[Object.keys(json)[0]];
    const status = root?.RESULT?.STATUS;
    // e-Stat intermittently returns STATUS 300 ("does not exist") under rapid
    // bursts even for valid IDs; retry transient failures before giving up.
    if (status !== 0) throw new Error(`${endpoint} e-Stat STATUS ${status}: ${root?.RESULT?.ERROR_MSG}`);
    return root;
  } catch (e) {
    if (attempt < 6) {
      await sleep(attempt * 1500);
      return estat(endpoint, params, attempt + 1);
    }
    throw e;
  }
}

const asArray = (x) => (Array.isArray(x) ? x : x == null ? [] : [x]);

// Pull the area class objects from a stats-data response's metadata.
function areaClass(root) {
  const classObj = asArray(root.STATISTICAL_DATA?.CLASS_INF?.CLASS_OBJ);
  return asArray(classObj.find((c) => c["@id"] === "area")?.CLASS);
}
// @code -> @name map.
function areaNames(root) {
  const out = new Map();
  for (const c of areaClass(root)) out.set(c["@code"], c["@name"]);
  return out;
}

// English area-name map, fetched once from the only year that exposes lang=E (2023).
async function englishNameMap() {
  const cfg = YEARS.find((y) => y.year === 2023);
  const en = await estat("getStatsData", {
    statsDataId: cfg.statsDataId, cdCat01: cfg.codes.total, lang: "E",
    limit: "100000", metaGetFlg: "Y", cntGetFlg: "N",
  });
  return Object.fromEntries(areaNames(en));
}

async function harvestYear({ year, statsDataId, codes }) {
  const codeToMeasure = new Map([
    [codes.total, "total_dwellings"],
    [codes.vacant_total, "vacant_total"],
    [codes.vacant_other, "vacant_other"],
  ]);
  const cdCat01 = [codes.total, codes.vacant_total, codes.vacant_other].join(",");

  // lang=J: values + Japanese area names (the only language older tables expose).
  const ja = await estat("getStatsData", {
    statsDataId, cdCat01, lang: "J", limit: "100000", metaGetFlg: "Y", cntGetFlg: "N",
  });
  await sleep(500);

  // Area hierarchy (name + level + parent) so the builder can keep only leaf
  // municipalities (a code that is nobody's @parentCode) and drop rollups.
  const meta = new Map();
  for (const c of areaClass(ja)) {
    meta.set(c["@code"], { ja: c["@name"], level: c["@level"] ?? null, parent: c["@parentCode"] ?? null });
  }

  const values = asArray(ja.STATISTICAL_DATA?.DATA_INF?.VALUE);
  const byArea = {};
  let unit = null;
  for (const v of values) {
    const area = v["@area"];
    const measure = codeToMeasure.get(v["@cat01"]);
    if (!measure) continue;
    unit = unit || v["@unit"];
    const raw = v["$"];
    const n = /^-?\d+$/.test(String(raw).trim()) ? parseInt(raw, 10) : null; // suppressed/…/X/- -> null
    (byArea[area] ||= {})[measure] = n;
  }

  const areas = {};
  for (const code of Object.keys(byArea)) {
    const m = meta.get(code) || {};
    areas[code] = { ja: m.ja ?? null, level: m.level ?? null, parent: m.parent ?? null, ...byArea[code] };
  }
  console.log(`  ${year} (${statsDataId}): ${Object.keys(areas).length} area rows, unit=${unit || "戸"}`);
  return { statsDataId, unit: unit || "戸", source: "Housing and Land Survey (Statistics Bureau of Japan)", areas };
}

async function main() {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  const out = { _english_names: {}, years: {} };

  process.stdout.write("fetching English area-name map (from 2023) ...\n");
  const enNames = await englishNameMap();
  await sleep(500);
  console.log(`  ${Object.keys(enNames).length} English area names`);

  for (const cfg of YEARS) {
    process.stdout.write(`fetching HLS ${cfg.year} ...\n`);
    out.years[cfg.year] = await harvestYear(cfg);
  }

  // Stable, reproducible: sorted keys, no timestamps. Freshness lives in metadata.json.
  const stable = {
    _english_names: Object.fromEntries(Object.keys(enNames).sort().map((k) => [k, enNames[k]])),
    years: {},
  };
  for (const y of Object.keys(out.years).sort()) {
    const yr = out.years[y];
    const areas = {};
    for (const code of Object.keys(yr.areas).sort()) areas[code] = yr.areas[code];
    stable.years[y] = { ...yr, areas };
  }
  fs.writeFileSync(path.join(CACHE_DIR, "estat-hls.json"), JSON.stringify(stable, null, 0) + "\n");
  console.log(`wrote pipeline/cache/estat-hls.json (${Object.keys(stable.years).length} survey years, ${Object.keys(stable._english_names).length} en names)`);
}

main().catch((e) => { console.error(e); process.exit(1); });

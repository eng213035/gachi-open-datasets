#!/usr/bin/env node
/**
 * Builds housing-vacancy/municipality_vacancy.csv from pipeline/cache/estat-hls.json
 * (harvested by pipeline/harvest/estat-hls-harvest.mjs).
 *
 * Tidy grain: one row = one municipality x one survey year (2003–2023).
 *
 * Values are the official published counts, verbatim, as of each survey year
 * (总住宅数 total_dwellings, 空き家 vacant_total, その他の住宅 vacant_other).
 * vacancy_rate is the ONLY derived field: e-Stat publishes no municipality-level
 * rate, so it is computed as vacant_total/total_dwellings*100 using the standard
 * 空き家率 definition and flagged in rate_source. Counts are never recomputed.
 *
 * Leaf-municipality selection: e-Stat's area axis mixes leaf municipalities with
 * rollups (national, prefecture, designated-city / 特別区部 totals). A code is a
 * rollup iff any of its child codes (learned from the years that publish
 * @parentCode: 2003/2018/2023) is present that same year — this correctly keeps a
 * city as a leaf before it gained wards and drops it afterwards (e.g. Sagamihara,
 * a designated city only from 2010). National/prefecture codes are dropped too.
 * Designated cities therefore appear as their wards, not a single city row.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { toCsv } from "./lib/csv.mjs";
import { municipalityRomaji } from "./lib/romaji.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const CACHE = path.join(ROOT, "pipeline", "cache");
const OUT_DIR = path.join(ROOT, "housing-vacancy");
const SOURCE = "Housing and Land Survey (Statistics Bureau of Japan)";

const COLUMNS = [
  "municipality_code", "name", "name_ja", "name_source", "pref", "year",
  "total_dwellings", "vacant_total", "vacant_other", "vacancy_rate", "rate_source", "source",
];

// Strip the -to/-fu/-ken suffix from e-Stat's official prefecture romanisation
// (Tokyo-to -> Tokyo, Kanagawa-ken -> Kanagawa); Hokkaido keeps its name.
function prefName(en) {
  if (!en) return "";
  return en.replace(/-(to|fu|ken)$/i, "");
}

function main() {
  const cache = JSON.parse(fs.readFileSync(path.join(CACHE, "estat-hls.json"), "utf8"));
  const enNames = cache._english_names || {};
  const years = cache.years;

  // Official Soumu kana readings, used to romanise municipalities dissolved
  // before 2023 (absent from e-Stat's English metadata). We only ever romanise
  // from an authoritative furigana reading, never from kanji.
  const kanaByCode = new Map();
  const mergersPath = path.join(CACHE, "muni-mergers.json");
  if (fs.existsSync(mergersPath)) {
    const mg = JSON.parse(fs.readFileSync(mergersPath, "utf8"));
    for (const r of mg.records) if (r.old_kana) kanaByCode.set(r.old_code, r.old_kana);
    for (const n of mg.news || []) if (n.kana) kanaByCode.set(n.code, n.kana);
  }
  const soumuPath = path.join(CACHE, "soumu-current.json");
  if (fs.existsSync(soumuPath)) {
    for (const m of JSON.parse(fs.readFileSync(soumuPath, "utf8"))) if (m.kana) kanaByCode.set(m.code, m.kana);
  }

  // Global parent -> children map from every year that publishes @parentCode.
  const children = new Map();
  for (const y of Object.keys(years)) {
    for (const [code, a] of Object.entries(years[y].areas)) {
      if (a.parent) {
        if (!children.has(a.parent)) children.set(a.parent, new Set());
        children.get(a.parent).add(code);
      }
    }
  }

  const isRollup = (code, present) => {
    if (code === "00000" || code.endsWith("000")) return true; // national / prefecture
    const kids = children.get(code);
    if (!kids) return false;
    for (const k of kids) if (present.has(k)) return true; // has a child this year -> rollup
    return false;
  };

  // English prefecture name by 2-digit prefecture code (from the NN000 rows).
  const prefEnByCode = (code) => prefName(enNames[`${code.slice(0, 2)}000`]);

  const rows = [];
  for (const y of Object.keys(years).sort()) {
    const areas = years[y].areas;
    const present = new Set(Object.keys(areas));
    for (const code of Object.keys(areas)) {
      if (isRollup(code, present)) continue;
      const a = areas[code];
      const total = a.total_dwellings ?? null;
      if (total == null) continue; // fully suppressed / no dwelling count -> no usable row
      const vacantTotal = a.vacant_total ?? null;
      const vacantOther = a.vacant_other ?? null;
      // English name: e-Stat official romanisation, else Hepburn from official
      // Soumu kana (for pre-2023-dissolved municipalities), else Japanese-only.
      let name = enNames[code] || "", nameSource = "estat-en";
      if (!name) {
        const kana = kanaByCode.get(code);
        if (kana) { name = municipalityRomaji(kana); nameSource = "somucho-kana"; }
        else nameSource = "ja";
      }
      let vacancyRate = "", rateSource = "";
      if (vacantTotal != null && total > 0) {
        vacancyRate = (Math.round((vacantTotal / total) * 1000) / 10).toFixed(1); // 1 dp %
        rateSource = "computed (vacant_total/total_dwellings)";
      }
      rows.push({
        municipality_code: code,
        name,
        name_ja: a.ja ?? "",
        name_source: nameSource,
        pref: prefEnByCode(code),
        year: Number(y),
        total_dwellings: total,
        vacant_total: vacantTotal,
        vacant_other: vacantOther,
        vacancy_rate: vacancyRate,
        rate_source: rateSource,
        source: SOURCE,
      });
    }
  }

  rows.sort((a, b) =>
    a.municipality_code.localeCompare(b.municipality_code) || a.year - b.year
  );

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, "municipality_vacancy.csv"), toCsv(rows, COLUMNS));

  const yrs = [...new Set(rows.map((r) => r.year))].sort();
  const munis = new Set(rows.map((r) => r.municipality_code)).size;
  const byLabel = (src) => new Set(rows.filter((r) => r.name_source === src).map((r) => r.municipality_code)).size;
  console.log(`municipality_vacancy.csv: ${rows.length} rows, ${munis} distinct municipalities, years ${yrs.join("/")}`);
  console.log(`  rows per year: ${yrs.map((y) => `${y}:${rows.filter((r) => r.year === y).length}`).join("  ")}`);
  console.log(`  name_source (distinct municipalities): estat-en ${byLabel("estat-en")}, somucho-kana ${byLabel("somucho-kana")}, ja ${byLabel("ja")}`);
}

main();

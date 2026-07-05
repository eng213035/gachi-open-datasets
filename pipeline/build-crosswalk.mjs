#!/usr/bin/env node
/**
 * Builds housing-vacancy/municipality_crosswalk.csv + low_confidence_review.csv
 * connecting pre/post-merger municipality codes, so users can bridge the
 * as-of-survey-year codes in municipality_vacancy.csv to today's municipalities.
 *
 * Two tiers (per the dataset's honesty rules — we never invent a successor):
 *  - HIGH: the dissolution is in BOTH the official Soumu 改正一覧表 (with a linked
 *    新設 successor) AND is empirically visible in the vacancy data (a code that
 *    appears in an earlier survey and is not a current municipality). -> crosswalk.
 *  - LOW: present on only one side — an official record we couldn't link to a
 *    successor (編入 / absorption), or a vacancy-era code with no entry in the
 *    official table (the 2004–2005 平成大合併 wave predates the 2005-04 table).
 *    -> low_confidence_review.csv, new_code blank, for human resolution.
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
const SOURCE = "Soumu 全国地方公共団体コード改正一覧表 (2005-04-01 onward)";

const CROSSWALK_COLS = ["old_code", "old_name", "old_name_ja", "new_code", "new_name", "new_name_ja", "merged_year", "confidence", "source"];
const REVIEW_COLS = ["old_code", "old_name_ja", "new_code", "new_name_ja", "merged_year", "reason", "source"];

function main() {
  const mergers = JSON.parse(fs.readFileSync(path.join(CACHE, "muni-mergers.json"), "utf8"));
  const hls = JSON.parse(fs.readFileSync(path.join(CACHE, "estat-hls.json"), "utf8"));
  const enNames = hls._english_names || {};
  const currentLeaf = new Set(
    JSON.parse(fs.readFileSync(path.join(CACHE, "soumu-current.json"), "utf8"))
      .filter((m) => !m.code.endsWith("00")).map((m) => m.code)
  );

  // Empirical: leaf codes seen in any vacancy survey but not a current municipality.
  // Leaf = a code that is nobody's parent that year (see build-vacancy.mjs).
  const children = new Map();
  for (const y of Object.keys(hls.years)) {
    for (const [code, a] of Object.entries(hls.years[y].areas)) {
      if (a.parent) (children.get(a.parent) || children.set(a.parent, new Set()).get(a.parent)).add(code);
    }
  }
  const vacancyLast = new Map(); // code -> {ja, year} last survey it appeared as a leaf
  for (const y of Object.keys(hls.years).sort()) {
    const areas = hls.years[y].areas; const present = new Set(Object.keys(areas));
    for (const code of Object.keys(areas)) {
      if (code === "00000" || code.endsWith("000")) continue;
      const kids = children.get(code);
      if (kids && [...kids].some((k) => present.has(k))) continue; // rollup
      vacancyLast.set(code, { ja: areas[code].ja || "", year: Number(y) });
    }
  }
  const disappeared = new Set([...vacancyLast.keys()].filter((c) => !currentLeaf.has(c)));

  const romaji = (kana) => (kana ? municipalityRomaji(kana) : "");
  const newName = (code, kana) => enNames[code] || romaji(kana) || "";

  const crosswalk = [], review = [];
  const officialOld = new Set();

  for (const r of mergers.records) {
    officialOld.add(r.old_code);
    const inVacancy = disappeared.has(r.old_code);
    // Successor must be a current leaf municipality. A successor that is a
    // designated-city parent code (e.g. 15201 Niigata-shi -> 15100 after it became
    // a designated city) is represented in municipalities.csv as its wards, not a
    // single row, so it can't be a clean crosswalk target -> route to review.
    if (r.new_code && inVacancy && currentLeaf.has(r.new_code)) {
      crosswalk.push({
        old_code: r.old_code,
        old_name: romaji(r.old_kana),
        old_name_ja: r.old_name || vacancyLast.get(r.old_code)?.ja || "",
        new_code: r.new_code,
        new_name: newName(r.new_code, r.new_kana),
        new_name_ja: r.new_name || "",
        merged_year: r.merged_year ?? "",
        confidence: "high",
        source: SOURCE,
      });
    } else {
      review.push({
        old_code: r.old_code,
        old_name_ja: r.old_name || "",
        new_code: r.new_code || "",
        new_name_ja: r.new_name || "",
        merged_year: r.merged_year ?? "",
        reason: !r.new_code
          ? "official record without a linkable 新設 successor (absorption/編入)"
          : (!currentLeaf.has(r.new_code)
              ? `successor ${r.new_code} became a designated city; represented as its wards in municipalities.csv`
              : "official record not seen in vacancy surveys"),
        source: SOURCE,
      });
    }
  }

  // Vacancy-era codes not in current municipalities and not in the official table.
  const latestYear = Math.max(...Object.keys(hls.years).map(Number));
  for (const code of [...disappeared].sort()) {
    if (officialOld.has(code)) continue;
    const yr = vacancyLast.get(code)?.year;
    review.push({
      old_code: code,
      old_name_ja: vacancyLast.get(code)?.ja || "",
      new_code: "",
      new_name_ja: "",
      merged_year: "",
      reason: yr === latestYear
        ? `in ${yr} survey but not in current Soumu municipality master (code reconciliation needed)`
        : `disappeared after ${yr} survey; no entry in official table (pre-2005-04 merger — successor needs the 平成合併 archive)`,
      source: "empirical (vacancy survey code disappearance)",
    });
  }

  crosswalk.sort((a, b) => a.old_code.localeCompare(b.old_code));
  review.sort((a, b) => a.old_code.localeCompare(b.old_code));

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, "municipality_crosswalk.csv"), toCsv(crosswalk, CROSSWALK_COLS));
  fs.writeFileSync(path.join(OUT_DIR, "low_confidence_review.csv"), toCsv(review, REVIEW_COLS));

  const orphanNew = crosswalk.filter((r) => !currentLeaf.has(r.new_code)).length;
  console.log(`municipality_crosswalk.csv: ${crosswalk.length} high-confidence merger pairs`);
  console.log(`low_confidence_review.csv: ${review.length} rows (${review.filter((r) => r.reason.startsWith("official")).length} official-unlinked, ${review.filter((r) => r.reason.startsWith("disappeared")).length} pre-2005 empirical)`);
  if (orphanNew) console.error(`  WARNING: ${orphanNew} crosswalk new_code not in current municipalities`);
}

main();

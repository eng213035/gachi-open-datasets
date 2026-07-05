#!/usr/bin/env node
/**
 * Validates frozen schema + referential integrity, and diffs each CSV
 * against the last committed version (`git show HEAD:<path>`). If any
 * previously-published row's values changed (not just new rows added),
 * this exits non-zero and prints the changed keys — a human must confirm
 * the change is intentional (and note why in CHANGELOG.md) before committing.
 */
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");

const SCHEMAS = {
  "station-master/stations.csv": ["station_id", "name", "name_ja", "name_source", "lat", "lng", "pref", "operators", "merge_confidence", "member_count"],
  "station-master/station_members.csv": ["station_id", "operator", "operator_station_name_ja", "odpt_id", "line_names"],
  "station-master/lines.csv": ["line_id", "name", "name_ja", "operator", "station_order"],
  "station-ridership/station_ridership.csv": ["station_id", "operator", "year", "passenger_journeys", "includes_alighting", "source_survey_id"],
  "housing-vacancy/municipality_vacancy.csv": ["municipality_code", "name", "name_ja", "name_source", "pref", "year", "total_dwellings", "vacant_total", "vacant_other", "vacancy_rate", "rate_source", "source"],
  "housing-vacancy/municipalities.csv": ["municipality_code", "name", "name_ja", "name_kana", "pref", "lat", "lng", "nearest_station_id", "station_distance_km"],
  "housing-vacancy/municipality_crosswalk.csv": ["old_code", "old_name", "old_name_ja", "new_code", "new_name", "new_name_ja", "merged_year", "confidence", "source"],
};
const KEY_COLUMNS = {
  "station-master/stations.csv": ["station_id"],
  "station-master/station_members.csv": ["station_id", "operator"],
  "station-master/lines.csv": ["line_id"],
  "station-ridership/station_ridership.csv": ["station_id", "operator", "year", "source_survey_id"],
  "housing-vacancy/municipality_vacancy.csv": ["municipality_code", "year"],
  "housing-vacancy/municipalities.csv": ["municipality_code"],
  "housing-vacancy/municipality_crosswalk.csv": ["old_code"],
};

function parseCsv(text) {
  const [headerLine, ...lines] = text.trim().split("\n");
  const headers = headerLine.split(",");
  return { headers, rows: lines.filter(Boolean).map((line) => {
    const cells = [];
    let cur = "", inQ = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') { inQ = !inQ; continue; }
      if (c === "," && !inQ) { cells.push(cur); cur = ""; continue; }
      cur += c;
    }
    cells.push(cur);
    const row = {};
    headers.forEach((h, i) => (row[h] = cells[i]));
    return row;
  })};
}

function keyOf(row, keyCols) {
  return keyCols.map((c) => row[c]).join("");
}

let failed = false;

for (const [rel, expectedCols] of Object.entries(SCHEMAS)) {
  const full = path.join(ROOT, rel);
  if (!fs.existsSync(full)) {
    console.error(`MISSING: ${rel}`);
    failed = true;
    continue;
  }
  const { headers, rows } = parseCsv(fs.readFileSync(full, "utf8"));
  if (JSON.stringify(headers) !== JSON.stringify(expectedCols)) {
    console.error(`SCHEMA MISMATCH in ${rel}`);
    console.error(`  expected: ${expectedCols.join(",")}`);
    console.error(`  actual:   ${headers.join(",")}`);
    failed = true;
    continue;
  }

  let prevText = null;
  try {
    prevText = execSync(`git show HEAD:${rel}`, { cwd: ROOT, stdio: ["pipe", "pipe", "pipe"] }).toString();
  } catch {
    // no committed version yet (first publish) — nothing to diff against
  }
  if (prevText) {
    const prev = parseCsv(prevText);
    const keyCols = KEY_COLUMNS[rel];
    const prevByKey = new Map(prev.rows.map((r) => [keyOf(r, keyCols), r]));
    const curByKey = new Map(rows.map((r) => [keyOf(r, keyCols), r]));
    let added = 0, changed = 0, removed = 0;
    const changedKeys = [];
    for (const [k, row] of curByKey) {
      if (!prevByKey.has(k)) { added++; continue; }
      const before = prevByKey.get(k);
      if (JSON.stringify(before) !== JSON.stringify(row)) {
        changed++;
        changedKeys.push(k.replace("", "/"));
      }
    }
    for (const k of prevByKey.keys()) if (!curByKey.has(k)) removed++;
    console.log(`${rel}: +${added} added, ${changed} changed, -${removed} removed (vs last commit)`);
    if (changed > 0) {
      console.error(`  BLOCKED: ${changed} previously-published row(s) changed value. This requires a human`);
      console.error(`  confirmation + a CHANGELOG.md entry explaining why (conventions.md rule #3).`);
      console.error(`  Changed keys (${keyCols.join("/")}): ${changedKeys.slice(0, 20).join(", ")}${changedKeys.length > 20 ? ", ..." : ""}`);
      failed = true;
    }
    if (removed > 0) {
      console.error(`  BLOCKED: ${removed} previously-published row(s) disappeared. Same rule applies.`);
      failed = true;
    }
  } else {
    console.log(`${rel}: ${rows.length} rows (no prior commit to diff against)`);
  }
}

// Referential integrity + station-master internal consistency.
{
  const stations = parseCsv(fs.readFileSync(path.join(ROOT, "station-master/stations.csv"), "utf8")).rows;
  const validIds = new Set(stations.map((r) => r.station_id));

  // Every station_members.station_id must exist in stations.csv.
  const members = parseCsv(fs.readFileSync(path.join(ROOT, "station-master/station_members.csv"), "utf8")).rows;
  const memberOrphans = members.filter((r) => !validIds.has(r.station_id));
  if (memberOrphans.length) {
    console.error(`REFERENTIAL INTEGRITY: ${memberOrphans.length} station_members reference a station_id not in stations.csv`);
    failed = true;
  } else {
    console.log(`referential integrity (station_members -> stations): OK`);
  }

  // name_source vocabulary: odpt (v1), wikidata / romanized (nationwide), or "".
  const ALLOWED_SOURCE = new Set(["odpt", "wikidata", "romanized", ""]);
  const badSource = stations.filter((r) => !ALLOWED_SOURCE.has(r.name_source));
  if (badSource.length) {
    console.error(`SCHEMA: ${badSource.length} stations have an unknown name_source (e.g. ${badSource.slice(0,3).map((r)=>`${r.station_id}=${r.name_source}`).join(", ")})`);
    failed = true;
  } else {
    console.log(`name_source vocabulary (odpt|wikidata|romanized|""): OK`);
  }

  const ridership = parseCsv(fs.readFileSync(path.join(ROOT, "station-ridership/station_ridership.csv"), "utf8")).rows;
  const orphans = ridership.filter((r) => !validIds.has(r.station_id));
  if (orphans.length) {
    console.error(`REFERENTIAL INTEGRITY: ${orphans.length} ridership rows reference a station_id not in stations.csv`);
    failed = true;
  } else {
    console.log(`referential integrity (ridership -> station-master): OK`);
  }
}

// Referential integrity: housing-vacancy dataset
{
  const readRows = (rel) => parseCsv(fs.readFileSync(path.join(ROOT, rel), "utf8")).rows;
  const vacDir = path.join(ROOT, "housing-vacancy");
  if (fs.existsSync(path.join(vacDir, "municipality_vacancy.csv"))) {
    const stationIds = new Set(parseCsv(fs.readFileSync(path.join(ROOT, "station-master/stations.csv"), "utf8")).rows.map((r) => r.station_id));
    const municipalities = readRows("housing-vacancy/municipalities.csv");
    const muniCodes = new Set(municipalities.map((r) => r.municipality_code));
    const crosswalk = readRows("housing-vacancy/municipality_crosswalk.csv");
    const crosswalkOld = new Set(crosswalk.map((r) => r.old_code));
    const reviewPath = path.join(vacDir, "low_confidence_review.csv");
    const reviewOld = new Set(fs.existsSync(reviewPath) ? readRows("housing-vacancy/low_confidence_review.csv").map((r) => r.old_code) : []);
    const vacancy = readRows("housing-vacancy/municipality_vacancy.csv");

    // (a) municipalities.nearest_station_id must exist in the station master.
    const badStation = municipalities.filter((r) => r.nearest_station_id && !stationIds.has(r.nearest_station_id));
    if (badStation.length) { console.error(`REFERENTIAL: ${badStation.length} municipalities.nearest_station_id not in station master`); failed = true; }
    else console.log(`referential integrity (municipalities.nearest_station_id -> station-master): OK`);

    // (b) crosswalk.new_code must be a current municipality.
    const badNew = crosswalk.filter((r) => r.new_code && !muniCodes.has(r.new_code));
    if (badNew.length) { console.error(`REFERENTIAL: ${badNew.length} crosswalk.new_code not in municipalities.csv (e.g. ${badNew.slice(0,5).map((r)=>r.new_code).join(", ")})`); failed = true; }
    else console.log(`referential integrity (crosswalk.new_code -> municipalities): OK`);

    // (c) every vacancy municipality_code must resolve: current municipality, or a
    //     known dissolution (high-confidence crosswalk or low-confidence review).
    const resolvable = (code) => muniCodes.has(code) || crosswalkOld.has(code) || reviewOld.has(code);
    const orphanVac = [...new Set(vacancy.map((r) => r.municipality_code))].filter((c) => !resolvable(c));
    if (orphanVac.length) { console.error(`REFERENTIAL: ${orphanVac.length} vacancy municipality_code resolve to neither municipalities nor crosswalk/review (e.g. ${orphanVac.slice(0,5).join(", ")})`); failed = true; }
    else console.log(`referential integrity (vacancy.municipality_code -> municipalities | crosswalk | review): OK`);
  }
}

if (failed) {
  console.error("\nvalidate.mjs FAILED — see above.");
  process.exit(1);
}
console.log("\nvalidate.mjs: all checks passed.");

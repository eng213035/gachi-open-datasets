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
};
const KEY_COLUMNS = {
  "station-master/stations.csv": ["station_id"],
  "station-master/station_members.csv": ["station_id", "operator"],
  "station-master/lines.csv": ["line_id"],
  "station-ridership/station_ridership.csv": ["station_id", "operator", "year", "source_survey_id"],
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

// Referential integrity: ridership.station_id subset of stations.station_id
{
  const stations = parseCsv(fs.readFileSync(path.join(ROOT, "station-master/stations.csv"), "utf8")).rows;
  const validIds = new Set(stations.map((r) => r.station_id));
  const ridership = parseCsv(fs.readFileSync(path.join(ROOT, "station-ridership/station_ridership.csv"), "utf8")).rows;
  const orphans = ridership.filter((r) => !validIds.has(r.station_id));
  if (orphans.length) {
    console.error(`REFERENTIAL INTEGRITY: ${orphans.length} ridership rows reference a station_id not in stations.csv`);
    failed = true;
  } else {
    console.log(`referential integrity (ridership -> station-master): OK`);
  }
}

if (failed) {
  console.error("\nvalidate.mjs FAILED — see above.");
  process.exit(1);
}
console.log("\nvalidate.mjs: all checks passed.");

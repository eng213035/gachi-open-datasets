#!/usr/bin/env node
/**
 * Builds station-ridership/station_ridership.csv from ODPT PassengerSurvey,
 * joined to station-master's station_id (must be built first).
 *
 * Tidy grain: one row = one station_id x one operator x one survey year.
 * Kept per-operator (not summed across operators sharing a station_id)
 * because odpt:includeAlighting conventions differ by operator, so summing
 * would mix boarding-only and boarding+alighting counts under one number.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { toCsv } from "./lib/csv.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const CACHE = path.join(ROOT, "pipeline", "cache");
const MASTER_DIR = path.join(ROOT, "station-master");
const OUT_DIR = path.join(ROOT, "station-ridership");

function load(name) {
  return JSON.parse(fs.readFileSync(path.join(CACHE, `${name}.json`), "utf8"));
}

function parseCsv(text) {
  const [headerLine, ...lines] = text.trim().split("\n");
  const headers = headerLine.split(",");
  return lines.map((line) => {
    // simple splitter sufficient here: no embedded commas in the columns we read
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
  });
}

function main() {
  const surveys = load("passengerSurveys");
  const operators = load("operators");
  const opName = new Map(
    operators.map((o) => [o["owl:sameAs"], o["odpt:operatorTitle"]?.en || o["owl:sameAs"].replace("odpt.Operator:", "")])
  );

  const membersText = fs.readFileSync(path.join(MASTER_DIR, "station_members.csv"), "utf8");
  const members = parseCsv(membersText);
  const odptIdToStation = new Map();
  for (const m of members) {
    for (const oid of m.odpt_id.split(";")) odptIdToStation.set(oid, m.station_id);
  }

  const rows = [];
  const unmatched = [];
  for (const survey of surveys) {
    const stationOdptIds = survey["odpt:station"] || [];
    // A survey can list multiple station records (e.g. through-service branches);
    // resolve each to our station_id and dedupe.
    const stationIds = [...new Set(stationOdptIds.map((id) => odptIdToStation.get(id)).filter(Boolean))];
    if (!stationIds.length) {
      unmatched.push({ survey_id: survey["owl:sameAs"], odpt_station_ids: stationOdptIds.join(";") });
      continue;
    }
    const operator = opName.get(survey["odpt:operator"]) || survey["odpt:operator"];
    const includeAlighting = survey["odpt:includeAlighting"] === true;
    for (const stationId of stationIds) {
      for (const obj of survey["odpt:passengerSurveyObject"] || []) {
        rows.push({
          station_id: stationId,
          operator,
          year: obj["odpt:surveyYear"],
          passenger_journeys: obj["odpt:passengerJourneys"],
          includes_alighting: includeAlighting,
          source_survey_id: survey["owl:sameAs"],
        });
      }
    }
  }

  rows.sort((a, b) =>
    a.station_id.localeCompare(b.station_id) ||
    a.operator.localeCompare(b.operator) ||
    a.year - b.year
  );

  // Referential integrity check: every station_id must exist in stations.csv.
  const stationsCsv = fs.readFileSync(path.join(MASTER_DIR, "stations.csv"), "utf8");
  const validIds = new Set(parseCsv(stationsCsv).map((r) => r.station_id));
  const orphans = rows.filter((r) => !validIds.has(r.station_id));
  if (orphans.length) {
    console.error(`REFERENTIAL INTEGRITY FAILURE: ${orphans.length} ridership rows reference unknown station_id`);
    console.error(orphans.slice(0, 5));
    process.exit(1);
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(
    path.join(OUT_DIR, "station_ridership.csv"),
    toCsv(rows, ["station_id", "operator", "year", "passenger_journeys", "includes_alighting", "source_survey_id"])
  );
  if (unmatched.length) {
    fs.writeFileSync(
      path.join(OUT_DIR, "unmatched_surveys.csv"),
      toCsv(unmatched, ["survey_id", "odpt_station_ids"])
    );
  }

  const years = [...new Set(rows.map((r) => r.year))].sort();
  console.log(`station_ridership.csv: ${rows.length} rows, ${new Set(rows.map((r) => r.station_id)).size} stations, years ${years[0]}-${years[years.length - 1]}`);
  console.log(`referential integrity: OK (0 orphan station_id)`);
  if (unmatched.length) console.log(`unmatched_surveys.csv: ${unmatched.length} surveys could not be joined (see file)`);
}

main();

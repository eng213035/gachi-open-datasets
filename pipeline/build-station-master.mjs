#!/usr/bin/env node
/**
 * Builds station-master/{stations,station_members,lines}.csv from the ODPT
 * cache via entity resolution (see shared/conventions.md for the method).
 *
 * Deterministic: sorts every output by a stable key so re-running on the same
 * cache produces byte-identical CSVs (conventions.md rule #7, reproducibility).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { UnionFind } from "./lib/union-find.mjs";
import { guessPrefecture, distMeters, normalizeStationName } from "./lib/geo.mjs";
import { toCsv } from "./lib/csv.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const CACHE = path.join(ROOT, "pipeline", "cache");
const OUT_DIR = path.join(ROOT, "station-master");
const PROXIMITY_THRESHOLD_M = 300;

function load(name) {
  return JSON.parse(fs.readFileSync(path.join(CACHE, `${name}.json`), "utf8"));
}

function main() {
  const stations = load("stations");
  const operators = load("operators");
  const railways = load("railways");

  const opName = new Map(
    operators.map((o) => [o["owl:sameAs"], o["odpt:operatorTitle"]?.en || o["owl:sameAs"].replace("odpt.Operator:", "")])
  );
  const railwayInfo = new Map(
    railways.map((r) => [
      r["owl:sameAs"],
      {
        en: r["odpt:railwayTitle"]?.en || r["owl:sameAs"].replace("odpt.Railway:", ""),
        ja: r["odpt:railwayTitle"]?.ja || "",
        operator: r["odpt:operator"],
        stationOrder: r["odpt:stationOrder"] || [],
      },
    ])
  );

  const byId = new Map(stations.map((s) => [s["owl:sameAs"], s]));
  const uf = new UnionFind(stations.map((s) => s["owl:sameAs"]));

  // Pass 1: explicit operator-declared connections (high confidence).
  for (const s of stations) {
    const id = s["owl:sameAs"];
    for (const otherId of s["odpt:connectingStation"] || []) {
      if (byId.has(otherId)) uf.union(id, otherId);
    }
  }

  // Pass 2: same normalized name + coordinates within threshold (medium confidence).
  // Only considered when both records have coordinates; otherwise deferred to
  // the manual review list rather than guessed.
  const byName = new Map();
  for (const s of stations) {
    const key = normalizeStationName(s["dc:title"]);
    if (!byName.has(key)) byName.set(key, []);
    byName.get(key).push(s);
  }
  const mediumConfidencePairs = new Set(); // groupRoot -> true if any medium-confidence merge contributed
  const reviewCandidates = [];
  for (const [name, group] of byName) {
    if (group.length < 2) continue;
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const a = group[i], b = group[j];
        const aId = a["owl:sameAs"], bId = b["owl:sameAs"];
        if (uf.find(aId) === uf.find(bId)) continue; // already merged via connectingStation
        const hasCoords = "geo:lat" in a && "geo:lat" in b;
        if (hasCoords) {
          const d = distMeters(a["geo:lat"], a["geo:long"], b["geo:lat"], b["geo:long"]);
          if (d <= PROXIMITY_THRESHOLD_M) {
            uf.union(aId, bId);
            mediumConfidencePairs.add(uf.find(aId));
          } else {
            reviewCandidates.push({
              reason: "same_name_far_apart",
              name_ja: name,
              a: aId,
              b: bId,
              distance_m: Math.round(d),
            });
          }
        } else {
          reviewCandidates.push({
            reason: "same_name_missing_coords",
            name_ja: name,
            a: aId,
            b: bId,
            distance_m: "",
          });
        }
      }
    }
  }

  const groups = uf.groups();

  // Stable ordering: sort groups by (min lat, min lng, first en name) so output is deterministic.
  const enriched = groups.map((memberIds) => {
    const members = memberIds.map((id) => byId.get(id));
    const lats = members.filter((m) => "geo:lat" in m).map((m) => m["geo:lat"]);
    const lngs = members.filter((m) => "geo:long" in m).map((m) => m["geo:long"]);
    return { memberIds, members, lats, lngs };
  });
  enriched.sort((a, b) => {
    const la = a.lats[0] ?? 999, lb = b.lats[0] ?? 999;
    if (la !== lb) return la - lb;
    const lga = a.lngs[0] ?? 999, lgb = b.lngs[0] ?? 999;
    if (lga !== lgb) return lga - lgb;
    return a.members[0]["dc:title"].localeCompare(b.members[0]["dc:title"]);
  });

  const stationRows = [];
  const memberRows = [];
  let counter = 1;
  for (const { memberIds, members } of enriched) {
    const stationId = `st_${String(counter).padStart(5, "0")}`;
    counter++;

    const lats = members.filter((m) => "geo:lat" in m).map((m) => m["geo:lat"]);
    const lngs = members.filter((m) => "geo:long" in m).map((m) => m["geo:long"]);
    const avgLat = lats.length ? lats.reduce((s, v) => s + v, 0) / lats.length : null;
    const avgLng = lngs.length ? lngs.reduce((s, v) => s + v, 0) / lngs.length : null;

    // Pick the majority (mode) name among members, not members[0] — a merged
    // hub can include a minority-named sub-station (e.g. Seibu-Shinjuku's
    // Toei entrance is separately titled "Shinjuku-nishiguchi"), and the
    // group's display name should reflect the dominant identity, not
    // whichever record happened to sort first.
    const jaCounts = new Map();
    for (const m of members) jaCounts.set(m["dc:title"], (jaCounts.get(m["dc:title"]) || 0) + 1);
    const nameJa = [...jaCounts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0];
    const enCounts = new Map();
    for (const m of members) {
      const en = m["odpt:stationTitle"]?.en;
      if (en) enCounts.set(en, (enCounts.get(en) || 0) + 1);
    }
    const nameEn = enCounts.size ? [...enCounts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0] : "";
    const nameSource = enCounts.size ? "odpt" : "romanized";

    const opIds = [...new Set(members.map((m) => m["odpt:operator"]))];
    const opEnNames = [...new Set(opIds.map((id) => opName.get(id) || id))].sort();

    const groupRoot = uf.find(memberIds[0]);
    const confidence = mediumConfidencePairs.has(groupRoot)
      ? "medium"
      : memberIds.length > 1
        ? "high"
        : "single";

    stationRows.push({
      station_id: stationId,
      name: nameEn,
      name_ja: nameJa,
      name_source: nameSource,
      lat: avgLat != null ? avgLat.toFixed(6) : "",
      lng: avgLng != null ? avgLng.toFixed(6) : "",
      pref: guessPrefecture(avgLat, avgLng),
      operators: opEnNames.join(";"),
      merge_confidence: confidence,
      member_count: memberIds.length,
    });

    // Group members-within-this-station by operator to build one row per operator.
    const byOperator = new Map();
    for (const m of members) {
      const opId = m["odpt:operator"];
      if (!byOperator.has(opId)) byOperator.set(opId, []);
      byOperator.get(opId).push(m);
    }
    for (const [opId, ms] of [...byOperator.entries()].sort((a, b) => (opName.get(a[0]) || a[0]).localeCompare(opName.get(b[0]) || b[0]))) {
      const lineNames = [...new Set(ms.map((m) => railwayInfo.get(m["odpt:railway"])?.en).filter(Boolean))].sort();
      memberRows.push({
        station_id: stationId,
        operator: opName.get(opId) || opId,
        operator_station_name_ja: ms[0]["dc:title"],
        odpt_id: ms.map((m) => m["owl:sameAs"]).join(";"),
        line_names: lineNames.join(";"),
      });
    }
  }

  // lines.csv: one row per railway, station_order resolved to our station_id where possible.
  const odptIdToStationId = new Map();
  for (const row of stationRows) {
    // rebuild lookup from memberRows since stationRows doesn't carry odpt ids directly
  }
  const memberOdptToStation = new Map();
  for (const row of memberRows) {
    for (const oid of row.odpt_id.split(";")) memberOdptToStation.set(oid, row.station_id);
  }

  const lineRows = [];
  for (const r of railways) {
    const id = r["owl:sameAs"];
    const info = railwayInfo.get(id);
    let orderedStationIds = [];
    if (info.stationOrder && info.stationOrder.length) {
      orderedStationIds = info.stationOrder
        .slice()
        .sort((a, b) => (a["odpt:index"] ?? 0) - (b["odpt:index"] ?? 0))
        .map((o) => memberOdptToStation.get(o["odpt:station"]))
        .filter(Boolean);
    } else {
      orderedStationIds = stations
        .filter((s) => s["odpt:railway"] === id)
        .map((s) => memberOdptToStation.get(s["owl:sameAs"]))
        .filter(Boolean)
        .sort();
    }
    lineRows.push({
      line_id: id,
      name: info.en,
      name_ja: info.ja,
      operator: opName.get(info.operator) || info.operator,
      station_order: [...new Set(orderedStationIds)].join("|"),
    });
  }
  lineRows.sort((a, b) => a.line_id.localeCompare(b.line_id));

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(
    path.join(OUT_DIR, "stations.csv"),
    toCsv(stationRows, ["station_id", "name", "name_ja", "name_source", "lat", "lng", "pref", "operators", "merge_confidence", "member_count"])
  );
  fs.writeFileSync(
    path.join(OUT_DIR, "station_members.csv"),
    toCsv(memberRows, ["station_id", "operator", "operator_station_name_ja", "odpt_id", "line_names"])
  );
  fs.writeFileSync(
    path.join(OUT_DIR, "lines.csv"),
    toCsv(lineRows, ["line_id", "name", "name_ja", "operator", "station_order"])
  );

  reviewCandidates.sort((a, b) => (a.a + a.b).localeCompare(b.a + b.b));
  fs.writeFileSync(
    path.join(OUT_DIR, "low_confidence_review.csv"),
    toCsv(reviewCandidates, ["reason", "name_ja", "a", "b", "distance_m"])
  );

  // shared/station_ids.csv: minimal join key so other datasets (ridership, future
  // ones) don't need to depend on station-master's full schema, just the ID.
  // Derived, not authoritative — station-master/stations.csv is the source of truth.
  fs.mkdirSync(path.join(ROOT, "shared"), { recursive: true });
  fs.writeFileSync(
    path.join(ROOT, "shared", "station_ids.csv"),
    toCsv(stationRows.map((r) => ({ station_id: r.station_id, name: r.name, name_ja: r.name_ja })), ["station_id", "name", "name_ja"])
  );

  console.log(`stations.csv: ${stationRows.length} physical stations (from ${stations.length} operator-line records)`);
  console.log(`station_members.csv: ${memberRows.length} rows`);
  console.log(`lines.csv: ${lineRows.length} rows`);
  console.log(`low_confidence_review.csv: ${reviewCandidates.length} candidates needing human review`);
  console.log(`medium-confidence merged groups: ${mediumConfidencePairs.size}`);
}

main();

#!/usr/bin/env node
/**
 * Builds station-master/{stations,station_members,lines}.csv.
 *
 * v2 = nationwide. The build is APPEND-ONLY over a frozen v1 base:
 *
 *   output = [ verbatim v1 rows from pipeline/frozen/*.v1.csv ]   (block 1, frozen)
 *          + [ new nationwide rows resolved from N02 ]            (block 2, computed)
 *
 * The 425 published v1 stations (Zenodo DOI, v1.0.0) are emitted BYTE-FOR-BYTE
 * from the immutable snapshot in pipeline/frozen/ — never recomputed — so their
 * station_id and every value are permanently frozen (conventions.md rule #3,
 * machine-checked by validate.mjs). The original ODPT entity-resolution that
 * produced them lives in git history (the pre-v2 commit); pipeline/frozen/ is
 * now their source of truth.
 *
 * Nationwide rows come from MLIT 国土数値情報 N02 (see harvest/n02-harvest.mjs):
 *   1. Cluster N02 records by the operator-authored group code N02_005g
 *      (transfer-hub grouping — analogous to ODPT connectingStation), then a
 *      conservative same-name + <=300 m + same-prefecture pass. Same name across
 *      prefectures or beyond 300 m is NOT merged (误统合 is worse than 误分离).
 *   2. Cross-match each cluster to a v1 station (same normalized name + <=300 m).
 *      A match => the cluster is a duplicate of an already-published station and
 *      is dropped (no new id, no member rows) to avoid double registration; its
 *      lines still resolve onto the v1 station id.
 *   3. Unmatched clusters become new physical stations (ids from max+1),
 *      pinned in pipeline/id-lock.csv so future N02 refreshes stay append-only.
 *
 * English name for a new station: Wikidata (CC0) label matched by normalized
 * name + proximity => name_source="wikidata"; else a machine Hepburn reading
 * (kuromoji, harvest/n02-readings.mjs) => name_source="romanized". Never blank.
 * Prefecture: nearest municipality centroid (reusing the geocode cache) — the
 * Kanto-only bounding-box guess in geo.mjs does not generalize.
 *
 * Deterministic: v1 block is literal bytes; new block is sorted by stable keys;
 * ids are locked. Re-running on the same caches yields byte-identical CSVs.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { UnionFind } from "./lib/union-find.mjs";
import { distMeters, normalizeStationName } from "./lib/geo.mjs";
import { toCsv } from "./lib/csv.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const CACHE = path.join(ROOT, "pipeline", "cache");
const FROZEN = path.join(ROOT, "pipeline", "frozen");
const OUT_DIR = path.join(ROOT, "station-master");
const LOCK_PATH = path.join(ROOT, "pipeline", "id-lock.csv");

const PROXIMITY_THRESHOLD_M = 300; // same as v1
const WIKIDATA_MATCH_M = 2000;     // generous: same normalized name => same reading,
                                   // so a loose radius maximizes coverage safely.

const STATION_COLS = ["station_id", "name", "name_ja", "name_source", "lat", "lng", "pref", "operators", "merge_confidence", "member_count"];
const MEMBER_COLS = ["station_id", "operator", "operator_station_name_ja", "odpt_id", "line_names"];
const LINE_COLS = ["line_id", "name", "name_ja", "operator", "station_order"];

const load = (name) => JSON.parse(fs.readFileSync(path.join(CACHE, `${name}.json`), "utf8"));
const readFrozen = (name) => fs.readFileSync(path.join(FROZEN, name), "utf8");
const prefName = (en) => (en ? en.replace(/-(to|fu|ken)$/i, "") : "");
const pad = (n) => `st_${String(n).padStart(5, "0")}`;

function parseCsv(text) {
  const [head, ...lines] = text.trim().split("\n");
  const headers = head.split(",");
  return lines.filter(Boolean).map((line) => {
    const cells = []; let cur = "", inQ = false;
    for (const c of line) {
      if (c === '"') { inQ = !inQ; continue; }
      if (c === "," && !inQ) { cells.push(cur); cur = ""; continue; }
      cur += c;
    }
    cells.push(cur);
    const row = {}; headers.forEach((h, i) => (row[h] = cells[i])); return row;
  });
}

// New rows serialized as a header-less CSV block, appended to the frozen text.
const appendBlock = (rows, cols) => {
  if (!rows.length) return "";
  const full = toCsv(rows, cols);
  return full.slice(full.indexOf("\n") + 1); // drop the header line, keep trailing \n
};

const mode = (arr) => {
  const c = new Map();
  for (const v of arr) c.set(v, (c.get(v) || 0) + 1);
  return [...c.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0];
};
const avg = (arr) => arr.reduce((s, v) => s + v, 0) / arr.length;

// Wikidata en label -> repo house style: drop trailing "(disambiguation)" and
// " Station", and fold macrons (Ōbaku -> Obaku) to match ODPT's ASCII Hepburn.
function cleanEn(en) {
  return en
    .normalize("NFKD").replace(/[̀-ͯ]/g, "") // strip macrons/diacritics (Ōbaku -> Obaku)
    .replace(/[‐-―−]/g, "-")             // unicode hyphens/dashes -> ASCII '-'
    .replace(/[·・]/g, "-")                    // middle dots (Naruo・... ) -> '-'
    .replace(/[‘’]/g, "'")                    // curly apostrophes -> '
    .replace(/\s*\([^)]*\)\s*$/, "")                    // trailing "(disambiguation)"
    .replace(/\s+Station$/i, "")                        // " Station" suffix
    .trim();
}

function main() {
  // ---------- Block 1: frozen v1 base (verbatim) ----------
  const fStations = readFrozen("stations.v1.csv");
  const fMembers = readFrozen("station_members.v1.csv");
  const fLines = readFrozen("lines.v1.csv");
  const fStationIds = readFrozen("station_ids.v1.csv");

  const v1 = parseCsv(fStations);
  const maxV1Id = Math.max(...v1.map((r) => +r.station_id.slice(3)));
  const v1ByNorm = new Map(); // normalized name -> [{id, lat, lng}] (coord'd stations only)
  for (const s of v1) {
    if (!s.lat || !s.lng) continue;
    const k = normalizeStationName(s.name_ja);
    if (!v1ByNorm.has(k)) v1ByNorm.set(k, []);
    v1ByNorm.get(k).push({ id: s.station_id, lat: +s.lat, lng: +s.lng });
  }

  // ---------- Inputs for the nationwide block ----------
  const n02 = load("n02-stations").records;
  const wd = load("wikidata-stations").records;
  const readings = load("n02-readings").readings;
  const muniGeo = load("municipality-geocode");
  const estatEn = load("estat-hls")._english_names || {};
  const muniPts = Object.entries(muniGeo).filter(([, c]) => c).map(([code, c]) => ({ pref: code.slice(0, 2) + "000", lat: c.lat, lng: c.lng }));

  const prefOf = (lat, lng) => {
    let best = "", bestM = Infinity;
    for (const m of muniPts) {
      const d = distMeters(lat, lng, m.lat, m.lng);
      if (d < bestM) { bestM = d; best = m.pref; }
    }
    return prefName(estatEn[best]);
  };

  // Wikidata name index (by normalized Japanese label).
  const wdByNorm = new Map();
  for (const w of wd) {
    if (!w.en || !w.ja) continue;
    const k = normalizeStationName(w.ja);
    if (!wdByNorm.has(k)) wdByNorm.set(k, []);
    wdByNorm.get(k).push(w);
  }

  // ---------- N02 clustering ----------
  // Pass 1: group by N02_005g. Dedupe records by station code within a group.
  const byGroup = new Map();
  for (const r of n02) {
    if (!byGroup.has(r.group)) byGroup.set(r.group, []);
    byGroup.get(r.group).push(r);
  }
  const groupAgg = new Map();
  for (const [gc, recs] of byGroup) {
    const byCode = new Map();
    for (const r of recs) if (!byCode.has(r.code)) byCode.set(r.code, r);
    const codeRecs = [...byCode.values()];
    const lat = avg(codeRecs.map((r) => r.lat));
    const lng = avg(codeRecs.map((r) => r.lng));
    const nameJa = mode(recs.map((r) => r.name_ja));
    groupAgg.set(gc, { gc, codeRecs, lat, lng, nameJa, norm: normalizeStationName(nameJa), pref: prefOf(lat, lng) });
  }

  // Pass 2: same normalized name + <=300 m + same prefecture (conservative).
  const uf = new UnionFind([...groupAgg.keys()]);
  const byNorm = new Map();
  for (const g of groupAgg.values()) {
    if (!byNorm.has(g.norm)) byNorm.set(g.norm, []);
    byNorm.get(g.norm).push(g);
  }
  const mediumRoots = new Set();
  const reviewCandidates = [];
  for (const [norm, grp] of byNorm) {
    if (grp.length < 2) continue;
    for (let i = 0; i < grp.length; i++) {
      for (let j = i + 1; j < grp.length; j++) {
        const a = grp[i], b = grp[j];
        if (uf.find(a.gc) === uf.find(b.gc)) continue;
        if (a.pref !== b.pref) continue; // different prefecture => never merge (separate stations)
        const d = distMeters(a.lat, a.lng, b.lat, b.lng);
        if (d <= PROXIMITY_THRESHOLD_M) {
          uf.union(a.gc, b.gc);
          mediumRoots.add(uf.find(a.gc));
        } else {
          reviewCandidates.push({ reason: "n02_same_name_same_pref_far_apart", name_ja: norm, a: a.gc, b: b.gc, distance_m: Math.round(d) });
        }
      }
    }
  }

  // Final clusters.
  const clusters = uf.groups().map((gcs) => {
    const parts = gcs.map((gc) => groupAgg.get(gc));
    const codeRecs = parts.flatMap((p) => p.codeRecs);
    const lat = avg(codeRecs.map((r) => r.lat));
    const lng = avg(codeRecs.map((r) => r.lng));
    const nameJa = mode(codeRecs.map((r) => r.name_ja));
    const medium = gcs.some((gc) => mediumRoots.has(uf.find(gc)));
    return { gcs: gcs.slice().sort(), codeRecs, lat, lng, nameJa, norm: normalizeStationName(nameJa), pref: parts[0].pref, medium };
  });

  // ---------- Cross-match to v1 (dedup) ----------
  const groupToStation = new Map(); // N02 group code -> resolved station_id (v1 for dropped, new for kept)
  const kept = [];
  let dropped = 0;
  for (const c of clusters) {
    const cands = v1ByNorm.get(c.norm) || [];
    let hit = null;
    for (const v of cands) if (distMeters(c.lat, c.lng, v.lat, v.lng) <= PROXIMITY_THRESHOLD_M) { hit = v; break; }
    if (hit) {
      dropped++;
      for (const gc of c.gcs) groupToStation.set(gc, hit.id);
    } else {
      kept.push(c);
    }
  }

  // ---------- Id assignment (locked, append-only) ----------
  const lock = new Map(); // key -> station_id
  if (fs.existsSync(LOCK_PATH)) for (const r of parseCsv(fs.readFileSync(LOCK_PATH, "utf8"))) lock.set(r.key, r.station_id);
  for (const c of kept) c.key = "n02:" + c.gcs.join(";");
  const lockedIds = [...lock.values()].map((id) => +id.slice(3));
  let counter = Math.max(maxV1Id, 0, ...lockedIds) + 1;
  const unlocked = kept.filter((c) => !lock.has(c.key));
  unlocked.sort((a, b) => a.lat - b.lat || a.lng - b.lng || a.nameJa.localeCompare(b.nameJa));
  for (const c of unlocked) { const id = pad(counter++); lock.set(c.key, id); }
  for (const c of kept) { c.id = lock.get(c.key); for (const gc of c.gcs) groupToStation.set(gc, c.id); }
  const newIdSet = new Set(kept.map((c) => c.id));

  // ---------- English name ----------
  const stats = { wikidata: 0, romanized: 0, empty: 0 };
  const englishName = (c) => {
    const cands = wdByNorm.get(c.norm) || [];
    let best = null, bestD = Infinity;
    for (const w of cands) { const d = distMeters(c.lat, c.lng, w.lat, w.lng); if (d < bestD) { bestD = d; best = w; } }
    if (best && bestD <= WIKIDATA_MATCH_M) { const n = cleanEn(best.en); if (n) { stats.wikidata++; return { name: n, source: "wikidata" }; } }
    const rom = readings[c.nameJa]?.romaji || "";
    if (rom) { stats.romanized++; return { name: rom, source: "romanized" }; }
    stats.empty++;
    return { name: "", source: "" };
  };

  // ---------- Build new station + member rows ----------
  kept.sort((a, b) => (+a.id.slice(3)) - (+b.id.slice(3)));
  const newStationRows = [];
  const newMemberRows = [];
  const newStationIdRows = [];
  for (const c of kept) {
    const { name, source } = englishName(c);
    const operators = [...new Set(c.codeRecs.map((r) => r.operator_ja))].sort();
    newStationRows.push({
      station_id: c.id,
      name,
      name_ja: c.nameJa,
      name_source: source,
      lat: c.lat.toFixed(6),
      lng: c.lng.toFixed(6),
      pref: c.pref,
      operators: operators.join(";"),
      merge_confidence: c.codeRecs.length > 1 ? (c.medium ? "medium" : "high") : "single",
      member_count: c.codeRecs.length,
    });
    newStationIdRows.push({ station_id: c.id, name, name_ja: c.nameJa });

    const byOp = new Map();
    for (const r of c.codeRecs) { if (!byOp.has(r.operator_ja)) byOp.set(r.operator_ja, []); byOp.get(r.operator_ja).push(r); }
    for (const op of [...byOp.keys()].sort()) {
      const rs = byOp.get(op);
      newMemberRows.push({
        station_id: c.id,
        operator: op,
        operator_station_name_ja: mode(rs.map((r) => r.name_ja)),
        odpt_id: [...new Set(rs.map((r) => "n02:" + r.code))].sort().join(";"),
        line_names: [...new Set(rs.map((r) => r.line_ja))].sort().join(";"),
      });
    }
  }

  // ---------- Build new line rows (N02 lines touching >=1 new station) ----------
  const lineMap = new Map();
  for (const r of n02) {
    const sid = groupToStation.get(r.group);
    if (!sid) continue;
    const key = r.operator_ja + " " + r.line_ja;
    if (!lineMap.has(key)) lineMap.set(key, { operator_ja: r.operator_ja, line_ja: r.line_ja, stations: new Set(), hasNew: false });
    const e = lineMap.get(key);
    e.stations.add(sid);
    if (newIdSet.has(sid)) e.hasNew = true;
  }
  const newLineRows = [];
  for (const e of lineMap.values()) {
    if (!e.hasNew) continue; // purely-Tokyo lines already covered by ODPT (v1)
    newLineRows.push({
      line_id: "n02:" + e.operator_ja + "/" + e.line_ja,
      name: "",
      name_ja: e.line_ja,
      operator: e.operator_ja,
      station_order: [...e.stations].sort().join("|"),
    });
  }
  newLineRows.sort((a, b) => a.line_id.localeCompare(b.line_id));

  // ---------- Emit (frozen block 1 verbatim + new block 2) ----------
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, "stations.csv"), fStations + appendBlock(newStationRows, STATION_COLS));
  fs.writeFileSync(path.join(OUT_DIR, "station_members.csv"), fMembers + appendBlock(newMemberRows, MEMBER_COLS));
  fs.writeFileSync(path.join(OUT_DIR, "lines.csv"), fLines + appendBlock(newLineRows, LINE_COLS));
  fs.writeFileSync(path.join(ROOT, "shared", "station_ids.csv"), fStationIds + appendBlock(newStationIdRows, ["station_id", "name", "name_ja"]));

  reviewCandidates.sort((a, b) => (a.name_ja + a.a + a.b).localeCompare(b.name_ja + b.a + b.b));
  fs.writeFileSync(path.join(OUT_DIR, "low_confidence_review.csv"), toCsv(reviewCandidates, ["reason", "name_ja", "a", "b", "distance_m"]));

  const lockRows = [...lock.entries()].map(([key, station_id]) => ({ station_id, source: key.startsWith("n02:") ? "n02" : "other", key }))
    .sort((a, b) => (+a.station_id.slice(3)) - (+b.station_id.slice(3)));
  fs.writeFileSync(LOCK_PATH, toCsv(lockRows, ["station_id", "source", "key"]));

  const total = v1.length + newStationRows.length;
  console.log(`stations.csv: ${total} physical stations (v1 frozen ${v1.length} + nationwide ${newStationRows.length})`);
  console.log(`  N02 clusters: ${clusters.length} (${dropped} matched a v1 station and were deduped, ${kept.length} new)`);
  console.log(`  english name source of new rows: wikidata ${stats.wikidata}, romanized ${stats.romanized}, blank ${stats.empty}`);
  console.log(`station_members.csv: ${parseCsv(fMembers).length + newMemberRows.length} rows (+${newMemberRows.length})`);
  console.log(`lines.csv: ${parseCsv(fLines).length + newLineRows.length} rows (+${newLineRows.length} N02 lines)`);
  console.log(`low_confidence_review.csv: ${reviewCandidates.length} candidates`);
  console.log(`id-lock.csv: ${lockRows.length} locked nationwide ids`);
}

main();

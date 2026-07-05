#!/usr/bin/env node
/**
 * Builds housing-vacancy/municipalities.csv — the current municipality master
 * that municipality_vacancy.csv and the crosswalk resolve against, and the
 * spine for the (Greater-Tokyo) station bridge.
 *
 * Rows: current leaf municipalities from soumu-current.json (designated cities
 * as their wards; national/prefecture/city-parent rollups dropped).
 * Coordinates: GSI representative point (pipeline/cache/municipality-geocode.json).
 * name (English): e-Stat official English where available, else Hepburn from the
 * official Soumu kana — never romanised from kanji.
 * Station bridge: nearest station in the Japan Station Master by great-circle
 * distance; nearest_station_id/station_distance_km are null when the nearest
 * covered station is > 30 km away. With the nationwide station master (v2) only
 * a handful of remote municipalities (islands, deep mountains) remain null.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { toCsv } from "./lib/csv.mjs";
import { distMeters } from "./lib/geo.mjs";
import { municipalityRomaji } from "./lib/romaji.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const CACHE = path.join(ROOT, "pipeline", "cache");
const OUT_DIR = path.join(ROOT, "housing-vacancy");
const MASTER = path.join(ROOT, "station-master", "stations.csv");

const COLUMNS = ["municipality_code", "name", "name_ja", "name_kana", "pref", "lat", "lng", "nearest_station_id", "station_distance_km"];
const BRIDGE_MAX_KM = 30;

// 北方領土 (Northern Territories, Nemuro subprefecture): administered by Japan but
// inaccessible; GSI has no real point for them, so the geocode is a placeholder that
// lands in mainland Hokkaido (e.g. central Sapporo). Rather than ship false
// coordinates, we null their lat/lng (and therefore the station bridge). See README.
const NORTHERN_TERRITORIES = new Set(["01695", "01696", "01697", "01698", "01699", "01700"]);

const prefName = (en) => (en ? en.replace(/-(to|fu|ken)$/i, "") : "");

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

function main() {
  const current = JSON.parse(fs.readFileSync(path.join(CACHE, "soumu-current.json"), "utf8"))
    .filter((m) => !m.code.endsWith("00")); // leaf municipalities only
  const geo = JSON.parse(fs.readFileSync(path.join(CACHE, "municipality-geocode.json"), "utf8"));
  const enNames = JSON.parse(fs.readFileSync(path.join(CACHE, "estat-hls.json"), "utf8"))._english_names || {};

  // Stations with coordinates, for the nearest-station bridge.
  const stations = parseCsv(fs.readFileSync(MASTER, "utf8"))
    .filter((s) => s.lat && s.lng)
    .map((s) => ({ id: s.station_id, lat: +s.lat, lng: +s.lng }));

  const nearestStation = (lat, lng) => {
    let best = null, bestM = Infinity;
    for (const s of stations) {
      const m = distMeters(lat, lng, s.lat, s.lng);
      if (m < bestM) { bestM = m; best = s; }
    }
    return best ? { id: best.id, km: Math.round(bestM / 100) / 10 } : null;
  };

  const rows = current.map((m) => {
    const coord = NORTHERN_TERRITORIES.has(m.code) ? null : (geo[m.code] || null);
    let stationId = "", stationKm = "";
    if (coord) {
      const n = nearestStation(coord.lat, coord.lng);
      if (n && n.km <= BRIDGE_MAX_KM) { stationId = n.id; stationKm = n.km.toFixed(1); }
    }
    const en = enNames[m.code] || municipalityRomaji(m.kana) || "";
    return {
      municipality_code: m.code,
      name: en,
      name_ja: m.name_ja,
      name_kana: (m.kana || "").normalize("NFKC"), // official Soumu reading, half->full-width katakana
      pref: prefName(enNames[`${m.code.slice(0, 2)}000`]),
      lat: coord ? coord.lat : "",
      lng: coord ? coord.lng : "",
      nearest_station_id: stationId,   // "" => null (no station within 30 km)
      station_distance_km: stationKm,
    };
  }).sort((a, b) => a.municipality_code.localeCompare(b.municipality_code));

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, "municipalities.csv"), toCsv(rows, COLUMNS));

  const noCoord = rows.filter((r) => r.lat === "").length;
  const bridged = rows.filter((r) => r.nearest_station_id).length;
  console.log(`municipalities.csv: ${rows.length} current municipalities`);
  console.log(`  ${noCoord} without coordinates (GSI no-match); ${bridged} bridged to a station within ${BRIDGE_MAX_KM}km, ${rows.length - bridged} null (remote — nearest station > ${BRIDGE_MAX_KM}km)`);
}

main();

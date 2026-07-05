#!/usr/bin/env node
/**
 * Harvests MLIT 国土数値情報 P11 (bus stops, nationwide) and derives, per current
 * municipality, the number of bus stops within 1 km of the municipality's
 * representative point (GSI centroid). Output:
 *   pipeline/cache/p11-busstop-counts.json  = { counts: { <municipality_code>: n } }
 *
 * IMPORTANT — this is a CENTROID-BASED density, not full-municipality coverage:
 * it counts bus-stop poles within 1 km of the town's representative point
 * (roughly, the area around the town hall), NOT every bus stop in the municipality.
 * This is stated in the API response and dataset README so it is not misread as
 * total coverage. It is the transit-access signal the Context API's livability
 * section needs — most relevant exactly for the sparse, shrinking towns this API
 * serves, where "is there a bus near the center of town?" is the live question.
 *
 * P11 ships one GML (XML) per prefecture (no GeoJSON), and its only geometry is
 * bus-stop points, so every <gml:pos> is a stop. We bin stops into a ~1.1 km grid
 * and check each centroid's 3x3 neighbourhood, so the 47-prefecture x 1,901-
 * municipality join stays fast. Deterministic: sorted output, no timestamps —
 * re-running on the same P11 release reproduces byte-identical counts.
 *
 * License: 国土数値情報 利用約款 (CC BY 4.0-compatible). See docs/p11-license-check.md.
 * Requires system `unzip`.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { distMeters } from "../lib/geo.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..", "..");
const CACHE = path.join(ROOT, "pipeline", "cache");
const MUNI = path.join(ROOT, "housing-vacancy", "municipalities.csv");

const P11_VERSION = "P11-22";
const RADIUS_M = 1000;
const CELL = 0.01; // ~1.1 km grid
const zipUrl = (xx) => `https://nlftp.mlit.go.jp/ksj/gml/data/P11/${P11_VERSION}/${P11_VERSION}_${xx}_GML.zip`;
const ATTRIBUTION = "「国土数値情報（バス停留所データ）」（国土交通省）を加工して作成";

function parseCsv(text) {
  const [head, ...lines] = text.trim().split("\n");
  const headers = head.split(",");
  return lines.filter(Boolean).map((line) => {
    const cells = []; let cur = "", q = false;
    for (const c of line) {
      if (c === '"') { q = !q; continue; }
      if (c === "," && !q) { cells.push(cur); cur = ""; continue; }
      cur += c;
    }
    cells.push(cur);
    const row = {}; headers.forEach((h, i) => (row[h] = cells[i])); return row;
  });
}

async function fetchZip(url, dest) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  fs.writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
}

// Extract all bus-stop points [lat, lng] from one prefecture's P11 GML.
function extractPoints(xml) {
  const pts = [];
  const re = /<gml:pos>\s*([-\d.]+)\s+([-\d.]+)\s*<\/gml:pos>/g;
  let m;
  while ((m = re.exec(xml))) pts.push([+m[1], +m[2]]); // P11 gml:pos is "lat lng"
  return pts;
}

async function main() {
  fs.mkdirSync(CACHE, { recursive: true });
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "p11-"));

  // 1. Download + parse all 47 prefectures into a nationwide point list.
  const grid = new Map(); // "gx,gy" -> [[lat,lng],...]
  let total = 0;
  for (let i = 1; i <= 47; i++) {
    const xx = String(i).padStart(2, "0");
    const zip = path.join(tmp, `${xx}.zip`);
    process.stdout.write(`P11 pref ${xx} ... `);
    await fetchZip(zipUrl(xx), zip);
    const xml = execSync(`unzip -p ${JSON.stringify(zip)} ${JSON.stringify(`${P11_VERSION}_${xx}_GML/${P11_VERSION}_${xx}.xml`)}`, { maxBuffer: 1 << 30 }).toString("utf8");
    const pts = extractPoints(xml);
    for (const p of pts) {
      const key = `${Math.floor(p[0] / CELL)},${Math.floor(p[1] / CELL)}`;
      if (!grid.has(key)) grid.set(key, []);
      grid.get(key).push(p);
    }
    total += pts.length;
    fs.rmSync(zip, { force: true });
    console.log(`${pts.length} stops`);
  }
  fs.rmSync(tmp, { recursive: true, force: true });

  // 2. Count stops within RADIUS_M of each municipality centroid (3x3 grid probe).
  const munis = parseCsv(fs.readFileSync(MUNI, "utf8")).filter((m) => m.lat && m.lng);
  const counts = {};
  for (const m of munis) {
    const lat = +m.lat, lng = +m.lng;
    const gx = Math.floor(lat / CELL), gy = Math.floor(lng / CELL);
    let n = 0;
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const bucket = grid.get(`${gx + dx},${gy + dy}`);
        if (!bucket) continue;
        for (const [plat, plng] of bucket) if (distMeters(lat, lng, plat, plng) <= RADIUS_M) n++;
      }
    }
    counts[m.municipality_code] = n;
  }

  const ordered = {};
  for (const k of Object.keys(counts).sort()) ordered[k] = counts[k];
  const out = {
    _meta: {
      source: `MLIT 国土数値情報 ${P11_VERSION} (バス停留所)`,
      source_url: `https://nlftp.mlit.go.jp/ksj/gml/data/P11/${P11_VERSION}/`,
      license: "国土数値情報 利用約款 (CC BY 4.0-compatible)",
      attribution: ATTRIBUTION,
      radius_m: RADIUS_M,
      basis: "count of bus-stop poles within radius of the municipality GSI centroid (representative point) — NOT whole-municipality coverage",
      total_stops_nationwide: total,
      note: "Harvest timestamp intentionally omitted; deterministic re-run reproduces counts.",
    },
    counts: ordered,
  };
  fs.writeFileSync(path.join(CACHE, "p11-busstop-counts.json"), JSON.stringify(out));

  const withBus = Object.values(ordered).filter((n) => n > 0).length;
  console.log(`\np11-busstop-counts.json: ${total.toLocaleString()} stops nationwide; ${munis.length} municipalities scored (${withBus} have >=1 stop within ${RADIUS_M}m of centroid)`);
}

main().catch((e) => { console.error(e); process.exit(1); });

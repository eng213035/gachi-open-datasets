#!/usr/bin/env node
/**
 * Harvests the MLIT 国土数値情報 N02 (rail) nationwide station layer into
 * pipeline/cache/n02-stations.json. This is the second station source (after
 * ODPT) and the one that takes station-master from Greater-Tokyo to nationwide.
 *
 * N02 ships each station as a LineString per platform/line segment (10k+
 * features). We keep one record per feature with a representative point (the
 * midpoint vertex of its LineString) plus the operator-authored group code
 * (N02_005g), which links a station's segments across operators at transfer
 * hubs (verified: Shinjuku's 7 JR/private/subway lines share one group code).
 * The build does the entity resolution; this script only structures the source.
 *
 * Like odpt-harvest, the parsed cache is committed and the build never hits the
 * network. Re-run to refresh. Requires system `unzip` (used to stream a single
 * entry out of the 12 MB archive without a Node zip dependency).
 *
 * License: 国土数値情報 is published free for general use under the standard
 * 国土数値情報 利用約款 (CC BY 4.0-compatible). Attribution is carried into
 * LICENSE-DATA.txt / README; see docs/n02-license-check.md.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = path.join(__dirname, "..", "cache");

const N02_VERSION = "N02-24";
const ZIP_URL = `https://nlftp.mlit.go.jp/ksj/gml/data/N02/${N02_VERSION}/${N02_VERSION}_GML.zip`;
const GEOJSON_ENTRY = `UTF-8/${N02_VERSION}_Station.geojson`;

const ATTRIBUTION = "「国土数値情報（鉄道データ）」（国土交通省）を加工して作成";
const LICENSE = "国土数値情報 利用約款 (CC BY 4.0-compatible); source freely public at https://nlftp.mlit.go.jp/ksj/";

// Midpoint vertex of a (possibly multi-part) coordinate list — a stable
// representative point for a platform LineString.
function midpoint(geometry) {
  const pts = [];
  const walk = (c) => {
    if (typeof c[0] === "number") pts.push(c);
    else for (const x of c) walk(x);
  };
  walk(geometry.coordinates);
  if (!pts.length) return null;
  const [lng, lat] = pts[Math.floor(pts.length / 2)];
  return { lat: +lat.toFixed(6), lng: +lng.toFixed(6) };
}

async function main() {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "n02-"));
  const zipPath = path.join(tmp, "n02.zip");

  process.stdout.write(`downloading ${ZIP_URL} ... `);
  const res = await fetch(ZIP_URL);
  if (!res.ok) throw new Error(`N02 download failed: ${res.status}`);
  fs.writeFileSync(zipPath, Buffer.from(await res.arrayBuffer()));
  console.log(`${(fs.statSync(zipPath).size / 1e6).toFixed(1)} MB`);

  // Stream the single UTF-8 station GeoJSON out of the archive.
  const geojsonText = execSync(`unzip -p ${JSON.stringify(zipPath)} ${JSON.stringify(GEOJSON_ENTRY)}`, {
    maxBuffer: 1 << 30,
  }).toString("utf8");
  const fc = JSON.parse(geojsonText);

  const records = [];
  for (const f of fc.features) {
    const p = f.properties;
    const rep = midpoint(f.geometry);
    if (!rep) continue;
    records.push({
      name_ja: p.N02_005,          // 駅名 (kanji only, no reading, no 駅 suffix)
      line_ja: p.N02_003,          // 路線名
      operator_ja: p.N02_004,      // 運営会社
      code: p.N02_005c,            // 駅コード
      group: p.N02_005g,           // 駅グループコード (transfer-hub grouping)
      rail_class: p.N02_001,       // 鉄道区分
      business_class: p.N02_002,   // 事業者種別
      lat: rep.lat,
      lng: rep.lng,
    });
  }
  // Stable order (by group, code, line) so the committed cache is deterministic.
  records.sort((a, b) =>
    a.group.localeCompare(b.group) || a.code.localeCompare(b.code) || a.line_ja.localeCompare(b.line_ja)
  );

  const out = {
    _meta: {
      source: `MLIT 国土数値情報 ${N02_VERSION} (鉄道 / Station)`,
      source_url: ZIP_URL,
      entry: GEOJSON_ENTRY,
      license: LICENSE,
      attribution: ATTRIBUTION,
      note: "one record per platform LineString; lat/lng is the LineString midpoint vertex. Harvest timestamp intentionally omitted (set by caller when publishing).",
    },
    records,
  };
  fs.writeFileSync(path.join(CACHE_DIR, "n02-stations.json"), JSON.stringify(out));
  fs.rmSync(tmp, { recursive: true, force: true });

  const groups = new Set(records.map((r) => r.group));
  const operators = new Set(records.map((r) => r.operator_ja));
  console.log(`n02-stations.json: ${records.length} records, ${groups.size} group codes, ${operators.size} operators`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

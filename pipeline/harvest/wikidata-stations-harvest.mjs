#!/usr/bin/env node
/**
 * Harvests Japanese railway-station English names + coordinates from Wikidata
 * into pipeline/cache/wikidata-stations.json. This is the authoritative,
 * license-clean (CC0) source of English names for the nationwide N02 stations
 * that ODPT does not cover (ODPT romaji stays the source for the 425 Tokyo
 * stations). The build matches these to N02 clusters by normalized name +
 * coordinate proximity; kuromoji Hepburn is only the fallback for non-matches.
 *
 * Wikidata data is released under CC0 (no attribution required); we credit it
 * anyway in the README. The cache is committed; the build never hits the network.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = path.join(__dirname, "..", "cache");

const ENDPOINT = "https://query.wikidata.org/sparql";
const UA = "gachi-open-datasets/2.0 (https://github.com/eng213035/gachi-open-datasets; eng213035@gmail.com)";
const PAGE = 8000;

// JP railway stations (incl. metro/tram/monorail subclasses) that have a
// coordinate — coordinate is required because we match by proximity.
const queryPage = (limit, offset) => `
SELECT ?s ?en ?ja ?coord WHERE {
  ?s wdt:P31/wdt:P279* wd:Q55488 .
  ?s wdt:P17 wd:Q17 .
  ?s wdt:P625 ?coord .
  OPTIONAL { ?s rdfs:label ?en FILTER(LANG(?en)="en") }
  OPTIONAL { ?s rdfs:label ?ja FILTER(LANG(?ja)="ja") }
}
ORDER BY ?s
LIMIT ${limit} OFFSET ${offset}`;

async function runPage(limit, offset) {
  const url = `${ENDPOINT}?query=${encodeURIComponent(queryPage(limit, offset))}&format=json`;
  for (let attempt = 1; attempt <= 4; attempt++) {
    const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/sparql-results+json" } });
    if (res.ok) return (await res.json()).results.bindings;
    if (res.status === 429 || res.status >= 500) {
      const wait = 2000 * attempt;
      console.log(`  page @${offset} got ${res.status}, retry in ${wait}ms`);
      await new Promise((r) => setTimeout(r, wait));
      continue;
    }
    throw new Error(`SPARQL page @${offset} failed: ${res.status}`);
  }
  throw new Error(`SPARQL page @${offset} failed after retries`);
}

function parsePoint(wkt) {
  // "Point(139.700 35.690)" -> {lng, lat}
  const m = /Point\(([-\d.]+)\s+([-\d.]+)\)/.exec(wkt || "");
  return m ? { lng: +m[1], lat: +m[2] } : null;
}

async function main() {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  const seen = new Map(); // qid -> row (dedupe: an item can repeat if it had >1 coord)
  for (let offset = 0; ; offset += PAGE) {
    process.stdout.write(`fetching Wikidata stations @offset ${offset} ... `);
    const rows = await runPage(PAGE, offset);
    console.log(`${rows.length}`);
    for (const b of rows) {
      const qid = b.s.value.replace("http://www.wikidata.org/entity/", "");
      if (seen.has(qid)) continue;
      const pt = parsePoint(b.coord?.value);
      if (!pt) continue;
      seen.set(qid, {
        qid,
        en: b.en?.value || "",
        ja: b.ja?.value || "",
        lat: +pt.lat.toFixed(6),
        lng: +pt.lng.toFixed(6),
      });
    }
    if (rows.length < PAGE) break;
  }

  const records = [...seen.values()]
    .filter((r) => r.en || r.ja)
    .sort((a, b) => a.qid.localeCompare(b.qid));

  const withEn = records.filter((r) => r.en).length;
  const out = {
    _meta: {
      source: "Wikidata (query.wikidata.org SPARQL); JP railway stations (wdt:P31/wdt:P279* wd:Q55488, P17=Q17) with coordinates",
      license: "CC0 1.0 (public domain dedication)",
      note: "en/ja are rdfs:label; coordinate is P625. Harvest timestamp intentionally omitted.",
    },
    records,
  };
  fs.writeFileSync(path.join(CACHE_DIR, "wikidata-stations.json"), JSON.stringify(out));
  console.log(`wikidata-stations.json: ${records.length} stations (${withEn} with English label)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

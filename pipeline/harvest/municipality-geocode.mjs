#!/usr/bin/env node
/**
 * Geocodes each current leaf municipality (from soumu-current.json) to a
 * representative point using the GSI (Geospatial Information Authority of Japan)
 * official address-search API — keyless, authoritative. Results cache to
 * pipeline/cache/municipality-geocode.json so the build is reproducible and the
 * run is resumable (already-cached codes are skipped).
 *
 * The returned point is GSI's best address match (municipality office / centroid-
 * ish), not a polygon centroid — good enough for the nearest-station bridge and
 * for Stage-2 tile lookups; documented as a representative point in the README.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CACHE = path.join(__dirname, "..", "cache");
const OUT = path.join(CACHE, "municipality-geocode.json");
const GSI = "https://msearch.gsi.go.jp/address-search/AddressSearch";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const isLeaf = (code) => !code.endsWith("00"); // drop prefecture & designated-city-parent totals

async function geocode(query, attempt = 1) {
  try {
    const res = await fetch(`${GSI}?q=${encodeURIComponent(query)}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const arr = await res.json();
    if (!Array.isArray(arr) || !arr.length) return null;
    const [lng, lat] = arr[0].geometry.coordinates;
    return { lat: Math.round(lat * 1e6) / 1e6, lng: Math.round(lng * 1e6) / 1e6 };
  } catch (e) {
    if (attempt < 4) { await sleep(attempt * 1000); return geocode(query, attempt + 1); }
    return null;
  }
}

async function main() {
  const current = JSON.parse(fs.readFileSync(path.join(CACHE, "soumu-current.json"), "utf8"));
  const cache = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, "utf8")) : {};
  const leaves = current.filter((c) => isLeaf(c.code));

  let done = 0, hit = 0, miss = 0, since = 0;
  for (const m of leaves) {
    if (cache[m.code]) { done++; continue; }
    // name_ja already includes the parent city for designated-city wards
    // (e.g. 札幌市中央区), so pref + name resolves unambiguously.
    const coord = await geocode(`${m.pref_ja}${m.name_ja}`);
    cache[m.code] = coord; // null is cached too (do not retry a genuine no-match every run)
    coord ? hit++ : miss++;
    done++; since++;
    if (since >= 50) {
      // Stable, sorted write so the cache diff stays clean and the run is resumable.
      const sorted = Object.fromEntries(Object.keys(cache).sort().map((k) => [k, cache[k]]));
      fs.writeFileSync(OUT, JSON.stringify(sorted, null, 0) + "\n");
      since = 0;
      process.stdout.write(`  ${done}/${leaves.length} (hit ${hit}, miss ${miss})\r`);
    }
    await sleep(120);
  }
  const sorted = Object.fromEntries(Object.keys(cache).sort().map((k) => [k, cache[k]]));
  fs.writeFileSync(OUT, JSON.stringify(sorted, null, 0) + "\n");
  const nullCount = Object.values(cache).filter((v) => !v).length;
  console.log(`\nmunicipality-geocode.json: ${leaves.length} leaf municipalities, ${Object.keys(cache).length} cached, ${nullCount} unresolved`);
}

main().catch((e) => { console.error(e); process.exit(1); });

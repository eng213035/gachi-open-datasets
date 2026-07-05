#!/usr/bin/env node
/**
 * Harvests raw ODPT data (Station / Operator / Railway / PassengerSurvey)
 * into pipeline/cache/*.json. Re-run any time to refresh; build scripts
 * always read from cache, never hit the network directly.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = path.join(__dirname, "..", "cache");

const TOKEN = process.env.ODPT_TOKEN;
if (!TOKEN) {
  console.error("ODPT_TOKEN env var is required (source ~/gachi-mcp-run/secrets/odpt-env)");
  process.exit(1);
}

const ENDPOINTS = {
  stations: "odpt:Station",
  operators: "odpt:Operator",
  railways: "odpt:Railway",
  passengerSurveys: "odpt:PassengerSurvey",
};

async function fetchAll(typeName) {
  const url = `https://api.odpt.org/api/v4/${typeName}?acl:consumerKey=${TOKEN}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${typeName} fetch failed: ${res.status}`);
  return res.json();
}

async function main() {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  for (const [file, typeName] of Object.entries(ENDPOINTS)) {
    process.stdout.write(`fetching ${typeName} ... `);
    const data = await fetchAll(typeName);
    fs.writeFileSync(path.join(CACHE_DIR, `${file}.json`), JSON.stringify(data));
    console.log(`${data.length} records`);
  }
  fs.writeFileSync(
    path.join(CACHE_DIR, "harvest-meta.json"),
    JSON.stringify({ harvested_note: "timestamp intentionally omitted from repo; set by caller when publishing" }, null, 2)
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

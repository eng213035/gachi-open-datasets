#!/usr/bin/env node
/**
 * Machine Hepburn readings for N02 station names, used ONLY as the fallback for
 * stations that do not get an English name from Wikidata (see
 * wikidata-stations-harvest.mjs). Output: pipeline/cache/n02-readings.json,
 * a { name_ja -> { kana, romaji } } map over the unique N02 station names.
 *
 * kuromoji (IPADIC) gives a katakana reading per token; we concatenate the
 * tokens and route the result through the existing kanaToRomaji (romaji.mjs) so
 * the Hepburn rules (long-vowel shortening, sokuon, youon) match the rest of the
 * repo. Place-name readings from a general dictionary are imperfect — that is
 * exactly why these are flagged name_source="romanized" and only used when no
 * authoritative reading exists. Doing this in a harvest step (not the build)
 * keeps the build cache-only and byte-reproducible (conventions rule #7).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { kanaToRomaji } from "../lib/romaji.mjs";

const require = createRequire(import.meta.url);
const kuromoji = require("kuromoji");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = path.join(__dirname, "..", "cache");
const DIC_PATH = path.join(__dirname, "..", "..", "node_modules", "kuromoji", "dict");

const isKatakana = (s) => /^[゠-ヿーー]+$/.test(s);
const cap = (w) => (w ? w[0].toUpperCase() + w.slice(1) : w);

function buildTokenizer() {
  return new Promise((resolve, reject) => {
    kuromoji.builder({ dicPath: DIC_PATH }).build((err, tok) => (err ? reject(err) : resolve(tok)));
  });
}

function readingKatakana(tokenizer, name) {
  const tokens = tokenizer.tokenize(name);
  let kana = "";
  for (const t of tokens) {
    // token.reading is katakana; "*" or undefined for unknown tokens.
    const r = t.reading && t.reading !== "*" ? t.reading : (isKatakana(t.surface_form) ? t.surface_form : "");
    kana += r;
  }
  return kana;
}

async function main() {
  const n02 = JSON.parse(fs.readFileSync(path.join(CACHE_DIR, "n02-stations.json"), "utf8")).records;
  const names = [...new Set(n02.map((r) => r.name_ja))].sort();

  const tokenizer = await buildTokenizer();
  const out = {};
  let romanized = 0, empty = 0;
  for (const name of names) {
    const kana = readingKatakana(tokenizer, name);
    const romaji = cap(kanaToRomaji(kana));
    out[name] = { kana, romaji };
    if (romaji) romanized++; else empty++;
  }

  const payload = {
    _meta: {
      source: "kuromoji 0.1.2 (IPADIC) reading -> kanaToRomaji (pipeline/lib/romaji.mjs)",
      note: "Fallback only. Machine transliteration of kanji station names; not an authoritative reading. Used when Wikidata has no match (name_source=romanized).",
    },
    readings: out,
  };
  fs.writeFileSync(path.join(CACHE_DIR, "n02-readings.json"), JSON.stringify(payload));
  console.log(`n02-readings.json: ${names.length} unique names (${romanized} romanized, ${empty} empty)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

#!/usr/bin/env node
/**
 * Harvests the Ministry of Internal Affairs and Communications (総務省) official
 * local-government code data into pipeline/cache/:
 *
 *   soumu-current.json  — current 全国地方公共団体コード (code + kanji + kana),
 *                         the authoritative current municipality master and the
 *                         only sanctioned source of readings for romanisation.
 *   muni-mergers.json   — the 改正一覧表 (code revisions since 2005-04-01):
 *                         dissolved municipalities and, where the table's
 *                         structure allows, their 新設 successor.
 *
 * Provenance: the two .xlsx are cached verbatim under pipeline/cache/soumu/.
 * Successor linkage: 新設 (new-establishment) mergers list the dissolved
 * municipalities as 欠番/削除 rows immediately followed by the new municipality's
 * 新設 row, all sharing an effective date and prefecture. We link dissolved
 * olds to the 新設 that shares their (prefecture, effective-date). 編入 (absorption
 * into an existing municipality) leaves no 新設 row, so those olds get no
 * successor here (new_code:null) and are resolved downstream as low-confidence.
 *
 * NOTE: this table starts 2005-04-01, so the bulk of the 2004–2005 平成大合併
 * wave predates it. Pre-2005 dissolutions therefore surface only via the
 * empirical cross-check in build-crosswalk.mjs, not from this file.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readXlsx } from "./../lib/xlsx.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CACHE = path.join(__dirname, "..", "cache");
const SOUMU = path.join(CACHE, "soumu");
const CURRENT_XLSX = path.join(SOUMU, "current_codes.xlsx");
const REVISIONS_XLSX = path.join(SOUMU, "revisions.xlsx");

const CURRENT_URL = "https://www.soumu.go.jp/main_content/000925835.xlsx";
const REVISIONS_URL = "https://www.soumu.go.jp/main_content/000875488.xlsx";

async function ensure(file, url) {
  if (fs.existsSync(file)) return;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download ${url} -> HTTP ${res.status}`);
  fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
}

// Some cells carry the kanji value with its ruby appended (e.g. "上磯町かみいそちょう"
// in a single shared string). Callers use dedicated furigana columns, but names
// can still get a trailing kana annotation — strip a trailing run of kana.
const stripRuby = (s) => (s || "").replace(/[぀-ヿㇰ-ㇿ]+$/u, "").trim();
const code5 = (c) => (c && /^\d{6}$/.test(c) ? c.slice(0, 5) : (c && /^\d{5}$/.test(c) ? c : null));

// "R6.1.1" / "H17.4.1" / "S..." Japanese era date, or an Excel serial number.
function parseDate(raw) {
  const s = (raw || "").trim();
  if (!s) return null;
  const era = s.match(/^([RHS])(\d+)\.(\d+)\.(\d+)$/);
  if (era) {
    const base = { R: 2018, H: 1988, S: 1925 }[era[1]];
    const y = base + Number(era[2]);
    return `${y}-${String(era[3]).padStart(2, "0")}-${String(era[4]).padStart(2, "0")}`;
  }
  if (/^\d+$/.test(s)) {
    // Excel serial date (1900 date system; day 0 = 1899-12-30).
    const ms = (Number(s) - 25569) * 86400000;
    return new Date(ms).toISOString().slice(0, 10);
  }
  return null;
}

function parseCurrent() {
  const { sheets } = readXlsx(CURRENT_XLSX);
  const out = new Map(); // code5 -> {code, pref_ja, name_ja, kana}
  for (const rows of sheets) {
    for (const r of rows.slice(1)) {
      const code = code5(r[0]);
      // Some source rows (e.g. designated-city wards, newly-created cities) carry the
      // reading appended to the name cell ("色丹村シコタンムラ", "相模原市サガミハラシ").
      // Strip the trailing kana ruby; the authoritative reading is kept in `kana`.
      const nameJa = stripRuby((r[2] || "").trim());
      if (!code || !nameJa) continue; // skip prefecture-only rows (empty municipality name)
      out.set(code, { code, pref_ja: (r[1] || "").trim(), name_ja: nameJa, kana: (r[4] || "").trim() });
    }
  }
  return [...out.values()].sort((a, b) => a.code.localeCompare(b.code));
}

function parseRevisions() {
  const { sheets } = readXlsx(REVISIONS_XLSX);
  const rows = sheets[0];
  // Fill down ditto ("〃") for effective date and prefecture so grouped rows carry them.
  let lastDate = null, lastPref = null;
  const events = []; // {kind:'old'|'new', code, name, kana, pref, date}
  for (const r of rows.slice(4)) {
    const kubun = (r[8] || "").trim();
    let dateCell = (r[13] || "").trim();
    if (dateCell === "〃") dateCell = lastDate; else if (dateCell) lastDate = dateCell;
    let pref = stripRuby(r[4]);
    if (!pref) pref = lastPref; else lastPref = pref;
    const date = parseDate(dateCell);

    if (kubun.startsWith("欠番")) {
      const c = code5(r[5]);
      if (c) events.push({ kind: "old", code: c, name: stripRuby(r[6]), kana: (r[7] || "").trim(), pref, date });
    } else if (kubun.startsWith("新設")) {
      const c = code5(r[9]);
      if (c) events.push({ kind: "new", code: c, name: stripRuby(r[10]), kana: (r[11] || "").trim(), pref, date });
    }
  }

  // Link dissolved olds to the 新設 sharing their (prefecture, effective date).
  const newsByKey = new Map();
  for (const e of events) if (e.kind === "new" && e.date) newsByKey.set(`${e.pref}|${e.date}`, e);

  const records = [];
  for (const e of events) {
    if (e.kind !== "old") continue;
    const succ = e.date ? newsByKey.get(`${e.pref}|${e.date}`) : null;
    records.push({
      old_code: e.code, old_name: e.name, old_kana: e.kana,
      new_code: succ ? succ.code : null,
      new_name: succ ? succ.name : null,
      new_kana: succ ? succ.kana : null,
      merged_year: e.date ? Number(e.date.slice(0, 4)) : null,
      effective_date: e.date,
      pref_ja: e.pref,
      source: "Soumu 全国地方公共団体コード改正一覧表 (2005-04-01 onward)",
    });
  }
  // Also expose the 新設 municipalities' readings (helps romanise successors).
  const news = events.filter((e) => e.kind === "new")
    .map((e) => ({ code: e.code, name: e.name, kana: e.kana, pref_ja: e.pref, established: e.date }));
  return { records, news };
}

async function main() {
  await ensure(CURRENT_XLSX, CURRENT_URL);
  await ensure(REVISIONS_XLSX, REVISIONS_URL);

  const current = parseCurrent();
  const { records, news } = parseRevisions();

  fs.writeFileSync(path.join(CACHE, "soumu-current.json"),
    JSON.stringify(current, null, 0) + "\n");
  const linked = records.filter((r) => r.new_code).length;
  fs.writeFileSync(path.join(CACHE, "muni-mergers.json"),
    JSON.stringify({ records: records.sort((a, b) => a.old_code.localeCompare(b.old_code)),
                     news: news.sort((a, b) => a.code.localeCompare(b.code)) }, null, 0) + "\n");

  console.log(`soumu-current.json: ${current.length} current municipalities (incl. designated-city wards)`);
  console.log(`muni-mergers.json: ${records.length} dissolved-code records, ${linked} linked to a 新設 successor, ${records.length - linked} unlinked (編入 / needs cross-check)`);
}

main().catch((e) => { console.error(e); process.exit(1); });

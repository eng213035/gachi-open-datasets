// Minimal read-only .xlsx reader: no external deps, uses the system `unzip` to
// extract the shared-strings table and each worksheet's XML, then parses cells.
// Sufficient for the flat government code/merger spreadsheets this pipeline reads
// (plain cells, shared strings, inline strings). Not a general xlsx implementation.
import { execSync } from "node:child_process";

const decodeEntities = (s) =>
  s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
   .replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
   .replace(/&amp;/g, "&");

// Concatenate every <t>…</t> inside a shared-string <si> (handles rich-text runs).
const siText = (si) =>
  decodeEntities((si.match(/<t[^>]*>([\s\S]*?)<\/t>/g) || [])
    .map((m) => m.replace(/^<t[^>]*>/, "").replace(/<\/t>$/, "")).join(""));

// "B12" -> zero-based column index 1.
function colIndex(ref) {
  const letters = ref.match(/^[A-Z]+/)[0];
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

function readEntry(path, entry) {
  return execSync(`unzip -p ${JSON.stringify(path)} ${JSON.stringify(entry)}`, { maxBuffer: 2e8 }).toString();
}

// Returns { sheets: [ rows ] }, where each row is an array of string|null cells.
export function readXlsx(path) {
  let shared = [];
  try {
    const ss = readEntry(path, "xl/sharedStrings.xml");
    shared = (ss.match(/<si>[\s\S]*?<\/si>/g) || []).map(siText);
  } catch { /* a sheet may have no shared strings */ }

  // Discover worksheet parts in order (sheet1.xml, sheet2.xml, …).
  const list = execSync(`unzip -Z1 ${JSON.stringify(path)}`, { maxBuffer: 2e8 }).toString();
  const sheetParts = (list.match(/xl\/worksheets\/sheet\d+\.xml/g) || [])
    .filter((v, i, a) => a.indexOf(v) === i)
    .sort((a, b) => (+a.match(/\d+/)[0]) - (+b.match(/\d+/)[0]));

  const sheets = [];
  for (const part of sheetParts) {
    const xml = readEntry(path, part);
    const rows = [];
    for (const rowXml of xml.match(/<row[\s\S]*?<\/row>/g) || []) {
      const cells = [];
      for (const cm of rowXml.match(/<c\b[^>]*?(?:\/>|>[\s\S]*?<\/c>)/g) || []) {
        const ref = (cm.match(/\br="([A-Z]+\d+)"/) || [])[1];
        if (!ref) continue;
        const idx = colIndex(ref);
        const t = (cm.match(/\bt="([^"]+)"/) || [])[1];
        let val = null;
        const vm = cm.match(/<v>([\s\S]*?)<\/v>/);
        if (t === "s" && vm) val = shared[+vm[1]] ?? null;
        else if (t === "inlineStr") { const im = cm.match(/<t[^>]*>([\s\S]*?)<\/t>/); val = im ? decodeEntities(im[1]) : null; }
        else if (vm) val = decodeEntities(vm[1]);
        cells[idx] = val;
      }
      rows.push(cells);
    }
    sheets.push(rows);
  }
  return { sheets };
}

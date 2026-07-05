// Kana -> Hepburn romaji, for romanising municipality names from the official
// Soumu kana (furigana) readings ONLY. We never romanise from kanji: place-name
// readings are irregular, so a reading is only ever taken from an authoritative
// furigana source. Long vowels are written short (Tokyo, not Tōkyō/Toukyou),
// matching how e-Stat/passport Hepburn renders Japanese place names.

const BASE = {
  ア:"a",イ:"i",ウ:"u",エ:"e",オ:"o",
  カ:"ka",キ:"ki",ク:"ku",ケ:"ke",コ:"ko",
  ガ:"ga",ギ:"gi",グ:"gu",ゲ:"ge",ゴ:"go",
  サ:"sa",シ:"shi",ス:"su",セ:"se",ソ:"so",
  ザ:"za",ジ:"ji",ズ:"zu",ゼ:"ze",ゾ:"zo",
  タ:"ta",チ:"chi",ツ:"tsu",テ:"te",ト:"to",
  ダ:"da",ヂ:"ji",ヅ:"zu",デ:"de",ド:"do",
  ナ:"na",ニ:"ni",ヌ:"nu",ネ:"ne",ノ:"no",
  ハ:"ha",ヒ:"hi",フ:"fu",ヘ:"he",ホ:"ho",
  バ:"ba",ビ:"bi",ブ:"bu",ベ:"be",ボ:"bo",
  パ:"pa",ピ:"pi",プ:"pu",ペ:"pe",ポ:"po",
  マ:"ma",ミ:"mi",ム:"mu",メ:"me",モ:"mo",
  ヤ:"ya",ユ:"yu",ヨ:"yo",
  ラ:"ra",リ:"ri",ル:"ru",レ:"re",ロ:"ro",
  ワ:"wa",ヰ:"i",ヱ:"e",ヲ:"o",ン:"n",ヴ:"vu",
};
// Youon: consonant stem for the i-row kana that can take small ya/yu/yo.
const YOUON = {
  キ:"ky",ギ:"gy",シ:"sh",ジ:"j",チ:"ch",ニ:"ny",ヒ:"hy",
  ビ:"by",ピ:"py",ミ:"my",リ:"ry",
};
const SMALL_Y = { ャ:"a", ュ:"u", ョ:"o" };

// Normalise: NFKC folds half-width katakana (ｻ) to full-width (サ); convert any
// hiragana to katakana so one table covers both furigana styles.
function toKatakana(s) {
  const nfkc = (s || "").normalize("NFKC");
  let out = "";
  for (const ch of nfkc) {
    const c = ch.codePointAt(0);
    out += (c >= 0x3041 && c <= 0x3096) ? String.fromCodePoint(c + 0x60) : ch;
  }
  return out;
}

export function kanaToRomaji(kana) {
  const s = toKatakana(kana);
  const seg = [];
  for (let i = 0; i < s.length; i++) {
    const ch = s[i], next = s[i + 1];
    if (ch === "ッ") { seg.push("__SOKUON__"); continue; }
    if (ch === "ー") { seg.push("__LONG__"); continue; }
    if (YOUON[ch] && SMALL_Y[next]) { seg.push(YOUON[ch] + SMALL_Y[next]); i++; continue; }
    if (BASE[ch] != null) { seg.push(BASE[ch]); continue; }
    if (SMALL_Y[next] === undefined && "ァィゥェォ".includes(ch)) { seg.push({ ァ:"a",ィ:"i",ゥ:"u",ェ:"e",ォ:"o" }[ch]); continue; }
    // Unknown char (rare): keep nothing rather than invent a reading.
  }
  // Resolve sokuon (double next consonant; ch -> tch) and long marks (drop).
  let out = "";
  for (let i = 0; i < seg.length; i++) {
    if (seg[i] === "__LONG__") continue;
    if (seg[i] === "__SOKUON__") {
      const nx = seg.find((x, j) => j > i && x !== "__LONG__" && x !== "__SOKUON__");
      if (nx) out += nx.startsWith("ch") ? "t" : nx[0];
      continue;
    }
    out += seg[i];
  }
  // Long-vowel shortening (place-name convention): ou/oo -> o, uu -> u.
  out = out.replace(/ou/g, "o").replace(/oo/g, "o").replace(/uu/g, "u");
  return out;
}

// Municipality suffixes as they appear romanised at the end of a reading.
const SUFFIX = ["shi", "ku", "cho", "machi", "mura", "son", "gun", "to", "fu", "ken"];
const cap = (w) => (w ? w[0].toUpperCase() + w.slice(1) : w);

// Full municipality name: "Sapporo-shi", "Kamiiso-cho", "Chuo-ku".
export function municipalityRomaji(kana) {
  const r = kanaToRomaji(kana);
  if (!r) return "";
  for (const suf of SUFFIX) {
    if (r.length > suf.length && r.endsWith(suf)) {
      return `${cap(r.slice(0, -suf.length))}-${suf}`;
    }
  }
  return cap(r);
}

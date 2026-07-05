# Japan Municipality Housing Vacancy 2003–2023

Japan has ~9 million vacant homes — but **which towns?** This is the first
English, citable, **municipality-level** vacancy dataset built from Japan's
Housing and Land Survey (住宅・土地統計調査), covering **2003–2023 (five national
surveys)**, joined to the [Japan Station Master](../station-master) so vacancy
can be read next to station ridership decline.

Watch a resort town and a shrinking coastal city diverge: central Tokyo's
**Shinjuku-ku** absorbs its vacancies (rate 13.3% → 11.2% over the two decades,
its *neglected* vacancies falling to almost nothing), while **Tosashimizu-shi**
in Kochi climbs 18.9% → 39.5%, its neglected-vacant homes more than doubling.

## Files

| File | Grain | Rows |
|---|---|---|
| `municipality_vacancy.csv` | one municipality × one survey year | 6,388 |
| `municipalities.csv` | one current municipality (the join spine) | 1,901 |
| `municipality_crosswalk.csv` | one pre→post merger pair (high confidence) | 80 |
| `low_confidence_review.csv` | dissolutions needing human confirmation | 561 |

### `municipality_vacancy.csv`

| column | meaning |
|---|---|
| `municipality_code` | 5-digit 全国地方公共団体コード, **as of that survey year** (never back-ported) |
| `name` | English name (see *Names* below) |
| `name_ja` | Japanese name as published that year |
| `name_source` | `estat-en` (official), `somucho-kana` (romanised from official kana), or `ja` (Japanese only) |
| `pref` | prefecture (English) |
| `year` | survey year (2003 / 2008 / 2013 / 2018 / 2023) |
| `total_dwellings` | 総住宅数 — official published count |
| `vacant_total` | 空き家（総数）— official published count |
| `vacant_other` | その他の住宅 — the "neglected vacancy" series the media cites (official count) |
| `vacancy_rate` | **computed** `vacant_total / total_dwellings × 100`, 1 dp |
| `rate_source` | always `computed (vacant_total/total_dwellings)` where a rate is present |
| `source` | `Housing and Land Survey (Statistics Bureau of Japan)` |

The three counts are **official values, verbatim**. `vacancy_rate` is the one
derived column: e-Stat does **not** publish a vacancy rate at municipality level,
so it is computed from the two published counts using the standard 空き家率
definition and flagged in `rate_source`. It is left blank where a count is
statistically suppressed.

### `municipalities.csv`

Current (post-merger) municipality master — the spine that
`municipality_vacancy.csv` and the crosswalk resolve against. Columns:
`municipality_code, name, name_ja, name_kana, pref, lat, lng,
nearest_station_id, station_distance_km`. `name_kana` is the official Soumu
reading (katakana) — the sanctioned source for the English romanisation.
Coordinates are a GSI representative point (see *Sources*).

**Northern Territories.** The six Nemuro-subprefecture villages (色丹村,
泊村, 留夜別村, 留別村, 紗那村, 蘂取村; codes 01695–01700) are administered by
Japan but inaccessible, so GSI has no real point for them; their `lat`/`lng`
(and station bridge) are left **null** rather than shipping the placeholder
mainland-Hokkaido coordinate the geocoder returns. They have no vacancy survey.

**Station bridge coverage: nationwide (Japan Station Master v2, 9,145 stations).**
`nearest_station_id` / `station_distance_km` are computed from the Japan Station
Master; municipalities whose nearest station is **more than 30 km away carry
`nearest_station_id = null`** (**1,805 municipalities are bridged; 96 remain
null** — remote islands and deep-mountain towns with no rail within 30 km). With
the v1 Greater-Tokyo-only master this was 207 bridged / 1,694 null; the v2
nationwide master closed almost all of that gap.

### `municipality_crosswalk.csv` + `low_confidence_review.csv`

Municipality codes change when towns merge (the 平成大合併). Rather than force a
continuous time series, this dataset keeps every year's values under its
**as-of-year code** and ships a crosswalk so you can join across mergers yourself.

- `municipality_crosswalk.csv` — **80 high-confidence** `old → new` pairs, each
  confirmed by *both* the official Soumu 改正一覧表 (a linked 新設 successor) *and*
  the vacancy data (the old code appears in an earlier survey and is not a current
  municipality). Columns: `old_code, old_name, old_name_ja, new_code, new_name,
  new_name_ja, merged_year, confidence, source`.
- `low_confidence_review.csv` — **561 rows** flagged for human confirmation, because
  they appear on only one side of that cross-check:
  - 217 — dissolved in the vacancy data but no entry in the official table (the
    2004–2005 平成大合併 wave predates the table's 2005-04-01 start; successor needs
    the 総務省 平成合併 archive);
  - 200 — official 欠番 records with no linkable 新設 successor (編入 / absorption);
  - 134 — official records not seen dissolving in the vacancy data;
  - 7 — present in the 2023 survey but not yet in the current Soumu master (code
    reconciliation);
  - 3 — successor became a designated city and is represented as its wards here
    (e.g. Niigata 15201 → 15100).

## Coverage & caveats (read before citing)

- **Sample survey.** The Housing and Land Survey is a sample survey. Small
  municipalities are not tabulated separately every year, so this is **not** every
  Japanese municipality. Municipalities present per survey year:

  | 2003 | 2008 | 2013 | 2018 | 2023 |
  |---|---|---|---|---|
  | 1,362 | 1,300 | 1,271 | 1,241 | 1,214 |

  (1,653 distinct municipalities across all years; the sum of listed
  municipalities holds ~96–97% of national dwellings, the remainder being small
  towns the survey does not break out.)
- **Designated cities appear as their wards**, not a single city row (matching how
  e-Stat tabulates them); national and prefecture rollups are excluded.
- **No municipality-level table exists for 1998** (the survey's finest 1998 unit is
  市部 + 大都市の区 + larger towns), so the municipality series begins in 2003.
- **2023 series rename.** In 2023 e-Stat renamed その他の住宅 to
  「賃貸・売却用及び二次的住宅を除く空き家」. It is the **same series** (the
  neglected-vacancy figure); `vacant_other` is continuous across years despite the
  label change.
- **Names.** English names are e-Stat's official romanisation where available
  (1,214 current municipalities). Municipalities dissolved before 2023 are absent
  from that source, so **222** are romanised (Hepburn) from the official Soumu kana
  readings (`name_source = somucho-kana`) and **217** remain Japanese-only
  (`name_source = ja`) — their readings are not in the machine-readable official
  sources we use, and we never romanise from kanji (place-name readings are
  irregular).

## Cite as

> gachi-tokusuru (2026). *Japan Municipality Housing Vacancy 2003–2023* [Data set].
> Derived from the Housing and Land Survey (Statistics Bureau of Japan) via e-Stat.

## License

- **Data**: CC BY 4.0. See [`LICENSE-DATA.txt`](LICENSE-DATA.txt) for the required
  source attribution (e-Stat / Statistics Bureau of Japan; 総務省 全国地方公共団体
  コード; GSI). Accuracy and completeness are not guaranteed; this is a derived work
  and not an official government product.
- **Pipeline code**: MIT (see `../LICENSE`).

## How it's built

`npm run harvest:estat-hls` (vacancy counts, e-Stat API) → `harvest:soumu` (codes +
kana + mergers) → `harvest:geocode` (GSI centroids) populate `pipeline/cache/`;
then `npm run build:vacancy && build:municipalities && build:crosswalk` regenerate
the CSVs deterministically (byte-identical on re-run), gated by
`npm run validate` (frozen schema, no-silent-rewrite diff, referential integrity).

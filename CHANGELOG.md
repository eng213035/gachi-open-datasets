# Changelog

Entries here explain *why* whenever a previously-published data value
changes (per `shared/conventions.md` rule #3) — new rows appended in an
annual update don't need an entry; corrected/removed historical values do.

## 2026-07-09 — station-master v2.1.0 (romaji corrections)

- **227 corrected romanizations in `station-master/stations.csv`** (the `name`
  column only). No `station_id`, coordinates, operators, line links, or row
  counts changed — English readings only, so existing joins are unaffected. Two
  error classes were fixed:
  - **Mis-readings** — e.g. the suffix 橋 read as *-kyo* instead of *-bashi*;
    石垣 as *Ishikaki* → *Ishigaki*.
  - **Leaked neighbouring-station names** — a `name` that had picked up an
    adjacent station's romaji: 国際展示場 *Ariake* → *Kokusai-tenjijo*,
    後楽園 *Kasuga* → *Korakuen*, 東日本橋 *Bakuro-yokoyama* → *Higashi-nihombashi*.
- **Method**: audited all 8,650 distinct name→romaji pairs; 3.0% were flagged,
  and the 227 genuine errors applied. Macron-only differences and
  official-English/loanword forms were excluded (kept as correct).
- **Why this is a correction (rule #3)**: these `name` values were published in
  v2.0.0 and were wrong; they are now fixed. IDs are unchanged.

## 2026-07-05 — station-master v2.0.0 (nationwide)

- **Nationwide expansion.** `station-master` grows from 425 Greater-Tokyo
  stations to **9,145** by adding stations from MLIT 国土数値情報 N02-24 (鉄道).
  `station_members.csv` 579 → 9,659, `lines.csv` 94 → 681.
- **All 425 v1 IDs and values are unchanged** (append-only). This is not a
  correction — zero previously-published rows changed or were removed
  (`validate.mjs` confirms `0 changed, -0 removed`), so per rule #3 no value-
  change justification is required. The v1 rows are now emitted byte-for-byte
  from an immutable snapshot in `pipeline/frozen/`; new IDs (`st_00426`+) are
  pinned in `pipeline/id-lock.csv` so future refreshes stay append-only.
- **New sources**: N02 (nationwide geometry/lines/operators), Wikidata (CC0,
  English names — 8,109 of the new rows), kuromoji Hepburn fallback (611 rows,
  `name_source=romanized`). Attribution added to `LICENSE-DATA.txt`. License
  research: `docs/n02-license-check.md`.
- **New-row conventions** (do not affect v1 rows): nationwide `pref` uses a
  nearest-municipality lookup (not the Kanto bounding box); N02 `operators` and
  `station_members.operator` carry Japanese operator names (ODPT-derived Tokyo
  rows keep English); `station_members.odpt_id` carries `n02:<code>` source IDs
  for N02 members. See `shared/conventions.md`.

## 2026-07-05 — housing-vacancy v1.0.0 (initial release)

- First publication of `housing-vacancy`: municipality-level vacancy from the
  Housing and Land Survey, 2003–2023 (five surveys). `municipality_vacancy.csv`
  (6,388 rows, 1,653 municipalities), `municipalities.csv` (1,901 current
  municipalities with GSI coordinates + **nationwide** station bridge — with the
  station-master v2 master the `nearest_station_id` null count fell 1,694 → 96),
  `municipality_crosswalk.csv` (80 high-confidence merger pairs) and
  `low_confidence_review.csv` (561 rows for human confirmation).
- Counts are official e-Stat values verbatim; `vacancy_rate` is computed
  (e-Stat publishes no municipality-level rate) and flagged in `rate_source`.
- **`name_kana` column** added: the official Soumu katakana reading (the sanctioned
  source for the English romanisation), 1,901/1,901 populated.
- **Data-quality fixes at first release** (no prior published values, so no diff to
  report): (1) the Soumu source appends the reading to the name cell for some rows
  (designated-city wards, new cities, Northern Territories) — the harvester now strips
  the trailing kana ruby, so `name_ja` is clean (19 rows fixed). (2) The six Northern
  Territories villages (01695–01700) had placeholder mainland-Hokkaido coordinates;
  their `lat`/`lng`/bridge are now null (no false coordinates shipped).

## 2026-07-05 — v1.0.0 (initial release)

- First publication of `station-master` (425 physical stations, entity-resolved
  from 720 ODPT operator-line records, 25 operators, 94 lines) and
  `station-ridership` (3,144 rows, 292 stations, years 2000-2025).
- No prior version exists, so no diff to report.

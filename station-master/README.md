# Japan Station Master — Entity-Resolved Station, Operator & Line Data

Shinjuku Station isn't one thing in Japanese transit data — it's JR East,
Keio, Odakyu, Seibu, Tokyo Metro, and the Toei subway/streetcar bureau, each
publishing their own record with their own ID. Every existing open dataset
we could find either treats these as unrelated rows, or was hand-merged once
and abandoned years ago.

**This is a maintained, entity-resolved station master**: one row per
physical station, with the operator-level records preserved underneath so
you can see exactly how the merge was made — and a confidence flag so you
can be as conservative or permissive as you want.

As of **v2 this is nationwide** — 9,145 physical stations across Japan. The
425 Greater-Tokyo stations resolved from ODPT (with operator-declared transfer
links and ODPT's own English names) are unchanged; the rest are added from MLIT
国土数値情報 N02, with English names from Wikidata (CC0). See Coverage below.

> Related community datasets covering similar ground (and, as far as we can
> tell, not actively maintained as of 2026): search GitHub for
> `japan-train-data`, `open-data-jp-railway-stations`, and `tokyo-stations-API`.
> If you maintain one of these, we'd genuinely like to talk about consolidating
> — open an issue.

## Cite as

This dataset is published together with Japan Station Ridership as one
combinable Zenodo record (they share a `station_id` join key):

> gachi-tokusuru (2026). *Japan Station Master & Ridership — Canonical Open
> Datasets (Japan)* (v2.0.0) [Data set]. Zenodo.
> https://doi.org/10.5281/zenodo.21199500

(The DOI above is the concept DOI — it always resolves to the latest version.
To cite this exact release, use the v2.0.0 version DOI
`10.5281/zenodo.21207225`. The v1.0.0 Greater-Tokyo release remains citable at
`10.5281/zenodo.21199501`.)

## License

- **Data**: CC BY 4.0, inherited from the Public Transportation Open Data
  Center (ODPT). See `LICENSE-DATA.txt` for the exact required attribution
  text — reproduce it if you redistribute this data.
- **Pipeline code** (this repo's `pipeline/` scripts): MIT, see `LICENSE`.

This dataset uses data provided by the Public Transportation Open Data
Center (https://www.odpt.org/) under the Public Transportation Open Data
Basic License. Accuracy and completeness of the data are not guaranteed.
Please do not contact the transit operators directly about this dataset —
contact us instead (see below).

## Coverage

**Nationwide (v2): 9,145 physical stations across Japan.** Two source layers,
distinguished by `name_source`:

- **Greater Tokyo (425 stations, `name_source=odpt`)** — resolved from ODPT
  (25 railway operators), with operators' own English names and their declared
  transfer links. These are the v1 rows, preserved **byte-for-byte** — same
  `station_id`, same values. Frozen forever (`pipeline/frozen/`).
- **Rest of Japan (~8,720 stations)** — added from MLIT 国土数値情報 N02-24
  (鉄道). English names come from Wikidata (`name_source=wikidata`, 8,109 rows)
  or, where Wikidata has no match, a machine Hepburn transliteration
  (`name_source=romanized`, 611 rows — non-authoritative, filterable).

Snapshot date: see `metadata.json.last_updated`. This is a point-in-time
extract of the ODPT catalog + N02-24, not a live feed.

## Files

### `stations.csv` — one row per physical station

| column | type | notes |
|---|---|---|
| `station_id` | string | Stable ID (`st_00001` style). Once issued, permanent — never reused or renumbered across versions. v1's `st_00001`–`st_00425` are frozen. |
| `name` | string | English name. Always populated — see `name_source` for provenance. |
| `name_ja` | string | Japanese name. |
| `name_source` | string | `odpt` (ODPT's own English title, the 425 Tokyo rows), `wikidata` (CC0 English label matched by name + proximity), or `romanized` (machine Hepburn fallback when no Wikidata match — non-authoritative; filter it out if you only want vetted names). |
| `lat`, `lng` | float | Averaged across constituent records. |
| `pref` | string | **Approximate.** Tokyo rows: original bounding-box heuristic (frozen). Nationwide rows: prefecture of the nearest municipality centroid. Border stations can be misclassified — see `shared/conventions.md`. |
| `operators` | string | `;`-separated operator names. **English** for Tokyo (ODPT) rows; **Japanese** for nationwide (N02) rows, which is all N02 provides. |
| `merge_confidence` | string | `single` (no merge needed), `high` (merged via operators' declared connections / N02 group code), `medium` (merged via name + <300m proximity). See methodology below. |
| `member_count` | int | How many raw source records (ODPT operator-line records, or N02 station records) were merged into this station. |

### `station_members.csv` — the merge, made transparent

One row per (station_id, operator) — the underlying records that got folded
into each physical station.

| column | type | notes |
|---|---|---|
| `station_id` | string | Join key to `stations.csv`. |
| `operator` | string | Operator name — English for Tokyo (ODPT) rows, Japanese for nationwide (N02) rows. |
| `operator_station_name_ja` | string | This operator's own name for the station (can differ — e.g. Seibu calls it "西武新宿", not "新宿"). |
| `odpt_id` | string | `;`-separated source record IDs this operator contributed: `odpt.Station:...` for Tokyo rows, `n02:<station code>` for N02 rows. (Column name kept for schema compatibility; it means "source record ID".) |
| `line_names` | string | `;`-separated line names this operator runs through this station (English for ODPT rows, Japanese for N02 rows). |

### `lines.csv` — one row per railway line

| column | type | notes |
|---|---|---|
| `line_id` | string | Source railway ID: `odpt.Railway:...` for Tokyo lines, `n02:<operator>/<line>` for N02 lines. |
| `name`, `name_ja` | string | Line name. `name` (English) is empty for N02 lines (no English source); `name_ja` is always present. |
| `operator` | string | Operator name (English for ODPT lines, Japanese for N02 lines). |
| `station_order` | string | `\|`-separated `station_id`s. Route order for ODPT lines that publish `odpt:stationOrder`; for N02 lines (which carry no stop order) it is a deduplicated `station_id` list, not a sequence. |

### `low_confidence_review.csv` — what we declined to auto-merge

Same-named station pairs that were *not* automatically merged, with the
reason and distance in meters. For the nationwide layer the reason is
`n02_same_name_same_pref_far_apart` — two same-named stations in the same
prefecture that are too far apart to safely merge. A real example: the
Hankyu and Hanshin 大阪梅田 termini sit ~559m apart and are correctly kept
as separate stations (different companies, different platforms) pending a
human decision. Cross-prefecture same-name stations (e.g. the four 府中
stations in Tokyo/Hiroshima/Tokushima/Kyoto) are simply distinct and not
listed here.

## Methodology (entity resolution)

Full detail in `shared/conventions.md`. Summary: within Tokyo (ODPT), merges
are driven first by operators' own declared `connectingStation` links (high
confidence), then by same-name + <300m coordinate proximity (medium confidence)
for anything not already linked. Nationwide (N02), stations are grouped first by
N02's operator-authored group code `N02_005g` (the transfer-hub grouping — the
N02 analogue of `connectingStation`), then by the same conservative same-name +
<300m + same-prefecture pass. Same name across prefectures or too far apart is
never auto-merged, and each N02 cluster is de-duplicated against the existing
Tokyo stations before a new ID is issued — so the 425 v1 IDs are never
duplicated or renumbered.

## Combine with Japan Station Ridership

`station_id` in this dataset is the same ID space used by
[Japan Station Ridership 2000-2025](../station-ridership/) — resolve a
station here, then look up its multi-year ridership there. See that
dataset's README for the join example.

## Roadmap

- ✅ **v2: nationwide coverage** — done (this release; MLIT N02 + Wikidata).
- Replace the point-based prefecture assignment (bounding box for Tokyo,
  nearest-municipality for nationwide) with a real polygon/boundary lookup.
- Backfill English operator names + English line names for the N02 (nationwide)
  rows, which currently carry Japanese operator/line names.
- Ongoing: fold `low_confidence_review.csv` candidates in as they're manually confirmed.

## Want more?

Latest-year snapshots, full nationwide coverage, and per-station query
access are available via API & MCP: https://api.gachi-tokusuru.com

The newest ODPT catalog state is available to API subscribers first; it
lands in this free dataset at the next annual release.

Custom/bulk data needs: https://api.gachi-tokusuru.com (Business inquiry form)
— not this repo's issue tracker.

## Support this project

If this dataset is useful to you, consider sponsoring:
see `.github/FUNDING.yml` in the repo root.

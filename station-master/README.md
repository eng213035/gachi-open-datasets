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

> Related community datasets covering similar ground (and, as far as we can
> tell, not actively maintained as of 2026): search GitHub for
> `japan-train-data`, `open-data-jp-railway-stations`, and `tokyo-stations-API`.
> If you maintain one of these, we'd genuinely like to talk about consolidating
> — open an issue.

## Cite as

This dataset is published together with Japan Station Ridership as one
combinable Zenodo record (they share a `station_id` join key):

> gachi-tokusuru (2026). *Japan Station Master & Ridership — Canonical Open
> Datasets (Greater Tokyo)* (v1.0.0) [Data set]. Zenodo.
> https://doi.org/10.5281/zenodo.21199500

(The DOI above is the concept DOI — it always resolves to the latest annual
version. To cite this exact release, use the v1.0.0 DOI
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

Greater Tokyo only — specifically, whatever operators ODPT itself publishes
(currently 25 railway operators / 42 total operators including bus).
**This is not nationwide.** Nationwide coverage is the planned v2 (see
Roadmap). We'd rather ship an honest, high-quality Tokyo dataset now than
wait for a "complete" one that never ships.

Snapshot date: see `metadata.json.last_updated`. This is a point-in-time
extract of ODPT's catalog, not a live feed.

## Files

### `stations.csv` — one row per physical station

| column | type | notes |
|---|---|---|
| `station_id` | string | Stable ID (`st_00001` style). Once issued, permanent — never reused or renumbered across versions. |
| `name` | string | English name (ODPT-provided romaji). |
| `name_ja` | string | Japanese name. |
| `name_source` | string | `odpt` (from ODPT's own English title) or `romanized` (fallback). In v1, effectively always `odpt` — ODPT provides English titles for 100% of its station records. |
| `lat`, `lng` | float | Averaged across constituent operator records. |
| `pref` | string | **Approximate** — see "Known limitation" in `shared/conventions.md`. Bounding-box heuristic, not a real geocoder. |
| `operators` | string | `;`-separated English operator names serving this physical station. |
| `merge_confidence` | string | `single` (no merge needed), `high` (merged via operators' own declared connections), `medium` (merged via name + <300m proximity). See methodology below. |
| `member_count` | int | How many raw ODPT operator-line records were merged into this station. |

### `station_members.csv` — the merge, made transparent

One row per (station_id, operator) — the underlying records that got folded
into each physical station.

| column | type | notes |
|---|---|---|
| `station_id` | string | Join key to `stations.csv`. |
| `operator` | string | English operator name. |
| `operator_station_name_ja` | string | This operator's own name for the station (can differ — e.g. Seibu calls it "西武新宿", not "新宿"). |
| `odpt_id` | string | `;`-separated raw ODPT station IDs (`odpt.Station:...`) this operator contributed. |
| `line_names` | string | `;`-separated English line names this operator runs through this station. |

### `lines.csv` — one row per railway line

| column | type | notes |
|---|---|---|
| `line_id` | string | Raw ODPT railway ID (kept as-is — lines don't need resolution the way stations do). |
| `name`, `name_ja` | string | Line name. |
| `operator` | string | English operator name. |
| `station_order` | string | `\|`-separated `station_id`s in route order (when ODPT publishes `odpt:stationOrder`; otherwise an unordered but deduplicated list). |

### `low_confidence_review.csv` — what we declined to auto-merge

Same-named station pairs that were *not* automatically merged, with the
reason (`same_name_far_apart` with distance in meters, or
`same_name_missing_coords` when we couldn't verify distance at all). These
are candidates for a human to review before a future release folds some of
them in. Real example currently in this list: the two Waseda stations
(Toei Arakawa Line vs. Tokyo Metro Tozai Line) sit ~735m apart and are
correctly *not* merged.

## Methodology (entity resolution)

Full detail in `shared/conventions.md`. Summary: merges are driven first by
operators' own declared `connectingStation` links (high confidence), then by
same-name + <300m coordinate proximity (medium confidence) for anything not
already linked. Same name + no coordinates, or same name + too far apart, is
never auto-merged.

## Combine with Japan Station Ridership

`station_id` in this dataset is the same ID space used by
[Japan Station Ridership 2000-2025](../station-ridership/) — resolve a
station here, then look up its multi-year ridership there. See that
dataset's README for the join example.

## Roadmap

- v2: nationwide coverage (beyond ODPT's currently-published operators)
- v2: replace the prefecture bounding-box heuristic with a real boundary lookup
- Ongoing: fold `low_confidence_review.csv` candidates in as they're manually confirmed

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

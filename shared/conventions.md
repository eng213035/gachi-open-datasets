# Conventions for gachi-open-datasets

These rules apply to every dataset in this repo. They exist so that anyone
citing a dataset, or building an API/analysis on top of it, can trust it
without re-checking each release.

1. **Frozen schema.** Column names, types, and units never change once a
   dataset version is published. If a column needs to change shape, that's a
   new dataset version (`-v2` folder/DOI), not an edit to the existing one.
2. **Tidy format.** One row = one entity x one observation. No wide format
   (years as columns). This is why `station_ridership.csv` has a `year`
   column rather than one column per year.
3. **No silent rewrites of history.** Every `build` run produces a diff
   report against the previous committed CSV. If any *past* value changed
   (not just new rows appended), the build **stops** and requires a human to
   confirm the change and write a reason in `CHANGELOG.md`. Source data
   corrections happen; silent ones don't.
4. **Machine-readable metadata.** Every dataset folder has a `metadata.json`
   with `version`, `temporal_coverage`, `last_updated`, `next_update_expected`,
   `license`, `doi`, `homepage`.
5. **Cite as.** Every README states the exact citation string to use.
6. **Source attribution carried through.** Any CC BY (or equivalent)
   attribution requirement from an upstream source is repeated verbatim in
   both `LICENSE-DATA.txt` and the README, not just linked.
7. **Reproducible builds.** Running `npm run build` twice on the same
   `pipeline/cache/*.json` produces byte-identical CSVs: stable sort keys,
   no embedded timestamps, no `Math.random()`/`Date.now()`. Freshness lives
   only in `metadata.json`, which is edited by hand when publishing a release
   (see `pipeline/harvest/` for how the cache itself gets refreshed).

## Entity resolution method (used by station-master, reused by anything that joins to it)

ODPT publishes one station record **per operator per line**, so a real-world
hub like Shinjuku shows up as 13+ separate records. Resolution runs in two
passes over those records:

1. **High confidence — operator-declared connections.** ODPT's
   `odpt:connectingStation` field is a graph edge operators themselves
   publish ("this station connects to that one"). Any two records joined by
   such an edge (directly or transitively) are merged into one physical
   station. We trust the operators' own declaration here, including
   judgment calls like Seibu-Shinjuku Station being merged into the greater
   Shinjuku entity — it's a few hundred meters from the JR/Metro complex but
   operators declare it connected, so it's treated as one entity. If you
   disagree with a specific merge, open an issue; the underlying raw IDs are
   preserved in `station_members.csv` so nothing is lost.
2. **Medium confidence — name + proximity.** For same-named stations *not*
   already linked by pass 1, if both have coordinates and are within 300m,
   they're merged (`merge_confidence=medium` in `stations.csv`). If they have
   coordinates but are *farther* than 300m (e.g. the two separate Waseda
   stations, ~735m apart, or Tokyo Metro's Asakusa vs. Tsukuba Express's
   Asakusa, ~600-680m apart), they are **not** merged — same name doesn't mean
   same station in Tokyo.
3. **Deferred to humans.** Same-named pairs with no coordinates on at least
   one side are never auto-merged (a proximity check can't be verified) —
   these land in `low_confidence_review.csv` for manual confirmation before
   a future release folds them in one way or the other.

`stations.csv.merge_confidence` is `single` (no merge needed), `high`, or
`medium`, so downstream users can filter to only-explicit merges if they want
a more conservative join.

## Nationwide expansion (station-master v2)

v2 keeps every v1 station frozen and **appends** nationwide stations from MLIT
国土数値情報 N02. The mechanism and the conventions specific to the new rows:

- **Freeze by verbatim passthrough.** The 425 v1 stations (and their members and
  lines) are emitted byte-for-byte from an immutable snapshot in
  `pipeline/frozen/*.v1.csv` — never recomputed. New IDs (`st_00426`+) continue
  the same `st_` counter and are pinned in `pipeline/id-lock.csv` (keyed by N02
  station group codes), so re-harvesting N02 stays append-only. Rule #3's diff
  gate (`validate.mjs`) is what guarantees no v1 value ever moves.
- **N02 entity resolution.** Pass 1 groups N02 records by the operator-authored
  group code `N02_005g` (a transfer-hub grouping — e.g. Shinjuku's seven
  JR/private/subway lines share one code — the N02 analogue of ODPT's
  `connectingStation`). Pass 2 merges only same-name + ≤300 m + **same
  prefecture** pairs. Same name across prefectures, or beyond 300 m, is never
  merged (误统合 is worse than 误分离; the latter is fixable, the former breaks
  IDs). Each N02 cluster is then cross-matched to the v1 stations by normalized
  name + ≤300 m; a match means it duplicates an already-published station and is
  dropped rather than issued a new ID.
- **`name_source` vocabulary.** `odpt` (v1, ODPT's own English title);
  `wikidata` (CC0 English label matched by normalized name + proximity); or
  `romanized` (machine Hepburn from kuromoji, used only when no Wikidata match
  exists — a best-effort transliteration of the kanji, explicitly non-
  authoritative and downstream-filterable). Every station has a non-empty
  English `name`.
- **Kanji-romanization exception.** The "never romanise from kanji" rule (see
  `romaji.mjs`) still holds for *authoritative* names: v1 stays ODPT romaji,
  and Wikidata supplies real English labels (including irregular readings such
  as 放出=Hanaten, 特牛=Kottoi). Only the `romanized` fallback transliterates
  kanji, and it is flagged as such so a consumer can exclude it. This is looser
  than the municipality rule (readings only from official furigana) because
  station names vary less and the flag makes the provenance explicit.
- **Operator names / source IDs on new rows.** N02 provides Japanese operator
  names only, so nationwide `stations.operators` and
  `station_members.operator` carry Japanese names (ODPT-derived Tokyo rows keep
  English). `station_members.odpt_id` holds `n02:<station code>` source IDs for
  N02 members (the column name is kept for schema-freeze compatibility; it means
  "source record ID"). N02 lines have no canonical stop order, so their
  `station_order` is a deduplicated `station_id` list, not a route sequence.

## Known limitation: prefecture is approximate

For the 425 v1 (Greater-Tokyo) rows, `stations.csv.pref` is the original coarse
lat/lng bounding-box heuristic (`pipeline/lib/geo.mjs`) and is frozen. For the
nationwide v2 rows, `pref` is the prefecture of the **nearest municipality
centroid** (reusing the geocode cache) — a strict improvement over the bounding
box, but still point-based, so stations right on a prefectural border can be
misclassified. Neither method is a true polygon lookup; a boundary-based
contribution is welcome.

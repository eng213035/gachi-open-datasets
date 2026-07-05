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

## Known limitation: prefecture is approximate

`stations.csv.pref` is derived from a coarse lat/lng bounding-box heuristic
(`pipeline/lib/geo.mjs`), not a real polygon/geocoder, because ODPT's coverage
is entirely Greater Tokyo. Stations near prefectural borders (Tokyo/Saitama,
Tokyo/Kanagawa, Tokyo/Chiba) can be misclassified. A proper boundary lookup
is a welcome contribution.

# gachi-open-datasets

[![DOI](https://zenodo.org/badge/DOI/10.5281/zenodo.21199500.svg)](https://doi.org/10.5281/zenodo.21199500)

**Deep, obscure Japanese public data — hand-verified, English-first, citable.**

Canonical, maintained open datasets built from Japanese public transit data.
Existing English-language datasets on this topic are largely hand-built,
stale, or incomplete (see each dataset's README for specifics) — these are
annually-refreshed, schema-frozen alternatives with transparent methodology.

This repo is both the source for these datasets **and** their pipeline: a
shared architecture designed to add more datasets over time without
rebuilding the plumbing each time.

## Datasets

| Dataset | What it is | Status |
|---|---|---|
| [station-master/](station-master/) | Entity-resolved Japan station master (**nationwide**, 9,145 stations) — one row per physical station across all operators | v2.0.0 |
| [station-ridership/](station-ridership/) | Annual per-station ridership, 2000-2025, joined to station-master's `station_id` | v1.0.0 |
| [housing-vacancy/](housing-vacancy/) | Municipality-level housing vacancy from the Housing and Land Survey, 2003–2023 (five surveys); current-municipality master + merge crosswalk, bridged to `station_id` | v1.0.0 |

The station datasets are also published to Zenodo (DOI, canonical archival
copy) and Kaggle (discovery/exposure). See each dataset's README for the exact
citation.

## Repo layout

```
datasets/
├── pipeline/            # harvest + build + validate — shared by all datasets
│   ├── harvest/          # source-specific harvesters (ODPT, MLIT N02, Wikidata, e-Stat, Soumu, GSI)
│   ├── frozen/           # immutable v1 published CSV snapshot (the station-master freeze anchor)
│   ├── id-lock.csv       # nationwide station_id lock (append-only across refreshes)
│   ├── lib/              # entity resolution, geo, CSV, xlsx reader, kana→romaji
│   ├── build-station-master.mjs
│   ├── build-ridership.mjs
│   ├── build-vacancy.mjs / build-municipalities.mjs / build-crosswalk.mjs
│   └── validate.mjs      # schema + referential integrity + no-silent-rewrite gate
├── station-master/       # dataset 1 (README, metadata.json, CSVs)
├── station-ridership/    # dataset 2 (README, metadata.json, CSVs)
├── housing-vacancy/      # dataset 3 (README, metadata.json, LICENSE-DATA, CSVs)
├── shared/
│   ├── conventions.md    # the rules every dataset here follows
│   └── station_ids.csv   # thin join-key export (derived from station-master)
└── docs/odpt-license-screenshots/  # provenance of source licenses
```

## Rebuilding

```
export ODPT_TOKEN=...          # see ~/gachi-mcp-run/secrets/odpt-env
npm run harvest:odpt           # refreshes ODPT cache (425 Tokyo stations)
npm run harvest:n02            # refreshes MLIT N02 nationwide rail cache
npm run harvest:wikidata       # refreshes Wikidata English-name cache (CC0)
npm run harvest:n02-readings   # kuromoji Hepburn fallback cache (needs npm install)
npm run build                  # regenerates all dataset CSVs, deterministically
npm run validate               # schema check + diff-vs-last-commit + referential integrity
```

`validate` will refuse to pass if any previously-published row's *value*
changed silently (see `shared/conventions.md` rule #3) — new rows are fine,
mutated history requires a human decision and a CHANGELOG.md entry.

## Sources

Primary sources (dataset catalog / landing pages). See each dataset's
`LICENSE-DATA.txt` for the exact required attribution wording.

- **ODPT** (Public Transportation Open Data Center) — station names & Tokyo ridership: https://developer.odpt.org/
- **MLIT 国土数値情報 N02/P11** — nationwide stations & bus stops: https://nlftp.mlit.go.jp/ksj/
- **Wikidata** (CC0) — English station names: https://www.wikidata.org/
- **Statistics Bureau of Japan (住宅・土地統計調査), via e-Stat** — housing vacancy: https://www.stat.go.jp/data/jyutaku/ · https://www.e-stat.go.jp/
- **MIC (総務省)** — municipality codes & merger records; **GSI 国土地理院** — municipality coordinates (see `housing-vacancy/LICENSE-DATA.txt`).

## License

- Dataset CSVs: CC BY 4.0 (see `LICENSE-DATA.txt` — required attribution
  text is there, reproduce it if you redistribute).
- Pipeline code: MIT (see `LICENSE`).

## Want more?

Latest-year data, live per-station updates, and per-station API/MCP query
access: https://api.gachi-tokusuru.com

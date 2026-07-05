# gachi-open-datasets

[![DOI](https://zenodo.org/badge/DOI/10.5281/zenodo.21199500.svg)](https://doi.org/10.5281/zenodo.21199500)

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
| [station-master/](station-master/) | Entity-resolved Japan station master (Greater Tokyo) — one row per physical station across all operators | v1.0.0 |
| [station-ridership/](station-ridership/) | Annual per-station ridership, 2000-2025, joined to station-master's `station_id` | v1.0.0 |

Both datasets are also published to Zenodo (DOI, canonical archival copy)
and Kaggle (discovery/exposure). See each dataset's README for the exact
citation.

## Repo layout

```
datasets/
├── pipeline/            # harvest + build + validate — shared by all datasets
│   ├── harvest/          # source-specific harvesters (currently: ODPT)
│   ├── lib/              # entity resolution, geo helpers, CSV writer
│   ├── build-station-master.mjs
│   ├── build-ridership.mjs
│   └── validate.mjs      # schema + referential integrity + no-silent-rewrite gate
├── station-master/       # dataset 1 (README, metadata.json, CSVs)
├── station-ridership/    # dataset 2 (README, metadata.json, CSVs)
├── shared/
│   ├── conventions.md    # the rules every dataset here follows
│   └── station_ids.csv   # thin join-key export (derived from station-master)
└── docs/odpt-license-screenshots/  # provenance of source licenses
```

## Rebuilding

```
export ODPT_TOKEN=...          # see ~/gachi-mcp-run/secrets/odpt-env
npm run harvest:odpt           # refreshes pipeline/cache/*.json from ODPT
npm run build                  # regenerates all dataset CSVs, deterministically
npm run validate               # schema check + diff-vs-last-commit + referential integrity
```

`validate` will refuse to pass if any previously-published row's *value*
changed silently (see `shared/conventions.md` rule #3) — new rows are fine,
mutated history requires a human decision and a CHANGELOG.md entry.

## License

- Dataset CSVs: CC BY 4.0 (see `LICENSE-DATA.txt` — required attribution
  text is there, reproduce it if you redistribute).
- Pipeline code: MIT (see `LICENSE`).

## Want more?

Latest-year data, full nationwide coverage, and per-station API/MCP query
access: https://api.gachi-tokusuru.com

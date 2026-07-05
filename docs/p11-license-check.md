# P11 (国土数値情報 バス停留所) — License Check

Record for the third KSJ source used by this stack: MLIT 国土数値情報 P11
(bus stops), used for the Context API's livability transit signal
(`bus_stops_within_1km`). Last researched: 2026-07-05.

## Source

- **Dataset**: 国土数値情報（バス停留所データ） P11-22 (2022 release) — bus-stop
  point geometry + name/operator/route, one GML (XML) per prefecture.
- **Coverage harvested**: all 47 prefectures → **278,515 bus stops nationwide**.
- **Download**: `https://nlftp.mlit.go.jp/ksj/gml/data/P11/P11-22/P11-22_<pref>_GML.zip`
  (verified reachable, ~0.4–0.5 MB/pref). Harvester: `pipeline/harvest/p11-harvest.mjs`.
- Archive metadata (`KS-META-P11-22_*.xml`) states the standard 国土数値情報 free
  public-use terms.

## Terms of use

国土数値情報 is distributed under the **国土数値情報 利用約款**
(<https://nlftp.mlit.go.jp/ksj/other/agreement.html>), **CC BY 4.0-compatible**
since the 2014 revision: free commercial use, redistribution and processing
permitted with attribution; processed data must be marked as processed and not
presented as an official government product. (Same terms as N02 — see
`docs/n02-license-check.md`.)

## How P11 is used (processing disclosure)

- We extract only bus-stop **points** (`<gml:pos>`) and derive, per current
  municipality, the **count of bus stops within 1 km of the municipality's GSI
  representative point (centroid)** — `pipeline/cache/p11-busstop-counts.json`.
- **This is a centroid-based density, NOT whole-municipality coverage.** It counts
  poles near the town's representative point (≈ around the town hall), not every
  bus stop in the municipality. This caveat is carried into the Context API
  response (`livability.transit`) and the README so it is not misread as total
  coverage. Raw P11 point data is not redistributed — only the derived count.

## Attribution carried into the release (conventions rule #6)

> 「国土数値情報（バス停留所データ）」（国土交通省）を加工して作成
> (Processed from MLIT National Land Numerical Information — Bus Stop data, P11-22.)
> Source: https://nlftp.mlit.go.jp/ksj/

## Verdict

**CLEAR to use** the derived per-municipality bus-stop counts (as a processed
livability indicator) under CC BY 4.0 with the attribution above. No non-commercial
or redistribution carve-out applies to P11.

# N02 (国土数値情報 鉄道) — License Check

Record for the license gate on the second station source used by
`station-master` v2 (nationwide expansion). Last researched: 2026-07-05.

## Source

- **Dataset**: MLIT 国土数値情報（鉄道データ） N02 — nationwide rail lines +
  stations, structured (line name, operator, station name, station code, station
  group code, coordinates).
- **Layer used**: `N02-24_Station` (UTF-8 GeoJSON), 10,235 platform features
  → 9,048 station group codes (`N02_005g`).
- **Download**: <https://nlftp.mlit.go.jp/ksj/gml/data/N02/N02-24/N02-24_GML.zip>
  (verified reachable, 12.7 MB). Harvester: `pipeline/harvest/n02-harvest.mjs`.
- Product spec: 国土数値情報（鉄道）製品仕様書 第3.2版. The archive metadata
  (`KS-META-N02-24.xml`) states: *「国土数値情報を無償で一般公開しています。」*

## Terms of use — findings

国土数値情報 is distributed under the **国土数値情報 利用約款**
(<https://nlftp.mlit.go.jp/ksj/other/agreement.html>). Since the 2014 revision the
terms are **CC BY 4.0-compatible**: free use including commercial, redistribution
and processing permitted, provided the source is attributed and — when the data
is processed — that processing is noted (and the result must not be presented as
if it were an official government product).

- **Commercial use**: permitted.
- **Redistribution / derived works**: permitted (this is exactly what a derived
  entity-resolved station master is).
- **Attribution required**: yes. For processed data the prescribed form is
  *「（コンテンツ名）（国土交通省）を加工して作成」*.

## Attribution carried into the release (conventions.md rule #6)

Verbatim in `LICENSE-DATA.txt` and the station-master README:

> 「国土数値情報（鉄道データ）」（国土交通省）を加工して作成
> (Processed from MLIT National Land Numerical Information — Railway data, N02-24.)
> Source: https://nlftp.mlit.go.jp/ksj/  ·  国土数値情報 利用約款 (CC BY 4.0-compatible)

## How N02 is used (processing disclosure)

- N02 station platform LineStrings → one representative point (midpoint vertex)
  per record.
- Entity resolution: group by the operator-authored group code `N02_005g`
  (transfer-hub grouping), then a conservative same-name + ≤300 m + same-
  prefecture pass; cross-matched against the existing ODPT-derived stations to
  avoid double registration. New physical stations get new `station_id`s; the 425
  v1 IDs are unchanged.
- English names for N02-only stations are **not** taken from N02 (which has no
  reading): Wikidata (CC0) where a confident match exists (`name_source=wikidata`),
  else a machine Hepburn transliteration (`name_source=romanized`). N02 is not the
  authority for romanization, so nothing is presented as official.

## Verdict

**CLEAR to publish** the derived nationwide station master under CC BY 4.0 with the
attribution above. No non-commercial or redistribution carve-out applies to N02
(unlike the hazard layers in `hazard-license-check.md`).

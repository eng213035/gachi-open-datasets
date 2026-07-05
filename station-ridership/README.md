# Japan Station Ridership 2000-2025

Watch Shinjuku's Tokyo Metro ridership fall off a cliff in 2020 and claw
back up year by year — the COVID trough and recovery, visible station by
station, operator by operator, in one tidy CSV.

## Cite as

> gachi-tokusuru (2026). *Japan Station Ridership 2000-2025*, v1.0.0.
> Zenodo. https://doi.org/PENDING

## License

- **Data**: CC BY 4.0, inherited from the Public Transportation Open Data
  Center (ODPT). See `LICENSE-DATA.txt` for the exact required attribution
  text.
- **Pipeline code**: MIT, see `LICENSE`.

This dataset uses data provided by the Public Transportation Open Data
Center (https://www.odpt.org/) under the Public Transportation Open Data
Basic License (`odpt:PassengerSurvey`). Accuracy and completeness of the
data are not guaranteed. Please do not contact the transit operators
directly about this dataset — contact us instead.

## Coverage

Greater Tokyo, matching [Japan Station Master](../station-master/)'s
operator coverage (this dataset's `station_id`s are drawn from that one).
Year range varies by operator/survey — most series run 2012-2024, some
extend back to 2000 or forward to 2025. Not every station has every year;
this is exactly what operators published to ODPT, not interpolated.

Snapshot date: see `metadata.json.last_updated`.

## `station_ridership.csv`

| column | type | notes |
|---|---|---|
| `station_id` | string | Join key — resolves via [Japan Station Master](../station-master/)'s `stations.csv`. |
| `operator` | string | English operator name. |
| `year` | int | Survey year. |
| `passenger_journeys` | int | Annual passenger journeys per day (operator's own survey methodology — see `includes_alighting`). |
| `includes_alighting` | bool | `true` if the count includes both boarding and alighting; `false` if boarding-only. **Operators differ on this** — don't sum or compare `passenger_journeys` across operators without checking this flag first. |
| `source_survey_id` | string | Raw ODPT `odpt:PassengerSurvey` ID this row came from. Kept because one physical station can have multiple survey series (e.g. one per line through it) — this is the row-level primary key alongside `station_id`/`operator`/`year`. |

**Grain**: one row = one survey series (`station_id` x `operator` x
`source_survey_id`) x one year. A station served by an operator's multiple
lines can legitimately have several `source_survey_id` rows for the same
`station_id`/`operator`/`year` — that's not a duplicate, it's one survey per
line. Group by `source_survey_id` if you want per-line series, or by
`station_id`/`operator`/`year` (summing `passenger_journeys`, after checking
`includes_alighting` is consistent) if you want a station+operator total.

## Example: Shinjuku's COVID trough and recovery

```
station_id,operator,year,passenger_journeys,includes_alighting,source_survey_id
st_00167,Tokyo Metro,2020,155619,true,odpt.PassengerSurvey:TokyoMetro.Shinjuku
st_00167,Tokyo Metro,2021,160781,true,odpt.PassengerSurvey:TokyoMetro.Shinjuku
st_00167,Tokyo Metro,2022,180278,true,odpt.PassengerSurvey:TokyoMetro.Shinjuku
st_00167,Tokyo Metro,2023,193170,true,odpt.PassengerSurvey:TokyoMetro.Shinjuku
st_00167,Tokyo Metro,2024,199942,true,odpt.PassengerSurvey:TokyoMetro.Shinjuku
```

(This particular series starts in 2020 — not every operator's survey covers
the same year range; see the "Coverage" note above.)

Filter `station_id=st_00167` (resolve it via Station Master's `stations.csv`
first, or just grep `name_ja=新宿`) and you have every operator's series for
the busiest station complex in the world, side by side.

## Combine with Japan Station Master

Resolve a station name/location to `station_id` in
[Japan Station Master](../station-master/)'s `stations.csv`, then filter
this dataset by that `station_id` for its full multi-year, multi-operator
ridership history. This join is why the two datasets share an ID space
instead of shipping separately.

## Roadmap

- v2: nationwide coverage, matching Station Master's v2
- Ongoing: new survey years added at each annual release; historical rows
  never change silently (see `shared/conventions.md`)

## Want more?

Latest-year data and per-station query access via API & MCP:
https://api.gachi-tokusuru.com

The newest survey year is available to API subscribers first; it lands in
this free dataset at the next annual release.

Custom/bulk data needs: https://api.gachi-tokusuru.com (Business inquiry
form) — not this repo's issue tracker.

## Support this project

If this dataset is useful to you, consider sponsoring:
see `.github/FUNDING.yml` in the repo root.

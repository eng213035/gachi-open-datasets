# ODPT license screenshots — provenance record

Acceptance criterion: keep a screenshot record of the ODPT catalog pages
that establish the license terms this repo relies on, in case terms change
later. Verified live on 2026-07-05 (this session, logged into
developer.odpt.org); screenshots themselves still need to be captured by a
human with local file access (the automation session that verified these
pages can't write image files into this repo directly).

## Pages to capture

1. **Terms/license overview** — https://developer.odpt.org/terms
   Confirms: data is published under CC0 / CC BY 4.0 / ODC BY 1.0 / ODbL 1.0
   (no registration needed) or under the "公共交通オープンデータ基本ライセンス"
   ("Public Transportation Open Data Basic License", requires developer site
   registration, permits commercial and non-commercial use with conditions).

2. **Per-operator dataset license, example (Toei)** —
   https://ckan.odpt.org/dataset/train-toei
   Confirms the specific license actually attached to a dataset we use:
   **Creative Commons Attribution 4.0 International (CC BY 4.0)**, with the
   exact required credit line:
   - JA: `コンテンツ等の提供者名：東京都交通局・公共交通オープンデータ協議会`
   - EN: `Provider name of content, etc.: Bureau of Transportation, Tokyo
     Metropolitan Government / Association for Open Data of Public
     Transportation`

3. Repeat step 2 for each operator whose `odpt:PassengerSurvey` /
   `odpt:Station` data ends up in the published dataset (at minimum: JR East,
   Tokyo Metro, Toei, Keio, Odakyu, Seibu — the operators through Shinjuku,
   used as the flagship example in both READMEs). Catalog URL pattern:
   `https://ckan.odpt.org/dataset?organization=<operator-slug>`, then open
   the "train information" / "鉄道関連情報" dataset for that operator.

## How to capture (manual, ~2 min per page)

Open each URL above in a logged-in developer.odpt.org session, screenshot
the license panel, save as `NN-short-name.png` in this folder
(e.g. `01-terms-overview.png`, `02-toei-train-license.png`).

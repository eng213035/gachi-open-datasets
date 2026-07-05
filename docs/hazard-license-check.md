# Station Hazard Dataset — License Check (B-0 gate)

> **STATUS: SUPERSEDED (2026-07-05) — the static Station Hazard DATASET was CANCELLED by owner
> policy. There is no CSV, no Zenodo/Kaggle release, and no derived scores. This file is kept
> only as the record of the license research that led to that decision.**
>
> **Owner policy (final): deliver OFFICIAL values as-is — do not invent derived scores; do not
> redistribute raw source data.** Raw redistribution is not permitted (see §3) and scoring is
> off-policy, so a static dataset has nothing publishable. Instead the same hazard information is
> served as a **live API relay**: `GET /v1/stations/{id}/hazard` on api.gachi-tokusuru.com,
> which queries the official MLIT reinfolib layers per request and returns the official
> values/categories verbatim with attribution + disclaimer (implemented in
> `~/gachi-toilet-mcp/src/worker.mjs`). This is API usage of the source, not dataset redistribution.
>
> This document is the record for the B-0 license gate. Last researched: 2026-07-05.

## 2026-07-05 (その2) — 非商用レイヤーを有料配信から除外 + 14日キャッシュ

運用判断として、**一部非商用の土砂・津波レイヤーを有料API配信から外す**方針に更新（それ以前は
`commercial_use` フラグ付きで値を返していた）。

- **除外対象と根拠**:
  - 土砂災害（XKT011・土砂災害警戒区域）= reinfolib 出典ページで **一部非商用**（都道府県により商用制限）。
  - 津波（XKT028・津波浸水想定）= 同じく **一部非商用**（沿岸都道府県に制限）。
  - → 有料エンドポイントで prefecture 単位の可否を都度判定するのはリスクが高いため、**値を返さず**
    `available:false` ＋ 公式ハザードマップ（<https://disaportal.gsi.go.jp/>）への案内を返す。
- **有料配信を継続するレイヤー（いずれも reinfolib 出典で商用 〇）**:
  - 洪水（XKT026）・地形分類/液状化（XKT025）・高潮（XKT027）。
- **キャッシュ**: `hazard:<station_id>:<type>`（type = flood/liquefaction/storm_surge）を KV に 14日 TTL で保存。
  上流失敗は保存しない。**attribution と免責文はキャッシュに含めず、配信時に必ず再付与**（キャッシュヒットでも
  出典・免責が欠落しない）。
- 実装 = `~/gachi-toilet-mcp/src/worker.mjs`（`excludedLayer` / `cachedLayer` / `stationHazard`）。

## Decision trail (2026-07-05)
- License research (below) established: **raw redistribution does NOT clear** — J-SHIS forbids
  redistributing raw (even format-converted) data; XKT025 has no CSV/bulk export; landslide &
  tsunami layers are 一部非商用.
- First direction was "derived-only scores." **Owner then overrode**: no derived scores either
  (house policy = relay official values as-is). → **Static dataset cancelled.**
- **Implemented instead: live relay endpoint** returning official flood-depth rank, landform/
  liquefaction class, and landslide/storm-surge/tsunami presence, each with source attribution.
  Landslide & tsunami carry a `commercial_use: restricted_in_some_prefectures` flag in the response.

## 1. Sources actually used by the existing hazard logic

All hazard values in the current stack come from the **MLIT 不動産情報ライブラリ
(Real Estate Information Library) API** — `https://www.reinfolib.mlit.go.jp/ex-api/external/…`
(requires an API key, header `Ocp-Apim-Subscription-Key`). Implemented in
`~/gachi-mcp/index.js` (`get_flood_risk`, `get_liquefaction_risk`, `get_disaster_risk`,
`get_hazard_summary`).

| Layer | reinfolib code | Original source |
|---|---|---|
| Flood inundation (洪水浸水想定区域) | XKT026 | Hazard Map Portal + 国土数値情報 (KSJ) |
| Landform → liquefaction tendency (地形分類) | XKT025 | MLIT 都市局 |
| Landslide / debris flow (土砂災害) | XKT011 / XKT012 | Hazard Map Portal + KSJ |
| Storm surge (高潮) | XKT027 | Hazard Map Portal + KSJ |
| Tsunami (津波) | XKT028 | Hazard Map Portal + KSJ |

**Earthquake (揺れやすさ) is NOT currently sourced** by any existing tool. The spec's
`earthquake_score` column would require a new source — **J-SHIS** (防災科研 地震ハザード
ステーション) or a landform-derived proxy from XKT025. See §4 open items.

## 2. Terms of use — findings (with clauses)

### reinfolib 利用規約 / API利用規約
- Base content is under **PDL 1.0 (公共データ利用規約第1.0版 ≈ CC BY 4.0)** — commercial use OK with attribution.
- **Hazard layers are explicitly carved out of PDL1.0** (Art. 2(2)ア) and inherit their
  original-source terms:
  - 国土数値情報 (KSJ): <https://nlftp.mlit.go.jp/ksj/other/agreement.html>
  - ハザードマップ オープンデータ: <https://disaportal.gsi.go.jp/hazardmapportal/hazardmap/copyright/copyright.html>
- Processing/derivation is allowed but you MUST note the content name **and that processing
  was performed**, and MUST NOT present the result "あたかも国が作成したかのような態様で"
  (as if created by the government).
- Required attribution: `出典：国土交通省　不動産情報ライブラリ` + URL; for processed data
  `「コンテンツの名称」（国土交通省）をもとに ○○ 作成`.
- Source: <https://www.reinfolib.mlit.go.jp/help/termsOfUse/>, <https://www.reinfolib.mlit.go.jp/help/contents/>

### Per-layer commercial / redistribution status (from reinfolib 出典ページ)
| Layer | Commercial | Notes |
|---|---|---|
| Flood XKT026 | 〇 permitted | map vs API versions differ in timing |
| Liquefaction/landform XKT025 | 〇 permitted | **"CSV export not available"** — bulk raw export not offered |
| Landslide XKT011/012 | **一部非商用** | some prefectures restrict commercial use |
| Storm surge XKT027 | 〇 permitted | — |
| Tsunami XKT028 | **一部非商用** | several coastal prefectures restricted |

### J-SHIS 利用規約 (only relevant if earthquake_score uses J-SHIS)
- You MAY edit/process the seismic-hazard data and **freely distribute the results (成果物)**.
- You MAY NOT redistribute the **raw data as-is, including format-converted copies**, to third parties.
  ("地震動予測地図データをそのまま複製（ファイル形式を変換しての複製を含む）して、第三者に頒布・譲渡することを禁じます")
- Attribution to J-SHIS required.
- Source: <https://www.j-shis.bosai.go.jp/agreement>

## 3. VERDICT (recommended — pending confirmation)

**→ DERIVED-INDICATOR-ONLY publishing (spec B-0 step 3 fallback).**

Rationale:
- Raw-value redistribution is **restricted or unclear**: XKT025 offers no CSV/bulk export;
  landslide & tsunami are 一部非商用; J-SHIS explicitly forbids redistributing raw (even
  format-converted) data. So the "再配布可 → 生値公開" branch does **not** clear.
- Derived indicators (our own computed 0–100 scores) are permitted as processed 成果物,
  provided we attribute the sources, state that processing was performed, and do not present
  them as government output.

Concrete consequences for the build:
1. Publish **only** `flood_score`, `earthquake_score`, `liquefaction_score`, `hazard_score`
   (0–100) + `assessed_at` + `source_version`. **No raw columns** (no `flood_depth_m`, no raw
   J-SHIS values, no layer geometry).
2. Compose `hazard_score` from **commercial-OK layers only**: flood (XKT026) + liquefaction
   (XKT025) + earthquake (J-SHIS derived 成果物, if chosen). **Exclude the 一部非商用 landslide
   (XKT011/012) and tsunami (XKT028) layers** from the published composite — this DIVERGES from
   the existing `get_hazard_summary`, which includes them. (Existing MCP tool is unaffected;
   only the published dataset changes.)
3. README must carry: full attribution to 国土交通省 不動産情報ライブラリ (+ J-SHIS if used),
   a "processed by gachi-tokusuru.com, not government-created" note, the score formula (fully
   public), and the safety disclaimer (B-3).

## 4. Open items requiring an operator decision (before build)

- [ ] **Confirm the DERIVED-ONLY verdict above** (vs. attempting raw redistribution).
- [ ] **Earthquake source**: integrate **J-SHIS** (new harvest; derived 成果物 only) — or drop
      `earthquake_score` for v1 — or approximate it from XKT025 landform. Not currently wired.
- [ ] **Confirm excluding landslide/tsunami** (一部非商用) from the published composite.
- [ ] Confirm the reinfolib API key + rate limits allow a 425-station harvest.
- [ ] Human go/no-go for the **Zenodo new-release DOI + Kaggle publish** (outward, irreversible).

## Sources
- reinfolib Terms of Use: https://www.reinfolib.mlit.go.jp/help/termsOfUse/
- reinfolib content sources: https://www.reinfolib.mlit.go.jp/help/contents/
- KSJ agreement: https://nlftp.mlit.go.jp/ksj/other/agreement.html
- Hazard Map Portal copyright: https://disaportal.gsi.go.jp/hazardmapportal/hazardmap/copyright/copyright.html
- J-SHIS Terms of Use: https://www.j-shis.bosai.go.jp/agreement

# Publish steps (manual, one-time per release)

Everything up to this point (harvest, build, validate, READMEs, licenses) is
automated/done. These steps are inherently manual — they create or touch
external accounts, which is out of scope for the pipeline itself.

## STATUS (2026-07-05)

- [x] **GitHub** — published: https://github.com/eng213035/gachi-open-datasets (public)
- [x] **Zenodo** — published via GitHub integration, single DOI for the
      combined repo (chosen over 2 separate DOIs for annual auto-update).
      - Concept DOI (always latest): **10.5281/zenodo.21199500**
      - v1.0.0 version DOI: **10.5281/zenodo.21199501**
      - `.zenodo.json` in repo root controls the metadata (type=dataset,
        CC BY 4.0, keywords). Each future GitHub Release auto-mints a new
        version DOI — no manual Zenodo step needed at annual update.
- [x] **Kaggle** — published (public, combined single dataset to match Zenodo):
      https://www.kaggle.com/datasets/takufujii/japan-station-master-and-ridership-2000-2025-tokyo
      Imported via GitHub-repo link; License=CC BY 4.0; tags=Transportation,
      Rail Transport, Japan, Coronavirus; description carries the Zenodo DOI,
      GitHub link, and the "Want more?" API/MCP hook.
- [ ] **ODPT license screenshots** — URLs/text recorded, PNGs not captured
      (see docs/odpt-license-screenshots/README.md)
- [ ] **api.gachi-tokusuru.com "Open Datasets" section + llms.txt** — not done
- [ ] **Precursor-repo outreach** — not done (do after Kaggle is live)

## 1. GitHub

1. Create repo `gachi-open-datasets` under your account/org (public, MIT+CC
   BY as already declared in LICENSE/LICENSE-DATA.txt).
2. Replace the `TODO` in `.github/FUNDING.yml` with your real GitHub
   Sponsors username before the first push.
3. `git remote add origin <url> && git push -u origin main`.
4. This same repo can double as the "GitHub repo" the MCP directory
   listings (mcp.so/Glama) point to, per the existing data-API project —
   no need for a second repo.

## 2. Zenodo (canonical, DOI)

Register **two separate records** (one per dataset, per the instructions —
separate DOIs):

1. https://zenodo.org → New upload.
2. Upload the dataset's folder contents (CSVs + README.md + metadata.json +
   LICENSE-DATA.txt) as a zip, or link the GitHub repo + tag a release and
   let Zenodo's GitHub integration mint the DOI automatically (recommended —
   keeps future updates simple: tag a new release, Zenodo mints a new
   version DOI automatically).
3. Metadata to fill in:
   - Title: "Japan Station Master (Entity-Resolved)" / "Japan Station
     Ridership 2000-2025"
   - Keywords: `japan`, `railway`, `station`, `ridership`, `entity-resolution`,
     `transportation`, `covid-19`
   - License: CC BY 4.0
   - Related identifiers: link the two records to each other ("is
     supplemented by" / "references"), and both to the GitHub repo.
4. Once minted, replace `"doi": "PENDING"` in both `metadata.json` files and
   the `https://doi.org/PENDING` placeholders in both READMEs with the real
   DOI, then commit.

## 3. Kaggle (discovery/exposure)

1. https://www.kaggle.com/datasets → New Dataset, one per dataset.
2. Paste the same README content into Kaggle's description field, with the
   Zenodo DOI link at the top (Kaggle indexes/ranks partly on external
   citation signals).
3. License: CC BY 4.0 (Kaggle has this as a preset).

## 4. After both are live

1. Add an "Open Datasets" section to api.gachi-tokusuru.com linking both
   Zenodo records + the GitHub repo.
2. Add both datasets to `llms.txt`.
3. **Only after** the above are live and DOIs are real: post one issue each
   (only where an issue tracker exists and is active) on the precursor repos
   named in station-master/README.md, using wording like:

   > We built a maintained, entity-resolved alternative covering similar
   > ground — [link]. Sharing in case it's useful, and happy to discuss
   > consolidating efforts if you're still maintaining this.

   Do this once, politely, per repo — not a recurring campaign.

## Note on the ODPT license screenshots

See `docs/odpt-license-screenshots/README.md` — the exact URLs and required
credit text have been verified, but the actual `.png` files need a human to
capture and drop in that folder before the first Zenodo/GitHub push (keeps
provenance if ODPT's terms change later).

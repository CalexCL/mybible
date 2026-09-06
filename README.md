# 中文研读圣经 · Chinese Study Bible

A Chinese-centered Protestant Bible study web application designed for GitHub Pages now and a future Supabase backend.

## Current public build

- 66-book Protestant canon navigation
- Simplified Chinese Union Version (CUVS) reading
- Old Testament / New Testament navigation
- Verse study drawer
- Starter Scripture cross references
- Hebrew / Aramaic / Greek study framework
- Names and titles of God
- God's miracles and Jesus' miracles
- Parables
- Prophecy → fulfillment
- Covenants
- Bible people, places and timeline starter datasets
- Notes, bookmarks and highlights
- Light / Dark / Sepia / OLED modes
- Mobile / tablet / desktop responsive layout
- GitHub Pages workflow
- Supabase-ready personal-study storage boundary and SQL schema

## Protestant source policy

The project's theological/reference layer is restricted to verified mainstream Protestant / evangelical sources. See `SOURCE_POLICY.md`.

## Scripture integrity

Bible text, original-language data, factual reference data, commentary and personal notes are separate layers. Study material is never allowed to silently alter Scripture.

## CUVS

The public build includes the public-domain Simplified Chinese Union Version dataset produced from the supplied CUVS source, with an online structured-CUVS fallback for chapters that were not safely segmented from the PDF extraction.

## NKJV

The private prototype used the NKJV PDF supplied by the project owner. Because a public GitHub Pages site is public redistribution, the complete NKJV text file is intentionally excluded from this public package until the required electronic distribution permission or licensed API has been resolved. The UI and configuration remain ready to enable NKJV later.

## Run locally

```bash
python3 serve.py
```

Then open `http://127.0.0.1:8765`.

## Deploy

See `DEPLOYMENT.md`.

## Supabase

See `supabase/README.md` and `supabase/schema.sql`.

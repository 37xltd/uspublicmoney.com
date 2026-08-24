# US Federal Spending

Independent Cloudflare Worker that serves **precomputed** agency × fiscal-year sums from the USAspending.gov Award Data Archive (FY2025 All Contracts Full, 20260806).

This is **not** [USAspending.gov](https://www.usaspending.gov/) and is **not** endorsed by the U.S. Department of the Treasury or OMB.

## Coverage of the first ship

Projections in `public/data/` were built from R2 object `atlas-source-usaspending/bulk/us-federal/2026-08-18/chunks/part-00` only (250 MiB zip prefix). Figures are a **sample**, not full-archive national totals.

## Min-N

Agency × FY pages exist only if the sample cell has ≥ 10 distinct awards **or** |obligation| ≥ $10 million. No `/awards/` URLs.

## Deploy

```
npx wrangler deploy
```

Account `15e6d5c00c1f0b9390bbfd82b1ac3ada`. Worker reads only the JSON/HTML assets in this repo (no request-path scan of the 2 GB archive).

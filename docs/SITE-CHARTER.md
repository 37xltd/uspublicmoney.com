# Site charter — US Federal Spending

- **Task:** inspect awarding-agency contract obligations by US fiscal year.
- **Rights:** USAspending Award Data Archive is U.S. government work, public domain (17 U.S.C. 105). Attribute Treasury Fiscal Service; no endorsement claim.
- **Min-N:** agency × FY page iff ≥10 distinct `contract_award_unique_key` values **or** |`federal_action_obligation` sum| ≥ $10,000,000 in the published projection. Recipient lists: ≥3 transaction rows. Fail closed (404 omit).
- **URL farms killed:** no `/awards/{id}`; no one-award recipient pages; no NAICS×state×FY sitemap.
- **Indexability:** sitemap = Tier A only (hub, agencies index, agency, agency×FY min-N, reports, about, methodology, data-sources, recipients index). Query filters noindex.
- **Evidence layers:** obligation sums and HHI are **calculated** from observed transaction rows.

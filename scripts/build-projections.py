#!/usr/bin/env python3
import csv, json, datetime
from collections import defaultdict
from pathlib import Path

csv.field_size_limit(2**22)
src = Path("/tmp/usas/file1.csv")
out_dir = Path("/workspace/us-federal-spending/public/data")
out_dir.mkdir(parents=True, exist_ok=True)

def fy_from(date_s):
    date_s = (date_s or "").strip()
    if len(date_s) >= 10 and date_s[4] == "-":
        y, m = int(date_s[0:4]), int(date_s[5:7])
    else:
        return None
    return y + 1 if m >= 10 else y

def slugify(code, name):
    base = (name or "unknown").lower()
    out = []
    for ch in base:
        if ch.isalnum():
            out.append(ch)
        elif out and out[-1] != "-":
            out.append("-")
    s = "".join(out).strip("-")
    return ((code + "-" if code else "") + s)[:80] or "unknown"

cells = defaultdict(lambda: {"obligation": 0.0, "actions": 0, "awards": set(), "recipients": defaultdict(lambda: {"obligation": 0.0, "actions": 0, "name": ""})})
n_rows = 0
n_bad = 0

with src.open("r", encoding="utf-8", errors="replace", newline="") as f:
    r = csv.DictReader(f)
    print("fields", len(r.fieldnames or []), flush=True)
    for row in r:
        n_rows += 1
        try:
            name = (row.get("awarding_agency_name") or "").strip()
            code = (row.get("awarding_agency_code") or "").strip()
            obl_s = (row.get("federal_action_obligation") or "").strip()
            fy = fy_from(row.get("action_date") or "")
            if fy is None:
                n_bad += 1
                continue
            obl = float(obl_s) if obl_s else 0.0
            award = (row.get("contract_award_unique_key") or "").strip()
            uei = (row.get("recipient_uei") or "").strip()
            rname = (row.get("recipient_name") or "").strip()
            cell = cells[(code, name, fy)]
            cell["obligation"] += obl
            cell["actions"] += 1
            if award:
                cell["awards"].add(award)
            rid = uei or rname or "?"
            rec = cell["recipients"][rid]
            rec["obligation"] += obl
            rec["actions"] += 1
            rec["name"] = rname or uei
        except Exception:
            n_bad += 1
        if n_rows % 250000 == 0:
            print("rows", n_rows, "cells", len(cells), flush=True)

print("DONE rows", n_rows, "bad", n_bad, "cells", len(cells), flush=True)

MIN_AWARDS = 10
MIN_OBL = 10_000_000.0
agencies = {}
hub_cells = []
for (code, name, fy), st in cells.items():
    n_awards = len(st["awards"]) if st["awards"] else st["actions"]
    obl = st["obligation"]
    pass_min = n_awards >= MIN_AWARDS or obl >= MIN_OBL or obl <= -MIN_OBL
    slug = slugify(code, name)
    recs = []
    all_abs = []
    for rid, r in st["recipients"].items():
        all_abs.append(abs(r["obligation"]))
        if r["actions"] >= 3:
            recs.append({"id": rid, "name": r["name"], "obligation": round(r["obligation"], 2), "award_count": r["actions"], "action_count": r["actions"]})
    recs.sort(key=lambda x: -abs(x["obligation"]))
    recs = recs[:20]
    s = sum(all_abs) or 1.0
    hhi = sum((x / s) ** 2 for x in all_abs) * 10000
    rec = {
        "agency_code": code,
        "agency_name": name,
        "slug": slug,
        "fy": fy,
        "obligation": round(obl, 2),
        "action_count": st["actions"],
        "award_count": n_awards,
        "recipient_count": len(st["recipients"]),
        "min_n_pass": pass_min,
        "hhi": round(hhi, 1),
        "top_recipients": recs,
    }
    hub_cells.append(rec)
    if pass_min:
        agencies.setdefault(slug, {"code": code, "name": name, "slug": slug, "years": []})
        agencies[slug]["years"].append(fy)
        (out_dir / "agencies").mkdir(exist_ok=True)
        (out_dir / "agencies" / f"{slug}-{fy}.json").write_text(json.dumps(rec))

by_fy = defaultdict(lambda: {"obligation": 0.0, "actions": 0, "awards": 0})
by_ag = defaultdict(lambda: {"obligation": 0.0, "award_count": 0, "name": "", "slug": "", "code": ""})
for rec in hub_cells:
    g = by_fy[rec["fy"]]
    g["obligation"] += rec["obligation"]
    g["actions"] += rec["action_count"]
    g["awards"] += rec["award_count"]
    a = by_ag[rec["slug"]]
    a["obligation"] += rec["obligation"]
    a["award_count"] += rec["award_count"]
    a["name"] = rec["agency_name"]
    a["slug"] = rec["slug"]
    a["code"] = rec["agency_code"]

top_ag = sorted(by_ag.values(), key=lambda x: -abs(x["obligation"]))[:20]
for a in top_ag:
    a["obligation"] = round(a["obligation"], 2)
s = sum(abs(a["obligation"]) for a in by_ag.values()) or 1.0
hhi_nat = sum((abs(a["obligation"]) / s) ** 2 for a in by_ag.values()) * 10000

nat_rec = defaultdict(lambda: {"obligation": 0.0, "award_count": 0, "name": "", "id": ""})
for st in cells.values():
    for rid, r in st["recipients"].items():
        nr = nat_rec[rid]
        nr["obligation"] += r["obligation"]
        nr["award_count"] += r["actions"]
        nr["name"] = r["name"]
        nr["id"] = rid
top_rec = [v for v in nat_rec.values() if v["award_count"] >= 3]
top_rec.sort(key=lambda x: -abs(x["obligation"]))
top_rec = [{**v, "obligation": round(v["obligation"], 2)} for v in top_rec[:20]]

retrieved = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
meta = {
    "source": "USAspending.gov Award Data Archive",
    "file": "FY2025_All_Contracts_Full_20260806.zip",
    "member": "FY2025_All_Contracts_Full_20260806_1.csv",
    "licence": "US Government work, public domain (17 U.S.C. 105)",
    "r2_prefix": "bulk/us-federal/2026-08-18/",
    "r2_object": "bulk/us-federal/2026-08-18/chunks/part-00",
    "part_bytes": 262144000,
    "compressed_bytes_read": 262143910,
    "uncompressed_bytes_decoded": src.stat().st_size,
    "rows_parsed": n_rows,
    "rows_skipped": n_bad,
    "coverage": "SAMPLE of the first CSV member, using only R2 chunk part-00 (250 MiB). The member continues into later parts. These are not full-archive national totals.",
    "method": "Sum federal_action_obligation by awarding_agency_code x US fiscal year of action_date (FY starts 1 October). Award counts are distinct contract_award_unique_key values in this sample. Deobligations (negative) are included. Min-N: agency x FY page only if award_count >= 10 or |obligation| >= 10000000. Recipient lists require at least 3 transaction rows in this sample. Recipient award_count on lists is transaction rows, labelled as such.",
    "retrieved_utc": retrieved,
    "archive_date": "2026-08-18",
    "archive_file_date": "20260806",
    "attribution": "Derived from USAspending.gov data published by the U.S. Department of the Treasury, Bureau of the Fiscal Service. This site is not the official USAspending search and is not endorsed by Treasury or OMB.",
}

hub = {
    "meta": meta,
    "fiscal_years": [
        {"fy": fy, "obligation": round(v["obligation"], 2), "action_count": v["actions"], "award_count": v["awards"]}
        for fy, v in sorted(by_fy.items())
    ],
    "agency_hhi": round(hhi_nat, 1),
    "top_agencies": top_ag,
    "top_recipients": top_rec,
    "agency_year_cells": [
        {k: rec[k] for k in ["agency_code","agency_name","slug","fy","obligation","action_count","award_count","min_n_pass","hhi"]}
        for rec in sorted(hub_cells, key=lambda x: -abs(x["obligation"]))
        if rec["min_n_pass"]
    ],
}
(out_dir / "hub.json").write_text(json.dumps(hub))
(out_dir / "meta.json").write_text(json.dumps(meta, indent=2))
idx_ag = [{"slug": a["slug"], "code": a["code"], "name": a["name"], "years": sorted(set(a["years"]))} for a in agencies.values()]
idx_ag.sort(key=lambda x: x["name"])
(out_dir / "agencies.json").write_text(json.dumps(idx_ag))
print("agencies", len(idx_ag), "min-n cells", sum(1 for r in hub_cells if r["min_n_pass"]))
print("fy", sorted(by_fy))

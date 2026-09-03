/**
 * US Federal Spending — precomputed projections only.
 */
const SITE = "US Public Money";
const GA_MEASUREMENT_ID = "G-SWVLQ1LFZ7";
const DESC = "Explore a clearly labelled sample of US federal contract obligations by agency and recipient, with USAspending source dates, identifiers and calculation limits.";
const ATTR = "Derived from USAspending.gov (U.S. Department of the Treasury, Bureau of the Fiscal Service). U.S. government work, public domain (17 U.S.C. 105). This site is not the official USAspending search and is not endorsed by Treasury or OMB.";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.hostname === "www.uspublicmoney.com") {
      url.hostname = "uspublicmoney.com";
      url.protocol = "https:";
      return Response.redirect(url.toString(), 301);
    }
    const path = url.pathname.replace(/\/+$/, "") || "/";
    try {
      if (
        path === "/favicon.ico" ||
        path === "/favicon.svg" ||
        path === "/favicon.png" ||
        path === "/logo.svg" ||
        path === "/og.png" ||
        path === "/apple-touch-icon.png" ||
        path === "/site.webmanifest"
      ) {
        return assetFile(env, path, path === "/favicon.ico" ? "image/x-icon" : null);
      }
      if (path === "/robots.txt") {
        return text(`User-agent: *\nAllow: /\nDisallow: /*?\nDisallow: /reports?\nSitemap: ${url.origin}/sitemap.xml\n`);
      }
      if (path === "/sitemap.xml") return sitemap(env, request, url.origin);
      if (path === "/") return home(env, request, url);
      if (path === "/agencies") return agenciesIndex(env, request, url);
      if (path === "/recipients") return recipientsPage(env, request, url);
      if (path === "/reports") return reportsPage(env, request, url);
      if (path === "/reports/concentration") return concentration(env, request, url);
      if (path === "/about") return about(url);
      if (path === "/methodology") return methodology(env, request, url);
      if (path === "/data-sources") return sources(env, request, url);
      const fyReport = path.match(/^\/reports\/(fy)?(\d{4})$/);
      if (fyReport) {
        return Response.redirect(new URL("/reports?fy=" + fyReport[2], url.origin).toString(), 301);
      }
      const agFy = path.match(/^\/agencies\/([a-z0-9-]+)\/(\d{4})$/);
      if (agFy) {
        return Response.redirect(new URL("/agencies/" + agFy[1], url.origin).toString(), 301);
      }
      const ag = path.match(/^\/agencies\/([a-z0-9-]+)$/);
      if (ag) return agencyHub(env, request, url, ag[1]);
      return html(layout(url, { title: `Not found · ${SITE}`, desc: DESC, path, body: `<main class="wrap"><h1>Not found</h1><p>No award pages. Try <a href="/agencies">agencies</a>.</p></main>` }), 404);
    } catch (err) {
      return html(layout(url, { title: `Error · ${SITE}`, desc: DESC, path, body: `<main class="wrap"><h1>Error</h1><p>${esc(err.message)}</p></main>` }), 500);
    }
  },
};

async function assetFile(env, assetPath, type) {
  if (env && env.ASSETS) {
    const res = await env.ASSETS.fetch(new Request(new URL(assetPath, "https://assets.local")));
    if (res.ok) {
      const headers = new Headers(res.headers);
      if (type) headers.set("content-type", type);
      headers.set("cache-control", "public, max-age=86400");
      return new Response(res.body, { status: 200, headers });
    }
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" fill="#0a3161"/><text x="16" y="22" text-anchor="middle" fill="#c5a572" font-size="16" font-family="Georgia">$</text></svg>`;
  return new Response(svg, { headers: { "content-type": "image/svg+xml", "cache-control": "public, max-age=86400" } });
}

async function loadJson(env, request, assetPath) {
  if (env && env.ASSETS) {
    const res = await env.ASSETS.fetch(new Request(new URL(assetPath, "https://assets.local")));
    if (res.ok) return res.json();
  }
  const res = await fetch(new URL(assetPath, request.url));
  if (res.ok) return res.json();
  return null;
}

function usd(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return "n/a";
  const sign = x < 0 ? "−" : "";
  return sign + "$" + Math.abs(x).toLocaleString("en-US", { maximumFractionDigits: 0 });
}

function pctLabel(n) {
  if (n == null || !Number.isFinite(Number(n))) return "n/a";
  const x = Number(n);
  const sign = x > 0 ? "+" : "";
  return sign + x.toFixed(1) + "%";
}

function shareBlock(canonical) {
  return `<p class="share"><span>SHARE</span> <button type="button" class="copy" data-url="${esc(canonical)}">Copy link</button> <a href="mailto:?subject=${encodeURIComponent(SITE)}&amp;body=${encodeURIComponent(canonical)}">Email</a> <a href="https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(canonical)}">LinkedIn</a> <a href="https://twitter.com/intent/tweet?url=${encodeURIComponent(canonical)}">X</a></p>`;
}

function coverageNote(meta, extra) {
  meta = meta || {};
  const coverage = meta.coverage_label || "sample";
  const snapshot = meta.retrieved_utc || meta.pull_date_utc || "not available";
  return `<aside class="prov">
    <h2>Source, date, method</h2>
    <p><strong>Coverage status:</strong> ${esc(coverage)} — ${esc(meta.coverage || "Sample of one archive chunk. Not full-archive totals.")}</p>
    <p><strong>Last successful snapshot:</strong> ${esc(snapshot)} UTC. Archive date: ${esc(meta.archive_date || "")}.</p>
    <p><strong>Freshness:</strong> held snapshot; this page does not imply live or complete national coverage.</p>
    <p><strong>Source:</strong> ${esc(meta.source || "USAspending.gov Award Data Archive")} · file ${esc(meta.file || "")} · member ${esc(meta.member || "")}.</p>
    <p><strong>Method:</strong> ${esc(meta.method || "")}</p>
    <p><strong>Rows used:</strong> ${esc(String(meta.rows_parsed ?? "n/a"))} money records. Amounts are US dollars. All percentages use this loaded sample only.</p>
    ${extra || ""}
    <p>${esc(ATTR)}</p>
  </aside>`;
}

function barChart(rows, valueKey, labelKey, caption) {
  const max = Math.max(1, ...rows.map((r) => Math.abs(Number(r[valueKey]) || 0)));
  const bars = rows.slice(0, 12).map((r, i) => {
    const v = Number(r[valueKey]) || 0;
    const w = (Math.abs(v) / max) * 520;
    const y = 8 + i * 28;
    return `<text x="0" y="${y + 14}" font-size="11" fill="#f4f1ea">${esc((r[labelKey] || "").slice(0, 28))}</text>
      <rect x="200" y="${y}" width="${w}" height="18" fill="#c5a572"/>
      <text x="${208 + w}" y="${y + 14}" font-size="11" fill="#c5a572">${esc(usd(v))}</text>`;
  }).join("");
  const h = 8 + Math.min(12, rows.length) * 28 + 8;
  return `<figure>
    <figcaption>${esc(caption)}</figcaption>
    <svg viewBox="0 0 900 ${h}" width="100%" role="img" aria-label="${esc(caption)}">${bars}</svg>
  </figure>`;
}

function recipTable(rows, extraHead, extraCell) {
  return `<table>
    <thead><tr><th>Recipient</th><th>UEI / id</th><th>Obligation (observed)</th><th>Rows (observed)</th>${extraHead || ""}</tr></thead>
    <tbody>${(rows || []).map((r) => `<tr><td>${esc(r.name)}</td><td><code>${esc(r.id)}</code></td><td>${usd(r.obligation)}</td><td>${r.action_count || r.award_count || ""}</td>${extraCell ? extraCell(r) : ""}</tr>`).join("")}</tbody>
  </table>`;
}

async function home(env, request, url) {
  const hub = (await loadJson(env, request, "/data/hub.json")) || { meta: {}, fiscal_years: [], top_agencies: [], top_recipients: [], agency_year_cells: [] };
  const fy = (url.searchParams.get("fy") || "").trim();
  const agency = (url.searchParams.get("agency") || "").trim();
  let cells = hub.agency_year_cells || [];
  if (fy) cells = cells.filter((c) => String(c.fy) === fy);
  if (agency) cells = cells.filter((c) => c.slug === agency);
  const total = cells.reduce((s, c) => s + (c.obligation || 0), 0);
  const actions = cells.reduce((s, c) => s + (c.action_count || 0), 0);
  const awards = cells.reduce((s, c) => s + (c.award_count || 0), 0);
  const filtered = Boolean(fy || agency);
  const years = (hub.fiscal_years || []).map((y) => `<option value="${y.fy}"${String(fy) === String(y.fy) ? " selected" : ""}>FY ${y.fy}</option>`).join("");
  const ags = (hub.agency_year_cells || []).map((c) => `<option value="${esc(c.slug)}"${c.slug === agency ? " selected" : ""}>${esc(c.agency_name)}</option>`).join("");
  const fyLine = (hub.fiscal_years || []).map((y) => `<li>FY ${y.fy}: ${usd(y.obligation)} · ${y.award_count.toLocaleString("en-US")} awards · ${y.action_count.toLocaleString("en-US")} actions (sample)</li>`).join("");
  const change = (hub.loaded_set && hub.loaded_set.change_note) || "";
  const body = `
    <main>
      <section class="hero">
        <div class="wrap">
          <p class="kicker">United States · government contracts · sample</p>
          <h1>Which agencies awarded the contract money?</h1>
          <p class="lede">Explore observed contract obligations by agency and recipient in one dated USAspending archive sample. For live or complete federal records, <a href="https://www.usaspending.gov/">use the official USAspending search</a>.</p>
          ${shareBlock(url.origin + "/")}
          <form class="filters" action="/" method="get">
            <label>Year <select name="fy"><option value="">All years in sample</option>${years}</select></label>
            <label>Government agency <select name="agency"><option value="">All agencies</option>${ags}</select></label>
            <button type="submit">Show results</button>
          </form>
          <p class="note">Filters are query state only (noindex). They do not create extra URLs.</p>
        </div>
      </section>
      <div class="wrap">
        <div class="answer">
          <p class="kicker">Money in this sample</p>
          <p class="figure">${usd(total)}</p>
          <p>${awards.toLocaleString("en-US")} distinct awards · ${actions.toLocaleString("en-US")} transaction rows · agency HHI ${esc(String(hub.agency_hhi))} (0–10,000, calculated on this sample’s agency obligation shares).</p>
          <p class="note">Pull date ${esc((hub.meta && hub.meta.retrieved_utc) || "")} UTC. ${esc(change)}</p>
        </div>
        ${coverageNote(hub.meta)}
        <h2>Money by year</h2>
        <ul>${fyLine || "<li>None</li>"}</ul>
        <h2>Agencies that gave out the most money</h2>
        ${barChart(hub.top_agencies || [], "obligation", "name", "Top agencies by summed federal_action_obligation in this sample (observed)")}
        <table>
          <thead><tr><th>Agency</th><th>Code</th><th>Obligation (sample, observed)</th><th>Awards</th></tr></thead>
          <tbody>${(hub.top_agencies || []).map((a) => `<tr><td><a href="/agencies/${esc(a.slug)}">${esc(a.name)}</a></td><td>${esc(a.code)}</td><td>${usd(a.obligation)}</td><td>${(a.award_count || 0).toLocaleString("en-US")}</td></tr>`).join("")}</tbody>
        </table>
        <h2>Companies and groups that received the most money</h2>
        <table>
          <thead><tr><th>Recipient</th><th>UEI / id</th><th>Obligation (sample)</th><th>Rows</th></tr></thead>
          <tbody>${(hub.top_recipients || []).map((r) => `<tr><td>${esc(r.name)}</td><td><code>${esc(r.id)}</code></td><td>${usd(r.obligation)}</td><td>${(r.award_count || 0).toLocaleString("en-US")}</td></tr>`).join("")}</tbody>
        </table>
        <p class="note">Recipient names can repeat under different UEIs; IDs are listed separately. There are no /recipients/{id} pages.</p>
        <h2>Government agencies</h2>
        <p>${cells.length} agencies shown${filtered ? " after filters" : ""}. We only show agencies with enough records to make the figures useful.</p>
        <ul class="grid">${cells.map((c) => `<li><a href="/agencies/${esc(c.slug)}">${esc(c.agency_name)}</a><span>${usd(c.obligation)} · ${c.award_count} awards · HHI ${c.hhi} (calculated)</span></li>`).join("")}</ul>
      </div>
    </main>`;
  return html(layout(url, { title: `${SITE} — agency contract obligations (sample)`, desc: DESC, path: "/", body, noindex: filtered }));
}

async function agenciesIndex(env, request, url) {
  const list = (await loadJson(env, request, "/data/agencies.json")) || [];
  const hub = (await loadJson(env, request, "/data/hub.json")) || { meta: {} };
  const body = `
    <main class="wrap">
      <h1>Awarding agencies</h1>
      ${shareBlock(url.origin + "/agencies")}
      <p>Each agency has one page. We only publish an agency page when the sample has enough records to make the figures useful. Year is a filter on that page.</p>
      ${coverageNote(hub.meta, `<p>${esc((hub.loaded_set && hub.loaded_set.change_note) || "")}</p>`)}
      <ul class="grid">${list.map((a) => `<li><a href="/agencies/${esc(a.slug)}">${esc(a.name)}</a><span>code ${esc(a.code)}</span></li>`).join("")}</ul>
    </main>`;
  return html(layout(url, { title: `Agencies · ${SITE}`, desc: "Awarding agencies with min-N hubs.", path: "/agencies", body }));
}

async function agencyHub(env, request, url, slug) {
  const rec = await loadJson(env, request, `/data/hubs/${slug}.json`);
  if (!rec || !rec.min_n_pass) {
    return html(layout(url, { title: `Agency not published · ${SITE}`, desc: DESC, path: url.pathname, body: `<main class="wrap"><h1>Not published</h1><p>This agency is missing or fails min-N in the loaded sample.</p></main>` }), 404);
  }
  const o = rec.observed || {};
  const c = rec.calculated || {};
  const fy = (url.searchParams.get("fy") || "").trim();
  const noindex = Boolean(fy);
  const similar = rec.similar_hubs || [];
  const gb = rec.good_vs_bad || {};
  const mx = rec.most_x || {};
  const body = `
    <main class="wrap">
      <p class="crumb"><a href="/">Home</a> / <a href="/agencies">Agencies</a> / ${esc(rec.agency_name)}</p>
      <p class="kicker">Agency page · ${esc(rec.coverage_label || "sample")} · agency code ${esc(rec.agency_code)}</p>
      <h1>${esc(rec.agency_name)}</h1>
      ${shareBlock(url.origin + "/agencies/" + slug)}
      <form class="filters" action="/agencies/${esc(slug)}" method="get">
        <label>Year <select name="fy"><option value="">All in sample (FY ${esc(String(rec.fy_in_sample))})</option><option value="${esc(String(rec.fy_in_sample))}"${fy === String(rec.fy_in_sample) ? " selected" : ""}>FY ${esc(String(rec.fy_in_sample))}</option></select></label>
        <button type="submit">Show results</button>
      </form>
      <p class="note">Filters are query state (noindex). One canonical URL: /agencies/${esc(slug)}</p>
      <div class="answer">
        <p class="kicker">Observed amount in the data</p>
        <p class="figure">${usd(o.federal_action_obligation_sum)}</p>
        <p>${(o.award_count || 0).toLocaleString("en-US")} distinct awards · ${(o.action_count || 0).toLocaleString("en-US")} actions · ${(o.recipient_count || 0).toLocaleString("en-US")} recipients in this sample. FY in loaded set: ${esc(String(rec.fy_in_sample))}.</p>
      </div>
      <p class="note"><strong>Data loaded:</strong> ${esc(rec.pull_date_utc || "")} UTC. Snapshot: ${esc(rec.snapshot_id || "")}. ${esc(rec.change_note || "")}</p>
      <h2>How this agency compares</h2>
      <p>These figures are calculated, not copied from the source. They use ${esc(String((rec.meta && rec.meta.rows_parsed) || "n/a"))} money records in the sample. ${esc(c.method || "")}</p>
      <table>
        <thead><tr><th>Metric</th><th>This hub</th><th>Loaded-set average</th><th>% vs average</th><th>Similar-hub average</th><th>% vs similar</th></tr></thead>
        <tbody>
          <tr><td>Obligation (USD)</td><td>${usd(o.federal_action_obligation_sum)}</td><td>${usd(c.loaded_set_avg_obligation)}</td><td>${pctLabel(c.pct_vs_loaded_set_avg_obligation)}</td><td>${usd(c.similar_avg_obligation)}</td><td>${pctLabel(c.pct_vs_similar_obligation)}</td></tr>
          <tr><td>Awards</td><td>${(o.award_count || 0).toLocaleString("en-US")}</td><td>${c.loaded_set_avg_awards}</td><td>${pctLabel(c.pct_vs_loaded_set_avg_awards)}</td><td>${c.similar_avg_awards}</td><td>${pctLabel(c.pct_vs_similar_awards)}</td></tr>
          <tr><td>Recipient HHI (calculated)</td><td>${c.recipient_hhi}</td><td>${c.loaded_set_avg_hhi}</td><td>${pctLabel(c.pct_vs_loaded_set_avg_hhi)}</td><td>${c.similar_avg_hhi}</td><td>${pctLabel(c.pct_vs_similar_hhi)}</td></tr>
        </tbody>
      </table>
      <h3>Similar hubs (similar spend / size)</h3>
      <ul>${similar.map((s) => `<li><a href="/agencies/${esc(s.slug)}">${esc(s.name)}</a> — ${usd(s.obligation)} · ${s.award_count} awards · HHI ${s.hhi}</li>`).join("")}</ul>
      <h2>Recipients above and below this agency’s average</h2>
      <p><strong>Vs loaded-set:</strong> ${esc(gb.vs_loaded_set || "")}. <strong>Vs similar:</strong> ${esc(gb.vs_similar || "")}.</p>
      <p class="note">${esc(gb.note || "")} Listed-recipient average obligation (calculated on this hub’s min-3 list): ${usd(gb.listed_recipient_average_obligation)}.</p>
      <h3>Recipients above the listed average</h3>
      ${recipTable(gb.good_recipients_vs_listed_average)}
      <h3>Recipients below the listed average</h3>
      ${recipTable(gb.bad_recipients_vs_listed_average)}
      <h2>Other useful rankings</h2>
      <p class="note">${esc(mx.note || "")}</p>
      <h3>Most dollars</h3>
      ${recipTable(mx.most_dollars)}
      <h3>Most award rows</h3>
      ${recipTable(mx.most_awards_rows)}
      <h3>Largest share of listed recipients (calculated)</h3>
      ${recipTable(mx.most_share_of_listed, "<th>Share of listed</th>", (r) => `<td>${esc(String(r.share_pct_of_listed))}%</td>`)}
      ${barChart(rec.top_recipients || [], "obligation", "name", "Top recipients — observed federal_action_obligation in this sample")}
      ${coverageNote(rec.meta)}
      <p><a href="/reports?agency=${encodeURIComponent(slug)}&amp;slice=good">Compose a report (good slice)</a> · <a href="/reports?agency=${encodeURIComponent(slug)}&amp;slice=bad">bad slice</a> · <a href="/reports?agency=${encodeURIComponent(slug)}&amp;slice=most-dollars&amp;format=pdf">PDF most-dollars</a></p>
    </main>`;
  return html(layout(url, { title: `${rec.agency_name} · ${SITE}`, desc: `Sample agency hub for ${rec.agency_name}.`, path: `/agencies/${slug}`, body, noindex }));
}

function sliceRows(rec, slice) {
  const gb = rec.good_vs_bad || {};
  const mx = rec.most_x || {};
  if (slice === "bad") return { title: "Recipients below the listed average", rows: gb.bad_recipients_vs_listed_average || [] };
  if (slice === "most-dollars") return { title: "Recipients with the most money", rows: mx.most_dollars || [] };
  if (slice === "most-awards") return { title: "Recipients with the most records", rows: mx.most_awards_rows || [] };
  if (slice === "most-share") return { title: "Recipients with the largest share", rows: mx.most_share_of_listed || [] };
  if (slice === "concentration") return { title: "Money concentration", rows: mx.most_share_of_listed || [] };
  return { title: "Recipients above the listed average", rows: gb.good_recipients_vs_listed_average || rec.top_recipients || [] };
}

async function reportsPage(env, request, url) {
  const list = (await loadJson(env, request, "/data/agencies.json")) || [];
  const hub = (await loadJson(env, request, "/data/hub.json")) || { meta: {} };
  const agency = (url.searchParams.get("agency") || "").trim();
  const slice = (url.searchParams.get("slice") || "good").trim();
  const format = (url.searchParams.get("format") || "html").trim();
  const composed = Boolean(url.searchParams.toString());
  if (!composed) {
    const opts = list.map((a) => `<option value="${esc(a.slug)}">${esc(a.name)}</option>`).join("");
    const body = `
      <main class="wrap">
        <h1>Make a report</h1>
        ${shareBlock(url.origin + "/reports")}
        <p>Choose an agency and the view you want. The report is made when you ask for it and is not listed in search results.</p>
        <form class="filters" action="/reports" method="get">
          <label>Agency <select name="agency" required>${opts}</select></label>
          <label>What to show <select name="slice">
            <option value="good">Recipients above average</option>
            <option value="bad">Recipients below average</option>
            <option value="most-dollars">Most money</option>
            <option value="most-awards">Most records</option>
            <option value="most-share">Largest share</option>
            <option value="concentration">How concentrated the money is</option>
          </select></label>
          <label>Format <select name="format"><option value="html">HTML</option><option value="pdf">PDF</option></select></label>
          <button type="submit">Make report</button>
        </form>
        ${coverageNote(hub.meta)}
      </main>`;
    return html(layout(url, { title: `Reports · ${SITE}`, desc: "Compose an on-demand agency slice report.", path: "/reports", body }));
  }
  const rec = await loadJson(env, request, `/data/hubs/${agency}.json`);
  if (!rec) {
    return html(layout(url, { title: `Report not available · ${SITE}`, desc: DESC, path: "/reports", body: `<main class="wrap"><h1>Choose a qualified agency</h1></main>`, noindex: true }), 404);
  }
  const sl = sliceRows(rec, slice);
  if (format === "pdf") {
    const pdf = buildPdf(rec, sl);
    return new Response(pdf, {
      status: 200,
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `attachment; filename="${agency}-${slice}.pdf"`,
        "x-robots-tag": "noindex, nofollow",
      },
    });
  }
  const body = `
    <main class="wrap">
      <p class="kicker">On-demand report · noindex · sample</p>
      <h1>${esc(rec.agency_name)} — ${esc(sl.title)}</h1>
      <p>Pull / ingest ${esc(rec.pull_date_utc || "")} UTC. ${esc(rec.change_note || "")}</p>
      <p><a href="/agencies/${esc(agency)}">Agency hub</a> · <a href="${esc(url.pathname + url.search + (url.search.includes("format=") ? "" : (url.search ? "&" : "?") + "format=pdf"))}">Download PDF</a></p>
      ${recipTable(sl.rows)}
      ${coverageNote(rec.meta)}
    </main>`;
  return html(layout(url, { title: `Report · ${rec.agency_name} · ${SITE}`, desc: sl.title, path: "/reports", body, noindex: true, canonicalOverride: url.origin + "/reports" }));
}

function pdfEscape(s) {
  return String(s || "").replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function buildPdf(rec, sl) {
  const lines = [];
  lines.push("US Federal Spending — on-demand report (sample)");
  lines.push((rec.agency_name || "") + " — " + (sl.title || ""));
  lines.push("Pull / ingest: " + (rec.pull_date_utc || "") + " UTC");
  lines.push(rec.change_note || "");
  lines.push("Coverage: sample. Official fields only: federal_action_obligation, recipient_name, recipient_uei.");
  lines.push("Source: USAspending Award Data Archive FY2025_All_Contracts_Full_20260806.zip");
  lines.push("");
  for (const r of (sl.rows || []).slice(0, 20)) {
    lines.push(`${(r.name || "").slice(0, 42)}  ${r.id || ""}  ${usd(r.obligation)}`);
  }
  lines.push("");
  lines.push(ATTR.slice(0, 220));
  const content = lines.map((ln, i) => `BT /F1 10 Tf 40 ${760 - i * 14} Td (${pdfEscape(ln.slice(0, 110))}) Tj ET`).join("\n");
  const objects = [];
  objects.push("1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj");
  objects.push("2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj");
  objects.push("3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj");
  objects.push(`4 0 obj << /Length ${content.length} >> stream\n${content}\nendstream endobj`);
  objects.push("5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj");
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (const obj of objects) {
    offsets.push(pdf.length);
    pdf += obj + "\n";
  }
  const xrefAt = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  for (let i = 1; i < offsets.length; i++) {
    pdf += String(offsets[i]).padStart(10, "0") + " 00000 n \n";
  }
  pdf += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF`;
  return pdf;
}

async function concentration(env, request, url) {
  const hub = (await loadJson(env, request, "/data/hub.json")) || { meta: {}, top_agencies: [], agency_year_cells: [] };
  const body = `
    <main class="wrap">
      <h1>Concentration</h1>
      ${shareBlock(url.origin + "/reports/concentration")}
      <p>Agency HHI in this sample: <strong>${esc(String(hub.agency_hhi))}</strong> (sum of squared agency shares of |obligation| × 10,000). Calculated, not observed.</p>
      ${coverageNote(hub.meta, `<p>${esc((hub.loaded_set && hub.loaded_set.change_note) || "")}</p>`)}
      <h2>Agency shares (top 20)</h2>
      ${barChart(hub.top_agencies || [], "obligation", "name", "Agency obligation shares, sample")}
      <h2>Highest hub HHI (recipient concentration)</h2>
      <table>
        <thead><tr><th>Agency hub</th><th>HHI</th><th>Obligation</th></tr></thead>
        <tbody>${[...(hub.agency_year_cells || [])].sort((a, b) => b.hhi - a.hhi).slice(0, 15).map((c) => `<tr><td><a href="/agencies/${esc(c.slug)}">${esc(c.agency_name)}</a></td><td>${c.hhi}</td><td>${usd(c.obligation)}</td></tr>`).join("")}</tbody>
      </table>
    </main>`;
  return html(layout(url, { title: `Concentration · ${SITE}`, desc: "Agency and recipient concentration (HHI) in the sample.", path: "/reports/concentration", body }));
}

async function recipientsPage(env, request, url) {
  const hub = (await loadJson(env, request, "/data/hub.json")) || { top_recipients: [], meta: {} };
  const body = `
    <main class="wrap">
      <h1>Companies and groups that received money</h1>
      ${shareBlock(url.origin + "/recipients")}
      <p>This list shows the largest recipients in the sample. We need at least three records before a recipient is included.</p>
      ${coverageNote(hub.meta)}
      <table>
        <thead><tr><th>Recipient</th><th>Id</th><th>Obligation (sample)</th><th>Rows</th></tr></thead>
        <tbody>${(hub.top_recipients || []).map((r) => `<tr><td>${esc(r.name)}</td><td><code>${esc(r.id)}</code></td><td>${usd(r.obligation)}</td><td>${r.award_count}</td></tr>`).join("")}</tbody>
      </table>
    </main>`;
  return html(layout(url, { title: `Recipients · ${SITE}`, desc: "Top recipients in the USAspending sample (min 3 rows).", path: "/recipients", body }));
}

async function about(url) {
  const body = `
    <main class="wrap">
      <h1>About</h1>
      ${shareBlock(url.origin + "/about")}
      <p>${SITE} is an independent evidence reader for US federal <em>contract</em> actions in one USAspending Award Data Archive file. It is not USAspending.gov, not a Treasury product, and not a complete picture of federal spending.</p>
      <p>This site helps you understand government contract money by agency. It does not create a page for every individual award or every year.</p>
      <p>Operator: 37X / ASAP Ventures. Related UK twin: <a href="https://ukpublicmoney.co.uk/">UK Public Money</a> (different corpus).</p>
    </main>`;
  return html(layout(url, { title: `About · ${SITE}`, desc: "Independent USAspending archive reader.", path: "/about", body }));
}

async function methodology(env, request, url) {
  const meta = (await loadJson(env, request, "/data/meta.json")) || {};
  const body = `
    <main class="wrap">
      <h1>Methodology</h1>
      ${shareBlock(url.origin + "/methodology")}
      ${coverageNote(meta)}
      <h2>Year</h2>
      <p>The US government year starts on 1 October. We work out the year from the date on each money record. Year is a filter, not a separate page.</p>
      <h2>What is summed</h2>
      <p>Observed: <code>federal_action_obligation</code> on each transaction row. Award-level running totals such as <code>total_dollars_obligated</code> are not summed (they would double-count).</p>
      <h2>Why some agencies are not shown</h2>
      <p>An agency page is shown only when the sample has at least 10 different awards or at least $10 million in contract money. This helps avoid misleading results from tiny samples.</p>
      <h2>Comparisons</h2>
      <p>Comparison figures are calculated from this sample. We compare each agency with the average agency and with four agencies of a similar size. The concentration number is also calculated.</p>
    </main>`;
  return html(layout(url, { title: `Methodology · ${SITE}`, desc: "How agency hubs are computed.", path: "/methodology", body }));
}

async function sources(env, request, url) {
  const meta = (await loadJson(env, request, "/data/meta.json")) || {};
  const body = `
    <main class="wrap">
      <h1>Data sources</h1>
      ${shareBlock(url.origin + "/data-sources")}
      ${coverageNote(meta)}
      <ul>
        <li>Official archive: <a href="https://www.usaspending.gov/download_center/award_data_archive">USAspending Award Data Archive</a></li>
        <li>File: ${esc(meta.file || "")} (published 20260806; copied to R2 on ${esc(meta.archive_date || "")})</li>
        <li>R2 object used for this build: ${esc(meta.r2_object || "")}</li>
        <li>Licence: ${esc(meta.licence || "")}</li>
      </ul>
      <p>Official search: <a href="https://www.usaspending.gov/">usaspending.gov</a>.</p>
    </main>`;
  return html(layout(url, { title: `Data sources · ${SITE}`, desc: "USAspending Award Data Archive provenance.", path: "/data-sources", body }));
}

async function sitemap(env, request, origin) {
  const list = (await loadJson(env, request, "/data/agencies.json")) || [];
  const urls = [
    `${origin}/`,
    `${origin}/agencies`,
    `${origin}/recipients`,
    `${origin}/reports`,
    `${origin}/reports/concentration`,
    `${origin}/about`,
    `${origin}/methodology`,
    `${origin}/data-sources`,
  ];
  for (const a of list) urls.push(`${origin}/agencies/${a.slug}`);
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `  <url><loc>${u}</loc></url>`).join("\n")}\n</urlset>\n`,
    { headers: { "content-type": "application/xml; charset=utf-8" } }
  );
}

function layout(url, { title, desc, path, body, noindex, canonicalOverride }) {
  const origin = url.origin;
  const canonical = canonicalOverride || `${origin}${path === "/" ? "/" : path}`;
  const structuredData = JSON.stringify({
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${origin}/#organization`,
        name: SITE,
        url: `${origin}/`,
        logo: `${origin}/logo.svg`,
      },
      {
        "@type": "WebSite",
        "@id": `${origin}/#website`,
        name: SITE,
        url: `${origin}/`,
        description: "Independent, source-attributed views of one clearly labelled USAspending contract-data sample; not complete national totals.",
        publisher: { "@id": `${origin}/#organization` },
      },
      {
        "@type": "WebPage",
        "@id": `${canonical}#webpage`,
        url: canonical,
        name: title,
        description: desc,
        isPartOf: { "@id": `${origin}/#website` },
      },
    ],
  }).replaceAll("<", "\\u003c");
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(desc)}">
  <meta name="robots" content="${noindex ? "noindex,follow" : "index,follow"}">
  <link rel="canonical" href="${esc(canonical)}">
  <link rel="icon" href="/favicon.ico" sizes="any">
  <link rel="icon" href="/favicon.svg" type="image/svg+xml">
  <link rel="apple-touch-icon" href="/apple-touch-icon.png">
  <link rel="manifest" href="/site.webmanifest">
  <meta name="theme-color" content="#0a3161">
  <meta property="og:title" content="${esc(title)}">
  <meta property="og:description" content="${esc(desc)}">
  <meta property="og:type" content="website">
  <meta property="og:url" content="${esc(canonical)}">
  <meta property="og:image" content="${esc(origin)}/og.png">
  <meta property="og:site_name" content="${esc(SITE)}">
  <meta name="twitter:card" content="summary_large_image">
  <script type="application/ld+json">${structuredData}</script>
  <script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag("consent","default",{analytics_storage:"denied",ad_storage:"denied",ad_user_data:"denied",ad_personalization:"denied"});function enableAnalytics(){try{localStorage.setItem("uspm-analytics","granted")}catch(e){}gtag("consent","update",{analytics_storage:"granted"});var s=document.createElement("script");s.async=true;s.src="https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}";document.head.appendChild(s);gtag("js",new Date());gtag("config","${GA_MEASUREMENT_ID}",{anonymize_ip:true})}try{if(localStorage.getItem("uspm-analytics")==="granted")enableAnalytics()}catch(e){}</script>
  <style>
    :root { --navy:#0a3161; --gold:#c5a572; --paper:#f4f1ea; --ink:#1b1b18; --muted:#5c574c; --card:#fffdf8; }
    * { box-sizing:border-box; }
    body { margin:0; font: 18px/1.5 "Nimbus Roman", "Times New Roman", Georgia, serif; color:var(--ink); background:var(--paper); }
    h1,h2,h3 { font-weight:700; letter-spacing:-0.01em; }
    header { background:var(--navy); color:var(--paper); border-bottom:4px solid var(--gold); }
    header .wrap { max-width:980px; margin:0 auto; padding:.75rem 1.2rem; display:flex; flex-wrap:wrap; gap:.8rem 1.2rem; align-items:center; }
    .brand { display:flex; align-items:center; gap:.6rem; color:var(--paper); text-decoration:none; font-weight:700; }
    .brand img { width:40px; height:40px; }
    nav { display:flex; gap:1rem; flex-wrap:wrap; }
    header a, footer a { color:#e6d5b8; }
    .hero { background:linear-gradient(180deg,#0a3161 0%, #123e73 100%); color:var(--paper); padding:2rem 0 2.2rem; }
    .hero .lede, .hero .note { color:#d9d0c3; }
    .wrap { max-width:980px; margin:0 auto; padding:1.1rem 1.2rem; }
    .kicker { letter-spacing:.12em; text-transform:uppercase; font-size:.72rem; color:var(--gold); margin:0 0 .4rem; }
    .figure { font-size:2.1rem; margin:.2rem 0; color:var(--navy); }
    .hero .figure { color:var(--gold); }
    .answer { background:var(--card); border-left:8px solid var(--gold); padding:1rem 1.1rem; margin:1rem 0; }
    .prov { background:#e8eef6; border:1px solid #b9c4d6; padding:1rem; margin:1rem 0; }
    .filters { display:flex; flex-wrap:wrap; gap:.7rem; align-items:end; background:var(--card); color:var(--ink); padding:.8rem; }
    .filters label { display:flex; flex-direction:column; font-size:.85rem; gap:.2rem; }
    .filters select { min-width:12rem; padding:.4rem .5rem; font:inherit; }
    button, .copy { background:var(--gold); color:var(--navy); border:0; padding:.45rem .8rem; font:inherit; cursor:pointer; }
    .grid { list-style:none; padding:0; display:grid; gap:.6rem; grid-template-columns:repeat(auto-fill,minmax(240px,1fr)); }
    .grid li { background:var(--card); padding:.75rem; border-top:4px solid var(--navy); }
    table { display:block; width:100%; max-width:100%; overflow-x:auto; border-collapse:collapse; background:var(--card); }
    th,td { text-align:left; padding:.4rem .5rem; border-bottom:1px solid #e4ddd0; vertical-align:top; }
    .share { display:flex; flex-wrap:wrap; gap:.5rem; align-items:center; }
    .share span { font-size:.75rem; letter-spacing:.08em; }
    .note, small, figcaption { color:var(--muted); font-size:.9rem; }
    a { color:var(--navy); }
    figure svg { background:var(--navy); padding:8px; }
    footer { background:var(--navy); color:#e7ddd0; margin-top:2rem; border-top:4px solid var(--gold); }
    code { font-size:.85em; }
  </style>
</head>
<body>
  <header>
    <div class="wrap">
      <a class="brand" href="/"><img src="/logo.svg" width="40" height="40" alt="">${SITE}</a>
      <nav>
        <a href="/">Home</a>
        <a href="/agencies">Agencies</a>
        <a href="/recipients">Recipients</a>
        <a href="/reports">Reports</a>
        <a href="/reports/concentration">Concentration</a>
        <a href="/methodology">Method</a>
        <a href="/data-sources">Sources</a>
        <a href="/about">About</a>
      </nav>
    </div>
  </header>
  ${body}
  <footer>
    <div class="wrap">
      <p>${esc(ATTR)}</p>
      <p>Owner/operator: <a href="https://37xventures.com/#contact" rel="noopener noreferrer">37X Ventures</a>.</p>
      ${shareBlock(canonical)}
      <p><a href="/about">About</a> · <a href="/methodology">Methodology</a> · <a href="/data-sources">Data sources</a> · <a href="mailto:hello@uspublicmoney.com?subject=US%20Public%20Money%20correction">Report a correction</a> · No /awards pages.</p>
      <p><button type="button" onclick="enableAnalytics()">Allow analytics</button> Analytics is optional and off by default.</p>
      <p id="catalogue-status" aria-live="polite">Shared catalogue status: checking…</p>
    </div>
  </footer>
  <script>
    fetch("https://atlas-open-data-ingest.rewardspy.workers.dev/public-catalog/site/uspublicmoney.com").then(r=>r.ok?r.json():Promise.reject()).then(d=>{const ids=(d.datasets||[]).map(x=>x.id),f=[];if(ids.includes("grants-gov"))f.push("dated federal opportunities");if(ids.includes("sec-edgar"))f.push("issuer identity");if(ids.includes("world-bank"))f.push("country-level context");document.getElementById("catalogue-status").textContent="Shared catalogue checked "+String(d.generatedAt).slice(0,10)+": "+(f.join(", ")||"no additional public-money layer")+" listed as candidates. Catalogue presence is not publication approval. Opportunity records are not awards or spending, and company or country context never becomes a payment claim."}).catch(()=>document.getElementById("catalogue-status").textContent="Shared catalogue unavailable; publication remains fail-closed."); 
    document.addEventListener("click", (e) => {
      const b = e.target.closest(".copy");
      if (!b) return;
      const u = b.getAttribute("data-url");
      if (navigator.clipboard) navigator.clipboard.writeText(u);
      b.textContent = "Copied";
    });
  </script>
</body>
</html>`;
}

function html(s, status = 200) {
  return new Response(s, { status, headers: secureHeaders("text/html; charset=utf-8") });
}
function text(s) {
  return new Response(s, { headers: secureHeaders("text/plain; charset=utf-8") });
}
function secureHeaders(contentType) {
  return {
    "content-type": contentType,
    "strict-transport-security": "max-age=31536000; includeSubDomains",
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
    "referrer-policy": "strict-origin-when-cross-origin",
    "permissions-policy": "camera=(), microphone=(), geolocation=()",
    "content-security-policy": "default-src 'self'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'; object-src 'none'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline' https://www.googletagmanager.com https://static.cloudflareinsights.com; connect-src 'self' https://atlas-open-data-ingest.rewardspy.workers.dev https://www.google-analytics.com https://*.google-analytics.com https://cloudflareinsights.com; upgrade-insecure-requests"
  };
}
function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

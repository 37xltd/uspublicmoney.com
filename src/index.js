/**
 * US Federal Spending — precomputed projections only.
 * Does not scan R2 bulk archives on request.
 */
const SITE = "US Federal Spending";
const DESC = "Agency × fiscal-year contract obligations from the USAspending Award Data Archive. Independent reader; not Treasury or OMB.";
const ATTR = "Derived from USAspending.gov (U.S. Department of the Treasury, Bureau of the Fiscal Service). U.S. government work, public domain (17 U.S.C. 105). This site is not the official USAspending search and is not endorsed by Treasury or OMB.";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
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
        return assetFile(env, path === "/favicon.ico" ? "/favicon.png" : path, path === "/favicon.ico" ? "image/png" : null);
      }
      if (path === "/robots.txt") {
        return text(`User-agent: *\nAllow: /\nDisallow: /*?\nSitemap: ${url.origin}/sitemap.xml\n`);
      }
      if (path === "/sitemap.xml") return sitemap(env, request, url.origin);
      if (path === "/") return home(env, request, url);
      if (path === "/agencies") return agenciesIndex(env, request, url);
      if (path === "/recipients") return recipientsPage(env, request, url);
      if (path === "/reports/concentration") return concentration(env, request, url);
      if (path === "/about") return about(url);
      if (path === "/methodology") return methodology(env, request, url);
      if (path === "/data-sources") return sources(env, request, url);
      const fyReport = path.match(/^\/reports\/(fy)?(\d{4})$/);
      if (fyReport) return fyPage(env, request, url, fyReport[2]);
      const agFy = path.match(/^\/agencies\/([a-z0-9-]+)\/(\d{4})$/);
      if (agFy) return agencyYear(env, request, url, agFy[1], agFy[2]);
      const ag = path.match(/^\/agencies\/([a-z0-9-]+)$/);
      if (ag) return agencyPage(env, request, url, ag[1]);
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

function shareBlock(canonical) {
  return `<p class="share"><span>SHARE</span> <button type="button" class="copy" data-url="${esc(canonical)}">Copy link</button> <a href="mailto:?subject=${encodeURIComponent(SITE)}&amp;body=${encodeURIComponent(canonical)}">Email</a> <a href="https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(canonical)}">LinkedIn</a> <a href="https://twitter.com/intent/tweet?url=${encodeURIComponent(canonical)}">X</a></p>`;
}

function filterBar(hub, fy, agency) {
  const years = (hub.fiscal_years || []).map((y) => `<option value="${y.fy}"${String(fy) === String(y.fy) ? " selected" : ""}>FY ${y.fy}</option>`).join("");
  const ags = (hub.agency_year_cells || []).map((c) => `<option value="${esc(c.slug)}"${c.slug === agency ? " selected" : ""}>${esc(c.agency_name)}</option>`).join("");
  return `<form class="filters" action="/" method="get">
    <label>Fiscal year <select name="fy"><option value="">All in sample</option>${years}</select></label>
    <label>Agency <select name="agency"><option value="">All agencies</option>${ags}</select></label>
    <button type="submit">Apply</button>
  </form>
  <p class="note">Filters are query state only (noindex). They do not create extra URLs.</p>`;
}

function coverageNote(meta) {
  meta = meta || {};
  return `<aside class="prov">
    <h2>Source, date, method</h2>
    <p><strong>Coverage:</strong> ${esc(meta.coverage || "Sample of one archive chunk. Not full-archive totals.")}</p>
    <p><strong>Source:</strong> ${esc(meta.source || "USAspending.gov Award Data Archive")} · file ${esc(meta.file || "")} · member ${esc(meta.member || "")} · archive date ${esc(meta.archive_date || "")}.</p>
    <p><strong>Method:</strong> ${esc(meta.method || "")}</p>
    <p><strong>Rows in this projection:</strong> ${esc(String(meta.rows_parsed ?? "n/a"))} transaction rows. Units: US dollars of <code>federal_action_obligation</code>. Denominator: this sample only.</p>
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
  const fyLine = (hub.fiscal_years || []).map((y) => `<li>FY ${y.fy}: ${usd(y.obligation)} · ${y.award_count.toLocaleString("en-US")} awards · ${y.action_count.toLocaleString("en-US")} actions (sample)</li>`).join("");
  const body = `
    <main>
      <section class="hero">
        <div class="wrap">
          <p class="kicker">United States · contract actions · sample</p>
          <h1>Who obligated what, by awarding agency and fiscal year.</h1>
          <p class="lede">Independent projection of USAspending Award Data Archive contracts. Not a search of every award. No per-award pages.</p>
          ${shareBlock(url.origin + "/")}
          ${filterBar(hub, fy, agency)}
        </div>
      </section>
      <div class="wrap">
        <div class="answer">
          <p class="kicker">Sample total in view</p>
          <p class="figure">${usd(total)}</p>
          <p>${awards.toLocaleString("en-US")} distinct awards · ${actions.toLocaleString("en-US")} transaction rows · agency HHI ${esc(String(hub.agency_hhi))} (0–10,000, calculated on this sample’s agency obligation shares).</p>
        </div>
        ${coverageNote(hub.meta)}
        <h2>Fiscal years in this projection</h2>
        <ul>${fyLine || "<li>None</li>"}</ul>
        <h2>Top awarding agencies</h2>
        ${barChart(hub.top_agencies || [], "obligation", "name", "Top agencies by summed federal_action_obligation in this sample")}
        <table>
          <thead><tr><th>Agency</th><th>Code</th><th>Obligation (sample)</th><th>Awards</th></tr></thead>
          <tbody>${(hub.top_agencies || []).map((a) => `<tr><td><a href="/agencies/${esc(a.slug)}/2025">${esc(a.name)}</a></td><td>${esc(a.code)}</td><td>${usd(a.obligation)}</td><td>${(a.award_count || 0).toLocaleString("en-US")}</td></tr>`).join("")}</tbody>
        </table>
        <h2>Top recipients in sample (min 3 transaction rows)</h2>
        <table>
          <thead><tr><th>Recipient</th><th>UEI / id</th><th>Obligation (sample)</th><th>Rows</th></tr></thead>
          <tbody>${(hub.top_recipients || []).map((r) => `<tr><td>${esc(r.name)}</td><td><code>${esc(r.id)}</code></td><td>${usd(r.obligation)}</td><td>${(r.award_count || 0).toLocaleString("en-US")}</td></tr>`).join("")}</tbody>
        </table>
        <p class="note">Recipient names can repeat under different UEIs; IDs are listed separately. There are no /recipients/{id} pages.</p>
        <h2>Agency × FY cells that pass min-N</h2>
        <p>${cells.length} cells shown${filtered ? " after filters" : ""}.</p>
        <ul class="grid">${cells.map((c) => `<li><a href="/agencies/${esc(c.slug)}/${c.fy}">${esc(c.agency_name)} · FY ${c.fy}</a><span>${usd(c.obligation)} · ${c.award_count} awards · HHI ${c.hhi}</span></li>`).join("")}</ul>
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
      <p>Pages exist only where an agency × FY cell passes min-N (at least 10 awards or $10 million |obligation| in this sample).</p>
      ${coverageNote(hub.meta)}
      <ul class="grid">${list.map((a) => `<li><a href="/agencies/${esc(a.slug)}">${esc(a.name)}</a><span>code ${esc(a.code)} · FY ${esc((a.years || []).join(", "))}</span></li>`).join("")}</ul>
    </main>`;
  return html(layout(url, { title: `Agencies · ${SITE}`, desc: "Awarding agencies with min-N agency × FY reports.", path: "/agencies", body }));
}

async function agencyPage(env, request, url, slug) {
  const list = (await loadJson(env, request, "/data/agencies.json")) || [];
  const ag = list.find((a) => a.slug === slug);
  if (!ag) {
    return html(layout(url, { title: `Agency not in sample · ${SITE}`, desc: DESC, path: url.pathname, body: `<main class="wrap"><h1>Agency not in this sample</h1></main>` }), 404);
  }
  const hub = (await loadJson(env, request, "/data/hub.json")) || { meta: {} };
  const years = (ag.years || []).sort();
  const body = `
    <main class="wrap">
      <p class="crumb"><a href="/">Home</a> / <a href="/agencies">Agencies</a> / ${esc(ag.name)}</p>
      <h1>${esc(ag.name)}</h1>
      ${shareBlock(url.origin + "/agencies/" + slug)}
      <p>Awarding agency code <code>${esc(ag.code)}</code>. Year reports:</p>
      <ul>${years.map((y) => `<li><a href="/agencies/${esc(slug)}/${y}">FY ${y}</a></li>`).join("")}</ul>
      ${coverageNote(hub.meta)}
    </main>`;
  return html(layout(url, { title: `${ag.name} · ${SITE}`, desc: `Sample FY reports for ${ag.name}.`, path: `/agencies/${slug}`, body }));
}

async function agencyYear(env, request, url, slug, fy) {
  const rec = await loadJson(env, request, `/data/agencies/${slug}-${fy}.json`);
  if (!rec || !rec.min_n_pass) {
    return html(layout(url, { title: `Not published · ${SITE}`, desc: DESC, path: url.pathname, body: `<main class="wrap"><h1>Not published</h1><p>This agency × FY cell is missing or fails min-N.</p></main>` }), 404);
  }
  const hub = (await loadJson(env, request, "/data/hub.json")) || { meta: {} };
  const body = `
    <main class="wrap">
      <p class="crumb"><a href="/">Home</a> / <a href="/agencies">Agencies</a> / <a href="/agencies/${esc(slug)}">${esc(rec.agency_name)}</a> / FY ${esc(fy)}</p>
      <h1>${esc(rec.agency_name)} · FY ${esc(fy)}</h1>
      ${shareBlock(url.origin + `/agencies/${slug}/${fy}`)}
      <div class="answer">
        <p class="figure">${usd(rec.obligation)}</p>
        <p>Sum of <code>federal_action_obligation</code> in this sample. ${rec.award_count.toLocaleString("en-US")} distinct awards · ${rec.action_count.toLocaleString("en-US")} actions · ${rec.recipient_count.toLocaleString("en-US")} recipients · recipient HHI ${rec.hhi} (calculated on |obligation| shares in this cell).</p>
      </div>
      ${coverageNote(hub.meta)}
      <h2>Top recipients (min 3 rows in this cell)</h2>
      ${barChart(rec.top_recipients || [], "obligation", "name", "Top recipients in this agency × FY sample cell")}
      <table>
        <thead><tr><th>Recipient</th><th>Id</th><th>Obligation</th><th>Rows</th></tr></thead>
        <tbody>${(rec.top_recipients || []).map((r) => `<tr><td>${esc(r.name)}</td><td><code>${esc(r.id)}</code></td><td>${usd(r.obligation)}</td><td>${r.action_count}</td></tr>`).join("")}</tbody>
      </table>
    </main>`;
  return html(layout(url, { title: `${rec.agency_name} FY ${fy} · ${SITE}`, desc: `Sample obligated amount for ${rec.agency_name} in FY ${fy}.`, path: `/agencies/${slug}/${fy}`, body }));
}

async function fyPage(env, request, url, fy) {
  const hub = (await loadJson(env, request, "/data/hub.json")) || { fiscal_years: [], agency_year_cells: [], meta: {} };
  const y = (hub.fiscal_years || []).find((x) => String(x.fy) === String(fy));
  if (!y) {
    return html(layout(url, { title: `FY ${fy} not in sample · ${SITE}`, desc: DESC, path: url.pathname, body: `<main class="wrap"><h1>FY ${esc(fy)} is not in this sample</h1></main>` }), 404);
  }
  const cells = (hub.agency_year_cells || []).filter((c) => String(c.fy) === String(fy));
  const body = `
    <main class="wrap">
      <h1>FY ${esc(fy)} sample</h1>
      ${shareBlock(url.origin + "/reports/" + fy)}
      <div class="answer"><p class="figure">${usd(y.obligation)}</p><p>${y.award_count.toLocaleString("en-US")} awards · ${y.action_count.toLocaleString("en-US")} actions in this sample.</p></div>
      ${coverageNote(hub.meta)}
      <table>
        <thead><tr><th>Agency</th><th>Obligation</th><th>Awards</th><th>HHI</th></tr></thead>
        <tbody>${cells.map((c) => `<tr><td><a href="/agencies/${esc(c.slug)}/${fy}">${esc(c.agency_name)}</a></td><td>${usd(c.obligation)}</td><td>${c.award_count}</td><td>${c.hhi}</td></tr>`).join("")}</tbody>
      </table>
    </main>`;
  return html(layout(url, { title: `FY ${fy} report · ${SITE}`, desc: `Sample FY ${fy} agency obligations.`, path: `/reports/${fy}`, body }));
}

async function concentration(env, request, url) {
  const hub = (await loadJson(env, request, "/data/hub.json")) || { meta: {}, top_agencies: [], agency_year_cells: [] };
  const body = `
    <main class="wrap">
      <h1>Concentration</h1>
      ${shareBlock(url.origin + "/reports/concentration")}
      <p>Agency HHI in this sample: <strong>${esc(String(hub.agency_hhi))}</strong> (sum of squared agency shares of |obligation| × 10,000). Calculated, not observed. Cell-level recipient HHI is on each agency × FY page.</p>
      ${coverageNote(hub.meta)}
      <h2>Agency shares (top 20)</h2>
      ${barChart(hub.top_agencies || [], "obligation", "name", "Agency obligation shares, sample")}
      <h2>Highest cell HHI (recipient concentration)</h2>
      <table>
        <thead><tr><th>Agency × FY</th><th>HHI</th><th>Obligation</th></tr></thead>
        <tbody>${[...(hub.agency_year_cells || [])].sort((a, b) => b.hhi - a.hhi).slice(0, 15).map((c) => `<tr><td><a href="/agencies/${esc(c.slug)}/${c.fy}">${esc(c.agency_name)} FY ${c.fy}</a></td><td>${c.hhi}</td><td>${usd(c.obligation)}</td></tr>`).join("")}</tbody>
      </table>
    </main>`;
  return html(layout(url, { title: `Concentration · ${SITE}`, desc: "Agency and recipient concentration (HHI) in the sample.", path: "/reports/concentration", body }));
}

async function recipientsPage(env, request, url) {
  const hub = (await loadJson(env, request, "/data/hub.json")) || { top_recipients: [], meta: {} };
  const body = `
    <main class="wrap">
      <h1>Recipients (national sample list)</h1>
      ${shareBlock(url.origin + "/recipients")}
      <p>One index of top recipients with at least 3 transaction rows. No per-recipient URLs (URL-farm rule).</p>
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
      <p>${SITE} is an independent evidence reader for US federal <em>contract</em> actions in one USAspending Award Data Archive file. It is not USAspending.gov, not a Treasury product, and not a complete picture of federal spending (grants, loans, and later zip members are out of this projection).</p>
      <p>Public pages are agency and year reports that clear min-N. There are no <code>/awards/</code> pages.</p>
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
      <h2>Fiscal year</h2>
      <p>US federal FY starts 1 October. FY is taken from <code>action_date</code> (year + 1 when month ≥ 10). The archive filename is FY2025; this sample’s dates all mapped to FY 2025.</p>
      <h2>What is summed</h2>
      <p><code>federal_action_obligation</code> on each transaction row. Award-level running totals such as <code>total_dollars_obligated</code> are not summed (they would double-count).</p>
      <h2>Min-N</h2>
      <p>An agency × FY HTML page is published only if distinct <code>contract_award_unique_key</code> count ≥ 10 or |obligation| ≥ $10,000,000 in this sample. Recipient rows on lists require ≥ 3 transaction rows. Empty cells are omitted (404), not noindexed shells.</p>
      <h2>HHI</h2>
      <p>Calculated: sum of squared shares of |obligation| × 10,000. Labelled calculated.</p>
    </main>`;
  return html(layout(url, { title: `Methodology · ${SITE}`, desc: "How agency × FY sums are computed.", path: "/methodology", body }));
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
        <li>R2 object used for this build: ${esc(meta.r2_object || "")} (${esc(String(meta.part_bytes || ""))} bytes)</li>
        <li>Licence: ${esc(meta.licence || "")}</li>
      </ul>
      <p>Official search: <a href="https://www.usaspending.gov/">usaspending.gov</a>. Use that product to look up a single award.</p>
    </main>`;
  return html(layout(url, { title: `Data sources · ${SITE}`, desc: "USAspending Award Data Archive provenance.", path: "/data-sources", body }));
}

async function sitemap(env, request, origin) {
  const list = (await loadJson(env, request, "/data/agencies.json")) || [];
  const hub = (await loadJson(env, request, "/data/hub.json")) || { fiscal_years: [] };
  const urls = [
    `${origin}/`,
    `${origin}/agencies`,
    `${origin}/recipients`,
    `${origin}/reports/concentration`,
    `${origin}/about`,
    `${origin}/methodology`,
    `${origin}/data-sources`,
  ];
  for (const y of hub.fiscal_years || []) urls.push(`${origin}/reports/${y.fy}`);
  for (const a of list) {
    urls.push(`${origin}/agencies/${a.slug}`);
    for (const y of a.years || []) urls.push(`${origin}/agencies/${a.slug}/${y}`);
  }
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `  <url><loc>${u}</loc></url>`).join("\n")}\n</urlset>\n`,
    { headers: { "content-type": "application/xml; charset=utf-8" } }
  );
}

function layout(url, { title, desc, path, body, noindex }) {
  const origin = url.origin;
  const canonical = `${origin}${path === "/" ? "/" : path}`;
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(desc)}">
  ${noindex ? `<meta name="robots" content="noindex,follow">` : ""}
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
  <meta name="twitter:title" content="${esc(title)}">
  <meta name="twitter:description" content="${esc(desc)}">
  <style>
    :root { --navy:#0a3161; --gold:#c5a572; --paper:#f4f1ea; --ink:#1b1b18; --muted:#5c574c; --card:#fffdf8; }
    * { box-sizing:border-box; }
    body { margin:0; font: 18px/1.5 "Nimbus Roman", "Times New Roman", Georgia, serif; color:var(--ink); background:var(--paper); }
    h1,h2 { font-weight:700; letter-spacing:-0.01em; }
    header { background:var(--navy); color:var(--paper); border-bottom:4px solid var(--gold); }
    header .wrap { max-width:980px; margin:0 auto; padding:.75rem 1.2rem; display:flex; flex-wrap:wrap; gap:.8rem 1.2rem; align-items:center; }
    .brand { display:flex; align-items:center; gap:.6rem; color:var(--paper); text-decoration:none; font-weight:700; }
    .brand svg, .brand img { width:40px; height:40px; }
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
    table { width:100%; border-collapse:collapse; background:var(--card); }
    th,td { text-align:left; padding:.4rem .5rem; border-bottom:1px solid #e4ddd0; vertical-align:top; }
    .share { display:flex; flex-wrap:wrap; gap:.5rem; align-items:center; }
    .share span { font-size:.75rem; letter-spacing:.08em; }
    .meta, .note, small, figcaption { color:var(--muted); font-size:.9rem; }
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
      ${shareBlock(canonical)}
      <p><a href="/about">About</a> · <a href="/methodology">Methodology</a> · <a href="/data-sources">Data sources</a> · No /awards pages.</p>
    </div>
  </footer>
  <script>
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
  return new Response(s, { status, headers: { "content-type": "text/html; charset=utf-8" } });
}
function text(s) {
  return new Response(s, { headers: { "content-type": "text/plain; charset=utf-8" } });
}
function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

#!/usr/bin/env node
// Fetches the latest official communications from the USR Marche / USP
// Macerata site (uspmc.sinp.net) and writes them to school-news.json, which
// the homepage's "News" section (see index.html/#news) fetches alongside
// news.json and renders under the "Scuola" category. No AI/API key involved,
// same policy as scripts/fetch-news.mjs: the site has no public API or a
// feed covering these announcements (its WordPress RSS feed only covers an
// unrelated legacy blog), so this does a small, targeted regex scrape
// instead — of the site's full "Tutte le notizie" archive (paginated, ~10
// items per page, oldest going back years), not just the homepage's
// abbreviated "In primo piano" excerpt.
//
// Usage:
//   node scripts/fetch-school-news.mjs
//
// Run daily via .github/workflows/news-sync.yml, or by hand to refresh
// school-news.json locally.

import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { request } from "node:https";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const OUT_PATH = join(ROOT, "school-news.json");

const SOURCE_URL = "https://www.uspmc.sinp.net/tutte-le-notizie/";
const PAGE_URL = (n) => `https://www.uspmc.sinp.net/tutte-le-notizie/page/${n}/`;
const MAX_AGE_DAYS = 32; // "last month" of announcements, browsed in full (no fixed item cap)
const MAX_ITEMS = 60; // sanity ceiling in case the archive ever lists far more than usual
const MAX_PAGES = 5; // the archive is ~10 items/page and ~267 pages deep — stop well before the cutoff date could ever need more

// The site's own TLS certificate is misconfigured — it's issued for a
// completely different domain (verified with `openssl s_client`), and the
// chain is incomplete, so every standards-compliant client (including
// Node's default fetch) refuses the connection. Diego confirmed skipping
// verification for this one, specific, known destination — done via a
// plain node:https request with its own Agent rather than global fetch, so
// this doesn't weaken TLS verification for anything else in the process.
function fetchInsecure(url) {
  return new Promise((resolve, reject) => {
    const req = request(
      url,
      { headers: { "User-Agent": "fetch-school-news-script" }, rejectUnauthorized: false },
      (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          fetchInsecure(new URL(res.headers.location, url).toString()).then(resolve, reject);
          return;
        }
        if (res.statusCode !== 200) {
          res.resume();
          reject(new Error(`${res.statusCode} ${res.statusMessage}`));
          return;
        }
        let data = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => resolve(data));
      }
    );
    req.on("error", reject);
    req.end();
  });
}

// Matches each archive entry: a headline link (the site's theme always
// marks these with rel="bookmark", unlike the featured-image link next to
// each entry, which carries rel="nofollow") followed — a fair bit further
// down, past a thumbnail and an info table — by a
// "Data di pubblicazione</td><td class="valore">DD/MM/YYYY" cell.
const ITEM_RE =
  /<a href="([^"]+)"[^>]*title="([^"]*)"[^>]*rel="bookmark">([^<]*)<\/a>[\s\S]{0,2500}?Data di pubblicazione<\/td>\s*<td class="valore">(\d{2})\/(\d{2})\/(\d{4})/g;

function decodeHtmlEntities(s) {
  return s
    .replace(/&#8217;/g, "’")
    .replace(/&#8216;/g, "‘")
    .replace(/&#8220;/g, "“")
    .replace(/&#8221;/g, "”")
    .replace(/&#8211;/g, "–")
    .replace(/&#8212;/g, "—")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function parseItems(html) {
  const items = [];
  ITEM_RE.lastIndex = 0;
  let m;
  while ((m = ITEM_RE.exec(html))) {
    const [, href, titleAttr, linkText, dd, mm, yyyy] = m;
    let url;
    try {
      url = new URL(href, SOURCE_URL).toString();
    } catch {
      continue;
    }

    const title = decodeHtmlEntities((linkText || titleAttr || "").trim());
    if (!title) continue;

    // Only a publication date is available (no time of day) — pin it to a
    // fixed hour so sorting/cutoff math is stable without implying more
    // precision than the source actually gives.
    const time = Math.floor(new Date(`${yyyy}-${mm}-${dd}T09:00:00+02:00`).getTime() / 1000);
    if (Number.isNaN(time)) continue;

    items.push({ id: url, title, url, source: "uspmc.sinp.net", time, category: "scuola" });
  }
  return items;
}

async function main() {
  const cutoff = Date.now() / 1000 - MAX_AGE_DAYS * 24 * 3600;
  const seen = new Set();
  const items = [];

  for (let page = 1; page <= MAX_PAGES; page++) {
    const url = page === 1 ? SOURCE_URL : PAGE_URL(page);
    let html;
    try {
      html = await fetchInsecure(url);
    } catch (err) {
      console.error(`Could not fetch ${url}: ${err.message}`);
      break; // keep whatever earlier pages already yielded
    }

    const pageItems = parseItems(html).filter((it) => {
      if (seen.has(it.id)) return false;
      seen.add(it.id);
      return true;
    });
    if (pageItems.length === 0) break; // no (new) items parsed — markup changed, or archive exhausted

    items.push(...pageItems);

    // Once an entire page falls before the cutoff, older pages will too
    // (the archive is in reverse-chronological order) — stop paging.
    const oldestOnPage = Math.min(...pageItems.map((it) => it.time));
    if (oldestOnPage < cutoff) break;
  }

  const kept = items
    .filter((it) => it.time >= cutoff)
    .sort((a, b) => b.time - a.time)
    .slice(0, MAX_ITEMS);

  if (kept.length === 0) {
    console.warn("Parsed 0 items in range — the site's markup may have changed; leaving school-news.json untouched.");
    return;
  }

  const payload = {
    generatedAt: new Date().toISOString(),
    items: kept,
  };

  await writeFile(OUT_PATH, JSON.stringify(payload, null, 2) + "\n", "utf8");
  console.log(`Wrote ${kept.length} school stories to school-news.json`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

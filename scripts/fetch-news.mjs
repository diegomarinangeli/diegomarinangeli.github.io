#!/usr/bin/env node
// Fetches today's top tech/CS stories from Hacker News's public, keyless
// Firebase API and writes them to news.json, which the homepage's "News"
// section (see index.html/#news) fetches and renders client-side. No
// AI/API key involved — same policy as scripts/generate-project.mjs.
//
// Usage:
//   node scripts/fetch-news.mjs
//
// Run daily via .github/workflows/news-sync.yml, or by hand to refresh
// news.json locally.

import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const OUT_PATH = join(ROOT, "news.json");

const TOP_STORIES_URL = "https://hacker-news.firebaseio.com/v0/topstories.json";
const ITEM_URL = (id) => `https://hacker-news.firebaseio.com/v0/item/${id}.json`;

const CANDIDATE_COUNT = 90; // how many top-story ids to inspect
const TARGET_COUNT = 24; // how many stories to keep, after filtering
const MIN_SCORE = 40;
const CONCURRENCY = 10;

// Best-effort category tagging from the title alone — good enough to power
// the site's interest filter, not meant to be perfectly accurate. First
// matching rule wins; keep IDs in sync with the CATEGORIES list in
// script.js (the "News" section IIFE).
const CATEGORY_RULES = [
  {
    id: "ai",
    keywords: [
      "ai ", " ai", "artificial intelligence", "llm", "gpt", "openai", "anthropic",
      "claude", "machine learning", "neural", "chatgpt", "gemini", "diffusion model",
    ],
  },
  {
    id: "security",
    keywords: [
      "security", "vulnerab", "exploit", "breach", "cve", "ransomware", "malware",
      "hack", "encrypt", "privacy", "phishing",
    ],
  },
  {
    id: "webdev",
    keywords: [
      "javascript", "typescript", "react", "css", "html", "browser", "web dev",
      "frontend", "front-end", "node.js", "http", "api ",
    ],
  },
  {
    id: "languages",
    keywords: [
      "rust", "python", "golang", " go ", "programming language", "compiler",
      "c++", "kotlin", "swift", "ruby", "java ",
    ],
  },
  {
    id: "hardware",
    keywords: [
      "chip", "cpu", "gpu", "hardware", "processor", "silicon", "raspberry pi",
      "arduino", "risc-v", "semiconductor", "robot",
    ],
  },
  {
    id: "startup",
    keywords: [
      "startup", "funding", "raises", "acquire", "acquisition", "ipo",
      "valuation", "y combinator", "venture",
    ],
  },
  {
    id: "science",
    keywords: [
      "research", "study", "physics", "space", "nasa", "biology", "quantum",
      "science", "algorithm", "math",
    ],
  },
];

function categorize(title) {
  const t = ` ${title.toLowerCase()} `;
  for (const rule of CATEGORY_RULES) {
    if (rule.keywords.some((k) => t.includes(k))) return rule.id;
  }
  return "other";
}

function hostnameOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "news.ycombinator.com";
  }
}

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}

async function mapWithConcurrency(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const idx = next++;
      results[idx] = await fn(items[idx]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

async function main() {
  const ids = (await fetchJson(TOP_STORIES_URL)).slice(0, CANDIDATE_COUNT);
  const rawItems = await mapWithConcurrency(ids, CONCURRENCY, (id) => fetchJson(ITEM_URL(id)).catch(() => null));

  const items = rawItems
    .filter((it) => it && it.type === "story" && it.url && !it.dead && !it.deleted && it.title)
    .filter((it) => (it.score || 0) >= MIN_SCORE)
    .sort((a, b) => b.score - a.score)
    .slice(0, TARGET_COUNT)
    .map((it) => ({
      id: it.id,
      title: it.title,
      url: it.url,
      source: hostnameOf(it.url),
      points: it.score || 0,
      comments: it.descendants || 0,
      time: it.time,
      category: categorize(it.title),
      discussionUrl: `https://news.ycombinator.com/item?id=${it.id}`,
    }));

  const payload = {
    generatedAt: new Date().toISOString(),
    items,
  };

  await writeFile(OUT_PATH, JSON.stringify(payload, null, 2) + "\n", "utf8");
  console.log(`Wrote ${items.length} stories to news.json`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

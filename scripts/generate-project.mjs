#!/usr/bin/env node
// Generates a project card + detail page + cover gradient for a GitHub repo,
// matching the hand-drawn line-art style already used on the site. Drafts
// copy purely from the repo's own metadata/README — no AI calls involved,
// so this can run unattended (e.g. in CI) with nothing but GITHUB_TOKEN.
//
// Usage:
//   node scripts/generate-project.mjs <owner>/<repo> [--slug=custom-slug]
//   node scripts/generate-project.mjs --sync
//
// Env (via exported shell vars or a local .env, see .env.example):
//   GITHUB_TOKEN       optional — raises GitHub API rate limit, required for org repos
//   GITHUB_USER        optional — defaults to the owner in the git remote
//
// Tracks published repos by stable GitHub repo id in scripts/published-repos.json
// (not by name), so renaming a repo already on the site doesn't publish a duplicate.
//
// Only writes files. Nothing is committed or pushed — review the diff yourself.

import { readFile, writeFile, access, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { execSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const INDEX_HTML = join(ROOT, "index.html");
const STYLE_CSS = join(ROOT, "style.css");
const PROJECTS_DIR = join(ROOT, "projects");
const MANIFEST_PATH = join(__dirname, "published-repos.json");

// Liquid-glass GitHub pill button, shared by every generated card and project page.
const GITHUB_ICON_SVG = `<svg viewBox="0 0 16 16" width="15" height="15" fill="currentColor" aria-hidden="true">
                    <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z"/>
                  </svg>`;

function githubButton(owner, repo, title) {
  return `<a class="btn-github" href="https://github.com/${owner}/${repo}" target="_blank" rel="noopener"${
    title ? ` aria-label="${escapeAttr(title)} on GitHub"` : ""
  }>
                  ${GITHUB_ICON_SVG}
                  <span>GitHub</span>
                </a>`;
}

// Icon-only "Live demo" pill, used on cards (.card-links visually hides the
// span text — see style.css); project pages keep the plain text button.
const LIVE_DEMO_ICON_SVG = `<svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" aria-hidden="true">
                    <circle cx="8" cy="8" r="6.5"/>
                    <line x1="1.5" y1="8" x2="14.5" y2="8"/>
                    <path d="M8 1.5c2.3 1.9 2.3 11.1 0 13"/>
                    <path d="M8 1.5c-2.3 1.9-2.3 11.1 0 13"/>
                  </svg>`;

function liveDemoCardButton(url, title) {
  return `<a class="btn-glass" href="${url}" target="_blank" rel="noopener" aria-label="${escapeAttr(
    title
  )} live demo">
                  ${LIVE_DEMO_ICON_SVG}
                  <span>Live demo</span>
                </a>`;
}

await loadDotEnv();

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--sync")) {
    await runSync(args);
  } else if (args[0] && !args[0].startsWith("--")) {
    const slugArg = args.find((a) => a.startsWith("--slug="));
    const slugOverride = slugArg ? slugArg.slice("--slug=".length) : null;
    const { owner, repo } = parseOwnerRepo(args[0]);
    await generateOne(owner, repo, slugOverride);
  } else {
    console.error(
      "Usage:\n  node scripts/generate-project.mjs <owner>/<repo> [--slug=custom-slug]\n  node scripts/generate-project.mjs --sync"
    );
    process.exit(1);
  }
}

function parseOwnerRepo(input) {
  const cleaned = input.replace(/^https?:\/\/github\.com\//, "").replace(/\/$/, "");
  const [owner, repo] = cleaned.split("/");
  if (!owner || !repo) {
    throw new Error(`Could not parse "<owner>/<repo>" from "${input}"`);
  }
  return { owner, repo };
}

async function loadDotEnv() {
  const envPath = join(ROOT, ".env");
  let text;
  try {
    text = await readFile(envPath, "utf-8");
  } catch {
    return;
  }
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

function defaultGithubUser() {
  if (process.env.GITHUB_USER) return process.env.GITHUB_USER;
  try {
    const url = execSync("git remote get-url origin", { cwd: ROOT }).toString().trim();
    const match = url.match(/github\.com[:/]([^/]+)\//);
    if (match) return match[1];
  } catch {
    // fall through
  }
  return "diegomarinangeli";
}

async function githubFetch(path) {
  const headers = {
    Accept: "application/vnd.github+json",
    "User-Agent": "generate-project-script",
  };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const res = await fetch(`https://api.github.com${path}`, { headers });
  if (!res.ok) {
    throw new Error(`GitHub API ${path} failed: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

async function getRepoMetadata(owner, repo) {
  return githubFetch(`/repos/${owner}/${repo}`);
}

async function getReadme(owner, repo) {
  try {
    const data = await githubFetch(`/repos/${owner}/${repo}/readme`);
    const decoded = Buffer.from(data.content, data.encoding || "base64").toString("utf-8");
    return decoded.slice(0, 8000);
  } catch {
    console.warn(`  (no README found for ${owner}/${repo}, continuing without it)`);
    return "";
  }
}

async function hasReleases(owner, repo) {
  try {
    const releases = await githubFetch(`/repos/${owner}/${repo}/releases?per_page=1`);
    return Array.isArray(releases) && releases.length > 0;
  } catch {
    return false;
  }
}

async function listPortfolioRepos(user) {
  const repos = await githubFetch(`/users/${user}/repos?per_page=100&sort=created`);
  return repos.filter((r) => Array.isArray(r.topics) && r.topics.includes("portfolio"));
}

function slugify(name, override) {
  if (override) return override;
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

async function alreadyPublishedRepos() {
  const html = await readFile(INDEX_HTML, "utf-8");
  const seen = new Set();
  const re = /github\.com\/([^/"]+)\/([^/"#]+)/g;
  let m;
  while ((m = re.exec(html))) {
    seen.add(`${m[1]}/${m[2]}`.toLowerCase());
  }
  return seen;
}

// Tracks published repos by their stable GitHub repo id (not by owner/name),
// so a repo rename doesn't fool the sync into publishing a duplicate.
async function loadManifest() {
  try {
    return JSON.parse(await readFile(MANIFEST_PATH, "utf-8"));
  } catch {
    return {};
  }
}

async function saveManifest(manifest) {
  const sorted = Object.fromEntries(
    Object.entries(manifest).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  );
  await writeFile(MANIFEST_PATH, `${JSON.stringify(sorted, null, 2)}\n`, "utf-8");
}

async function pathExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

// --- Cover art / gradient themes (no AI: picked deterministically per repo) --

// Every theme pairs a vivid diagonal duotone gradient with an abstract white
// line-art icon (150x110 viewBox), matching the site's hand-crafted style.
// Only rgba(255,255,255,OPACITY) is used inside the icons, per that style.
const THEMES = [
  {
    gradientFrom: "#29c5e6",
    gradientTo: "#4338ca",
    coverSvgInner: `<circle cx="45" cy="35" r="6" fill="rgba(255,255,255,0.85)"/>
      <circle cx="105" cy="35" r="6" fill="rgba(255,255,255,0.85)"/>
      <circle cx="75" cy="80" r="6" fill="rgba(255,255,255,0.85)"/>
      <line x1="45" y1="35" x2="105" y2="35" stroke="rgba(255,255,255,0.5)" stroke-width="2.2"/>
      <line x1="45" y1="35" x2="75" y2="80" stroke="rgba(255,255,255,0.5)" stroke-width="2.2"/>
      <line x1="105" y1="35" x2="75" y2="80" stroke="rgba(255,255,255,0.5)" stroke-width="2.2"/>`,
  },
  {
    gradientFrom: "#f5a623",
    gradientTo: "#e11d48",
    coverSvgInner: `<rect x="35" y="25" width="80" height="16" rx="3" stroke="rgba(255,255,255,0.9)" stroke-width="2.2"/>
      <rect x="25" y="47" width="100" height="16" rx="3" stroke="rgba(255,255,255,0.65)" stroke-width="2.2"/>
      <rect x="35" y="69" width="80" height="16" rx="3" stroke="rgba(255,255,255,0.4)" stroke-width="2.2"/>`,
  },
  {
    gradientFrom: "#10b981",
    gradientTo: "#0e7490",
    coverSvgInner: `<polygon points="75,15 115,37 115,73 75,95 35,73 35,37" stroke="rgba(255,255,255,0.85)" stroke-width="2.3"/>
      <line x1="75" y1="15" x2="75" y2="95" stroke="rgba(255,255,255,0.4)" stroke-width="2"/>
      <line x1="35" y1="37" x2="115" y2="73" stroke="rgba(255,255,255,0.3)" stroke-width="2"/>`,
  },
  {
    gradientFrom: "#d946ef",
    gradientTo: "#4f46e5",
    coverSvgInner: `<circle cx="60" cy="55" r="28" stroke="rgba(255,255,255,0.75)" stroke-width="2.2"/>
      <circle cx="92" cy="55" r="28" stroke="rgba(255,255,255,0.45)" stroke-width="2.2"/>`,
  },
  {
    gradientFrom: "#64748b",
    gradientTo: "#0ea5e9",
    coverSvgInner: `<path d="M15 70 Q40 30 65 60 T115 45 T145 55" stroke="rgba(255,255,255,0.85)" stroke-width="2.3" fill="none"/>
      <line x1="15" y1="90" x2="145" y2="90" stroke="rgba(255,255,255,0.35)" stroke-width="2"/>`,
  },
  {
    gradientFrom: "#84cc16",
    gradientTo: "#059669",
    coverSvgInner: `<circle cx="75" cy="55" r="22" stroke="rgba(255,255,255,0.85)" stroke-width="2.3"/>
      <circle cx="75" cy="55" r="8" stroke="rgba(255,255,255,0.5)" stroke-width="2"/>
      <line x1="75" y1="25" x2="75" y2="15" stroke="rgba(255,255,255,0.6)" stroke-width="2.3"/>
      <line x1="75" y1="85" x2="75" y2="95" stroke="rgba(255,255,255,0.6)" stroke-width="2.3"/>
      <line x1="45" y1="55" x2="35" y2="55" stroke="rgba(255,255,255,0.6)" stroke-width="2.3"/>
      <line x1="105" y1="55" x2="115" y2="55" stroke="rgba(255,255,255,0.6)" stroke-width="2.3"/>`,
  },
  {
    gradientFrom: "#ef4444",
    gradientTo: "#f97316",
    coverSvgInner: `<path d="M25 35 L55 55 L25 75" stroke="rgba(255,255,255,0.85)" stroke-width="2.3" fill="none"/>
      <path d="M65 35 L95 55 L65 75" stroke="rgba(255,255,255,0.6)" stroke-width="2.3" fill="none"/>
      <path d="M105 35 L135 55 L105 75" stroke="rgba(255,255,255,0.35)" stroke-width="2.3" fill="none"/>`,
  },
  {
    gradientFrom: "#14b8a6",
    gradientTo: "#9333ea",
    coverSvgInner: `<polygon points="75,15 115,55 75,95 35,55" stroke="rgba(255,255,255,0.85)" stroke-width="2.3"/>
      <polygon points="75,35 95,55 75,75 55,55" stroke="rgba(255,255,255,0.5)" stroke-width="2"/>`,
  },
];

function hashString(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = (h * 33) ^ s.charCodeAt(i);
  }
  return h >>> 0;
}

function pickTheme(owner, repo) {
  const idx = hashString(`${owner}/${repo}`) % THEMES.length;
  return THEMES[idx];
}

// --- README parsing (no AI: plain markdown -> structured copy) -------------

function stripCodeFences(text) {
  return text.replace(/```[\s\S]*?```/g, "");
}

function stripHtmlComments(text) {
  return text.replace(/<!--[\s\S]*?-->/g, "");
}

function isBadgeOrImageOnly(line) {
  const t = line.trim();
  if (!t || !t.includes("![")) return false;
  return t.replace(/!\[[^\]]*\]\([^)]*\)/g, "").trim() === "";
}

// Repo-relative links (e.g. "[demo](docs/demo.mp4)") are meaningless off of
// GitHub, so before we draft any copy, rewrite every non-image markdown link
// that points at a relative path into an absolute link to that file's GitHub
// blob view. Absolute http(s)/mailto/anchor links are left untouched. Image
// links (the "![...]" form) are skipped here on purpose — those are handled
// separately by findReadmeCoverImage, which needs the original relative path
// to fetch the raw file.
function absolutizeReadmeLinks(rawReadme, owner, repo, branch) {
  return rawReadme.replace(
    /(?<!!)\[([^\]]*)\]\(([^)\s]+)(\s+"[^"]*")?\)/g,
    (whole, label, url, title) => {
      if (/^(https?:|mailto:|#)/i.test(url)) return whole;
      const clean = url.replace(/^\.?\//, "");
      return `[${label}](https://github.com/${owner}/${repo}/blob/${branch}/${clean}${title || ""})`;
    }
  );
}

const BADGE_URL_RE = /(shields\.io|badge\.fury\.io|img\.shields|codecov\.io|coveralls\.io|travis-ci|circleci\.com|opencollective\.com\/.*badge|github\.com\/[^/]+\/[^/]+\/(actions|workflows)\/)/i;

// Finds the first "real" (non-badge) image referenced in the README, so it
// can be downloaded and used as the project's cover art instead of the
// generated gradient icon.
function findReadmeCoverImage(rawReadme) {
  const text = stripHtmlComments(stripCodeFences(rawReadme || ""));
  const re = /!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
  let m;
  while ((m = re.exec(text))) {
    const alt = m[1] || "";
    const src = m[2];
    if (BADGE_URL_RE.test(src) || /badge|shield/i.test(alt)) continue;
    return { alt, src };
  }
  return null;
}

// Downloads a README image (resolving relative paths against the repo's
// default branch) and saves it under projects/covers/<slug>.<ext>. Returns
// the path relative to the projects/ directory (e.g. "covers/evox.png"), or
// null if the image couldn't be fetched.
async function downloadReadmeCoverImage(owner, repo, branch, image, slug) {
  let url = image.src;
  if (!/^https?:\/\//i.test(url)) {
    url = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${url.replace(/^\.?\//, "")}`;
  }
  let res;
  try {
    res = await fetch(url);
  } catch {
    return null;
  }
  if (!res || !res.ok) return null;

  const buf = Buffer.from(await res.arrayBuffer());
  const contentType = res.headers.get("content-type") || "";
  const extFromPath = (url.match(/\.(png|jpe?g|gif|webp|avif|svg)(?:\?|$)/i) || [])[1];
  let ext = extFromPath
    ? extFromPath.toLowerCase()
    : contentType.includes("png")
    ? "png"
    : contentType.includes("gif")
    ? "gif"
    : contentType.includes("webp")
    ? "webp"
    : contentType.includes("svg")
    ? "svg"
    : "jpg";
  if (ext === "jpeg") ext = "jpg";

  const coversDir = join(PROJECTS_DIR, "covers");
  await mkdir(coversDir, { recursive: true });
  const fileName = `${slug}.${ext}`;
  await writeFile(join(coversDir, fileName), buf);
  return `covers/${fileName}`;
}

function isHr(line) {
  return /^(-{3,}|\*{3,}|_{3,})\s*$/.test(line.trim());
}

// Strips markdown emphasis/code markers down to plain text. Runs the
// bold/italic passes in a loop until nothing changes, so nesting like
// "**bold with *italic* inside**" resolves the inner span first instead of
// leaving the outer "**" pair unmatched (which used to leak stray "*"
// characters into the rendered page — the outer pair only becomes a clean,
// asterisk-free match once the inner one has already been stripped).
function stripEmphasis(text) {
  let result = text;
  let prev;
  do {
    prev = result;
    result = result
      .replace(/`([^`]+)`/g, "$1")
      .replace(/\*\*([^*]+)\*\*/g, "$1")
      .replace(/__([^_]+)__/g, "$1")
      .replace(/\*([^*]+)\*/g, "$1")
      .replace(/_([^_]+)_/g, "$1");
  } while (result !== prev);
  return result;
}

// `links: "keep"` turns markdown links into real <a> tags (used for the
// prose that actually gets rendered on the project page); the default
// drops the URL and keeps just the label (used for headings/tags/tagline,
// which land in attributes or plain-text contexts that can't hold markup).
function stripMarkdownInline(text, { links = "strip" } = {}) {
  let result = stripEmphasis(text.replace(/<[^>]+>/g, ""));
  result = result.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, (m, label, url) => {
    const cleanLabel = stripEmphasis(label);
    if (links !== "keep" || !/^https?:\/\//i.test(url)) return cleanLabel;
    return `<a href="${escapeAttr(url)}" target="_blank" rel="noopener">${cleanLabel}</a>`;
  });
  return result.trim();
}

function parseBulletLine(rawLine) {
  const t = rawLine.trim().replace(/^[-*+]\s+/, "").replace(/^\d+\.\s+/, "");
  const m = t.match(/^\*\*(.+?)\*\*\s*[:—-]\s*(.+)$/);
  if (m) {
    return { strong: stripMarkdownInline(m[1]), text: stripMarkdownInline(m[2], { links: "keep" }) };
  }
  return { text: stripMarkdownInline(t, { links: "keep" }) };
}

function isSkippableLine(line) {
  const t = line.trim();
  return !t || isHr(line) || isBadgeOrImageOnly(line);
}

function isListLine(t) {
  return /^[-*+]\s+/.test(t) || /^\d+\.\s+/.test(t);
}

function extractParagraphs(lines, maxParagraphs) {
  const paragraphs = [];
  let current = [];
  const flush = () => {
    if (current.length) {
      const text = stripMarkdownInline(current.join(" ").replace(/\s+/g, " ").trim(), { links: "keep" });
      if (text) paragraphs.push(text);
      current = [];
    }
  };
  for (const line of lines) {
    const t = line.trim();
    if (isSkippableLine(line) || /^#{1,6}\s+/.test(t) || isListLine(t)) {
      flush();
      continue;
    }
    current.push(t);
  }
  flush();
  return paragraphs.slice(0, maxParagraphs);
}

function extractSectionBody(lines) {
  const paragraphs = [];
  const bullets = [];
  let current = [];
  const flushParagraph = () => {
    if (current.length) {
      const text = stripMarkdownInline(current.join(" ").replace(/\s+/g, " ").trim(), { links: "keep" });
      if (text) paragraphs.push(text);
      current = [];
    }
  };
  for (const line of lines) {
    const t = line.trim();
    if (isSkippableLine(line) || /^#{1,6}\s+/.test(t)) {
      flushParagraph();
      continue;
    }
    if (isListLine(t)) {
      flushParagraph();
      bullets.push(parseBulletLine(t));
      continue;
    }
    current.push(t);
  }
  flushParagraph();
  return { paragraphs, bullets };
}

const SKIP_HEADING_RE = /^(table of contents|contents|license|licence|contributing|acknowledge?ments?|badges|authors?|credits)$/i;

function parseReadme(rawReadme) {
  const text = stripHtmlComments(stripCodeFences(rawReadme || ""));
  const lines = text.split("\n").map((l) => l.replace(/\r$/, ""));

  let start = 0;
  for (let i = 0; i < Math.min(lines.length, 5); i++) {
    if (/^#\s+/.test(lines[i])) {
      start = i + 1;
      break;
    }
  }
  const body = lines.slice(start);

  const level2Idx = [];
  body.forEach((l, i) => {
    if (/^##\s+(?!#)/.test(l)) level2Idx.push(i);
  });

  const introLines = level2Idx.length ? body.slice(0, level2Idx[0]) : body.slice(0, Math.min(body.length, 40));
  const intro = extractParagraphs(introLines, 2);

  const sections = [];
  for (let s = 0; s < level2Idx.length && sections.length < 4; s++) {
    const startI = level2Idx[s] + 1;
    const endI = s + 1 < level2Idx.length ? level2Idx[s + 1] : body.length;
    const headingRaw = body[level2Idx[s]].replace(/^##\s+/, "").trim();
    const heading = stripMarkdownInline(headingRaw);
    if (SKIP_HEADING_RE.test(heading)) continue;
    const { paragraphs, bullets } = extractSectionBody(body.slice(startI, endI));
    if (!paragraphs.length && !bullets.length) continue;
    sections.push({ heading, paragraphs: paragraphs.slice(0, 3), bullets: bullets.slice(0, 8) });
  }

  return { intro, sections };
}

// --- Template-based drafting (no AI) ----------------------------------------

function humanizeRepoName(name) {
  return name
    .replace(/[-_]+/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .map((w) => (w === w.toUpperCase() ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ");
}

function humanizeTopic(topic) {
  return topic.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function buildTagline(meta, introParagraphs) {
  if (meta.description && meta.description.trim()) return meta.description.trim();
  // introParagraphs may contain <a> tags (kept for on-page prose) — a
  // tagline lands in a meta description attribute, so strip back to plain text.
  const firstPara = introParagraphs[0] && introParagraphs[0].replace(/<a\s[^>]*>|<\/a>/g, "");
  if (firstPara) {
    const sentenceMatch = firstPara.match(/^.*?[.!?](?:\s|$)/);
    return (sentenceMatch ? sentenceMatch[0] : firstPara).trim();
  }
  return meta.language ? `A ${meta.language} project.` : "A project by " + meta.owner.login + ".";
}

function buildTagsAndStack(meta) {
  const topics = (meta.topics || []).filter((t) => t !== "portfolio");
  const tags = [];
  if (meta.language) tags.push(meta.language);
  for (const t of topics) {
    if (tags.length >= 3) break;
    const label = humanizeTopic(t);
    if (!tags.includes(label)) tags.push(label);
  }
  if (tags.length === 0) tags.push("Project");

  const stackParts = [];
  if (meta.language) stackParts.push(meta.language);
  for (const t of topics) {
    const label = humanizeTopic(t);
    if (!stackParts.includes(label)) stackParts.push(label);
  }
  const techStackLine = stackParts.length ? stackParts.join(" · ") : tags.join(" · ");

  return { tags: tags.slice(0, 3), techStackLine };
}

function draftProjectFromTemplate({ meta, readme }, releasesAvailable) {
  const theme = pickTheme(meta.owner.login, meta.name);
  const title = humanizeRepoName(meta.name);
  const { intro: introParagraphs, sections: parsedSections } = parseReadme(readme);

  const tagline = buildTagline(meta, introParagraphs);
  const { tags, techStackLine } = buildTagsAndStack(meta);

  let intro = introParagraphs.join("\n\n");
  if (!intro) {
    intro = meta.description || `${title} is a project by ${meta.owner.login}, hosted on GitHub.`;
  }

  // Fallback when the README has no "## " sections to pull from: a "Tech
  // stack" bullet list, built from structured metadata rather than prose, so
  // it never just repeats the intro/tagline text verbatim.
  let sections = parsedSections;
  if (!sections.length) {
    sections = [
      {
        heading: "Tech stack",
        paragraphs: [],
        bullets: techStackLine.split(" · ").map((part) => ({ text: part })),
      },
    ];
  }

  const links = {};
  if (releasesAvailable) links.releases = `https://github.com/${meta.owner.login}/${meta.name}/releases`;

  return {
    title,
    tagline,
    tags,
    techStackLine,
    intro,
    sections,
    links,
    gradientFrom: theme.gradientFrom,
    gradientTo: theme.gradientTo,
    coverSvgInner: theme.coverSvgInner,
  };
}

function validateDraft(draft) {
  const required = [
    "title",
    "tagline",
    "tags",
    "techStackLine",
    "intro",
    "sections",
    "links",
    "gradientFrom",
    "gradientTo",
    "coverSvgInner",
  ];
  for (const key of required) {
    if (draft[key] === undefined || draft[key] === null || draft[key] === "") {
      throw new Error(`Draft is missing required field "${key}" — rerun the script.`);
    }
  }
  if (!Array.isArray(draft.tags) || draft.tags.length === 0) {
    throw new Error("Draft has no tags");
  }
  if (!Array.isArray(draft.sections) || draft.sections.length === 0) {
    throw new Error("Draft has no sections");
  }
  if (!/^#[0-9a-fA-F]{6}$/.test(draft.gradientFrom) || !/^#[0-9a-fA-F]{6}$/.test(draft.gradientTo)) {
    throw new Error("Draft gradientFrom/gradientTo must be 6-digit hex colors");
  }
}

// --- Rendering -----------------------------------------------------------

function escapeAttr(s) {
  return String(s).replace(/"/g, "&quot;");
}

function renderCoverArt(slug, draft) {
  if (draft.coverImage) {
    return `<img class="preview-photo" src="projects/${draft.coverImage}" alt="" loading="lazy" />`;
  }
  return `<svg class="preview-art" width="150" height="110" viewBox="0 0 150 110" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                ${draft.coverSvgInner}
              </svg>`;
}

function renderCard(slug, owner, repo, draft) {
  const liveDemo = draft.links.liveDemo;
  const previewHref = liveDemo || `projects/${slug}.html`;
  const tagsHtml = draft.tags.map((t) => `<span>${t}</span>`).join("");
  const linkList = liveDemo
    ? [liveDemoCardButton(liveDemo, draft.title), githubButton(owner, repo, draft.title)]
    : [githubButton(owner, repo, draft.title)];
  const previewClass = `card-preview preview-${slug}${draft.coverImage ? " has-photo" : ""}`;

  return `          <article class="card">
            <a class="${previewClass}" href="${previewHref}" aria-label="Open the ${escapeAttr(draft.title)} project page">
              ${renderCoverArt(slug, draft)}
            </a>
            <div class="card-body">
              <h3><a href="projects/${slug}.html">${draft.title}</a></h3>
              <p>${draft.tagline}</p>
              <div class="card-tags">${tagsHtml}</div>
              <div class="card-links">
                ${linkList.join("\n                ")}
              </div>
            </div>
          </article>`;
}

function renderSectionsHtml(sections) {
  return sections
    .map((s) => {
      const parts = [`        <h2>${s.heading}</h2>`];
      for (const p of s.paragraphs || []) {
        parts.push(`        <p>${p}</p>`);
      }
      if (s.bullets && s.bullets.length) {
        const items = s.bullets
          .map((b) => `          <li>${b.strong ? `<strong>${b.strong}</strong> — ` : ""}${b.text}</li>`)
          .join("\n");
        parts.push(`        <ul>\n${items}\n        </ul>`);
      }
      return parts.join("\n");
    })
    .join("\n\n");
}

function renderProjectPage(slug, owner, repo, draft) {
  const introHtml = draft.intro
    .split("\n\n")
    .map((p) => `        <p>\n          ${p}\n        </p>`)
    .join("\n\n");

  const links = [githubButton(owner, repo, draft.title)];
  if (draft.links.liveDemo) {
    links.unshift(`<a class="btn-glass" href="${draft.links.liveDemo}" target="_blank" rel="noopener">Live demo</a>`);
  }
  if (draft.links.releases) {
    links.push(`<a class="btn-glass" href="${draft.links.releases}" target="_blank" rel="noopener">Releases</a>`);
  }

  return `<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
<meta name="theme-color" content="#0d0d0d" />
<script>try{if(localStorage.getItem("siteTheme")==="light")document.documentElement.setAttribute("data-theme","light");}catch(e){}</script>
<title>${draft.title} — Diego Marinangeli</title>
<meta name="description" content="${escapeAttr(`${draft.title} — ${draft.tagline}`)}" />
<link rel="icon" type="image/png" href="../avatar-round.png" />
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Geist:wght@300;400;500;600;700&family=IBM+Plex+Serif:ital,wght@0,400;0,500;1,400;1,500&display=swap">
<link rel="stylesheet" href="../style.css" />

<body>
  <aside class="sidebar">
      <button class="nav-toggle" type="button" aria-expanded="false" aria-label="Apri il menu di navigazione">
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
          <line class="bar bar-top" x1="2" y1="5" x2="16" y2="5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
          <line class="bar bar-mid" x1="2" y1="9" x2="16" y2="9" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
          <line class="bar bar-bot" x1="2" y1="13" x2="16" y2="13" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
        </svg>
      </button>
      <nav class="quick-links" aria-label="Quick links">
        <a class="quick-link" href="https://github.com/diegomarinangeli" target="_blank" rel="noopener" aria-label="GitHub">
          <svg viewBox="0 0 16 16" width="18" height="18" fill="currentColor" aria-hidden="true">
            <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z"/>
          </svg>
        </a>
        <a class="quick-link" href="mailto:artidego@gmail.com" aria-label="Email">
          <svg viewBox="0 0 16 16" width="18" height="18" fill="currentColor" aria-hidden="true">
            <path d="M1.5 3h13c.28 0 .5.22.5.5v9c0 .28-.22.5-.5.5h-13a.5.5 0 0 1-.5-.5v-9c0-.28.22-.5.5-.5Zm.6 1.2v.2l5.9 4.2 5.9-4.2v-.2H2.1Zm11.8 1.36-5.6 3.99a.5.5 0 0 1-.6 0L2.1 5.56V12h11.8V5.56Z"/>
          </svg>
        </a>
      </nav>
      <div class="sidebar-panel">
      <div class="nav-trigger">
        <a class="sidebar-brand" href="../index.html#about" aria-label="Diego Marinangeli">
          <img class="sidebar-brand-avatar" src="../avatar.png" alt="" width="28" height="28" loading="lazy" />
        </a>
        <nav class="section-links" aria-label="Section navigation">
          <a class="section-link" href="../index.html#about">Home</a>
          <a class="section-link" href="../index.html#work" data-it="Progetti">Works</a>
          <a class="section-link" href="../index.html#news">News</a>
        </nav>
      </div>

      <div class="divider"></div>

      <nav class="social-list">
        <a class="social-item" data-tooltip="Visit my GitHub" data-tooltip-it="Vai al mio GitHub" href="https://github.com/diegomarinangeli" target="_blank" rel="noopener">
          <svg viewBox="0 0 16 16" width="18" height="18" fill="currentColor" aria-hidden="true">
            <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z"/>
          </svg>
          <span>GitHub</span>
        </a>
        <a class="social-item" data-tooltip="Contact me" data-tooltip-it="Contattami" href="mailto:artidego@gmail.com">
          <svg viewBox="0 0 16 16" width="18" height="18" fill="currentColor" aria-hidden="true">
            <path d="M1.5 3h13c.28 0 .5.22.5.5v9c0 .28-.22.5-.5.5h-13a.5.5 0 0 1-.5-.5v-9c0-.28.22-.5.5-.5Zm.6 1.2v.2l5.9 4.2 5.9-4.2v-.2H2.1Zm11.8 1.36-5.6 3.99a.5.5 0 0 1-.6 0L2.1 5.56V12h11.8V5.56Z"/>
          </svg>
          <span>Email</span>
        </a>
      </nav>

      <div class="divider"></div>

      <nav class="ask-ai-list" aria-label="Ask an AI about Diego">
        <a class="ai-item" id="ask-claude" data-tooltip="Ask Claude about me" data-tooltip-it="Chiedi a Claude di me" href="https://claude.ai/new?q=Tell%20me%20something%20about%20Diego%20Marinangeli" target="_blank" rel="noopener" title="Ask Claude about me">
          <img src="../claude-icon.png" width="28" height="28" alt="" aria-hidden="true" />
          <span>Claude</span>
        </a>
        <a class="ai-item" id="ask-chatgpt" data-tooltip="Ask ChatGPT about me" data-tooltip-it="Chiedi a ChatGPT di me" href="https://chatgpt.com/?q=Tell%20me%20something%20about%20Diego%20Marinangeli" target="_blank" rel="noopener" title="Ask ChatGPT about me">
          <svg viewBox="0 0 24 24" width="28" height="28" fill="currentColor" aria-hidden="true">
            <path d="M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729ZM13.26 22.4292a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4944ZM3.5992 18.3038a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464ZM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1685a.0757.0757 0 0 1-.071 0l-4.8303-2.7865A4.504 4.504 0 0 1 2.3408 7.872ZM18.937 11.7514l-5.8144-3.3874 2.0201-1.1637a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.407-.667ZM20.9477 8.7283l-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.408 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.66ZM8.3065 12.863l-2.02-1.1638a.0804.0804 0 0 1-.038-.0567V6.0742a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805L8.704 5.4592a.7948.7948 0 0 0-.3927.6813ZM9.404 10.4976l2.6069-1.4998 2.602 1.4998v2.9994l-2.602 1.4997-2.607-1.4997Z"/>
          </svg>
          <span>ChatGPT</span>
        </a>
      </nav>

      <div class="divider"></div>

      <div class="theme-toggle" role="group" aria-label="Choose theme / Scegli il tema">
        <button type="button" class="theme-btn" data-theme-choice="light" data-tooltip="Light theme" data-tooltip-it="Tema chiaro">
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="4"/>
            <path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/>
          </svg>
          <span>Light</span>
        </button>
        <button type="button" class="theme-btn" data-theme-choice="dark" data-tooltip="Dark theme" data-tooltip-it="Tema scuro">
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>
          </svg>
          <span>Dark</span>
        </button>
      </div>

      <div class="lang-toggle" role="group" aria-label="Choose language / Scegli la lingua">
        <button type="button" class="lang-btn" data-lang="en" data-tooltip="Switch to English" data-tooltip-it="Passa all'inglese">EN</button>
        <button type="button" class="lang-btn" data-lang="it" data-tooltip="Switch to Italian" data-tooltip-it="Passa all'italiano">IT</button>
      </div>
      </div>
    </aside>

  <div class="page">
    <main class="content">
      <div class="project-page">
        <div class="project-hero preview-${slug}${draft.coverImage ? " has-photo" : ""}">
          ${
            draft.coverImage
              ? `<img class="preview-photo" src="${draft.coverImage}" alt="" loading="lazy" />`
              : `<svg width="190" height="130" viewBox="0 0 150 110" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            ${draft.coverSvgInner}
          </svg>`
          }
        </div>

        <h1>${draft.title}</h1>
        <p class="project-meta">${draft.techStackLine}</p>

${introHtml}

${renderSectionsHtml(draft.sections)}

        <div class="project-links">
          ${links.join("\n          ")}
        </div>
      </div>
    </main>
  </div>

  <footer class="work-sub">
    <p style="text-align: center; font-size: 0.9em; color: #666;">© Diego Marinangeli 2026. All rights reserved.</p>
  </footer>

  <script src="../script.js" defer></script>
</body>
`;
}

function renderGradientCss(slug, from, to) {
  return `.preview-${slug} {\n  background: linear-gradient(135deg, ${from} 0%, ${to} 100%);\n}\n\n`;
}

// --- File mutation ---------------------------------------------------------

function detectEol(text) {
  return text.includes("\r\n") ? "\r\n" : "\n";
}

function toEol(text, eol) {
  return text.replace(/\r\n/g, "\n").replace(/\n/g, eol);
}

async function insertCardIntoIndex(cardHtml) {
  const html = await readFile(INDEX_HTML, "utf-8");
  const eol = detectEol(html);
  const marker = /<\/article>\r?\n {8}<\/div>/;
  const matches = html.match(new RegExp(marker.source, "g"));
  if (!matches || matches.length !== 1) {
    throw new Error(
      `Could not find a unique spot to insert the new card in index.html (expected exactly one ".cards" closing marker, found ${matches ? matches.length : 0}). Insert it manually.`
    );
  }
  const cardBlock = toEol(cardHtml, eol);
  const updated = html.replace(marker, (m) => `${m.slice(0, "</article>".length)}${eol}${eol}${cardBlock}${m.slice("</article>".length)}`);
  await writeFile(INDEX_HTML, updated, "utf-8");
}

async function appendGradientToStyle(css) {
  const style = await readFile(STYLE_CSS, "utf-8");
  const eol = detectEol(style);
  const marker = /\r?\n\.preview-art \{/;
  const matches = style.match(new RegExp(marker.source, "g"));
  if (!matches || matches.length !== 1) {
    throw new Error(
      `Could not find a unique spot to insert the new gradient in style.css (expected exactly one ".preview-art" rule, found ${matches ? matches.length : 0}). Insert it manually.`
    );
  }
  const cssBlock = toEol(css, eol);
  const updated = style.replace(marker, (m) => `${eol}${cssBlock}${m.slice(eol.length)}`);
  await writeFile(STYLE_CSS, updated, "utf-8");
}

// --- Orchestration -----------------------------------------------------

async function generateOne(owner, repo, slugOverride) {
  console.log(`Fetching metadata for ${owner}/${repo}...`);
  const meta = await getRepoMetadata(owner, repo);

  const manifest = await loadManifest();
  const manifestEntry = manifest[String(meta.id)];
  if (manifestEntry) {
    console.log(`${owner}/${repo} (id ${meta.id}) is already published as "${manifestEntry.slug}" — skipping.`);
    return;
  }

  // Belt-and-suspenders fallback for entries published before the manifest
  // existed, or added by hand: match by the literal URL still in index.html.
  const published = await alreadyPublishedRepos();
  if (published.has(`${owner}/${repo}`.toLowerCase())) {
    console.log(`${owner}/${repo} is already linked from index.html — skipping.`);
    return;
  }

  const slug = slugify(repo, slugOverride);
  const pagePath = join(PROJECTS_DIR, `${slug}.html`);
  if (await pathExists(pagePath)) {
    throw new Error(`projects/${slug}.html already exists. Pass --slug=<other> to pick a different slug.`);
  }

  const readmeRaw = await getReadme(owner, repo);
  const releasesAvailable = await hasReleases(owner, repo);
  const branch = meta.default_branch || "main";

  const coverImageRef = findReadmeCoverImage(readmeRaw);
  const readme = absolutizeReadmeLinks(readmeRaw, owner, repo, branch);

  console.log("Drafting copy + cover art from repo metadata/README...");
  const draft = draftProjectFromTemplate({ meta, readme }, releasesAvailable);
  validateDraft(draft);

  if (meta.homepage && !draft.links.liveDemo) {
    draft.links.liveDemo = meta.homepage;
  }

  if (coverImageRef) {
    console.log(`Found a README cover image (${coverImageRef.src}) — downloading it...`);
    const savedRelPath = await downloadReadmeCoverImage(owner, repo, branch, coverImageRef, slug);
    if (savedRelPath) {
      draft.coverImage = savedRelPath;
    } else {
      console.warn(`  (could not download ${coverImageRef.src}, falling back to the generated icon)`);
    }
  }

  await writeFile(pagePath, renderProjectPage(slug, owner, repo, draft), "utf-8");
  await insertCardIntoIndex(renderCard(slug, owner, repo, draft));
  await appendGradientToStyle(renderGradientCss(slug, draft.gradientFrom, draft.gradientTo));

  manifest[String(meta.id)] = { owner, repo, slug };
  await saveManifest(manifest);

  console.log(`\nDone. Wrote:\n  projects/${slug}.html\n  + card in index.html\n  + .preview-${slug} rule in style.css\n  + manifest entry in scripts/published-repos.json`);
  console.log("Review the diff before committing.");
}

async function runSync() {
  const user = defaultGithubUser();
  console.log(`Scanning ${user}'s repos for the "portfolio" topic...`);
  const repos = await listPortfolioRepos(user);
  const manifest = await loadManifest();
  const missing = repos.filter((r) => !manifest[String(r.id)]);

  if (missing.length === 0) {
    console.log("Nothing to do — every portfolio-tagged repo is already on the site.");
    return;
  }

  console.log(`Found ${missing.length} new repo(s): ${missing.map((r) => r.name).join(", ")}`);
  for (const r of missing) {
    console.log(`\n--- ${user}/${r.name} ---`);
    await generateOne(user, r.name, null);
  }
}

main().catch((err) => {
  console.error(`\nError: ${err.message}`);
  process.exit(1);
});

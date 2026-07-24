#!/usr/bin/env node
// Generates a project card + detail page + cover gradient for a GitHub repo,
// matching the hand-drawn line-art style already used on the site.
//
// Usage:
//   node scripts/generate-project.mjs <owner>/<repo> [--slug=custom-slug]
//   node scripts/generate-project.mjs --sync
//
// Env (via exported shell vars or a local .env, see .env.example):
//   ANTHROPIC_API_KEY  optional — drafts copy + cover art via the Anthropic API.
//                      If unset, falls back to the locally logged-in `claude`
//                      CLI session (no separate key needed, but `claude` must
//                      be on PATH and logged in).
//   GITHUB_TOKEN       optional — raises GitHub API rate limit, required for org repos
//   GITHUB_USER        optional — defaults to the owner in the git remote
//
// Only writes files. Nothing is committed or pushed — review the diff yourself.

import { readFile, writeFile, access } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { execSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const INDEX_HTML = join(ROOT, "index.html");
const STYLE_CSS = join(ROOT, "style.css");
const PROJECTS_DIR = join(ROOT, "projects");

await loadDotEnv();

const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5";

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

async function pathExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

// --- Claude call --------------------------------------------------------

const DESIGN_SYSTEM_PROMPT = `You draft new project entries for a personal portfolio site (diegomarinangeli.github.io), matching its existing hand-crafted style exactly. Output ONLY via the publish_project tool call.

VOICE: concise, technical, third-person-omitted ("X does Y", not "This project does Y"). No marketing fluff, no emoji.

COVER ART (coverSvgInner + gradientFrom/gradientTo): every project card and detail-page hero shows a duotone diagonal gradient with a minimalist white line-art icon on top, abstractly representing the project's domain. Rules:
- coverSvgInner is RAW inner SVG markup only (paths/rects/circles/lines) — no outer <svg> tag.
- Coordinate space is a 150x110 viewBox. Keep shapes roughly centered within x:[5,145] y:[10,100].
- Only use rgba(255,255,255,OPACITY) for stroke/fill, OPACITY between 0.25 and 0.95, so it always reads as line art on top of the gradient. No other colors anywhere in the SVG.
- stroke-width 2 to 2.5 on strokes.
- Keep it abstract/geometric (outlined shapes, simple icons), not literal illustrations or text.
- gradientFrom/gradientTo are hex colors forming a vivid diagonal duotone (used as linear-gradient(135deg, from 0%, to 100%)). Gradients already in use on the site: blue-to-violet (#3d8bff -> #7c3aed), green-to-teal (#22c37d -> #0a6b4f), orange-to-pink (#ff9a3d -> #e0417a). Pick a visually distinct new pairing, still vivid/dark enough for white line art to read clearly on top.

Here is a full worked example (an existing project on the site), showing exactly what tone/detail level to match — study its card copy and detail-page sections:

CARD:
<article class="card">
  <a class="card-preview preview-dfr" href="projects/dfr.html" aria-label="Open the DFR project page">
    <svg class="preview-art" ...><!-- line-art icon --></svg>
  </a>
  <div class="card-body">
    <h3><a href="projects/dfr.html">DFR</a></h3>
    <p>An ASP.NET Core 8 tourism platform with real-time data sync, geolocation-aware discovery, interactive maps and a local AI tour guide.</p>
    <div class="card-tags"><span>C#</span><span>ASP.NET Core</span><span>Ollama</span></div>
  </div>
</article>

DETAIL PAGE BODY:
<h1>DFR</h1>
<p class="project-meta">C# · ASP.NET Core 8 · Entity Framework Core · SQL Server · Ollama (Llama 3.1)</p>
<p>DFR is a tourism exploration platform built with ASP.NET Core 8, designed to guide travelers through a destination with personalized preferences, real-time data sync, and an AI-powered tour guide. Built as a three-person exam project for the Software Project Management course at the University of Camerino.</p>
<h2>How it works</h2>
<ul>
  <li><strong>Identity management</strong> — full registration, authentication, and password recovery flow via ASP.NET Core Identity.</li>
  <li><strong>AI tour guide</strong> — a dedicated chat assistant powered by a local LLM (Ollama, Llama 3.1) with RAG context injection, focused on answering tourism questions for the target area.</li>
</ul>
<h2>Tech stack</h2>
<ul>
  <li><strong>Backend</strong> — .NET 8 / C# 12, Razor Pages &amp; MVC</li>
  <li><strong>AI engine</strong> — Ollama running Llama 3.1</li>
</ul>

Now produce the same quality of output for the given repo, based on its metadata and README. If the README describes multiple distinct capabilities, split them into bullets the way "How it works" does above. Use section headings that fit what the README actually documents (e.g. "How it works", "Features", "Security", "Requirements & installation", "Notes") — do not force sections that don't apply. Write 1-3 sections total. Keep tagline to one sentence (15-25 words). Infer tags/techStackLine from the repo's language, topics and README, most specific first.`;

function buildTool() {
  return {
    name: "publish_project",
    description: "Publish the drafted card copy, detail-page content, and cover art for a project.",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Project display name, matching repo/README capitalization." },
        tagline: { type: "string", description: "One sentence, ~15-25 words, for the card description." },
        tags: {
          type: "array",
          items: { type: "string" },
          minItems: 1,
          maxItems: 3,
          description: "Short tech labels for the card pills.",
        },
        techStackLine: { type: "string", description: "Tech stack items joined with ' · '." },
        intro: {
          type: "string",
          description: "1-2 paragraph introduction for the detail page. Separate paragraphs with \\n\\n.",
        },
        sections: {
          type: "array",
          minItems: 1,
          items: {
            type: "object",
            properties: {
              heading: { type: "string" },
              paragraphs: { type: "array", items: { type: "string" } },
              bullets: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    strong: { type: "string", description: "Optional bold lead-in for the bullet." },
                    text: { type: "string" },
                  },
                  required: ["text"],
                },
              },
            },
            required: ["heading"],
          },
        },
        links: {
          type: "object",
          properties: {
            liveDemo: { type: "string", description: "Only if the README/homepage clearly indicates a live demo URL." },
            releases: { type: "string", description: "Only if the repo clearly has a releases page worth linking." },
          },
        },
        gradientFrom: { type: "string" },
        gradientTo: { type: "string" },
        coverSvgInner: { type: "string" },
      },
      required: [
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
      ],
    },
  };
}

function buildUserContent({ owner, repo, meta, readme }) {
  return `Repo: ${owner}/${repo}
Description: ${meta.description || "(none)"}
Primary language: ${meta.language || "(unknown)"}
Topics: ${(meta.topics || []).join(", ") || "(none)"}
Homepage: ${meta.homepage || "(none)"}

README:
${readme || "(no README)"}`;
}

async function draftProjectViaApi(ctx) {
  const userContent = buildUserContent(ctx);
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 4096,
      system: DESIGN_SYSTEM_PROMPT,
      messages: [{ role: "user", content: userContent }],
      tools: [buildTool()],
      tool_choice: { type: "tool", name: "publish_project" },
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Anthropic API call failed: ${res.status} ${res.statusText}\n${body}`);
  }
  const data = await res.json();
  const toolUse = data.content.find((b) => b.type === "tool_use" && b.name === "publish_project");
  if (!toolUse) {
    throw new Error("Claude did not return a publish_project tool call");
  }
  return toolUse.input;
}

// Locates the real claude.exe behind the npm-installed `claude`/`claude.cmd`
// shim on Windows, so it can be spawned directly (shell:false). Going through
// cmd.exe/PowerShell to invoke the shim mangles the --json-schema argument's
// quotes/braces — this sidesteps that entirely.
async function resolveClaudeExecutable() {
  if (process.platform !== "win32") return "claude";
  const { execFileSync } = await import("node:child_process");
  const { existsSync } = await import("node:fs");
  const out = execFileSync("where", ["claude"], { encoding: "utf-8" });
  const cmdPath = out
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find((l) => l.toLowerCase().endsWith(".cmd"));
  if (!cmdPath) throw new Error("Could not locate claude.cmd via `where claude`.");
  const content = await readFile(cmdPath, "utf-8");
  const match = content.match(/"%dp0%\\(.+?claude\.exe)"/);
  if (!match) throw new Error(`Could not parse the claude.cmd shim to find claude.exe.`);
  const exePath = join(dirname(cmdPath), match[1]);
  if (!existsSync(exePath)) throw new Error(`Resolved claude.exe path does not exist: ${exePath}`);
  return exePath;
}

// Drafts via the locally logged-in `claude` CLI session instead of a raw API
// key — reuses whatever Claude Code auth (subscription or key) is already set up.
async function draftProjectViaCli(ctx) {
  const { execFile } = await import("node:child_process");
  const prompt = `${DESIGN_SYSTEM_PROMPT}\n\n${buildUserContent(ctx)}`;
  const schema = JSON.stringify(buildTool().input_schema);
  const claudeExe = await resolveClaudeExecutable();

  const stdout = await new Promise((resolve, reject) => {
    const child = execFile(
      claudeExe,
      ["-p", "--tools", "", "--output-format", "json", "--json-schema", schema],
      { maxBuffer: 20 * 1024 * 1024 },
      (err, stdout, stderr) => {
        if (err) return reject(new Error(`claude CLI call failed: ${err.message}\n${stderr}`));
        resolve(stdout);
      }
    );
    child.stdin.write(prompt);
    child.stdin.end();
  });

  const parsed = JSON.parse(stdout);
  if (parsed.is_error || !parsed.structured_output) {
    throw new Error(`claude CLI did not return structured output: ${parsed.result || stdout}`);
  }
  return parsed.structured_output;
}

async function draftProject(ctx) {
  if (process.env.ANTHROPIC_API_KEY) {
    return draftProjectViaApi(ctx);
  }
  console.log("  (no ANTHROPIC_API_KEY set — using the logged-in `claude` CLI session instead)");
  return draftProjectViaCli(ctx);
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

function renderCard(slug, owner, repo, draft) {
  const liveDemo = draft.links.liveDemo;
  const previewHref = liveDemo || `projects/${slug}.html`;
  const tagsHtml = draft.tags.map((t) => `<span>${t}</span>`).join("");
  const linkList = liveDemo
    ? [
        `<a href="${liveDemo}" target="_blank" rel="noopener">Live demo</a>`,
        `<a href="https://github.com/${owner}/${repo}" target="_blank" rel="noopener">Code</a>`,
      ]
    : [
        `<a href="projects/${slug}.html">Details</a>`,
        `<a href="https://github.com/${owner}/${repo}" target="_blank" rel="noopener">Code</a>`,
      ];

  return `          <article class="card">
            <a class="card-preview preview-${slug}" href="${previewHref}" aria-label="Open the ${escapeAttr(draft.title)} project page">
              <svg class="preview-art" width="150" height="110" viewBox="0 0 150 110" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                ${draft.coverSvgInner}
              </svg>
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

  const links = [`<a href="https://github.com/${owner}/${repo}" target="_blank" rel="noopener">Code</a>`];
  if (draft.links.liveDemo) {
    links.unshift(`<a href="${draft.links.liveDemo}" target="_blank" rel="noopener">Live demo</a>`);
  }
  if (draft.links.releases) {
    links.push(`<a href="${draft.links.releases}" target="_blank" rel="noopener">Releases</a>`);
  }
  links.push(`<a href="https://github.com/${owner}/${repo}#readme" target="_blank" rel="noopener">Full README on GitHub</a>`);

  return `<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${draft.title} — Diego Marinangeli</title>
<meta name="description" content="${escapeAttr(`${draft.title} — ${draft.tagline}`)}" />
<link rel="icon" type="image/png" href="../avatar-round.png" />
<link rel="stylesheet" href="../style.css" />

<body>
  <div class="page">
    <aside class="sidebar">
      <nav class="social-list">
        <a class="social-item" href="https://github.com/diegomarinangeli" target="_blank" rel="noopener">
          <svg viewBox="0 0 16 16" width="18" height="18" fill="currentColor" aria-hidden="true">
            <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z"/>
          </svg>
          <span>GitHub</span>
        </a>
        <a class="social-item" href="mailto:marinangelidiego@gmail.com">
          <svg viewBox="0 0 16 16" width="18" height="18" fill="currentColor" aria-hidden="true">
            <path d="M1.5 3h13c.28 0 .5.22.5.5v9c0 .28-.22.5-.5.5h-13a.5.5 0 0 1-.5-.5v-9c0-.28.22-.5.5-.5Zm.6 1.2v.2l5.9 4.2 5.9-4.2v-.2H2.1Zm11.8 1.36-5.6 3.99a.5.5 0 0 1-.6 0L2.1 5.56V12h11.8V5.56Z"/>
          </svg>
          <span>Email</span>
        </a>
      </nav>

      <div class="divider"></div>

      <nav class="ask-ai-list" aria-label="Ask an AI about Diego">
        <a class="ai-item" id="ask-claude" href="https://claude.ai/new?q=Tell%20me%20something%20about%20Diego%20Marinangeli" target="_blank" rel="noopener" title="Ask Claude about me">
          <svg viewBox="0 0 24 24" width="28" height="28" fill="currentColor" aria-hidden="true">
            <path d="M12 2 13.7 9.3 21 11 13.7 12.7 12 20 10.3 12.7 3 11 10.3 9.3 12 2Z"/>
          </svg>
        </a>
        <a class="ai-item" id="ask-chatgpt" href="https://chatgpt.com/?q=Tell%20me%20something%20about%20Diego%20Marinangeli" target="_blank" rel="noopener" title="Ask ChatGPT about me">
          <svg viewBox="0 0 24 24" width="28" height="28" fill="currentColor" aria-hidden="true">
            <path d="M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729ZM13.26 22.4292a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4944ZM3.5992 18.3038a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464ZM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1685a.0757.0757 0 0 1-.071 0l-4.8303-2.7865A4.504 4.504 0 0 1 2.3408 7.872ZM18.937 11.7514l-5.8144-3.3874 2.0201-1.1637a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.407-.667ZM20.9477 8.7283l-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.408 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.66ZM8.3065 12.863l-2.02-1.1638a.0804.0804 0 0 1-.038-.0567V6.0742a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805L8.704 5.4592a.7948.7948 0 0 0-.3927.6813ZM9.404 10.4976l2.6069-1.4998 2.602 1.4998v2.9994l-2.602 1.4997-2.607-1.4997Z"/>
          </svg>
        </a>
      </nav>
    </aside>

    <main class="content">
      <div class="project-page">
        <a class="back-link" href="../index.html#work">
          <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor" aria-hidden="true">
            <path d="M9.7 2.3 4 8l5.7 5.7 1.4-1.4L6.8 8l4.3-4.3z"/>
          </svg>
          Back to diegomarinangeli.github.io
        </a>

        <div class="project-hero preview-${slug}">
          <svg width="190" height="130" viewBox="0 0 150 110" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            ${draft.coverSvgInner}
          </svg>
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
  const marker = /<\/article>\r?\n {8}<\/div>\r?\n {6}<\/section>/;
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

  console.log(`Fetching metadata for ${owner}/${repo}...`);
  const meta = await getRepoMetadata(owner, repo);
  const readme = await getReadme(owner, repo);

  console.log("Drafting copy + cover art with Claude...");
  const draft = await draftProject({ owner, repo, meta, readme });
  validateDraft(draft);

  if (meta.homepage && !draft.links.liveDemo) {
    draft.links.liveDemo = meta.homepage;
  }

  await writeFile(pagePath, renderProjectPage(slug, owner, repo, draft), "utf-8");
  await insertCardIntoIndex(renderCard(slug, owner, repo, draft));
  await appendGradientToStyle(renderGradientCss(slug, draft.gradientFrom, draft.gradientTo));

  console.log(`\nDone. Wrote:\n  projects/${slug}.html\n  + card in index.html\n  + .preview-${slug} rule in style.css`);
  console.log("Review the diff before committing.");
}

async function runSync() {
  const user = defaultGithubUser();
  console.log(`Scanning ${user}'s repos for the "portfolio" topic...`);
  const repos = await listPortfolioRepos(user);
  const published = await alreadyPublishedRepos();
  const missing = repos.filter((r) => !published.has(`${user}/${r.name}`.toLowerCase()));

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

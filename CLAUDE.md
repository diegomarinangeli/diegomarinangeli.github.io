# SitoPersonale

Personal portfolio site for Diego Marinangeli (diegomarinangeli.github.io). Static HTML/CSS/vanilla JS, one shared `style.css` across `index.html` and `projects/*.html`.

## Design convention

Always use a **liquid glass** style (Apple-style translucent surfaces: `backdrop-filter: blur() saturate()`, soft semi-transparent background, subtle light border, inset highlight) for new UI elements added to this site — bars, scrollbars, panels, buttons, cards, etc. Reuse the `--glass-*` custom properties defined in `style.css` (`--glass-bg`, `--glass-bg-strong`, `--glass-border`, `--glass-highlight`, `--glass-blur`) rather than hardcoding new rgba values.

## Git commits

Never add a `Co-Authored-By: Claude ...` (or any AI attribution) trailer to commit messages in this repo. Diego does not want Claude/Anthropic showing up in the GitHub contributors list for his personal site — commit as him only, no co-author line.

## Automation

`scripts/generate-project.mjs` (run via `.github/workflows/sync-portfolio.yml`) auto-adds new GitHub repos tagged with the "portfolio" topic as project cards. It inserts new `<article class="card">` blocks into `index.html` by matching the exact whitespace around `.cards`' closing tags — don't restructure that markup by hand without checking the script still finds its insertion marker. Repos that should never be published (or should stay off the site) can be preemptively added to `scripts/published-repos.json` keyed by their GitHub repo id.

`scripts/fetch-news.mjs` and `scripts/fetch-school-news.mjs` (both run once a day via `.github/workflows/news-sync.yml`) refresh `news.json` (tech, from Hacker News's public keyless Firebase API) and `school-news.json` (the "Scuola" category, scraped from uspmc.sinp.net's "Tutte le notizie" archive, paginated — no public API/feed covers those announcements) respectively — no AI/API key involved in either. The homepage's `#news` section (`index.html`) fetches both JSON files client-side and keeps them as two **separate** feeds in `script.js` — a Tech/Scuola pill picks which one is shown (they're not merged into one list). There's no server-rendering step, so those two files are the only generated artifacts committed by the workflow. Category IDs are duplicated across `scripts/fetch-news.mjs` (`CATEGORY_RULES`), `scripts/fetch-school-news.mjs` (hardcodes `category: "scuola"`), and `script.js` (`TECH_CATEGORIES`/`ALL_CATEGORIES`, in the News section IIFE) — keep them in sync if any list changes. `fetch-school-news.mjs` disables TLS certificate verification for that one request (the site's own cert is misconfigured for a different domain — confirmed with `openssl s_client`, not a bug in the script) via a plain `node:https` request, not global `fetch`, so it doesn't weaken verification anywhere else.

The whole News section sits behind a password prompt (`mk01`) for everyone but Diego — deliberately **not** persisted anywhere (no localStorage/cookie), so it re-locks on every reload; see `script.js`'s `NEWS_PASSWORD` check. This is presentation-only (the JSON files are still directly fetchable), not real access control. Visitor "interests" (tech sub-category filter) and per-story read/unread status are stored in that visitor's `localStorage` (`newsInterests`, `newsReadStatus`) — there's no backend, so nothing is aggregated or sent anywhere.

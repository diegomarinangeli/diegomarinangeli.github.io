# SitoPersonale

Personal portfolio site for Diego Marinangeli (diegomarinangeli.github.io). Static HTML/CSS/vanilla JS, one shared `style.css` across `index.html` and `projects/*.html`.

## Design convention

Always use a **liquid glass** style (Apple-style translucent surfaces: `backdrop-filter: blur() saturate()`, soft semi-transparent background, subtle light border, inset highlight) for new UI elements added to this site — bars, scrollbars, panels, buttons, cards, etc. Reuse the `--glass-*` custom properties defined in `style.css` (`--glass-bg`, `--glass-bg-strong`, `--glass-border`, `--glass-highlight`, `--glass-blur`) rather than hardcoding new rgba values.

## Git commits

Never add a `Co-Authored-By: Claude ...` (or any AI attribution) trailer to commit messages in this repo. Diego does not want Claude/Anthropic showing up in the GitHub contributors list for his personal site — commit as him only, no co-author line.

## Automation

`scripts/generate-project.mjs` (run via `.github/workflows/sync-portfolio.yml`) auto-adds new GitHub repos tagged with the "portfolio" topic as project cards. It inserts new `<article class="card">` blocks into `index.html` by matching the exact whitespace around `.cards`' closing tags — don't restructure that markup by hand without checking the script still finds its insertion marker. Repos that should never be published (or should stay off the site) can be preemptively added to `scripts/published-repos.json` keyed by their GitHub repo id.

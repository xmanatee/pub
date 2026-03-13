You are a product designer and tool architect brainstorming one-of-a-kind interactive web experiences — some visually creative, some functionally powerful, some both.

<context>
Each idea will become a self-contained HTML page (inline CSS + JS, under 10 KB) running in a sandboxed iframe. The UI is the frontend; the backend is **commands**.

A pub page can define **commands** via a JSON manifest — functions that execute CLI tools on the user's machine. This means a pub isn't limited to what runs in the browser. It can call APIs, process media, interact with cloud services, run AI models — anything a CLI tool can do. The UI sends a command, the tool runs locally, the result comes back to the page.

**Important constraint**: there is currently no way to upload files from the user's device into the command environment. Commands work with URLs, IDs, text, and files they create themselves (e.g., `yt-dlp` downloading a video by URL, `gog` fetching data from Google). Design ideas around this — use URLs and cloud data, not local file paths.

An **agent executor** can invoke Claude Code or another AI agent from a command — so a pub can have AI-powered features (summarization, generation, analysis, decision-making) built right into its UI.

Here is a (non-exhaustive) list of CLI tools available. Use any of these, combine them, or imagine others:

**Google & Cloud Services**
`gog` (Gmail, Calendar, Drive, Docs, Sheets, Slides, Tasks, Contacts, Chat, Forms, Keep, Groups), `gcloud` (GCP Compute, GKE, BigQuery, Cloud Run), `gsutil` (Cloud Storage), `aws` (EC2, S3, Lambda, RDS), `az` (Azure), `firebase`, `vercel`, `netlify`, `fly`, `wrangler` (Cloudflare Workers)

**Code & Git**
`git`, `gh` (GitHub PRs, issues, Actions, repos, gists), `rg` (ripgrep — fast code search), `fd` (file finder), `tokei`/`scc` (code stats), `tree` (directory structure), `delta` (syntax-highlighted diffs)

**Media Processing**
`ffmpeg` (video/audio convert, trim, encode, thumbnails, waveforms), `imagemagick`/`magick` (image edit, convert, resize, watermark), `sox` (audio processing/effects), `yt-dlp` (download from YouTube/1000+ sites), `exiftool` (image/video metadata), `whisper` (speech-to-text), `say`/`espeak` (text-to-speech), `coqui-tts`/`piper` (voice synthesis)

**Documents & OCR**
`pandoc` (convert between Markdown, DOCX, PDF, HTML, LaTeX, EPUB), `wkhtmltopdf`/`weasyprint` (HTML→PDF), `pdftk` (merge, split, rotate PDFs), `pdftotext`/`pdfgrep` (extract/search PDFs), `tesseract` (OCR — image to text), `typst` (modern typesetting), `ghostscript`

**Data & Databases**
`sqlite3`, `duckdb` (analytics SQL on CSV/Parquet/JSON), `jq` (JSON processor), `yq` (YAML/XML/TOML), `csvkit`/`xsv`/`miller` (CSV tools), `dsq` (SQL on any file format), `pgcli`/`mycli` (Postgres/MySQL)

**Communication**
`gog` (Gmail, Chat), `himalaya` (IMAP/SMTP email client), `signal-cli` (Signal messaging), `slack` CLI, `pingme` (alerts to Discord/Slack/Telegram/Teams)

**File Management & Sync**
`rclone` (sync to 70+ cloud storage providers), `rsync`, `restic`/`borgbackup` (encrypted backups), `ncdu`/`dust` (disk usage analysis), `tar`/`zip`/`7z`, `duf` (drive status)

**Network & HTTP**
`curl`, `httpie`/`xh` (API testing), `nmap` (network scanning), `mtr` (traceroute), `doggo`/`dig` (DNS), `bandwhich` (bandwidth per-process), `ngrok` (tunnels)

**System Monitoring**
`htop`/`btop`/`glances` (process/system monitors), `procs` (process explorer), `hyperfine` (CLI benchmarking)

**AI & ML**
`ollama` (run local LLMs — Llama, Mistral, Phi), `whisper` (speech-to-text), `claude` (Claude Code agent), `stable-diffusion` CLI tools, agent executor (invoke any AI agent from a command)

**Productivity & Tasks**
`taskwarrior` (tasks with tags, priorities, dependencies), `watson`/`bartib` (time tracking), `pass`/`gopass` (password management), `calcure` (calendar TUI), `obsidian-cli` (notes/vault)

**Finance**
`ledger`/`hledger`/`beancount` (plain-text accounting), `ticker` (stock prices), `cointop` (crypto portfolio)

**DevOps & Infrastructure**
`docker` (containers), `kubectl`/`helm`/`k9s` (Kubernetes), `terraform`/`pulumi` (IaC), `ansible` (automation), `act` (run GitHub Actions locally)

**Weather, Location, Smart Home**
`wttr.in` (weather via curl), `ipinfo` (geo-IP), `hass-cli` (Home Assistant), `mosquitto` (MQTT/IoT)
</context>

<task>
Generate {{IDEA_COUNT}} ideas. For each one, create the file `output/pubs/NNN-short-name/idea.md` where `NNN` is zero-padded and `short-name` is descriptive kebab-case.

**Order ideas from most compelling to most conventional.** "Compelling" can mean visually stunning, functionally powerful, surprisingly useful, or a clever integration nobody has thought of. Frontload ideas that make someone think "I actually want to use this."

Each `idea.md` should be 2–3 paragraphs covering:
- What the user sees when they open the page and what they can do with it
- The core interaction or workflow — what makes it useful, engaging, or both
- Which CLI tools it uses and how (specific commands), or for browser-only ideas, the key technique
- Why someone would come back — the utility, the delight, or both
</task>

<idea_strategies>
Don't just think "what app can I build for tool X." Think about what becomes possible when you wire a simple UI to powerful local tools. Ideas can be visually creative, functionally creative, or both. Here are strategies across the full spectrum:

**Functional creativity — workflows & integrations**
- **Glue between tools that don't talk to each other** — a UI that connects Gmail + GitHub + Calendar into a unified triage view. A pipeline builder that chains pandoc → typst → rclone. The value is the integration, not the visuals.
- **Eliminate multi-step workflows** — things that currently take 5 terminal commands and context-switching become one page with a few clicks. Video conversion, document format pipelines, multi-service deployments.
- **Aggregate scattered data** — collect all "tasks" from GitHub issues + Taskwarrior + Google Tasks + flagged emails into one place. Show all notifications across Slack + Gmail + GitHub in a single feed. The value is the unified view.
- **Make expert tools accessible** — ffmpeg, duckdb, imagemagick, pandoc, terraform are powerful but intimidating. Build the UI that makes their power usable by someone who doesn't memorize flags.
- **AI as the connective tissue** — use agent executors to bridge gaps: auto-categorize incoming items, suggest which meeting to decline, draft replies, summarize a thread, extract action items from a doc.

**Visual creativity — experiences & delight**
- **Reimagine a familiar interface** — present email as a radar, calendar as a landscape, git history as geology, disk usage as a city skyline. The data is mundane; the presentation makes you see it differently.
- **Data as art** — structured data (git history, email patterns, code stats) visualized as constellations, topographic maps, musical scores, woven patterns.
- **Browser-native experiences** — Canvas animations, Web Audio synths, generative art, physics simulations, games. No tools needed — the browser is enough.

**Both — useful AND beautiful**
- **Playful utilities** — a timer that's gorgeous, a unit converter with personality, a color picker that teaches you color theory.
- **Original tool combinations** — what happens when you combine `whisper` + `pandoc` + `gog`? Speech → text → formatted doc → emailed. What about `yt-dlp` + `ffmpeg` + `whisper`? YouTube → audio → transcript. The combination is the idea.
- **Opinionated micro-tools** — not a full app, just one thing done exceptionally well. A tool that turns a GitHub issue thread into a decision doc. A page that monitors your Docker containers and restarts the ones that crash. A form that creates a properly formatted git commit from structured fields.
</idea_strategies>

<diversity_rules>
You tend to converge on visually flashy ideas with the same playbook: take data → map it to a creative metaphor → add animations. Fight this actively:

- No two ideas may share the same primary mechanic or the same tool combination.
- **Vary the value proposition**: some ideas are valuable because they're beautiful, some because they save 10 minutes a day, some because they connect two things that were disconnected, some because they make a hard thing easy. Not everything needs to look spectacular.
- **Vary complexity**: some should be dead simple (one input, one output, done), others rich and layered.
- **Vary tool usage**: some ideas use one tool deeply, some combine 2–3 tools, some are pure browser experiences.
- For tool-powered apps: don't just make "a dashboard for X" or "X but as a galaxy/radar/landscape." Think about what workflow this tool is part of and what's painful about that workflow.
- Aim for roughly equal distribution: ~1/3 primarily functional (integrations, workflows, automation), ~1/3 primarily visual (experiences, art, delight), ~1/3 both (useful tools with great UX).
- Include at least 5 ideas that feel genuinely weird or experimental.
</diversity_rules>

<examples>
These show the tone, level of detail, and the full range expected — from visual spectacles to pure utility to creative combinations:

<example>
### 012-notification-triage

A unified notification center combining **gog**, **gh**, and **slack**. All your incoming items — emails, GitHub notifications, Slack mentions — pulled into one list, auto-categorized by an agent executor into: needs response, FYI, can ignore. Each item shows its source icon, a one-line AI summary, and action buttons appropriate to its type (reply, close issue, archive, snooze).

Commands: `gog gmail list --query "is:unread"`, `gh api notifications`, agent command to classify urgency. The killer feature is batch actions — select 10 FYI notifications and archive them all across their respective services in one click. The interface is deliberately plain: a clean list, fast filters, keyboard shortcuts. The value isn't how it looks, it's that you process 50 notifications in 2 minutes instead of 15.
</example>

<example>
### 027-pandoc-pipeline

A visual pipeline builder for **pandoc** + **typst** + **rclone**. Drag-and-drop blocks representing conversion steps: input format → transform → output format → destination. Connect Markdown → PDF via pandoc, or Markdown → typst → PDF for better typography. Add a final block to upload the result to Google Drive via `rclone copy`.

Each block shows its underlying command. Click a block to configure options (page size, font, template). Hit "run" and watch the pipeline execute step by step, each block lighting up as it completes. Save pipeline configs for reuse. The UI is a simple node graph — functional, not flashy. The value: pandoc has 50+ format combinations and hundreds of flags. This makes it point-and-click.
</example>

<example>
### 038-clip-forge

A video tool powered by **yt-dlp** + **ffmpeg**. Paste a YouTube URL and the tool downloads it via `yt-dlp`, then displays it as a filmstrip — a horizontal ribbon of keyframes extracted via `ffmpeg -vf thumbnail`. Drag to select a range, set start/end with frame-accurate precision. Buttons for: trim, extract audio, convert to GIF, resize, compress. Each operation shows the ffmpeg command it's about to run and a size/quality estimate.

A waveform view (extracted via `ffmpeg -filter_complex showwavespic`) shows below the filmstrip so you can cut on audio beats. Progress bars during encoding are real, fed by ffmpeg's stderr output. The result: ffmpeg's power, none of its intimidation.
</example>

<example>
### 045-context-weave

A cross-tool knowledge dashboard combining **gog**, **gh**, and an **agent executor**. The center is a text editor where you write notes. As you type, three side panels light up with relevant context pulled from different tools:

- Left panel: recent emails mentioning the same keywords — `gog gmail search "{{query}}"`
- Right panel: GitHub issues and PRs matching the topic — `gh search issues "{{query}}"`
- Bottom panel: AI-generated connections — "This relates to your meeting tomorrow about X"

The magic is the cross-referencing. Mention a person's name and see their recent emails AND their GitHub activity side by side. Mention a project name and see the doc, the issues, and the emails in one view. Three separate data silos become one interconnected workspace.
</example>

<example>
### 058-git-topography

A topographic map of your git repository powered by **git** and **tokei**. Each file is a point on the map. Files that change together frequently are close together (clustered by co-commit frequency). Height = number of total changes (hotspots are mountains). Color = last author. Rivers form along dependency chains.

The map slowly rotates to show depth. Click a peak to see its commit history as a stratigraphic cross-section — layers of changes over time, color-coded by author. Zoom out far enough and you see the whole project as a mountain range, immediately revealing which areas are active and which are dormant plains.
</example>

<example>
### 071-deploy-button

The simplest possible deploy tool, combining **gh**, **vercel**, and **pingme**. One page, one giant button. It shows your current branch, the last commit message, and a diff summary (`gh api` for PR details). Press the button: it triggers a Vercel deploy, monitors it, and sends a Slack/Discord notification via `pingme` when it's live. A traffic-light indicator shows deploy status: building → deploying → live.

No dashboards, no settings sprawl, no context switching. You open the page, confirm the diff looks right, and press. The entire interface is the button and the status light. Everything else is handled by the commands behind it.
</example>

<example>
### 083-thread-weaver

An interactive loom — purely browser-based, no CLI tools. Vertical warp threads are pre-strung across the screen. You pick a color and "weave" by dragging horizontally — the thread interlaces over and under the warp following a pattern you choose (plain weave, twill, satin, herringbone). As you weave rows, the fabric builds up with realistic-looking texture — light catches the threads differently based on their angle.

Tap a warp thread to change its color. Double-tap a woven row to unravel it with a satisfying animation. The finished textile can be downloaded as a PNG tile suitable for repeating backgrounds. A small panel shows the "draft notation" — the traditional grid diagram weavers use — updating live as you work.
</example>
</examples>

Use the Write tool to create each file. Make every single idea distinct and vivid.

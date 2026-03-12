You are a creative director brainstorming one-of-a-kind interactive web experiences.

<context>
Each idea will become a self-contained HTML page (inline CSS + JS, under 300 KB) running in a sandboxed iframe. The UI is the frontend; the backend is **commands**.

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
Generate 100 ideas. For each one, create the file `output/pubs/NNN-short-name/idea.md` where `NNN` is zero-padded (001–100) and `short-name` is descriptive kebab-case.

Each `idea.md` should be 2–3 paragraphs covering:
- What the user sees and experiences the moment they open the page
- The core interaction — what makes it engaging
- Which CLI tools it uses and how (specific commands), or for browser-only ideas, the key visual/interactive technique
- The emotional hook — what makes someone stay or come back
</task>

<idea_strategies>
Don't just think "what app can I build for tool X." Think about what experiences become possible when you combine a beautiful UI with the power of local tools. Here are strategies to spark ideas:

- **Reimagine a familiar interface** — take the concept of an email inbox, a calendar, a file manager, a music player, and present the data in a radically different visual metaphor (radar, landscape, galaxy, timeline, graph, game)
- **Cross-tool mashups** — the most interesting ideas combine data or actions from 2–3 tools into one unified view. What if your calendar events (gog) showed related GitHub issues (gh)? What if your notes linked to emails mentioning the same topics?
- **Aggregate a data type across tools** — collect all "tasks" from GitHub issues + Taskwarrior + Google Tasks + email flagged items into one unified view. Collect all "documents" from Drive + local filesystem + Obsidian vault.
- **Give a CLI tool a face** — tools like ffmpeg, imagemagick, duckdb, pandoc are incredibly powerful but intimidating. Build the UI that makes their power accessible.
- **AI-augmented workflows** — use the agent executor to add intelligence: auto-categorize, summarize, draft replies, suggest actions, find patterns, translate.
- **Browser-native delights** — not everything needs tools. Canvas animations, WebGL experiments, Web Audio synths, generative art, games, simulations — these are compelling on their own.
- **Data as art** — take structured data (git history, email patterns, disk usage, code stats) and visualize it as something beautiful: constellations, topographic maps, musical scores, woven patterns.
- **Playful utilities** — timers that are beautiful, calculators that are fun, converters that surprise you, generators that delight.
</idea_strategies>

<diversity_rules>
You tend to converge on safe, predictable ideas. Fight this actively:

- No two ideas may share the same primary mechanic or the same tool combination.
- Vary aesthetics wildly: some dark and moody, some bright and playful, some brutalist, some minimal, some maximalist, some retro, some futuristic.
- Mix complexity: some should be dead simple (one interaction, instant delight), others rich and layered.
- Mix tool usage: some ideas use one tool deeply, some combine 2–3 tools, some are pure browser experiences.
- Draw from unexpected domains: music theory, fluid dynamics, typography, linguistics, cartography, astronomy, cooking, textiles, architecture, dance.
- For tool-powered apps: don't just make "a dashboard for X." Think about what unique UI would make that tool's data come alive.
- Include at least 5 ideas that feel genuinely weird or experimental.
</diversity_rules>

<examples>
These show the tone, level of detail, and range expected:

<example>
### 008-inbox-radar

A radial email client powered by **gog**. Instead of a list, your inbox is a radar screen — a dark circular display with a sweeping green scanline. Emails appear as blips: size = thread length, brightness = recency, distance from center = priority (AI-scored via agent command). Hover a blip to preview the subject and sender in a tooltip. Click to expand the full email in a slide-out panel.

Commands: `gog gmail list` populates the radar, `gog gmail read` opens a thread, `gog gmail archive` sweeps a blip off the screen with a satisfying fade. An agent command auto-generates a one-line summary for each unread email, shown on hover. The radar continuously rotates — new emails materialize as the scanline passes. The whole thing feels like mission control for your day.
</example>

<example>
### 023-meeting-sculptor

A 3D calendar visualization using **gog** for Google Calendar. Your week is rendered as a landscape — each day is a column, meetings are physical blocks stacked vertically. Color = calendar, height = duration, texture = meeting type (1:1 = smooth, group = rough, focus time = glass). You can orbit the view with mouse drag, and the landscape gives you an instant visceral feel for how packed your week is — a cliff face of meetings vs. a gentle rolling hill.

Click a block to see details in a floating card. An agent command can suggest which meetings to decline based on your stated priorities ("protect my mornings for deep work"). The empty spaces between blocks glow softly — they're your free time, and the UI celebrates them.
</example>

<example>
### 037-drive-galaxy

A Google Drive file manager reimagined as a star map, powered by **gog**. Files are stars, folders are constellations. Size = file size, color = file type (docs blue, sheets green, images warm orange), brightness = last modified recency. Zoom in on a constellation to see its files spread out. Zoom out to see your whole Drive as a galaxy.

Commands: `gog drive list` scans folders, `gog drive download` grabs a file, `gog drive upload` adds a new star with a birth animation. A search bar becomes a telescope — type and matching stars pulse. Combine with **exiftool**: select an image star and a sidebar shows its EXIF data, extracted metadata glowing alongside.
</example>

<example>
### 051-clip-forge

A video tool powered by **yt-dlp** + **ffmpeg**. Paste a YouTube URL and the tool downloads it via `yt-dlp`, then displays it as a filmstrip — a horizontal ribbon of keyframes extracted via `ffmpeg -vf thumbnail`. Drag to select a range, set start/end with frame-accurate precision. Buttons for: trim, extract audio, convert to GIF, resize, compress. Each operation shows the ffmpeg command it's about to run and a size/quality estimate.

The UI is dark with amber accents — an editing bay aesthetic. A waveform view (extracted via `ffmpeg -filter_complex showwavespic`) shows below the filmstrip so you can cut on audio beats. Progress bars during encoding are real, fed by ffmpeg's stderr output. The result: ffmpeg's power, none of its intimidation.
</example>

<example>
### 064-context-weave

A cross-tool knowledge dashboard combining **gog**, **gh**, and an **agent executor**. The center is a text editor where you write notes. As you type, three side panels light up with relevant context pulled from different tools:

- Left panel: recent emails mentioning the same keywords — `gog gmail search "{{query}}"`
- Right panel: GitHub issues and PRs matching the topic — `gh search issues "{{query}}"`
- Bottom panel: AI-generated connections — "This relates to your meeting tomorrow about X"

The magic is the cross-referencing. Mention a person's name and see their recent emails AND their GitHub activity side by side. Mention a project name and see the doc, the issues, and the emails in one view. Three separate data silos become one interconnected workspace.
</example>

<example>
### 078-git-topography

A topographic map of your git repository — purely browser-based via **git log** output piped in. Each file is a point on the map. Files that change together frequently are close together (clustered by co-commit frequency). Height = number of total changes (hotspots are mountains). Color = last author. Rivers form along dependency chains.

The map slowly rotates to show depth. Click a peak to see its commit history as a stratigraphic cross-section — layers of changes over time, color-coded by author. Zoom out far enough and you see the whole project as a mountain range, immediately revealing which areas are active and which are dormant plains.
</example>

<example>
### 089-thread-weaver

An interactive loom — purely browser-based, no CLI tools. Vertical warp threads are pre-strung across the screen. You pick a color and "weave" by dragging horizontally — the thread interlaces over and under the warp following a pattern you choose (plain weave, twill, satin, herringbone). As you weave rows, the fabric builds up with realistic-looking texture — light catches the threads differently based on their angle.

Tap a warp thread to change its color. Double-tap a woven row to unravel it with a satisfying animation. The finished textile can be downloaded as a PNG tile suitable for repeating backgrounds. A small panel shows the "draft notation" — the traditional grid diagram weavers use — updating live as you work.
</example>
</examples>

Use the Write tool to create each file. Make every single idea distinct and vivid.

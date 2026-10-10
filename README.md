# CS2 Tournament Match Site 🎮

A clean, lightweight, and modern web application designed to track and display CS2 Aussie Laozi Cup tournament match results, powered by static hosting and dynamic JSON data rendering.

---

## 🚀 Current Features

- **Series archive:** The home page shows upcoming editions and the latest completed edition; all completed editions are listed on a dedicated archive page.
- **Edition and match details:** Each edition has its own match list; individual BO1/BO3 pages show scores, maps, rosters, and available player statistics.
- **Player statistics:** Kills, deaths, assists, K/D, headshot percentage, ADR, and MVP count are displayed when present in the saved match data. BO3 overview totals are aggregated from map data.
- **Edition information:** Event time, schedule, champion, captain, MVP, champion roster, FACEIT profile links, and avatars can be recorded for each edition.
- **Local data management:** A command-line menu can add or remove matches, create editions, update edition information, and edit champion/MVP records.
- **Hall of Fame placeholder:** The home page links to a separate Hall of Fame page, ready for future content.
- **Responsive, dependency-free front end:** Built with HTML, CSS, and vanilla JavaScript; data is loaded from JSON.
- **GitHub Pages deployment:** The site is published from the repository using GitHub Actions.

---

## 📁 Project Structure

```text
cs2MatchSite/
├── 📄 .gitignore                 # Local files and generated Python cache exclusions
├── 📁 .vscode/
│   └── 📄 tasks.json             # VS Code workspace tasks
├── 📄 index.html                 # Home page (kept at root for GitHub Pages)
├── 📄 history.html               # Completed tournament editions archive
├── 📄 registration.html          # Tournament registration information
├── 📄 series.html                # Edition match list and tournament awards
├── 📄 match.html                 # Match and player-statistics details
├── 📄 about.html                 # About page
├── 📄 hall-of-fame.html          # Hall of Fame placeholder page
├── 📄 _config.yml                # Keep Markdown files available as raw content
├── 📁 assets/
│   ├── 📁 css/
│   │   └── 📄 style.css          # Site styles
│   ├── 📁 images/
│   │   ├── 📄 default-avatar.svg # Placeholder shown when a player has no avatar
│   │   └── 📁 players/            # Saved player avatar image snapshots
│   └── 📁 js/
│       ├── 📄 script.js          # Home and archive series cards
│       ├── 📄 series.js          # Edition page and awards rendering
│       ├── 📄 match.js           # Match details and statistics
│       └── 📄 about.js           # Markdown content rendering
├── 📁 data/
│   └── 📄 matches.json           # Editions, match results, and player statistics
├── 📁 tools/
│   ├── 📄 faceit_sync.py         # FACEIT match data sync helpers
│   └── 📄 manage_matches.py      # Local match management menu
├── 📄 requirements.txt           # Python dependencies for FACEIT tools
├── 📁 docs/
│   ├── 📄 about.md               # Editable About Us content
│   └── 📄 changelog.md           # Change history
└── 📄 README.md                  # Project documentation
```

The home page displays upcoming editions and the latest completed edition, with a separate page for the full archive. The top-left ALTV wordmark expands to “Aussie Laozi TV” on hover or keyboard focus. The Hall of Fame currently opens a standalone placeholder page.

Tournament data is stored in the `series[]` array in `data/matches.json`. Each edition contains `id`, `title`, `status`, `description`, and `matches[]`. The optional `eventTime` and `schedule` fields are shown on the home page and edition details. When either field is set, the description line displays the edition title. Completed editions can also record `championTeam`, `captain`, `mvp`, and `championPlayers`.

Champion roster FACEIT IDs link to FACEIT player profiles. Avatars can be obtained from FACEIT match data or added through the management menu. The MVP’s K/D, kills, deaths, assists, ADR, headshot percentage, and match MVP count are aggregated from saved map statistics for the edition. Tournament Rating must currently be entered manually. The sync tool saves `player_stats` returned by the FACEIT Stats API, but the Rating and Swing values shown on the FACEIT website have not yet been verified or integrated; do not assume they synchronize automatically.

The About page content is stored in `docs/about.md`. Edit this Markdown file to update the page without changing its HTML or JavaScript. Supported formatting includes headings, paragraphs, unordered lists, bold, italic, and links.

---

## 🔮 Roadmap / Next Development Steps

- [x] **FACEIT API Integration:** Fetch match and player stats from the FACEIT API using `tools/faceit_sync.py`.
- [x] **BO3 Match Support:** Combine map results into a series overview with selectable per-map details.
- [x] **Series Management:** Organize editions such as S1 and S2, each with its own matches, schedule, and awards.
- [x] **Local Match Administration:** Add, remove, and manage matches and edition metadata from the CLI.
- [x] **Player Statistics:** Display available match and BO3 aggregate statistics.
- [ ] **Automated Data Pipeline:** Automatically synchronize match results into `data/matches.json`.
- [ ] **FACEIT Rating/Swing:** Verify whether these website statistics are available from a supported API response, then integrate if accessible.
- [ ] **Hall of Fame:** Replace the placeholder with historical player records.

---

## 🛠️ Local Development & Usage

1. Clone the repository:
   ```bash
   git clone https://github.com/ivtwWw/Cs2TournamentProject.git
   ```
2. Open the project folder in **VS Code**.
3. Use **Live Server** to preview the site locally.

## FACEIT Data Sync Setup

Install the Python dependency before running the FACEIT tools:

```powershell
python -m pip install -r requirements.txt
```

python -m tools.manage_matches  
`tools/faceit_sync.py` does not store an API key in source code. Set the `FACEIT_API_KEY` environment variable in the current terminal session before running the script:

### Windows PowerShell

```powershell
$env:FACEIT_API_KEY = "YOUR_NEW_FACEIT_API_KEY"
python tools/faceit_sync.py
```

### Windows Command Prompt

```cmd
set FACEIT_API_KEY=YOUR_NEW_FACEIT_API_KEY
python tools/faceit_sync.py
```

If an old API key was committed to Git or exposed in a public repository, revoke it in the FACEIT Developer Portal and generate a new one immediately. Do not put the new key in source code, `data/matches.json`, this README, or any commit.

### Syncing BO3 Matches

When adding a match with `python -m tools.manage_matches`, choose the single FACEIT link option if you have a link for the entire series. If the FACEIT Stats API returns data for all maps, the script will identify the series score and save each map’s score and player statistics.

If the FACEIT link only represents one map, choose the BO3 option to manually combine multiple map links and enter the 2 or 3 FACEIT match links/IDs in match order. The match details page provides a series overview and per-map navigation. Existing records without map or player data must be synchronized again to include it.

Run the sync script from the project root. It always reads and writes `data/matches.json`, regardless of the current working directory.

Player avatars fetched from FACEIT are saved as image snapshots in `assets/images/players/`, and match data stores their relative paths. When editing championship awards, paste a FACEIT CDN image URL; the management tool downloads it before saving. The download accepts HTTPS images from `distribution.faceit-cdn.net`, validates the image format, and limits files to 5 MB. If a snapshot cannot be downloaded, the management operation reports the error rather than replacing the saved avatar. Older records may still contain remote avatar URLs; leaving an avatar field blank preserves that value, while entering its CDN URL again attempts to save a local snapshot.

### Local Match Management

From the project root, run:

```powershell
python -m tools.manage_matches
```

The management menu can list editions and matches, fetch and add BO1/BO3 matches, delete matches by list number, create editions, update edition status/event time/schedule, and edit the champion team, captain, MVP, tournament Rating, and champion roster avatars. Event time accepts free-form text (for example, `Sep 1–15, 2026`). Separate schedule stages can be entered using semicolons. Leave a field blank to keep its current value, or enter `-` to clear it. Set `FACEIT_API_KEY` before fetching matches; viewing, deleting, and editing edition information do not require an API key. Changes are written directly to `data/matches.json`. Review the site, then commit and push your changes to deploy them through GitHub Pages.

To add or edit the event time and schedule shown on the home page, run the management menu and choose `5. Update edition information (status, event time, schedule)`, then select the edition. Event time accepts free-form text. Separate schedule stages with semicolons; they will appear on separate lines on the home-page edition card and edition details page. Leave a field blank to keep its current value, or enter `-` to clear it.

After an edition is complete, run `python -m tools.manage_matches` and choose menu option `6` to record the champion, captain, and MVP. Enter the MVP’s tournament Rating manually; other statistics are aggregated from the edition’s synchronized map data. Champion roster members and FACEIT IDs are read from the final match data. The menu can save a local avatar snapshot from a FACEIT CDN image URL for each roster member. The home-page edition card shows the champion, captain, and MVP; the edition page shows the champion roster and the MVP’s full tournament statistics.

To create S2 or a later edition, choose `Create edition` from the management menu and enter its ID (for example, `s2`), title, description, and status. When adding a match, select the edition it belongs to. Matches from S1, S2, and later editions are kept in separate lists.
# Second Brain

A self-hosted daily tracking system built on plain markdown. An Obsidian vault is the
source of truth; a dashboard reads and writes it over an API; a daily cron creates each
day's file and a morning briefing. Optionally, a wearable feeds sleep, resting heart rate
and training-zone data into the same place.

Your data stays as markdown in your own git repository. There is no database and no
third-party service holding your journal.

<!-- A screenshot goes well here. -->

## Why it is shaped like this

The vault is the source of truth, not a cache. Every number the dashboard shows lives in
YAML frontmatter in a file you can open in Obsidian, edit by hand, grep, or take
elsewhere. The API is a view over those files, so nothing is trapped in the app.

Two consequences worth knowing before you adopt it:

- **Writes are git commits.** The deployed Worker edits your vault through the GitHub
  Contents API. That gives you free history and sync, and it means writes are on the order
  of a second, not a millisecond.
- **Missing data stays missing.** Nothing is coerced to zero to make a chart continuous.
  A day you didn't log looks different from a day you logged as nothing, everywhere.

## Architecture

```
Obsidian  ─┐
           ├─→  markdown vault in git  ←─→  Cloudflare Worker API  ←─  dashboard (Pages)
wearable  ─┘                                        ↑
                                     GitHub Actions cron (daily file + briefing)
```

| Piece | What it is |
|---|---|
| `obsidian-vault/` | Markdown + YAML frontmatter. The source of truth. |
| `worker/` | Cloudflare Worker (Hono). The production API; reads and writes the vault via the GitHub API. |
| `api/` | Express server. The local-dev equivalent, reading the vault straight off disk. |
| `dashboard/` | Next.js, statically exported. Deploys to Cloudflare Pages. |
| `scripts/` | The daily cron: creates the day's file, weekly goals, and the briefing. |
| `.github/workflows/` | Runs that cron and commits the result. |

The Worker and the Express API serve the same routes, so the dashboard runs unchanged
against either.

## Quick start (local)

Requires Node 18+.

```bash
git clone https://github.com/liams975/second-brain-open.git
cd second-brain-open
(cd api && npm install) && (cd dashboard && npm install) && (cd scripts && npm install)

cp api/.env.example api/.env     # set VAULT_PATH, TIMEZONE, LATITUDE, LONGITUDE
echo 'NEXT_PUBLIC_API_URL=http://localhost:3001' > dashboard/.env.local

make dev                          # API on :3001, dashboard on :3000
```

The repo ships a small sample vault and sample wearable rollups, so every panel renders on
a fresh clone. Delete `obsidian-vault/Daily-Progress/*`, `obsidian-vault/Focus/*`,
`obsidian-vault/Projects/*`, `obsidian-vault/Health/*` and `data/` once it's yours — the
sample data describes a fictional person.

One wrinkle: the sample data is dated to when this repo was built. The daily and weekly
panels sort by filename so they render regardless, but the Ring tab asks for "the last N
days" by date, so it will look empty if you clone this long afterwards. That is the real
behaviour of a wearable you haven't worn yet, not a bug — it fills in once your own
producer starts writing `data/ring/`.

## Deploying

See [DEPLOY.md](DEPLOY.md). Short version: the Worker is the API, Pages serves the
dashboard, and a GitHub Action runs the cron. All three fit in free tiers.

**The API requires an `API_KEY` and refuses to start serving without one.** It reads and
writes a personal journal and CORS is open, so an unauthenticated deployment would be a
world-readable diary. This is deliberate; see DEPLOY.md for the two-line setup.

## Configuration

| Where | Keys |
|---|---|
| `api/.env` | `VAULT_PATH`, `ANTHROPIC_API_KEY`, `PORT`, `TIMEZONE`, `LATITUDE`, `LONGITUDE`, `RING_SYNC_SCRIPT` |
| `worker/wrangler.toml` `[vars]` | `GITHUB_OWNER`, `GITHUB_REPO`, `GITHUB_BRANCH`, `VAULT_DIR`, `TIMEZONE` |
| Worker secrets | `GITHUB_TOKEN`, `ANTHROPIC_API_KEY`, `API_KEY` |
| Pages build env | `NEXT_PUBLIC_API_URL`, optionally `NEXT_PUBLIC_LOCATION_LABEL` |
| GitHub Actions secrets | `ANTHROPIC_API_KEY` |

`TIMEZONE` matters more than it looks: daily files are named for a local calendar day, so
every component that derives "today" has to agree on which zone that is.

## The daily cron

Creates today's file from the template, creates the week's goals file on the first run of
a new week, fetches a morning briefing (weather, index closes, headlines), and commits.

Two things learned the hard way, both baked in:

- GitHub's `schedule` event is best-effort and queues worst at the top of the hour. Delays
  of several hours are normal, so schedule well before you want the file and avoid `:00`.
- Index levels come from a plain market API, not from a language model with web search.
  Letting the model hunt for numbers cost 87k–140k tokens per run and still returned nulls
  when its searches came up short. Fetching them directly costs nothing and is exact.

Run it once by hand with `VAULT_PATH=... node scripts/daily-cron.js`, or `--dry-run` to see
what it would write.

## Wearable integration

The dashboard's Ring tab reads `data/ring/<YYYY-MM-DD>.json`. That file is the entire
interface — this repo contains no Bluetooth code and no vendor SDK, so anything that writes
that shape works.

The reference producer is [qring](https://github.com/liams975/fitness-ring), which talks BLE to a
COLMI R06 smart ring. See **[docs/ring-schema.md](docs/ring-schema.md)** for the schema and
for writing your own producer against a different device.

## Vault structure

```
obsidian-vault/
├── Focus/            priorities.md, monthly-focus.md, weekly goals (YYYY-W##.md)
├── Daily-Progress/   one file per day (YYYY-MM-DD.md)
├── Projects/         one file per project; status: "active" feeds the cron
├── Health/           reference notes (protocols, targets)
├── Domains/          concepts, by subject
├── Media/            books, films, articles
├── Events/           events, applications, programs
├── People/           one file per person
└── Templates/        the canonical schema for every note type
```

`Templates/` is the real specification. To add a note type, add a template and a route.

## API

Both backends serve these. Base URL is `http://localhost:3001` locally, your Worker URL in
production. All routes require an `x-api-key` header on the Worker.

| Routes | |
|---|---|
| `/api/daily-progress` | `GET /today`, `GET /range/:n`, `GET /:date`, `PATCH /:date` |
| `/api/focus` | `GET /priorities`, `GET /weekly`, `PATCH /weekly` |
| `/api/monthly-focus` | `GET /`, `PATCH /` |
| `/api/projects` | `GET /`, `GET /:slug`, `PATCH /:slug` |
| `/api/ring` | `GET /range/:n`, `GET /:date`, `POST /sync` (local only) |
| `/api/briefing` | `GET /` |
| `/api/insights` | `GET /` (AI trend summary, cached daily) |
| `/api/health/references` | `GET /` |
| `/api/vault-stats` | `GET /` |
| `/api/events`, `/api/people` | `GET /`, `GET /:title`, `PATCH /:title` |

## Make targets

| | |
|---|---|
| `make dev` | API and dashboard together |
| `make start-api` / `make start-dash` | One at a time |
| `make test-cron` | Dry-run the cron — no writes, no git |
| `make book` | Create a book note |
| `make lint` / `make build` | Dashboard lint and production build |
| `make stop` | Kill whatever is on :3000 and :3001 |

## License

MIT — see [LICENSE](LICENSE).

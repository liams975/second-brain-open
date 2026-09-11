# Deploying

Three pieces, all on free tiers, with your data staying as markdown in your own GitHub repo:

```
browser ──→ Cloudflare Pages (static dashboard)
        └─→ Cloudflare Worker (API) ──GitHub API──→ your vault repo
GitHub Actions (daily) ───────────────────────────→ commits the daily file + briefing
```

Nothing redeploys when your data changes, so editing a goal never triggers a rebuild.

## 0. Your vault repo

The Worker reads and writes markdown through the GitHub API, so your vault needs to live in
a repo it can reach. **Make it private** — it is your journal.

You can keep the vault in this same repo, or split the framework and your vault apart;
`GITHUB_OWNER` / `GITHUB_REPO` / `VAULT_DIR` in `worker/wrangler.toml` decide what the
Worker reads.

## 1. The Worker (API)

```bash
cd worker
npm install
npx wrangler login

npx wrangler secret put GITHUB_TOKEN       # fine-grained PAT, Contents: read/write
npx wrangler secret put ANTHROPIC_API_KEY  # for /api/insights
npx wrangler secret put API_KEY            # any long random string — REQUIRED
```

Generate the API key with `openssl rand -hex 32` and save it in a password manager.

**`API_KEY` is not optional.** Without it the Worker answers `503` on every route and
refuses to serve. CORS is open by design so other tools can talk to the API, which means
an unauthenticated deployment would publish your journal to anyone who learned the URL.

Edit `[vars]` in `worker/wrangler.toml` — `GITHUB_OWNER`, `GITHUB_REPO`, `TIMEZONE` — then:

```bash
npx wrangler deploy
```

Check it. The first should be `401`, the second `200`:

```bash
curl -i https://<your-worker>.workers.dev/api/daily-progress/today
curl -i -H "x-api-key: <your key>" https://<your-worker>.workers.dev/api/daily-progress/today
```

Setting a secret takes effect immediately; no redeploy needed.

## 2. The dashboard (Pages)

Cloudflare dashboard → **Workers & Pages → Create → Pages → Connect to Git**.

| Setting | Value |
|---|---|
| Root directory | `dashboard` |
| Build command | `npm run build` |
| Build output | `out` |
| Env: `NEXT_PUBLIC_API_URL` | your Worker URL |
| Env: `NEXT_PUBLIC_LOCATION_LABEL` | optional, e.g. `Berlin` — labels the weather panel |

Set **Settings → Builds → Build watch paths** to `dashboard/*` so data commits don't
trigger rebuilds.

Or deploy without the Git integration:

```bash
cd dashboard
NEXT_PUBLIC_API_URL=<worker-url> npm run build
npx wrangler pages deploy out
```

### Giving the dashboard the key

The API key is deliberately **not** baked into the build — the site is a public static
export, so anything compiled in is readable by anyone. Instead the dashboard asks for the
key the first time a request comes back `401`, and stores it in `localStorage`.

So: open the site, paste the key into the prompt, done. It lives in that browser only,
which means clearing site data logs you out and you paste it again. If you'd rather skip
the prompt, set `NEXT_PUBLIC_API_KEY` at build time — but understand that publishes the key.

## 3. The cron

`.github/workflows/daily-cron.yml` creates the daily file and briefing and commits them.
Add `ANTHROPIC_API_KEY` under **Settings → Secrets and variables → Actions**, and set the
`env:` block's `TIMEZONE`, `LATITUDE` and `LONGITUDE` to yours.

Pick the schedule carefully:

- GitHub's `schedule` event is best-effort and queues worst on the hour. Several hours late
  is normal, so schedule well before you want the file and use an odd minute.
- Never schedule before your zone's UTC midnight. The script takes the date from the runner
  clock, which is UTC, so an early run writes *tomorrow's* file tonight. For UTC−7 the
  earliest safe hour is 07:00 UTC.

Trigger a first run by hand from the Actions tab.

## Running it locally instead

The Express server in `api/` serves the same routes off the filesystem, with no GitHub
round-trip and no auth (it binds locally and CORS is restricted to `localhost:3000`). It is
the better option if you want everything on one machine. `make dev` starts it with the
dashboard; `scripts/setup-launchd.sh` installs a macOS timer for the cron.

# Working in this repo with a coding agent

Context for Claude Code, Cursor, or similar. Also a decent orientation for a human.

## Shape

The vault is the source of truth. Two backends serve identical routes over it — a
Cloudflare Worker (production, reads/writes via the GitHub API) and an Express server
(local dev, reads/writes the filesystem). The dashboard is a static Next.js export and
runs unchanged against either.

**A change to an API route usually has to land in both backends.** `worker/src/index.ts`
and `api/src/routes/` are separate implementations of the same contract.

## Boundaries

- Never touch `.obsidian/`.
- Never commit `.env`, `.env.local`, or `.dev.vars`.
- When editing a note, change only the frontmatter field you were asked to change and
  preserve the body. These are someone's journal entries.
- Read only the files the task needs. Do not scan the whole vault.
- Ask before a change that would touch more than a handful of files.

## Invariants worth not breaking

- **Null is not zero.** Missing metrics are `null` everywhere and must never be coerced to
  `0` for display. A day on the charger is not a day of zero steps, and a day not logged is
  not a day of zero focus. Range endpoints omit missing days rather than zero-filling.
- **`API_KEY` fails closed.** The Worker returns `503` when it is unset. That is deliberate
  — do not "fix" it by making auth optional again.
- **The key is never baked into the bundle.** The dashboard is a public static export. It
  reads the key from `localStorage` at runtime via `ApiKeyGate`.
- **Timezone is config, not a constant.** Daily files are keyed to a local calendar day.
  Anything deriving "today" reads `TIMEZONE`.
- **The wearable interface is `data/ring/<date>.json` and nothing else.** No BLE code, no
  vendor SDK, no decoders in this repo. See `docs/ring-schema.md`.

## Layout

| | |
|---|---|
| `worker/src/index.ts` | Worker routes + auth middleware |
| `worker/src/github.ts` | Batched GitHub reads/writes |
| `api/src/index.js`, `api/src/routes/` | Express equivalent |
| `dashboard/src/app/page.tsx` | Tabs and layout |
| `dashboard/src/lib/api.ts` | Every client call; the single fetch choke point |
| `dashboard/src/components/` | One component per panel |
| `scripts/daily-cron.js` | Daily file, weekly goals, briefing |
| `obsidian-vault/Templates/` | The schema for every note type |

## Common tasks

- **Add a dashboard panel** — component in `dashboard/src/components/`, fetch function in
  `lib/api.ts`, import in `page.tsx`.
- **Add an API route** — implement in *both* `worker/src/index.ts` and a module under
  `api/src/routes/` (registered in `api/src/index.js`).
- **Add a note type** — template in `Templates/`, then a collection route.

## Costs

The briefing calls a model with web search. That tool re-sends every prior result on each
round, so cost grows with the square of the search count — cap it with `max_uses` and get
hard numbers (prices, dates) from plain APIs instead. Usage is logged per run.

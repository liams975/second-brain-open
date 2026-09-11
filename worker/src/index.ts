import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Env } from "./types";
import { ghGetFile, listVaultMd, vaultPath } from "./github";
import {
  readVaultFile,
  readVaultFiles,
  readVaultFolder,
  patchVaultFile,
  countVaultMd,
  parseFrontmatter,
  parseTasks,
} from "./vault";
import { todayYMD, getWeekId, ymdIn } from "./dates";

const app = new Hono<{ Bindings: Env }>();

// CORS so the static UI (and other agents) can call from any origin.
app.use("*", cors());

// Shared-secret auth, failing closed. This Worker reads and writes a personal
// journal and CORS is open, so an unset API_KEY is treated as a configuration
// error rather than as "no auth wanted" — otherwise the default deployment is
// a world-readable diary and nothing says so.
app.use("*", async (c, next) => {
  if (c.req.method === "OPTIONS") return next();
  const required = c.env.API_KEY;
  if (!required) {
    return c.json(
      { error: "API_KEY is not configured on this Worker. Run: wrangler secret put API_KEY" },
      503
    );
  }
  if (c.req.header("x-api-key") !== required) {
    return c.json({ error: "unauthorized" }, 401);
  }
  return next();
});

app.onError((err, c) => c.json({ error: err.message }, 500));

app.get("/", (c) => c.json({ ok: true, service: "second-brain-api" }));

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DATE_FILE_RE = /^\d{4}-\d{2}-\d{2}\.md$/;

// Most recent n daily docs, newest first. Sorting and slicing the *filenames*
// before fetching means a 14-day request reads 14 files, not the whole folder.
async function recentDailyDocs(env: Env, n: number) {
  const rels = (await listVaultMd(env, "Daily-Progress"))
    .filter((rel) => DATE_FILE_RE.test(rel.split("/").pop() as string))
    .sort((a, b) => (a < b ? 1 : a > b ? -1 : 0))
    .slice(0, n > 0 ? n : 0);
  return readVaultFiles(env, rels);
}

// --- daily progress ---
app.get("/api/daily-progress/today", async (c) => {
  const doc = await readVaultFile(c.env, `Daily-Progress/${todayYMD(c.env.TIMEZONE)}.md`);
  if (!doc) return c.json({ error: "No daily file for today yet" }, 404);
  return c.json(doc);
});

app.get("/api/daily-progress/range/:n", async (c) => {
  const n = parseInt(c.req.param("n"), 10);
  return c.json(await recentDailyDocs(c.env, Number.isFinite(n) ? n : 0));
});

app.get("/api/daily-progress/:date", async (c) => {
  const date = c.req.param("date");
  if (!DATE_RE.test(date)) return c.json({ error: "Invalid date format" }, 400);
  const doc = await readVaultFile(c.env, `Daily-Progress/${date}.md`);
  if (!doc) return c.json({ error: "Daily file not found" }, 404);
  return c.json(doc);
});

app.patch("/api/daily-progress/:date", async (c) => {
  const date = c.req.param("date");
  if (!DATE_RE.test(date)) return c.json({ error: "Invalid date format" }, 400);
  const updates = await c.req.json();
  const updated = await patchVaultFile(c.env, `Daily-Progress/${date}.md`, updates);
  if (!updated) return c.json({ error: "Daily file not found" }, 404);
  return c.json(updated);
});

// --- focus / weekly goals ---
app.get("/api/focus/weekly", async (c) => {
  const weekId = getWeekId(todayYMD(c.env.TIMEZONE));
  const doc = await readVaultFile(c.env, `Focus/${weekId}.md`);
  if (!doc) return c.json({ error: `Weekly file ${weekId} not found` }, 404);
  return c.json({ ...doc, goals: doc.tasks });
});

app.patch("/api/focus/weekly", async (c) => {
  const weekId = getWeekId(todayYMD(c.env.TIMEZONE));
  const updates = await c.req.json();
  const updated = await patchVaultFile(c.env, `Focus/${weekId}.md`, updates);
  if (!updated) return c.json({ error: `Weekly file ${weekId} not found` }, 404);
  return c.json({ ...updated, goals: updated.tasks });
});

// --- projects ---
// Slugs index straight into a vault path, so constrain them the way the daily
// routes constrain their date param — otherwise ".." walks out of the folder.
const SLUG_RE = /^[a-z0-9-]+$/;
const PROJECT_STATUSES = ["active", "planned", "paused", "completed"];

app.get("/api/projects", async (c) => {
  let items = await readVaultFolder(c.env, "Projects");
  const status = c.req.query("status");
  if (status) items = items.filter((d) => d.status === status);
  return c.json(items);
});

// One project with its markdown body, for the dashboard's detail view.
app.get("/api/projects/:slug", async (c) => {
  const slug = c.req.param("slug");
  if (!SLUG_RE.test(slug)) return c.json({ error: "Invalid project slug" }, 400);
  const rel = `Projects/${slug}.md`;
  const file = await ghGetFile(c.env, vaultPath(c.env, rel));
  if (!file) return c.json({ error: `Project ${slug} not found` }, 404);
  const parsed = parseFrontmatter(file.text);
  return c.json({
    ...parsed.data,
    body: parsed.content.trim(),
    tasks: parseTasks(parsed.content),
    _file: `${slug}.md`,
  });
});

// Only the three fields the cards edit are writable. Everything else in the
// frontmatter — and the whole body — stays owned by Obsidian.
app.patch("/api/projects/:slug", async (c) => {
  const slug = c.req.param("slug");
  if (!SLUG_RE.test(slug)) return c.json({ error: "Invalid project slug" }, 400);

  const updates = (await c.req.json()) as {
    summary?: unknown;
    phase?: unknown;
    status?: unknown;
  };
  const patch: Record<string, unknown> = {};
  if (typeof updates.summary === "string") patch.summary = updates.summary;
  if (typeof updates.phase === "string") patch.phase = updates.phase;
  if (typeof updates.status === "string") {
    if (!PROJECT_STATUSES.includes(updates.status)) {
      return c.json({ error: `status must be one of ${PROJECT_STATUSES.join(", ")}` }, 400);
    }
    patch.status = updates.status;
  }
  if (Object.keys(patch).length === 0) {
    return c.json({ error: "No writable fields (expected summary, phase and/or status)" }, 400);
  }

  const rel = `Projects/${slug}.md`;
  const file = await ghGetFile(c.env, vaultPath(c.env, rel));
  if (!file) return c.json({ error: `Project ${slug} not found` }, 404);
  const parsed = parseFrontmatter(file.text);
  const updated = await patchVaultFile(c.env, rel, patch);
  if (!updated) return c.json({ error: `Project ${slug} not found` }, 404);

  return c.json({ ...updated, body: parsed.content.trim() });
});

// --- vault stats ---
const DOMAIN_SUBFOLDERS = [
  "Computer-Science",
  "Economics-Politics",
  "Mathematics",
  "Philosophy",
  "Physics",
  "Chemistry",
  "Psychology",
];
const MEDIA_SUBFOLDERS = ["Films", "Literature", "TV-Series", "Articles"];

app.get("/api/vault-stats", async (c) => {
  const domainCounts = await Promise.all(DOMAIN_SUBFOLDERS.map((s) => countVaultMd(c.env, `Domains/${s}`)));
  const mediaCounts = await Promise.all(MEDIA_SUBFOLDERS.map((s) => countVaultMd(c.env, `Media/${s}`)));
  const [projects, events, people] = await Promise.all([
    countVaultMd(c.env, "Projects"),
    countVaultMd(c.env, "Events"),
    countVaultMd(c.env, "People"),
  ]);
  const domains: Record<string, number> = {};
  DOMAIN_SUBFOLDERS.forEach((s, i) => (domains[s] = domainCounts[i]));
  const media: Record<string, number> = {};
  MEDIA_SUBFOLDERS.forEach((s, i) => (media[s] = mediaCounts[i]));
  const sum = (arr: number[]) => arr.reduce((a, b) => a + b, 0);
  const total = sum(domainCounts) + sum(mediaCounts) + projects + events + people;
  return c.json({ domains, media, projects, events, people, total });
});

// --- monthly focus ---
app.get("/api/monthly-focus", async (c) => {
  const file = await ghGetFile(c.env, vaultPath(c.env, "Focus/monthly-focus.md"));
  if (!file) return c.json({ error: "monthly-focus.md not found" }, 404);
  const parsed = parseFrontmatter(file.text);
  return c.json({ ...parsed.data, body: parsed.content.trim() });
});

// Edit the vision and themes in place, the same way the daily and weekly
// files are edited. Only these two keys are writable — month/year are derived
// from the file the cron maintains, and the body prose is edited in Obsidian.
app.patch("/api/monthly-focus", async (c) => {
  const updates = (await c.req.json()) as { vision?: unknown; themes?: unknown };
  const patch: Record<string, unknown> = {};
  if (typeof updates.vision === "string") patch.vision = updates.vision;
  if (Array.isArray(updates.themes)) {
    patch.themes = updates.themes.map((t) => String(t ?? ""));
  }
  if (Object.keys(patch).length === 0) {
    return c.json({ error: "No writable fields (expected vision and/or themes)" }, 400);
  }

  const rel = "Focus/monthly-focus.md";
  const file = await ghGetFile(c.env, vaultPath(c.env, rel));
  if (!file) return c.json({ error: "monthly-focus.md not found" }, 404);
  const parsed = parseFrontmatter(file.text);
  const updated = await patchVaultFile(c.env, rel, patch);
  if (!updated) return c.json({ error: "monthly-focus.md not found" }, 404);

  // patchVaultFile returns the task-shaped doc; monthly focus is body-shaped.
  const { tasks: _tasks, _file, ...data } = updated;
  return c.json({ ...data, body: parsed.content.trim() });
});

// --- health references ---
app.get("/api/health/references", async (c) => {
  const folder = await readVaultFolder(c.env, "Health");
  // readVaultFolder gives frontmatter + tasks; re-read raw for body text.
  const out = await Promise.all(
    folder.map(async (d) => {
      const file = await ghGetFile(c.env, vaultPath(c.env, `Health/${d._file}`));
      const parsed = parseFrontmatter(file ? file.text : "");
      return {
        filename: d._file.replace(/\.md$/, ""),
        frontmatter: parsed.data,
        body: parsed.content.trim(),
      };
    })
  );
  return c.json(out);
});

// --- briefing (committed by the Actions cron to data/briefing.json) ---
const EMPTY_BRIEFING = { date: null, weather: null, market: null, headlines: null };
app.get("/api/briefing", async (c) => {
  try {
    const file = await ghGetFile(c.env, "data/briefing.json");
    if (!file) return c.json(EMPTY_BRIEFING);
    return c.json(JSON.parse(file.text));
  } catch (err) {
    // A transport/auth failure is not "no briefing committed yet" — keep the
    // shape the UI expects, but say what broke so an outage is not silently empty.
    return c.json({ ...EMPTY_BRIEFING, error: (err as Error).message });
  }
});

// --- ring ---
// Daily rollups from the qring pipeline, committed as data/ring/<date>.json.
// Same shape as the briefing route: a machine-generated blob read straight out
// of the repo, not vault frontmatter.
//
// A day with no rollup is simply absent from the response. Second Brain must
// render a missing day as missing — charging days, forgotten wear and failed
// syncs are all normal, and showing them as zero would quietly corrupt the
// trend lines.

async function ringRollup(env: Env, date: string) {
  const file = await ghGetFile(env, `data/ring/${date}.json`);
  if (!file) return null;
  try {
    return JSON.parse(file.text);
  } catch {
    return null;
  }
}

app.get("/api/ring/range/:n", async (c) => {
  const n = Math.min(parseInt(c.req.param("n"), 10) || 7, 365);

  // Build the date keys locally and fetch only those, rather than listing the
  // directory — the Free plan caps subrequests, and this keeps a 14-day
  // request at 14 reads regardless of how much history has accumulated.
  const keys: string[] = [];
  const now = new Date();
  for (let i = 0; i < n; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    keys.push(ymdIn(c.env.TIMEZONE, d));
  }

  const rollups = await Promise.all(keys.map((k) => ringRollup(c.env, k)));
  return c.json(rollups.filter((r) => r !== null));
});

// Sync is a local-only operation. The ring speaks Bluetooth to the Mac; this
// Worker runs in Cloudflare's network and has no radio and no route to it.
// Answering 501 with an explanation lets the UI show an honest message on a
// phone instead of a generic failure.
app.post("/api/ring/sync", (c) =>
  c.json(
    {
      ok: false,
      error: "Ring sync runs on the Mac — it needs Bluetooth, which this API has no access to.",
    },
    501,
  ),
);

app.get("/api/ring/:date", async (c) => {
  const date = c.req.param("date");
  if (!DATE_RE.test(date)) return c.json({ error: "date must be YYYY-MM-DD" }, 400);
  const rollup = await ringRollup(c.env, date);
  if (!rollup) return c.json({ error: `no ring rollup for ${date}` }, 404);
  return c.json(rollup);
});

export default app;

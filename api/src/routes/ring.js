const express = require('express');
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

// Daily rollups written by the qring pipeline, one JSON file per date. This
// mirrors data/briefing.json: a machine-generated blob committed to the repo
// and served read-only, rather than vault frontmatter a human edits.
//
// The ring platform is a separate system and this is the whole interface to
// it. Second Brain never reads a BLE packet and never imports a decoder, so
// the ring's internals can be rewritten without touching anything here.
const RING_DIR = path.resolve(__dirname, '../../../data/ring');
// IANA zone the rollup filenames are keyed in; must match the ring pipeline.
const TIMEZONE = process.env.TIMEZONE || 'UTC';
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const router = express.Router();

function readRollup(date) {
  const file = path.join(RING_DIR, `${date}.json`);
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    return null;
  }
}

// GET /api/ring/range/:n — the last n days, newest first.
// Days with no rollup are omitted rather than faked. A missing day is missing:
// the ring was charging, or was not worn, and the UI must be able to tell that
// apart from a day of genuinely zero activity.
router.get('/range/:n', (req, res) => {
  const n = Math.min(parseInt(req.params.n, 10) || 7, 365);
  if (!fs.existsSync(RING_DIR)) return res.json([]);

  const out = [];
  const today = new Date();
  for (let i = 0; i < n; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    // en-CA gives YYYY-MM-DD directly, matching the date keys used everywhere
    // else in this repo.
    const key = new Intl.DateTimeFormat('en-CA', { timeZone: TIMEZONE }).format(d);
    const rollup = readRollup(key);
    if (rollup) out.push(rollup);
  }
  res.json(out);
});

// GET /api/ring/:date — one day, 404 when there is no rollup for it.
router.get('/:date', (req, res) => {
  const { date } = req.params;
  if (!DATE_RE.test(date)) return res.status(400).json({ error: 'date must be YYYY-MM-DD' });
  const rollup = readRollup(date);
  if (!rollup) return res.status(404).json({ error: `no ring rollup for ${date}` });
  res.json(rollup);
});

// POST /api/ring/sync — pull from the ring on demand.
//
// Only this server can do it. The ring speaks Bluetooth and this machine is
// the only host with a radio; the production Worker runs on Cloudflare and
// physically cannot reach it. The Worker answers 501 on this path so the UI
// can say so plainly rather than appearing broken on a phone.
//
// Two deliberate safety properties:
//   - loopback only. This handler starts a process, and the server listens on
//     all interfaces, so without this check anyone on the same network could
//     trigger it.
//   - execFile with a fixed script path and no arguments. Nothing from the
//     request reaches the shell, so there is no injection surface.
// Path to your ring pipeline's sync script. Unset means there is no local
// ingester wired up, and the endpoint reports that instead of failing oddly.
const SYNC_SCRIPT = process.env.RING_SYNC_SCRIPT || '';
const SYNC_TIMEOUT_MS = 180000;

function isLoopback(req) {
  const addr = req.socket.remoteAddress || '';
  return addr === '127.0.0.1' || addr === '::1' || addr === '::ffff:127.0.0.1';
}

let syncInFlight = false;

router.post('/sync', (req, res) => {
  if (!isLoopback(req)) {
    return res.status(403).json({ error: 'ring sync can only be triggered from this machine' });
  }
  if (!SYNC_SCRIPT) {
    return res.status(501).json({
      error: 'No ring ingester configured. Set RING_SYNC_SCRIPT to a script that writes data/ring/<date>.json.',
    });
  }
  // The launchd agent runs the same script on a timer and takes an mkdir lock;
  // this guard just avoids queueing duplicate work from double-clicks.
  if (syncInFlight) {
    return res.status(409).json({ error: 'a sync is already running' });
  }

  syncInFlight = true;
  execFile('/bin/bash', [SYNC_SCRIPT], { timeout: SYNC_TIMEOUT_MS }, (err, stdout, stderr) => {
    syncInFlight = false;
    const output = `${stdout || ''}${stderr || ''}`.trim();
    const tail = output.split('\n').slice(-6).join('\n');

    if (err) {
      return res.status(500).json({ ok: false, error: err.message, output: tail });
    }
    // The script exits 0 when the ring is simply out of range — a normal
    // outcome, not a failure — so report which happened instead of implying
    // fresh data always arrived.
    const reached = !/not reachable/.test(output);
    res.json({
      ok: true,
      reached,
      changed: /pushed/.test(output),
      message: reached
        ? 'Synced from the ring.'
        : 'Ring not in range — move it near the Mac and try again.',
      output: tail,
    });
  });
});

module.exports = router;

const express = require('express');
const path = require('path');
const { readFolder, readFile, patchFile } = require('../parsers/frontmatter');

const router = express.Router();

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DATE_FILE_RE = /^\d{4}-\d{2}-\d{2}\.md$/;

function getToday() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function dailyDir() {
  return path.join(process.env.VAULT_PATH, 'Daily-Progress');
}

// Order matters: /today and /range/:n before /:date
router.get('/today', (req, res) => {
  const filePath = path.join(dailyDir(), `${getToday()}.md`);
  const doc = readFile(filePath);
  if (!doc) return res.status(404).json({ error: 'No daily file for today yet' });
  res.json(doc);
});

router.get('/range/:n', (req, res) => {
  const n = parseInt(req.params.n, 10);
  const files = readFolder(dailyDir())
    .filter((d) => DATE_FILE_RE.test(d._file))
    .sort((a, b) => (a._file < b._file ? 1 : a._file > b._file ? -1 : 0))
    .slice(0, n);
  res.json(files);
});

router.get('/:date', (req, res) => {
  const { date } = req.params;
  if (!DATE_RE.test(date)) return res.status(400).json({ error: 'Invalid date format, expected YYYY-MM-DD' });
  const filePath = path.join(dailyDir(), `${date}.md`);
  const doc = readFile(filePath);
  if (!doc) return res.status(404).json({ error: 'Daily file not found' });
  res.json(doc);
});

router.patch('/:date', (req, res) => {
  const { date } = req.params;
  if (!DATE_RE.test(date)) return res.status(400).json({ error: 'Invalid date format, expected YYYY-MM-DD' });
  const filePath = path.join(dailyDir(), `${date}.md`);
  if (!readFile(filePath)) return res.status(404).json({ error: 'Daily file not found' });
  const updated = patchFile(filePath, req.body);
  res.json(updated);
});

module.exports = router;

const express = require('express');
const path = require('path');
const { readFile, patchFile } = require('../parsers/frontmatter');

const router = express.Router();

function getWeekId(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

function focusDir() {
  return path.join(process.env.VAULT_PATH, 'Focus');
}

router.get('/priorities', (req, res) => {
  const doc = readFile(path.join(focusDir(), 'priorities.md'));
  if (!doc) return res.status(404).json({ error: 'priorities.md not found' });
  res.json(doc);
});

router.get('/weekly', (req, res) => {
  const weekId = getWeekId(new Date());
  const doc = readFile(path.join(focusDir(), `${weekId}.md`));
  if (!doc) return res.status(404).json({ error: `Weekly file ${weekId} not found` });
  // Goals live as body checkboxes (parsed into `tasks`); expose them as `goals`.
  res.json({ ...doc, goals: doc.tasks });
});

router.patch('/weekly', (req, res) => {
  const weekId = getWeekId(new Date());
  const filePath = path.join(focusDir(), `${weekId}.md`);
  if (!readFile(filePath)) return res.status(404).json({ error: `Weekly file ${weekId} not found` });
  const updated = patchFile(filePath, req.body);
  res.json(updated);
});

module.exports = router;

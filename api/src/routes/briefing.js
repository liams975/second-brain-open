const express = require('express');
const fs = require('fs');
const path = require('path');
const matter = require('gray-matter');

const CACHE_FILE = path.resolve(__dirname, '../../../data/briefing.json');
const EMPTY_BRIEFING = { date: null, weather: null, market: null, headlines: null };

// GET /api/briefing — return the cached daily briefing, or empty defaults.
const briefing = express.Router();
briefing.get('/', (req, res) => {
  try {
    if (!fs.existsSync(CACHE_FILE)) return res.json(EMPTY_BRIEFING);
    const data = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
    res.json(data);
  } catch (e) {
    res.json(EMPTY_BRIEFING);
  }
});

// GET /api/monthly-focus — frontmatter (month, year, vision, themes) + body.
const monthlyFocus = express.Router();
monthlyFocus.get('/', (req, res) => {
  const filePath = path.join(process.env.VAULT_PATH, 'Focus', 'monthly-focus.md');
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'monthly-focus.md not found' });
  }
  const parsed = matter.read(filePath);
  res.json({ ...parsed.data, body: (parsed.content || '').trim() });
});

module.exports = { briefing, monthlyFocus };

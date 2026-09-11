const express = require('express');
const fs = require('fs');
const path = require('path');
const { readFolder } = require('../parsers/frontmatter');

const router = express.Router();

const DATE_FILE_RE = /^\d{4}-\d{2}-\d{2}\.md$/;
const CACHE_FILE = path.resolve(__dirname, '../../insights-cache.json');

function getToday() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

router.get('/', async (req, res) => {
  const today = getToday();

  try {
    // serve from cache if it's today's
    if (fs.existsSync(CACHE_FILE)) {
      const cache = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
      if (cache.date === today) {
        return res.json({ insight: cache.insight, cached: true });
      }
    }

    const dailyDir = path.join(process.env.VAULT_PATH, 'Daily-Progress');
    const files = readFolder(dailyDir)
      .filter((d) => DATE_FILE_RE.test(d._file))
      .sort((a, b) => (a._file < b._file ? 1 : a._file > b._file ? -1 : 0))
      .slice(0, 14);

    if (files.length < 3) {
      return res.json({ insight: 'Keep logging for a few more days to unlock pattern insights.' });
    }

    const summary = files
      .map((d) => {
        const focus = d.focus_score != null ? d.focus_score : 0;
        const trueHabits = Object.entries(d.habits || {})
          .filter(([, v]) => v === true)
          .map(([k]) => k);
        const tasks = Array.isArray(d.tasks) ? d.tasks : [];
        const done = tasks.filter((t) => t.done).length;
        return `${d.date || d._file.replace(/\.md$/, '')}: focus=${focus}/10, habits=[${trueHabits.join(',')}], tasks=${done}/${tasks.length} done`;
      })
      .join('\n');

    const message =
      `Here is 2 weeks of productivity data:\n\n${summary}\n\n` +
      'Write 2-3 sentences of specific, encouraging observations about patterns. ' +
      'Reference concrete data points. Be direct and avoid generic advice.';

    const apiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 200,
        messages: [{ role: 'user', content: message }],
      }),
    });

    const data = await apiRes.json();
    const insight = data.content[0].text;

    fs.writeFileSync(CACHE_FILE, JSON.stringify({ date: today, insight }));
    res.json({ insight, cached: false });
  } catch (err) {
    res.json({ insight: 'Insight unavailable today.', error: err.message });
  }
});

module.exports = router;

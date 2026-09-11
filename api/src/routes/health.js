const express = require('express');
const fs = require('fs');
const path = require('path');
const matter = require('gray-matter');

const router = express.Router();

// GET /api/health/references — all reference files in the Health/ folder.
router.get('/references', (req, res) => {
  const dir = path.join(process.env.VAULT_PATH, 'Health');
  if (!fs.existsSync(dir)) return res.json([]);
  const out = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.md'))
    .map((f) => {
      const parsed = matter.read(path.join(dir, f));
      return {
        filename: f.replace(/\.md$/, ''),
        frontmatter: parsed.data || {},
        body: (parsed.content || '').trim(),
      };
    });
  res.json(out);
});

module.exports = router;

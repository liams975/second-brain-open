const express = require('express');
const fs = require('fs');
const path = require('path');

const router = express.Router();

const DOMAIN_SUBFOLDERS = [
  'Computer-Science',
  'Economics-Politics',
  'Mathematics',
  'Philosophy',
  'Physics',
  'Chemistry',
  'Psychology',
];
const MEDIA_SUBFOLDERS = ['Films', 'Literature', 'TV-Series', 'Articles'];

// Count .md files in a directory; missing/unreadable dirs count as 0.
function countMd(dir) {
  if (!fs.existsSync(dir)) return 0;
  try {
    return fs.readdirSync(dir).filter((f) => f.endsWith('.md')).length;
  } catch (e) {
    return 0;
  }
}

router.get('/', (req, res) => {
  const VAULT = process.env.VAULT_PATH;

  const domains = {};
  for (const sub of DOMAIN_SUBFOLDERS) {
    domains[sub] = countMd(path.join(VAULT, 'Domains', sub));
  }

  const media = {};
  for (const sub of MEDIA_SUBFOLDERS) {
    media[sub] = countMd(path.join(VAULT, 'Media', sub));
  }

  const projects = countMd(path.join(VAULT, 'Projects'));
  const events = countMd(path.join(VAULT, 'Events'));
  const people = countMd(path.join(VAULT, 'People'));

  const sum = (obj) => Object.values(obj).reduce((a, b) => a + b, 0);
  const total = sum(domains) + sum(media) + projects + events + people;

  res.json({ domains, media, projects, events, people, total });
});

module.exports = router;

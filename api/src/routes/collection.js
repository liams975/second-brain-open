const express = require('express');
const path = require('path');
const { readFolder, patchFile } = require('../parsers/frontmatter');

// Factory for the shared collection-route pattern used by
// projects.js, events.js and people.js.
// `subfolder` is resolved against VAULT_PATH at call time so the
// env is populated by the time requests run.
function createCollectionRouter(subfolder) {
  const router = express.Router();

  const dir = () => path.join(process.env.VAULT_PATH, subfolder);

  const findByTitle = (title) =>
    readFolder(dir()).find(
      (d) => (d.title || '').toLowerCase() === String(title).toLowerCase()
    );

  router.get('/', (req, res) => {
    let items = readFolder(dir());
    if (req.query.status) {
      items = items.filter((d) => d.status === req.query.status);
    }
    res.json(items);
  });

  router.get('/:title', (req, res) => {
    const doc = findByTitle(req.params.title);
    if (!doc) return res.status(404).json({ error: 'Not found' });
    res.json(doc);
  });

  router.patch('/:title', (req, res) => {
    const doc = findByTitle(req.params.title);
    if (!doc) return res.status(404).json({ error: 'Not found' });
    res.json(patchFile(doc._path, req.body));
  });

  return router;
}

module.exports = createCollectionRouter;

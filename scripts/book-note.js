const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.resolve(__dirname, '../api/.env') });

const VALID_STATUS = ['reading', 'completed', 'want-to-read'];

// --- parse args ---
const argv = process.argv.slice(2);
const positional = [];
let status = 'completed';
let rating = null;

for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--status') status = argv[++i];
  else if (a.startsWith('--status=')) status = a.slice('--status='.length);
  else if (a === '--rating') rating = parseInt(argv[++i], 10);
  else if (a.startsWith('--rating=')) rating = parseInt(a.slice('--rating='.length), 10);
  else positional.push(a);
}

const [title, author] = positional;

if (!title || !author) {
  console.error('Usage: node book-note.js "Book Title" "Author Name" [--status reading|completed|want-to-read] [--rating 1-10]');
  process.exit(1);
}
if (!VALID_STATUS.includes(status)) {
  console.error(`Invalid --status "${status}". Use one of: ${VALID_STATUS.join(', ')}`);
  process.exit(1);
}
if (rating != null && (Number.isNaN(rating) || rating < 1 || rating > 10)) {
  console.error('Invalid --rating. Use an integer 1-10.');
  process.exit(1);
}

// --- paths ---
const VAULT = process.env.VAULT_PATH;
const pad = (n) => String(n).padStart(2, '0');
const now = new Date();
const TODAY = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

// Sanitize only the filename; the frontmatter keeps the original title.
const safeTitle = title.replace(/[\\/:*?"<>|]/g, '-').trim();
const relPath = `Media/Literature/${safeTitle}.md`;
const filePath = path.join(VAULT, 'Media', 'Literature', `${safeTitle}.md`);

// --- guard: never overwrite an existing note ---
if (fs.existsSync(filePath)) {
  console.error(`Error: note already exists at ${relPath} — not overwriting.`);
  process.exit(1);
}

const PROMPT =
  `You are a well-read book analyst. Generate a structured summary of the book ` +
  `'${title}' by ${author}. Respond with ONLY a JSON object containing:\n` +
  `- summary: 3-4 sentence overview of the book's core thesis\n` +
  `- key_ideas: array of 5-7 key ideas, each as a string (one sentence per idea, specific and substantive)\n` +
  `- takeaways: array of 3-5 actionable takeaways or lessons\n` +
  `- themes: array of 3-5 one-word or short-phrase themes/tags\n` +
  `- connections: array of 2-3 related books or thinkers\n` +
  `No markdown fences, no preamble.`;

async function generate() {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      messages: [{ role: 'user', content: PROMPT }],
    }),
  });
  const response = await res.json();
  let text = response.content[0].text.trim();
  if (text.startsWith('```')) {
    text = text.replace(/^```[a-zA-Z]*\s*/, '').replace(/\s*```$/, '').trim();
  }
  return JSON.parse(text);
}

function yamlString(s) {
  // double-quoted YAML scalar with escaping
  return JSON.stringify(String(s));
}

function buildFile(data) {
  const themes = Array.isArray(data.themes) ? data.themes : [];
  const keyIdeas = Array.isArray(data.key_ideas) ? data.key_ideas : [];
  const takeaways = Array.isArray(data.takeaways) ? data.takeaways : [];
  const connections = Array.isArray(data.connections) ? data.connections : [];
  const summary = typeof data.summary === 'string' ? data.summary : '';
  const dateFinished = status === 'completed' ? TODAY : '';

  const fm = [
    '---',
    `title: ${yamlString(title)}`,
    `type: "book"`,
    `status: ${yamlString(status)}`,
    `rating: ${rating != null ? rating : 'null'}`,
    `author: ${yamlString(author)}`,
    `cover: ""`,
    `date_started: ""`,
    `date_finished: ${yamlString(dateFinished)}`,
    `tags: [${themes.map(yamlString).join(', ')}]`,
    '---',
  ].join('\n');

  const list = (arr) => (arr.length ? arr.map((x) => `- ${x}`).join('\n') : '');

  const body = [
    '',
    '## Summary',
    summary,
    '',
    '## Key ideas',
    list(keyIdeas),
    '',
    '## Takeaways',
    list(takeaways),
    '',
    '## Connections',
    list(connections),
    '',
    '## Notes',
    '',
  ].join('\n');

  return `${fm}\n${body}`;
}

async function main() {
  let data;
  try {
    data = await generate();
  } catch (error) {
    console.warn(`Warning: Claude API failed (${error.message}). Creating note with empty sections.`);
    data = {};
  }

  fs.writeFileSync(filePath, buildFile(data));
  console.log(`Created: ${relPath}`);
}

main();

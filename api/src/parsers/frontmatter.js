const fs = require('fs');
const path = require('path');
const matter = require('gray-matter');
const _ = require('lodash');

// Extract markdown-checkbox tasks from a body string into { text, done }.
// Text may be empty (blank slot) — goals/tasks are fixed-count and start blank.
function parseTasks(content) {
  const taskRegex = /^- \[([ x])\] ?(.*)$/gm;
  const tasks = [];
  let match;
  while ((match = taskRegex.exec(content)) !== null) {
    tasks.push({ text: match[2].trim(), done: match[1] === 'x' });
  }
  return tasks;
}

// Serialize frontmatter + body, always writing the date as a quoted string.
// An unquoted `date: 2026-06-08` in the source parses to a Date object; coerce
// it back to YYYY-MM-DD and force quotes so it never drifts again (e.g. after
// Obsidian rewrites the file).
function stringify(body, data) {
  if (data.date instanceof Date) {
    data.date = data.date.toISOString().slice(0, 10);
  }
  return matter
    .stringify(body, data)
    .replace(/^date:\s*(["']?)(\d{4}-\d{2}-\d{2})\1\s*$/m, "date: '$2'");
}

// Toggle the checkbox of the Nth task (0-based, counting only checkbox lines).
function setTaskChecked(body, index, done) {
  const lines = body.split('\n');
  let count = -1;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^- \[([ x])\] ?(.*)$/);
    if (m) {
      count++;
      if (count === index) {
        lines[i] = `- [${done ? 'x' : ' '}] ${m[2]}`;
        break;
      }
    }
  }
  return lines.join('\n');
}

// Set the text of the Nth checkbox (0-based), preserving its done state.
function setTaskText(body, index, text) {
  const lines = body.split('\n');
  let count = -1;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^- \[([ x])\] ?(.*)$/);
    if (m) {
      count++;
      if (count === index) {
        lines[i] = `- [${m[1]}] ${text}`;
        break;
      }
    }
  }
  return lines.join('\n');
}

function readFolder(folderPath) {
  if (!fs.existsSync(folderPath)) return [];
  return fs
    .readdirSync(folderPath)
    .filter((f) => f.endsWith('.md'))
    .map((f) => {
      const filePath = path.join(folderPath, f);
      const parsed = matter.read(filePath);
      return { ...parsed.data, tasks: parseTasks(parsed.content), _file: f, _path: filePath };
    })
    .sort((a, b) => (a._file < b._file ? -1 : a._file > b._file ? 1 : 0));
}

function readFile(filePath) {
  if (!fs.existsSync(filePath)) return null;
  const parsed = matter.read(filePath);
  return {
    ...parsed.data,
    tasks: parseTasks(parsed.content),
    _file: path.basename(filePath),
    _path: filePath,
  };
}

function patchFile(filePath, updates) {
  const parsed = matter.read(filePath);
  const data = parsed.data;
  let body = parsed.content;

  for (const [key, value] of Object.entries(updates)) {
    // CASE A — body checkbox edits: "tasks.2.done", "goals.0.text", etc.
    const m = key.match(/^(?:tasks|goals)\.(\d+)\.(done|text)$/);
    if (m) {
      const index = parseInt(m[1], 10);
      if (m[2] === 'done') {
        body = setTaskChecked(body, index, value === true);
      } else {
        body = setTaskText(body, index, String(value ?? ''));
      }
    } else {
      // CASE B — frontmatter field (flat habit keys, focus_score, etc.)
      _.set(data, key, value);
    }
  }

  // Always preserve the body when writing back, with the date kept quoted.
  fs.writeFileSync(filePath, stringify(body, data));
  return readFile(filePath);
}

module.exports = { readFolder, readFile, patchFile };

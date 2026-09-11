import yaml from "js-yaml";
import type { Env } from "./types";
import { ghGetFile, ghGetFilesBatch, ghPutFile, listVaultMd, vaultPath } from "./github";

export interface Task {
  text: string;
  done: boolean;
}
export type VaultDoc = Record<string, unknown> & { tasks: Task[]; _file: string };

// --- frontmatter (js-yaml, no gray-matter/Buffer) ---
function parseFrontmatter(text: string): { data: Record<string, unknown>; content: string } {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) return { data: {}, content: text };
  const data = (yaml.load(m[1]) as Record<string, unknown>) || {};
  return { data, content: m[2] };
}

function stringifyFrontmatter(data: Record<string, unknown>, content: string): string {
  if (data.date instanceof Date) data.date = (data.date as Date).toISOString().slice(0, 10);
  const y = yaml.dump(data, { lineWidth: -1 }).replace(/\n$/, "");
  const out = `---\n${y}\n---\n${content}`;
  // Keep the date quoted so YAML never re-parses it as a Date.
  return out.replace(/^date:\s*(["']?)(\d{4}-\d{2}-\d{2})\1\s*$/m, "date: '$2'");
}

// --- checkbox tasks (text may be blank) ---
export function parseTasks(content: string): Task[] {
  const re = /^- \[([ x])\] ?(.*)$/gm;
  const tasks: Task[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) tasks.push({ text: m[2].trim(), done: m[1] === "x" });
  return tasks;
}

function setTaskChecked(body: string, index: number, done: boolean): string {
  const lines = body.split("\n");
  let count = -1;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^- \[([ x])\] ?(.*)$/);
    if (m) {
      count++;
      if (count === index) {
        lines[i] = `- [${done ? "x" : " "}] ${m[2]}`;
        break;
      }
    }
  }
  return lines.join("\n");
}

function setTaskText(body: string, index: number, text: string): string {
  const lines = body.split("\n");
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
  return lines.join("\n");
}

export async function readVaultFile(env: Env, rel: string): Promise<VaultDoc | null> {
  const file = await ghGetFile(env, vaultPath(env, rel));
  if (!file) return null;
  const parsed = parseFrontmatter(file.text);
  return { ...parsed.data, tasks: parseTasks(parsed.content), _file: rel.split("/").pop() as string };
}

// Read a specific set of vault files in one batched request, preserving the
// caller's ordering. Prefer this over mapping readVaultFile over a list: that
// costs one subrequest per file and hits the Workers per-invocation cap.
export async function readVaultFiles(env: Env, rels: string[]): Promise<VaultDoc[]> {
  const paths = rels.map((rel) => vaultPath(env, rel));
  const texts = await ghGetFilesBatch(env, paths);
  const docs: VaultDoc[] = [];
  rels.forEach((rel, i) => {
    const text = texts.get(paths[i]);
    if (text === undefined) return;
    const parsed = parseFrontmatter(text);
    docs.push({
      ...parsed.data,
      tasks: parseTasks(parsed.content),
      _file: rel.split("/").pop() as string,
    });
  });
  return docs;
}

export async function readVaultFolder(env: Env, subfolder: string): Promise<VaultDoc[]> {
  const rels = await listVaultMd(env, subfolder);
  const docs = await readVaultFiles(env, rels);
  return docs.sort((a, b) => (a._file < b._file ? -1 : a._file > b._file ? 1 : 0));
}

export async function patchVaultFile(
  env: Env,
  rel: string,
  updates: Record<string, unknown>
): Promise<VaultDoc | null> {
  const file = await ghGetFile(env, vaultPath(env, rel));
  if (!file) return null;
  const parsed = parseFrontmatter(file.text);
  const data = parsed.data;
  let body = parsed.content;

  for (const [key, value] of Object.entries(updates)) {
    const m = key.match(/^(?:tasks|goals)\.(\d+)\.(done|text)$/);
    if (m) {
      const index = parseInt(m[1], 10);
      if (m[2] === "done") body = setTaskChecked(body, index, value === true);
      else body = setTaskText(body, index, String(value ?? ""));
    } else {
      data[key] = value;
    }
  }

  await ghPutFile(env, vaultPath(env, rel), stringifyFrontmatter(data, body), `Update ${rel}`, file.sha);
  return { ...data, tasks: parseTasks(body), _file: rel.split("/").pop() as string };
}

export async function countVaultMd(env: Env, subfolder: string): Promise<number> {
  return (await listVaultMd(env, subfolder)).length;
}

export { parseFrontmatter };

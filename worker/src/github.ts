import type { Env } from "./types";

const API = "https://api.github.com";

// GitHub requires a User-Agent; the Workers runtime does not add one.
function ghHeaders(env: Env): Record<string, string> {
  return {
    Authorization: `Bearer ${env.GITHUB_TOKEN}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "second-brain-worker",
  };
}

function encodePath(p: string): string {
  return p
    .split("/")
    .map((s) => encodeURIComponent(s))
    .join("/");
}

export function vaultPath(env: Env, rel: string): string {
  return `${env.VAULT_DIR}/${rel}`.replace(/\/+/g, "/");
}

// --- base64 helpers (Web APIs; no Node Buffer) ---
function decodeBase64(b64: string): string {
  const binary = atob(b64.replace(/\n/g, ""));
  const bytes = Uint8Array.from(binary, (ch) => ch.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function encodeBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

export interface GhFile {
  text: string;
  sha: string;
}

export async function ghGetFile(env: Env, repoPath: string): Promise<GhFile | null> {
  const res = await fetch(
    `${API}/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/contents/${encodePath(repoPath)}?ref=${encodeURIComponent(env.GITHUB_BRANCH)}`,
    { headers: ghHeaders(env) }
  );
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`ghGetFile ${repoPath}: ${res.status} ${await res.text()}`);
  const json = (await res.json()) as { content: string; sha: string };
  return { text: decodeBase64(json.content), sha: json.sha };
}

// Fetch many file texts in a single subrequest via GraphQL.
//
// The REST contents API costs one subrequest per file, and a Worker invocation
// is capped at 50 (Free plan) — reading a folder like Daily-Progress (78 files
// and growing) blows that limit outright. One GraphQL query aliases each path
// as its own field, so a whole folder costs one request instead of N.
export async function ghGetFilesBatch(
  env: Env,
  repoPaths: string[]
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (repoPaths.length === 0) return out;

  // Chunked so a very large folder can't produce an unbounded query document.
  const CHUNK = 100;
  for (let i = 0; i < repoPaths.length; i += CHUNK) {
    const chunk = repoPaths.slice(i, i + CHUNK);
    const fields = chunk
      .map(
        (p, j) =>
          `f${j}: object(expression: ${JSON.stringify(`${env.GITHUB_BRANCH}:${p}`)}) { ... on Blob { text } }`
      )
      .join("\n");
    const query =
      `query { repository(owner: ${JSON.stringify(env.GITHUB_OWNER)}, ` +
      `name: ${JSON.stringify(env.GITHUB_REPO)}) { ${fields} } }`;

    const res = await fetch(`${API}/graphql`, {
      method: "POST",
      headers: { ...ghHeaders(env), "Content-Type": "application/json" },
      body: JSON.stringify({ query }),
    });
    if (!res.ok) throw new Error(`ghGetFilesBatch: ${res.status} ${await res.text()}`);
    const json = (await res.json()) as {
      data?: { repository?: Record<string, { text?: string } | null> | null };
      errors?: Array<{ message: string }>;
    };
    if (json.errors && json.errors.length > 0) {
      throw new Error(`ghGetFilesBatch: ${json.errors[0].message}`);
    }
    const repo = json.data?.repository ?? {};
    chunk.forEach((p, j) => {
      const node = repo[`f${j}`];
      // Missing paths simply stay absent from the map, matching ghGetFile's null.
      if (node && typeof node.text === "string") out.set(p, node.text);
    });
  }
  return out;
}

export async function ghPutFile(
  env: Env,
  repoPath: string,
  text: string,
  message: string,
  sha?: string
): Promise<void> {
  const body: Record<string, unknown> = {
    message,
    content: encodeBase64(text),
    branch: env.GITHUB_BRANCH,
  };
  if (sha) body.sha = sha;
  const res = await fetch(
    `${API}/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/contents/${encodePath(repoPath)}`,
    { method: "PUT", headers: { ...ghHeaders(env), "Content-Type": "application/json" }, body: JSON.stringify(body) }
  );
  if (!res.ok) throw new Error(`ghPutFile ${repoPath}: ${res.status} ${await res.text()}`);
}

export interface DirEntry {
  name: string;
  type: "file" | "dir";
}

export async function ghListDir(env: Env, repoPath: string): Promise<DirEntry[]> {
  const res = await fetch(
    `${API}/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/contents/${encodePath(repoPath)}?ref=${encodeURIComponent(env.GITHUB_BRANCH)}`,
    { headers: ghHeaders(env) }
  );
  if (res.status === 404) return [];
  if (!res.ok) throw new Error(`ghListDir ${repoPath}: ${res.status} ${await res.text()}`);
  const json = await res.json();
  if (!Array.isArray(json)) return [];
  return (json as Array<{ name: string; type: "file" | "dir" }>).map((e) => ({ name: e.name, type: e.type }));
}

export async function listVaultMd(env: Env, subfolder: string): Promise<string[]> {
  const entries = await ghListDir(env, vaultPath(env, subfolder));
  return entries
    .filter((e) => e.type === "file" && e.name.endsWith(".md"))
    .map((e) => `${subfolder}/${e.name}`);
}

// The API base URL: local dev → Express (http://localhost:3001); production →
// the Cloudflare Worker URL, baked in at build time via NEXT_PUBLIC_API_URL.
const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";

// Optional shared key sent as x-api-key when the Worker has API_KEY set. Read
// from localStorage first (set in the browser, not baked into the static JS),
// falling back to a build-time value.
const BUILD_API_KEY = process.env.NEXT_PUBLIC_API_KEY || "";
function apiKey(): string {
  if (typeof window !== "undefined") {
    const stored = window.localStorage.getItem("sb_api_key");
    if (stored) return stored;
  }
  return BUILD_API_KEY;
}
// The key lives only in this browser, so anything that clears site data (an OS
// or browser update, Safari's storage purge) silently logs the dashboard out.
// ApiKeyGate calls this to put it back without a devtools session.
export function setApiKey(key: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem("sb_api_key", key.trim());
}

export const UNAUTHORIZED_EVENT = "sb:unauthorized";

function authHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const key = apiKey();
  return key ? { ...extra, "x-api-key": key } : extra;
}

async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const base: Record<string, string> = init?.body ? { "Content-Type": "application/json" } : {};
  const res = await fetch(`${API_BASE}${path}`, { ...init, headers: authHeaders(base) });
  // Every endpoint funnels through here, so one listener covers the whole app.
  // The response is returned untouched — callers still throw their own errors.
  if (res.status === 401 && typeof window !== "undefined") {
    window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
  }
  return res;
}

export type Mood = "" | "great" | "good" | "neutral" | "low" | "rough";

export interface DailyProgress {
  date: string;
  day_of_week: string;
  week: string;
  focus_score: number | null;
  energy: number | null;
  mood: Mood;
  deep_work_hours: number | null;
  weekly_goals_progress: string;
  // habits (current 8-key schema)
  habit_sleep_8h: boolean;
  habit_nutrition: boolean;
  habit_difficult_task: boolean;
  habit_creative_task: boolean;
  habit_reading: boolean;
  habit_exercise: boolean;
  habit_social_media: boolean;
  habit_stretching: boolean;
  // sleep + nutrition logging
  sleep_bedtime: string;
  sleep_wake: string;
  sleep_quality: number | null;
  sleep_factors: string[];
  supplements_taken: boolean;
  calories: number | null;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
  fiber: number | null;
  water: number | null;
  sugar: number | null;
  // routine check-offs
  routine_am_no_phone: boolean;
  routine_am_sunlight: boolean;
  routine_am_breakfast: boolean;
  routine_pm_no_phone: boolean;
  routine_pm_screens_off: boolean;
  routine_pm_prepare: boolean;
  tasks: Array<{ text: string; done: boolean }>;
  reflection: string;
  _file: string;
}

export interface WeeklyGoals {
  week: string;
  start_date: string;
  end_date: string;
  goals: Array<{ text: string; done: boolean }>;
  priorities_snapshot: string;
}

export interface VaultStats {
  domains: Record<string, number>;
  media: Record<string, number>;
  projects: number;
  events: number;
  people: number;
  total: number;
}

export interface Project {
  title: string;
  status: string;
  summary?: string;
  phase?: string;
  tags?: string[];
  _file: string;
}

// A single project plus its rendered-markdown body, from /api/projects/:slug.
export interface ProjectDetail extends Project {
  body: string;
}

// The three frontmatter fields the dashboard is allowed to write.
export interface ProjectUpdates {
  summary?: string;
  phase?: string;
  status?: string;
}

export interface BriefingHour {
  time: string;
  temperature: number | null;
  conditions: string;
  precip_chance: number | null;
}

export interface BriefingDay {
  date: string;
  high: number | null;
  low: number | null;
  conditions: string;
  precipitation_mm: number | null;
}

export interface BriefingWeather {
  temperature: number;
  feels_like: number;
  high: number;
  low: number;
  conditions: string;
  precipitation_mm: number;
  humidity: number;
  wind_kph: number;
  forecast_hourly?: BriefingHour[];
  forecast_daily?: BriefingDay[];
}

export interface BriefingIndex {
  name: string;
  value: number | null;
  change_pct: number | null;
  direction: string;
}

export interface BriefingMarket {
  session_date?: string;
  indices?: BriefingIndex[];
  notable: string;
  // Pre-August-2026 shape, still present in already-committed briefing files.
  sp500?: { value: number; change_pct: number; direction: string };
  nasdaq?: { value: number; change_pct: number; direction: string };
}

export interface BriefingHeadline {
  title: string;
  source: string;
  url: string;
  image?: string | null;
}

export interface Briefing {
  date: string | null;
  generated_at: string;
  weather: BriefingWeather | null;
  market: BriefingMarket | null;
  headlines: BriefingHeadline[] | null;
  error?: string | null;
}

export interface MonthlyFocus {
  month: string;
  year: number;
  vision: string;
  themes: string[];
  body: string;
}

export interface HealthReference {
  filename: string;
  frontmatter: Record<string, unknown>;
  body: string;
}

// --- ring ---
// The versioned daily rollup produced by the qring pipeline. This is the whole
// interface to the ring platform: no packets, no decoders, no coupling to how
// any of it is measured.
//
// Every metric is `number | null`, and null genuinely means unknown — a day on
// the charger, not a day of zero. Nothing here may be coerced to 0 for display
// or a charging day starts counting against trends and habit history.
export interface RingSleep {
  totalMin: number | null;
  awakeMin: number | null;
  lightMin: number | null;
  // Named "estimate" deliberately. The ring is not an EEG and the stage split
  // must never be presented as clinical sleep staging.
  deepMinEstimate: number | null;
  // null means this firmware exposes no REM stage at all, which is a different
  // claim from a night with zero REM.
  remMin: number | null;
  start: string | null;
  end: string | null;
  // Sleep belongs to the date you woke up, matching how the Health tab's
  // "Last night's sleep" card already works.
  attributedTo: "wakeDate";
  userEdited: boolean;
}

export interface RingDaily {
  schemaVersion: number;
  date: string;
  timezone: string;
  sleep: RingSleep;
  restingHR: {
    bpm: number | null;
    method: string;
    n: number;
    rolling7d: number | null;
    rolling30d: number | null;
  };
  activity: {
    steps: number | null;
    distanceKm: number | null;
    stepGoal: number;
    source: string | null;
  };
  training: {
    zoneMinutes: Record<string, number | null>;
    zone2Minutes: number | null;
    // Names which model produced the boundaries — a formula estimate and a
    // personally calibrated band are not the same thing and the UI says so.
    zoneModel: string;
    hrMaxEstimate: number;
    workouts: unknown[];
  };
  device: {
    battery: number | null;
    lastSync: string | null;
    // The whole series, not just the latest reading. These gauges look
    // voltage-based, so a sample taken mid-sync can sag well below the resting
    // level — one number cannot distinguish that from a real discharge.
    batteryHistory: {
      latest: number | null;
      charging: boolean | null;
      samples: Array<{ at: string; percent: number; charging: boolean }>;
      // Only present for a strictly falling run with no charge in it.
      drainPctPerHour: number | null;
    };
  };
  // Shipped across the boundary on purpose: the dashboard can grey out a day
  // it should not trust rather than drawing it as fact.
  quality: { hrCoverage: number | null; flags: string[] };
}

export async function getToday(): Promise<DailyProgress | null> {
  const res = await apiFetch(`/api/daily-progress/today`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`getToday failed: ${res.status}`);
  return res.json();
}

export async function getRange(n: number): Promise<DailyProgress[]> {
  const res = await apiFetch(`/api/daily-progress/range/${n}`);
  if (!res.ok) throw new Error(`getRange failed: ${res.status}`);
  return res.json();
}

export async function patchDaily(
  date: string,
  updates: Record<string, unknown>
): Promise<DailyProgress> {
  const res = await apiFetch(`/api/daily-progress/${date}`, {
    method: "PATCH",
    body: JSON.stringify(updates),
  });
  if (!res.ok) throw new Error(`patchDaily failed: ${res.status}`);
  return res.json();
}

export async function getWeeklyGoals(): Promise<WeeklyGoals | null> {
  const res = await apiFetch(`/api/focus/weekly`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`getWeeklyGoals failed: ${res.status}`);
  return res.json();
}

export async function patchWeeklyGoals(
  updates: Record<string, unknown>
): Promise<WeeklyGoals> {
  const res = await apiFetch(`/api/focus/weekly`, {
    method: "PATCH",
    body: JSON.stringify(updates),
  });
  if (!res.ok) throw new Error(`patchWeeklyGoals failed: ${res.status}`);
  return res.json();
}

export async function getVaultStats(): Promise<VaultStats> {
  const res = await apiFetch(`/api/vault-stats`);
  if (!res.ok) throw new Error(`getVaultStats failed: ${res.status}`);
  return res.json();
}

export async function getProjects(): Promise<Project[]> {
  const res = await apiFetch(`/api/projects`);
  if (!res.ok) throw new Error(`getProjects failed: ${res.status}`);
  return res.json();
}

export async function getBriefing(): Promise<Briefing> {
  const res = await apiFetch(`/api/briefing`);
  if (!res.ok) throw new Error(`getBriefing failed: ${res.status}`);
  return res.json();
}

export async function getMonthlyFocus(): Promise<MonthlyFocus | null> {
  const res = await apiFetch(`/api/monthly-focus`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`getMonthlyFocus failed: ${res.status}`);
  return res.json();
}

export async function patchMonthlyFocus(
  updates: { vision?: string; themes?: string[] }
): Promise<MonthlyFocus> {
  const res = await apiFetch(`/api/monthly-focus`, {
    method: "PATCH",
    body: JSON.stringify(updates),
  });
  if (!res.ok) throw new Error(`patchMonthlyFocus failed: ${res.status}`);
  return res.json();
}

export async function getProject(slug: string): Promise<ProjectDetail | null> {
  const res = await apiFetch(`/api/projects/${encodeURIComponent(slug)}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`getProject failed: ${res.status}`);
  return res.json();
}

export async function patchProject(
  slug: string,
  updates: ProjectUpdates
): Promise<ProjectDetail> {
  const res = await apiFetch(`/api/projects/${encodeURIComponent(slug)}`, {
    method: "PATCH",
    body: JSON.stringify(updates),
  });
  if (!res.ok) throw new Error(`patchProject failed: ${res.status}`);
  return res.json();
}

export async function getHealthReferences(): Promise<HealthReference[]> {
  const res = await apiFetch(`/api/health/references`);
  if (!res.ok) throw new Error(`getHealthReferences failed: ${res.status}`);
  return res.json();
}

// Days with no rollup are absent from this list, not zero-filled. Callers must
// treat a gap as a gap — see RingDaily.
export async function getRingRange(n: number): Promise<RingDaily[]> {
  const res = await apiFetch(`/api/ring/range/${n}`);
  if (!res.ok) throw new Error(`getRingRange failed: ${res.status}`);
  return res.json();
}

export interface RingSyncResult {
  ok: boolean;
  reached?: boolean;
  changed?: boolean;
  message?: string;
  error?: string;
  output?: string;
}

// Only the local API can do this — the ring is reached over Bluetooth from the
// Mac. Production answers 501, which is surfaced to the user rather than
// treated as a crash.
export async function syncRing(): Promise<RingSyncResult> {
  const res = await apiFetch(`/api/ring/sync`, { method: "POST" });
  const body = (await res.json().catch(() => ({}))) as RingSyncResult;
  if (res.status === 501 || res.status === 403) {
    return { ok: false, error: body.error ?? "Ring sync is only available on the Mac." };
  }
  if (!res.ok) return { ok: false, error: body.error ?? `sync failed: ${res.status}` };
  return body;
}

export async function getRingDay(date: string): Promise<RingDaily | null> {
  const res = await apiFetch(`/api/ring/${date}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`getRingDay failed: ${res.status}`);
  return res.json();
}

import type { RingDaily } from "./api";

// Config-driven metric list, the same shape as HABIT_CONFIG. Order is
// significant — it drives the stat row on the Ring tab.
export const RING_METRICS = [
  { key: "restingHR", label: "Resting HR", unit: "bpm" },
  { key: "sleep", label: "Sleep", unit: "" },
  { key: "steps", label: "Steps", unit: "" },
  { key: "zone2", label: "Zone 2", unit: "min" },
] as const;

export type RingMetricKey = (typeof RING_METRICS)[number]["key"];

// Zone labels. The ring reads zones 2-5; zone 1 is computed but not surfaced,
// since time below zone 2 is not a training signal worth a row.
export const ZONE_LABELS: Record<string, string> = {
  "2": "Zone 2 · easy",
  "3": "Zone 3 · moderate",
  "4": "Zone 4 · hard",
  "5": "Zone 5 · max",
};

export const ZONE_COLORS: Record<string, string> = {
  "2": "#4169e1",
  "3": "#6b8bf0",
  "4": "#e1a341",
  "5": "#f18a8a",
};

// A day is trustworthy enough to draw when the ring actually recorded
// something. `no-data` is the pipeline's own marker for a day it had nothing
// for — a charging day, or one the ring was not worn.
export function hasData(day: RingDaily): boolean {
  return !day.quality.flags.includes("no-data");
}

// Render a possibly-null number without ever turning it into a zero. The
// em dash is the convention already used across this dashboard for "not
// logged", and it matters more here: a charging day drawn as 0 steps would
// drag every trend line down and misreport the step goal.
export function fmt(value: number | null | undefined, digits = 0): string {
  if (value === null || value === undefined) return "—";
  return value.toFixed(digits);
}

export function fmtDuration(minutes: number | null): string {
  if (minutes === null) return "—";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

// How the zone model should be described to a reader. §13's whole point is
// that a formula HRmax and a personally calibrated band are different kinds of
// number, and the UI is not allowed to blur them.
export function zoneModelNote(model: string, hrMax: number): string {
  switch (model) {
    case "tanaka-estimate-v1":
      return `Estimated from age (Tanaka, HRmax ≈ ${hrMax}). Carries roughly 7–10 bpm of uncertainty — wider than some zone boundaries.`;
    case "personal-calibration-v1":
      return "Zone 2 anchored on your own calibration rides; the rest estimated from age.";
    case "measured-hrmax-v1":
      return `Based on a measured HRmax of ${hrMax}.`;
    default:
      return `Zone model: ${model}.`;
  }
}

// Human-readable quality flags. Nothing is hidden — §9 rule 5 — but a raw
// slug like "implausible-hr-samples:14" is not much use on a phone.
export function describeFlag(flag: string): string {
  if (flag === "no-data") return "No data recorded";
  if (flag === "low-hr-coverage") return "Sparse heart-rate coverage";
  if (flag === "sleep-stage-span-mismatch") return "Sleep stages disagree with the session length";
  if (flag.startsWith("implausible-hr-samples:")) {
    return `${flag.split(":")[1]} implausible heart-rate readings`;
  }
  return flag;
}

export function abbrevDate(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
}

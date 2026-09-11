import type { DailyProgress } from "./api";

// Order is significant — used for the habit grid and heatmap rows.
export const HABIT_CONFIG = [
  { key: "habit_sleep_8h", label: "8h sleep" },
  { key: "habit_nutrition", label: "Nutrition goals" },
  { key: "habit_difficult_task", label: "30min difficult task" },
  { key: "habit_creative_task", label: "30min creative task" },
  { key: "habit_reading", label: "30min reading" },
  { key: "habit_exercise", label: "2x 30min exercise" },
  { key: "habit_social_media", label: "Social media < 1h" },
  { key: "habit_stretching", label: "15min stretching" },
] as const;

export type HabitKey = (typeof HABIT_CONFIG)[number]["key"];

export const HABIT_KEYS = HABIT_CONFIG.map((h) => h.key) as HabitKey[];

// Legacy daily files used a different (6-habit) key set. Map a current key to
// its old equivalent so historical data still counts where there's a match.
// Keys present in both schemas (reading, exercise, stretching) need no mapping.
const HABIT_FALLBACK: Partial<Record<HabitKey, string>> = {
  habit_sleep_8h: "habit_sleep",
};

// Read a habit's value for a day's data, falling back to the legacy key.
export function habitDone(data: DailyProgress, key: HabitKey): boolean {
  if (data[key] === true) return true;
  const legacy = HABIT_FALLBACK[key];
  if (legacy && (data as unknown as Record<string, unknown>)[legacy] === true) return true;
  return false;
}

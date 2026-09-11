// Current 8-habit keys + legacy fallback, for the insight summary.
export const HABIT_KEYS = [
  "habit_sleep_8h",
  "habit_nutrition",
  "habit_difficult_task",
  "habit_creative_task",
  "habit_reading",
  "habit_exercise",
  "habit_social_media",
  "habit_stretching",
] as const;

const HABIT_FALLBACK: Record<string, string> = { habit_sleep_8h: "habit_sleep" };

export function habitDone(data: Record<string, unknown>, key: string): boolean {
  if (data[key] === true) return true;
  const legacy = HABIT_FALLBACK[key];
  if (legacy && data[legacy] === true) return true;
  return false;
}

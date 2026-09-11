// en-CA formats as YYYY-MM-DD, which is the key format used throughout.
export function ymdIn(tz: string, date: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(date);
}

export function todayYMD(tz: string): string {
  return ymdIn(tz);
}

export function getWeekId(ymd: string): string {
  const [y, m, day] = ymd.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1, day));
  const dow = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dow);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

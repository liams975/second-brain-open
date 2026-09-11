"use client";

import { useQuery } from "@tanstack/react-query";
import { getRange, DailyProgress } from "../lib/api";
import { HABIT_KEYS, habitDone } from "../lib/habits";

function toYMD(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Monday of the week containing `d` (local time)
function mondayOf(d: Date): Date {
  const offset = (d.getDay() + 6) % 7; // Mon=0 … Sun=6
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - offset);
}

function avgFocus(week: DailyProgress[]): number | null {
  const vals = week
    .map((d) => d.focus_score)
    .filter((v): v is number => v != null);
  if (!vals.length) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

function habitsPct(week: DailyProgress[]): number | null {
  if (!week.length) return null;
  const done = week.reduce(
    (sum, d) => sum + HABIT_KEYS.filter((k) => habitDone(d, k)).length,
    0
  );
  return (done / (week.length * HABIT_KEYS.length)) * 100;
}

function tasksTally(week: DailyProgress[]): { done: number; total: number } {
  return week.reduce(
    (acc, d) => {
      // Blank goal slots don't count toward totals.
      const tasks = (Array.isArray(d.tasks) ? d.tasks : []).filter((t) => t.text.trim() !== "");
      acc.done += tasks.filter((t) => t.done).length;
      acc.total += tasks.length;
      return acc;
    },
    { done: 0, total: 0 }
  );
}

function deepWork(week: DailyProgress[]): number {
  return week.reduce((sum, d) => sum + (d.deep_work_hours ?? 0), 0);
}

function Comparison({ delta, suffix }: { delta: number; suffix?: string }) {
  const rounded = Math.round(delta * 10) / 10;
  if (rounded === 0) {
    return <span style={{ ...cmp, color: "var(--muted)" }}>— 0{suffix ?? ""}</span>;
  }
  const up = rounded > 0;
  return (
    <span
      style={{
        ...cmp,
        color: up ? "var(--color-text-success)" : "var(--color-text-danger)",
      }}
    >
      {up ? "↑" : "↓"} {Math.abs(rounded)}
      {suffix ?? ""}
    </span>
  );
}

export default function WeeklySummary() {
  const { data } = useQuery({
    queryKey: ["daily", "range", 14],
    queryFn: () => getRange(14),
  });

  const all = data ?? [];
  const today = new Date();
  const thisMon = mondayOf(today);
  const lastMon = new Date(thisMon.getFullYear(), thisMon.getMonth(), thisMon.getDate() - 7);
  const thisMonStr = toYMD(thisMon);
  const lastMonStr = toYMD(lastMon);
  const todayStr = toYMD(today);

  const thisWeek = all.filter((d) => d.date >= thisMonStr && d.date <= todayStr);
  const lastWeek = all.filter((d) => d.date >= lastMonStr && d.date < thisMonStr);

  const enough = thisWeek.length >= 2;
  const hasLast = lastWeek.length >= 1;

  // metric values
  const tFocus = avgFocus(thisWeek);
  const lFocus = avgFocus(lastWeek);
  const tHabits = habitsPct(thisWeek);
  const lHabits = habitsPct(lastWeek);
  const tTasks = tasksTally(thisWeek);
  const lTasks = tasksTally(lastWeek);
  const tDeep = deepWork(thisWeek);
  const lDeep = deepWork(lastWeek);

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
      {/* Avg focus */}
      <div style={cardStyle}>
        <div style={label}>Avg focus</div>
        <div style={number}>{enough && tFocus != null ? tFocus.toFixed(1) : "—"}</div>
        {enough && hasLast && tFocus != null && lFocus != null && (
          <Comparison delta={tFocus - lFocus} />
        )}
      </div>

      {/* Habits */}
      <div style={cardStyle}>
        <div style={label}>Habits</div>
        <div style={number}>{enough && tHabits != null ? `${Math.round(tHabits)}%` : "—"}</div>
        {enough && hasLast && tHabits != null && lHabits != null && (
          <Comparison delta={tHabits - lHabits} suffix="%" />
        )}
      </div>

      {/* Tasks done */}
      <div style={cardStyle}>
        <div style={label}>Tasks done</div>
        <div style={number}>{enough ? `${tTasks.done} / ${tTasks.total}` : "—"}</div>
        {enough && hasLast && <Comparison delta={tTasks.done - lTasks.done} />}
      </div>

      {/* Deep work */}
      <div style={cardStyle}>
        <div style={label}>Deep work</div>
        <div style={number}>{enough ? `${Math.round(tDeep * 10) / 10} hrs` : "—"}</div>
        {enough && hasLast && <Comparison delta={tDeep - lDeep} suffix=" hrs" />}
      </div>
    </div>
  );
}

const cardStyle: React.CSSProperties = {
  background: "var(--color-background-secondary)",
  borderRadius: "var(--border-radius-md)",
  padding: "0.6rem 0.85rem",
};

const label: React.CSSProperties = {
  fontSize: 12,
  color: "var(--muted)",
};

const number: React.CSSProperties = {
  fontSize: 22,
  fontWeight: 500,
  margin: "2px 0 1px",
  lineHeight: 1.1,
};

const cmp: React.CSSProperties = {
  fontSize: 11,
};

"use client";

import { useQuery } from "@tanstack/react-query";
import { getRange, DailyProgress } from "../lib/api";
import { HABIT_KEYS, habitDone } from "../lib/habits";

const WEEKS = 26;
const CELL = 12;
const GAP = 2;
const COL_W = CELL + GAP;
const ROW_LABEL_W = 30;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const ROW_LABELS = ["Mon", "", "Wed", "", "Fri", "", ""];

function toYMD(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function mondayOf(d: Date): Date {
  const offset = (d.getDay() + 6) % 7;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - offset);
}

function completionScore(d: DailyProgress): {
  score: number;
  habitsDone: number;
  tasksDone: number;
  tasksTotal: number;
} {
  const habitsDone = HABIT_KEYS.filter((k) => habitDone(d, k)).length;
  // Only filled-in goals count; blank slots are ignored.
  const tasks = (Array.isArray(d.tasks) ? d.tasks : []).filter((t) => t.text.trim() !== "");
  const tasksDone = tasks.filter((t) => t.done).length;
  const tasksTotal = tasks.length;
  const score =
    (habitsDone / HABIT_KEYS.length) * 40 +
    (tasksTotal ? (tasksDone / tasksTotal) * 30 : 0) +
    (d.focus_score != null ? 15 : 0) +
    (d.reflection && d.reflection !== "" ? 15 : 0);
  return { score, habitsDone, tasksDone, tasksTotal };
}

function opacityFor(hasFile: boolean, score: number): number {
  if (!hasFile || score <= 0) return 0.06;
  if (score <= 25) return 0.25;
  if (score <= 50) return 0.45;
  if (score <= 75) return 0.7;
  return 1.0;
}

const LEGEND_OPACITIES = [0.06, 0.25, 0.45, 0.7, 1.0];

export default function CalendarHeatmap() {
  const { data } = useQuery({
    queryKey: ["daily", "range", 180],
    queryFn: () => getRange(180),
  });

  const byDate = new Map<string, DailyProgress>();
  (data ?? []).forEach((d) => byDate.set(d.date, d));

  const today = new Date();
  const todayStr = toYMD(today);
  const thisMonday = mondayOf(today);
  // first column = 25 weeks before the current week's Monday
  const firstMonday = new Date(
    thisMonday.getFullYear(),
    thisMonday.getMonth(),
    thisMonday.getDate() - (WEEKS - 1) * 7
  );

  // build columns (weeks) of 7 day-dates
  const columns: Date[][] = [];
  const monthMarkers: Array<{ col: number; label: string }> = [];
  let prevMonth = -1;
  for (let w = 0; w < WEEKS; w++) {
    const days: Date[] = [];
    for (let r = 0; r < 7; r++) {
      days.push(
        new Date(
          firstMonday.getFullYear(),
          firstMonday.getMonth(),
          firstMonday.getDate() + w * 7 + r
        )
      );
    }
    columns.push(days);
    const monMonth = days[0].getMonth();
    if (monMonth !== prevMonth) {
      monthMarkers.push({ col: w, label: MONTHS[monMonth] });
      prevMonth = monMonth;
    }
  }

  return (
    <div>
      {/* month labels */}
      <div style={{ display: "flex", marginBottom: 4 }}>
        <div style={{ width: ROW_LABEL_W, flexShrink: 0 }} />
        <div style={{ position: "relative", height: 14, flex: 1 }}>
          {monthMarkers.map((m) => (
            <span
              key={`${m.col}-${m.label}`}
              style={{
                position: "absolute",
                left: m.col * COL_W,
                fontSize: 10,
                color: "var(--muted)",
              }}
            >
              {m.label}
            </span>
          ))}
        </div>
      </div>

      {/* body: row labels + grid */}
      <div style={{ display: "flex" }}>
        <div style={{ width: ROW_LABEL_W, flexShrink: 0, display: "flex", flexDirection: "column", gap: GAP }}>
          {ROW_LABELS.map((lbl, r) => (
            <div key={r} style={{ height: CELL, fontSize: 9, color: "var(--muted)", lineHeight: `${CELL}px` }}>
              {lbl}
            </div>
          ))}
        </div>

        <div style={{ display: "flex", gap: GAP, overflowX: "auto" }}>
          {columns.map((days, w) => (
            <div key={w} style={{ display: "flex", flexDirection: "column", gap: GAP }}>
              {days.map((date) => {
                const ds = toYMD(date);
                const future = ds > todayStr;
                const file = byDate.get(ds);
                const hasFile = !!file && !future;
                const detail = file ? completionScore(file) : null;
                const score = detail ? detail.score : 0;
                const pct = Math.round(score);
                const monthDay = `${MONTHS[date.getMonth()]} ${date.getDate()}`;
                const tip = hasFile && detail
                  ? `${monthDay} — ${pct}%: ${detail.habitsDone}/${HABIT_KEYS.length} habits, ${detail.tasksDone}/${detail.tasksTotal} tasks, focus ${file!.focus_score ?? "—"}, reflection ${file!.reflection && file!.reflection !== "" ? "✓" : "✗"}`
                  : `${monthDay} — no entry`;
                return (
                  <div
                    key={ds}
                    title={tip}
                    style={{
                      width: CELL,
                      height: CELL,
                      borderRadius: 3,
                      background: "#4169e1",
                      opacity: opacityFor(hasFile, score),
                      visibility: future ? "hidden" : "visible",
                    }}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* legend */}
      <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 4, marginTop: 8 }}>
        <span style={{ fontSize: 10, color: "var(--muted)" }}>Less</span>
        {LEGEND_OPACITIES.map((o) => (
          <div
            key={o}
            style={{ width: CELL, height: CELL, borderRadius: 3, background: "#4169e1", opacity: o }}
          />
        ))}
        <span style={{ fontSize: 10, color: "var(--muted)" }}>More</span>
      </div>
    </div>
  );
}

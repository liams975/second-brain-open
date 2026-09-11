"use client";

import { useQuery } from "@tanstack/react-query";
import { getRange, DailyProgress } from "../lib/api";
import { HABIT_CONFIG, HabitKey, habitDone } from "../lib/habits";

const DAYS = 90;

function toYMD(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export default function HabitHeatmap() {
  const { data } = useQuery({
    queryKey: ["daily", "range", DAYS],
    queryFn: () => getRange(DAYS),
  });

  // date -> entry lookup (flat habit keys live on the entry itself)
  const byDate = new Map<string, DailyProgress>();
  (data ?? []).forEach((d: DailyProgress) => {
    byDate.set(d.date, d);
  });

  // last 90 calendar days, oldest -> newest (today is last column)
  const today = new Date();
  const days: string[] = [];
  for (let i = DAYS - 1; i >= 0; i--) {
    const dt = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
    days.push(toYMD(dt));
  }

  const isDone = (date: string, habit: HabitKey): boolean => {
    const entry = byDate.get(date);
    return entry ? habitDone(entry, habit) : false;
  };

  const streakFor = (habit: HabitKey): number => {
    let streak = 0;
    // iterate from today (last element) backwards
    for (let i = days.length - 1; i >= 0; i--) {
      if (isDone(days[i], habit)) streak++;
      else break;
    }
    return streak;
  };

  return (
    <div style={{ overflowX: "auto" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {HABIT_CONFIG.map(({ key: habit, label }) => {
          const streak = streakFor(habit);
          return (
            <div key={habit} style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={rowLabel}>{label}</div>
              <div style={{ display: "flex", gap: 2 }}>
                {days.map((date) => {
                  const done = isDone(date, habit);
                  return (
                    <div
                      key={date}
                      title={`${date} · ${label} · ${done ? "done" : "not done"}`}
                      style={{
                        width: 10,
                        height: 10,
                        borderRadius: 2,
                        background: "#4169e1",
                        opacity: done ? 1 : 0.1,
                      }}
                    />
                  );
                })}
              </div>
              <div style={streakStyle}>
                {streak > 0 ? `🔥 ${streak}` : "— 0"}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const rowLabel: React.CSSProperties = {
  width: 110,
  flexShrink: 0,
  fontSize: 12,
  color: "#8d95a3",
  textAlign: "right",
};

const streakStyle: React.CSSProperties = {
  width: 48,
  flexShrink: 0,
  fontSize: 12,
  color: "#dde2ea",
  whiteSpace: "nowrap",
};

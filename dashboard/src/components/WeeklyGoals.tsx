"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getWeeklyGoals, patchWeeklyGoals } from "../lib/api";

function formatWeekLabel(start: string, end: string): string {
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  const s = new Date(start + "T00:00:00").toLocaleDateString("en-US", opts);
  const e = new Date(end + "T00:00:00").toLocaleDateString("en-US", opts);
  return `Week of ${s} – ${e}`;
}

export default function WeeklyGoals() {
  const queryClient = useQueryClient();
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["weekly"],
    queryFn: getWeeklyGoals,
  });

  const mutation = useMutation({
    mutationFn: (updates: Record<string, unknown>) => patchWeeklyGoals(updates),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["weekly"] }),
  });

  const [texts, setTexts] = useState<string[]>([]);
  useEffect(() => {
    if (data) setTexts((data.goals ?? []).map((g) => g.text));
  }, [data]);

  if (isLoading) return <div style={{ color: "#8d95a3" }}>Loading…</div>;

  // Same distinction as DailyLogger: only a 404 means "not created yet".
  if (isError) {
    return (
      <div style={{ color: "var(--color-text-danger)", fontSize: 13, lineHeight: 1.4 }}>
        Can’t reach the API — {(error as Error)?.message ?? "unknown error"}
      </div>
    );
  }

  if (!data) {
    return (
      <div style={{ color: "#8d95a3", fontSize: 14 }}>
        This week&apos;s goals file hasn&apos;t been created yet.
      </div>
    );
  }

  const goals = data.goals ?? [];
  const doneCount = goals.filter((g) => g.done).length;
  const filled = goals.filter((g) => g.text.trim() !== "").length;

  return (
    <div>
      <div style={{ fontSize: 13, color: "#8d95a3", marginBottom: 12 }}>
        {formatWeekLabel(data.start_date, data.end_date)}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {goals.map((g, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <input
              type="checkbox"
              checked={g.done}
              onChange={() => mutation.mutate({ [`goals.${i}.done`]: !g.done })}
            />
            <input
              type="text"
              value={texts[i] ?? ""}
              placeholder={`Goal ${i + 1}`}
              onChange={(e) =>
                setTexts((s) => s.map((x, j) => (j === i ? e.target.value : x)))
              }
              onBlur={() => mutation.mutate({ [`goals.${i}.text`]: texts[i] ?? "" })}
              style={{
                flex: 1,
                background: "transparent",
                border: "none",
                borderBottom: "1px solid #2b313b",
                color: g.done ? "#8d95a3" : "#dde2ea",
                textDecoration: g.done ? "line-through" : "none",
                fontSize: 14,
                padding: "2px 0",
                outline: "none",
              }}
            />
          </div>
        ))}
        {goals.length === 0 && (
          <span style={{ color: "#8d95a3", fontSize: 13 }}>No goal slots for this week yet.</span>
        )}
      </div>
      {mutation.isError && (
        <div style={{ marginTop: 10, color: "var(--color-text-danger)", fontSize: 12 }}>
          Save failed: {(mutation.error as Error)?.message ?? "unknown error"}
        </div>
      )}
      <div style={{ marginTop: 12, fontSize: 13, color: "#8d95a3" }}>
        {doneCount} / {filled} goals
      </div>
    </div>
  );
}

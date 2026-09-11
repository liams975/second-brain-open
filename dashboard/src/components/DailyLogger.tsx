"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getToday, patchDaily, DailyProgress, Mood } from "../lib/api";
import { HABIT_CONFIG, HabitKey, habitDone } from "../lib/habits";

const MOOD_OPTIONS: Array<{ value: Exclude<Mood, "">; label: string }> = [
  { value: "great", label: "Great" },
  { value: "good", label: "Good" },
  { value: "neutral", label: "Neutral" },
  { value: "low", label: "Low" },
  { value: "rough", label: "Rough" },
];

export default function DailyLogger() {
  const queryClient = useQueryClient();
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["daily", "today"],
    queryFn: getToday,
  });

  const mutation = useMutation({
    mutationFn: ({
      date,
      updates,
    }: {
      date: string;
      updates: Record<string, unknown>;
    }) => patchDaily(date, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["daily", "today"] });
    },
  });

  // local state for slider / textareas, synced when data arrives
  const [focusValue, setFocusValue] = useState<number>(5);
  const [energyValue, setEnergyValue] = useState<number>(5);
  const [deepWork, setDeepWork] = useState<string>("");
  const [taskTexts, setTaskTexts] = useState<string[]>([]);
  const [reflection, setReflection] = useState("");
  const [progress, setProgress] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (data) {
      setFocusValue(data.focus_score ?? 5);
      setEnergyValue(data.energy ?? 5);
      setDeepWork(data.deep_work_hours != null ? String(data.deep_work_hours) : "");
      setTaskTexts(data.tasks.map((t) => t.text));
      setReflection(data.reflection ?? "");
      setProgress(data.weekly_goals_progress ?? "");
    }
  }, [data]);

  if (isLoading) {
    return <div style={card}>Loading today…</div>;
  }

  // A failed request is not the same as "no file yet" — getToday() only returns
  // null on a real 404, so anything else (API down, bad credentials) must say so
  // rather than fall through to the "cron hasn't run" message below.
  if (isError) {
    return (
      <div style={card}>
        <div style={errorTitle}>Can’t reach the API</div>
        <div style={errorDetail}>{(error as Error)?.message ?? "Unknown error"}</div>
      </div>
    );
  }

  if (!data) {
    return (
      <div style={{ ...card, color: "var(--muted)" }}>
        Today&apos;s log hasn&apos;t been created yet. The cron job runs at 7:00 AM.
      </div>
    );
  }

  const d: DailyProgress = data;

  const toggleTask = (i: number, done: boolean) =>
    mutation.mutate({ date: d.date, updates: { [`tasks.${i}.done`]: done } });

  const commitTaskText = (i: number) =>
    mutation.mutate({ date: d.date, updates: { [`tasks.${i}.text`]: taskTexts[i] ?? "" } });

  const toggleHabit = (key: HabitKey) =>
    mutation.mutate({ date: d.date, updates: { [key]: !habitDone(d, key) } });

  const commitFocus = () =>
    mutation.mutate({ date: d.date, updates: { focus_score: focusValue } });

  const commitEnergy = () =>
    mutation.mutate({ date: d.date, updates: { energy: energyValue } });

  const selectMood = (mood: Mood) =>
    mutation.mutate({ date: d.date, updates: { mood } });

  const commitDeepWork = () =>
    mutation.mutate({
      date: d.date,
      updates: { deep_work_hours: parseFloat(deepWork) || null },
    });

  const saveText = () =>
    mutation.mutate(
      {
        date: d.date,
        updates: { reflection, weekly_goals_progress: progress },
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ["daily", "today"] });
          setSaved(true);
          setTimeout(() => setSaved(false), 2000);
        },
      }
    );

  return (
    <div style={{ ...card, display: "flex", flexDirection: "column", gap: 16, height: "100%" }}>
      {/* Writes fail silently otherwise: a click just does nothing. */}
      {mutation.isError && (
        <div style={errorDetail}>
          Save failed: {(mutation.error as Error)?.message ?? "unknown error"}
        </div>
      )}

      {/* TASKS (manual daily goals) */}
      <section>
        <h3 style={sectionTitle}>Daily goals</h3>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {d.tasks.map((t, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input
                type="checkbox"
                checked={t.done}
                onChange={(e) => toggleTask(i, e.target.checked)}
              />
              <input
                type="text"
                value={taskTexts[i] ?? ""}
                placeholder={`Goal ${i + 1}`}
                onChange={(e) =>
                  setTaskTexts((s) => s.map((x, j) => (j === i ? e.target.value : x)))
                }
                onBlur={() => commitTaskText(i)}
                style={{
                  flex: 1,
                  background: "transparent",
                  border: "none",
                  borderBottom: "1px solid var(--border)",
                  color: t.done ? "var(--muted)" : "var(--fg)",
                  textDecoration: t.done ? "line-through" : "none",
                  fontSize: 14,
                  padding: "2px 0",
                  outline: "none",
                }}
              />
            </div>
          ))}
        </div>
      </section>

      {/* HABITS */}
      <section>
        <h3 style={sectionTitle}>Habits</h3>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 8,
          }}
        >
          {HABIT_CONFIG.map(({ key, label }) => {
            const active = habitDone(d, key);
            return (
              <button
                key={key}
                onClick={() => toggleHabit(key)}
                style={{
                  padding: "7px 8px",
                  borderRadius: 8,
                  border: "1px solid var(--border)",
                  background: active ? "var(--accent)" : "transparent",
                  color: active ? "#fff" : "var(--muted)",
                  fontWeight: active ? 600 : 400,
                  fontSize: 12,
                  lineHeight: 1.2,
                  transition: "all 0.15s",
                }}
              >
                {label}
              </button>
            );
          })}
        </div>
      </section>

      {/* FOCUS SCORE */}
      <section>
        <h3 style={sectionTitle}>Focus Score</h3>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <input
            type="range"
            min={1}
            max={10}
            step={1}
            value={focusValue}
            onChange={(e) => setFocusValue(Number(e.target.value))}
            onMouseUp={commitFocus}
            onTouchEnd={commitFocus}
            style={{ flex: 1, accentColor: "#4169e1" }}
          />
          <span style={{ fontSize: 32, fontWeight: 700, minWidth: 44, textAlign: "right" }}>
            {focusValue}
          </span>
        </div>
      </section>

      {/* ENERGY LEVEL */}
      <section>
        <h3 style={sectionTitle}>Energy level</h3>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <input
            type="range"
            min={1}
            max={10}
            step={1}
            value={energyValue}
            onChange={(e) => setEnergyValue(Number(e.target.value))}
            onMouseUp={commitEnergy}
            onTouchEnd={commitEnergy}
            style={{ flex: 1, accentColor: "#4169e1" }}
          />
          <span style={{ fontSize: 32, fontWeight: 700, minWidth: 44, textAlign: "right" }}>
            {energyValue}
          </span>
        </div>
      </section>

      {/* MOOD */}
      <section>
        <h3 style={sectionTitle}>Mood</h3>
        <div style={{ display: "flex", gap: 6 }}>
          {MOOD_OPTIONS.map((m) => {
            const active = d.mood === m.value;
            return (
              <button
                key={m.value}
                onClick={() => selectMood(m.value)}
                style={{
                  flex: 1,
                  padding: "8px 0",
                  borderRadius: 999,
                  border: "1px solid var(--border)",
                  background: active ? "var(--accent)" : "transparent",
                  color: active ? "#fff" : "var(--muted)",
                  fontWeight: active ? 600 : 400,
                  fontSize: 13,
                  transition: "all 0.15s",
                }}
              >
                {m.label}
              </button>
            );
          })}
        </div>
      </section>

      {/* DEEP WORK HOURS */}
      <section>
        <h3 style={sectionTitle}>Deep work</h3>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 14, color: "var(--fg)" }}>Deep work</span>
          <input
            type="number"
            min={0}
            max={12}
            step={0.5}
            value={deepWork}
            onChange={(e) => setDeepWork(e.target.value)}
            onBlur={commitDeepWork}
            style={{
              width: 60,
              background: "#101216",
              border: "1px solid var(--border)",
              borderRadius: 8,
              color: "var(--fg)",
              padding: "6px 8px",
              fontSize: 14,
            }}
          />
          <span style={{ fontSize: 13, color: "var(--muted)" }}>hrs</span>
        </div>
      </section>

      {/* REFLECTION & WEEKLY PROGRESS */}
      <section style={{ display: "flex", flexDirection: "column", gap: 12, flex: 1, minHeight: 0 }}>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 80 }}>
          <label style={fieldLabel}>Reflection</label>
          <textarea
            value={reflection}
            onChange={(e) => setReflection(e.target.value)}
            rows={3}
            style={{ ...textarea, flex: 1 }}
          />
        </div>
        <div>
          <label style={fieldLabel}>Weekly Goals Progress</label>
          <textarea
            value={progress}
            onChange={(e) => setProgress(e.target.value)}
            rows={2}
            style={textarea}
          />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button onClick={saveText} style={saveButton}>
            Save
          </button>
          {saved && <span style={{ color: "#7fdcb4", fontSize: 13 }}>Saved ✓</span>}
        </div>
      </section>
    </div>
  );
}

const card: React.CSSProperties = {
  background: "var(--card)",
  border: "1px solid var(--border)",
  borderRadius: 12,
  padding: "1rem 1.25rem",
};

const errorTitle: React.CSSProperties = {
  color: "var(--color-text-danger)",
  fontSize: 14,
  fontWeight: 600,
  marginBottom: 6,
};

const errorDetail: React.CSSProperties = {
  color: "var(--color-text-danger)",
  fontSize: 12,
  lineHeight: 1.4,
  wordBreak: "break-word",
};

const sectionTitle: React.CSSProperties = {
  fontSize: 13,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  color: "var(--muted)",
  marginBottom: 10,
};

const fieldLabel: React.CSSProperties = {
  display: "block",
  fontSize: 12,
  color: "var(--muted)",
  marginBottom: 6,
};

const textarea: React.CSSProperties = {
  width: "100%",
  background: "#101216",
  border: "1px solid var(--border)",
  borderRadius: 8,
  color: "var(--fg)",
  padding: 8,
  fontSize: 14,
  resize: "vertical",
};

const saveButton: React.CSSProperties = {
  background: "var(--accent)",
  border: "none",
  color: "#fff",
  padding: "8px 18px",
  borderRadius: 8,
  fontWeight: 600,
};

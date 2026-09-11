"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  getHealthReferences,
  getToday,
  getRange,
  patchDaily,
  DailyProgress,
  HealthReference,
} from "../lib/api";

// ---- static reference data (always renders even if files fail to parse) ----
const MACROS: [string, string][] = [
  ["Calories", "3,000 kcal"],
  ["Protein", "130–145 g"],
  ["Carbs", "375 g"],
  ["Fat", "75 g"],
  ["Fiber", "38+ g"],
  ["Water", "3.3+ L"],
  ["Sodium", "1,500–2,300 mg"],
  ["Sugar", "Under 35 g"],
];
const MICROS: [string, string][] = [
  ["Vitamin D", "15 mcg"],
  ["Magnesium", "410 mg"],
  ["Zinc", "11 mg"],
  ["Calcium", "1,300 mg"],
  ["Choline", "550 mg"],
  ["Omega-3s", "1.6 g"],
  ["Iron", "11 mg"],
  ["Iodine", "150 mcg"],
  ["Potassium", "3,000+ mg"],
  ["B vitamins", "All RDAs"],
];

const GYM_DAYS: [string, string][] = [
  ["monday", "Mon"],
  ["tuesday", "Tue"],
  ["wednesday", "Wed"],
  ["thursday", "Thu"],
  ["friday", "Fri"],
  ["saturday", "Sat"],
  ["sunday", "Sun"],
];
// Fallback only — Health/gym-split.md is the source of truth for the schedule.
const DEFAULT_SCHEDULE: Record<string, string> = {
  monday: "push",
  tuesday: "pull",
  wednesday: "legs",
  thursday: "push",
  friday: "pull",
  saturday: "rest",
  sunday: "rest",
};

// Three training tiers stepping down the accent ramp, so the week reads as a
// gradient at a glance rather than as three unrelated colours.
const FOCUS_BACKGROUNDS: Record<string, string> = {
  push: "var(--accent)",
  pull: "rgba(65,105,225,0.55)",
  legs: "rgba(65,105,225,0.28)",
};
const REST_BACKGROUND = "rgba(255,255,255,0.04)";

const SLEEP_FACTORS = ["Caffeine late", "Screens late", "Alcohol", "Late meal", "Stress"];

const NUTRITION_FIELDS: {
  key: keyof DailyProgress;
  label: string;
  unit: string;
  target: number;
  targetLabel: string;
  lowerBetter?: boolean;
}[] = [
  { key: "calories", label: "Calories", unit: "kcal", target: 3000, targetLabel: "3,000" },
  { key: "protein", label: "Protein", unit: "g", target: 130, targetLabel: "130–145" },
  { key: "carbs", label: "Carbs", unit: "g", target: 375, targetLabel: "375" },
  { key: "fat", label: "Fat", unit: "g", target: 75, targetLabel: "75" },
  { key: "fiber", label: "Fiber", unit: "g", target: 38, targetLabel: "38+" },
  { key: "water", label: "Water", unit: "L", target: 3.3, targetLabel: "3.3+" },
  { key: "sugar", label: "Sugar", unit: "g", target: 35, targetLabel: "<35", lowerBetter: true },
];
// macros used for the daily adherence score (positive "more is better" targets)
const ADHERENCE: [keyof DailyProgress, number][] = [
  ["calories", 3000],
  ["protein", 137],
  ["carbs", 375],
  ["fat", 75],
  ["fiber", 38],
  ["water", 3.3],
];

const ROUTINE_AM: [keyof DailyProgress, string][] = [
  ["routine_am_no_phone", "No phone first hour"],
  ["routine_am_sunlight", "10+ min sunlight"],
  ["routine_am_breakfast", "Breakfast before messages"],
];
const ROUTINE_PM: [keyof DailyProgress, string][] = [
  ["routine_pm_no_phone", "No phone after 10:30"],
  ["routine_pm_screens_off", "Screens off by 10:30"],
  ["routine_pm_prepare", "Prepare for next day"],
];

const card: React.CSSProperties = {
  background: "#1b1f26",
  border: "1px solid #2b313b",
  borderRadius: 12,
  padding: "1rem 1.25rem",
};
const title: React.CSSProperties = { fontSize: 13, color: "#8d95a3", marginBottom: 12 };
const muted: React.CSSProperties = { color: "var(--muted)", fontSize: 13 };

function abbrevDate(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
}

function valueColor(v: number | null, target: number, lowerBetter?: boolean): string {
  if (v == null) return "var(--fg)";
  if (lowerBetter) return v <= target ? "var(--color-text-success)" : "var(--color-text-danger)";
  if (v >= target) return "var(--color-text-success)";
  if (v < target * 0.7) return "var(--color-text-danger)";
  return "var(--fg)";
}

export default function HealthPage() {
  const queryClient = useQueryClient();
  const { data: refs } = useQuery({ queryKey: ["health-references"], queryFn: getHealthReferences });
  const { data: today } = useQuery({ queryKey: ["daily", "today"], queryFn: getToday });
  const { data: range } = useQuery({ queryKey: ["daily", "range", 14], queryFn: () => getRange(14) });

  const mutation = useMutation({
    mutationFn: (updates: Record<string, unknown>) =>
      patchDaily((today as DailyProgress).date, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["daily", "today"] });
      queryClient.invalidateQueries({ queryKey: ["daily", "range", 14] });
    },
  });
  const patch = (updates: Record<string, unknown>) => {
    if (today) mutation.mutate(updates);
  };

  // nutrition input local state (controlled, patch on blur)
  const [nutri, setNutri] = useState<Record<string, string>>({});
  const [bedtime, setBedtime] = useState("");
  const [wake, setWake] = useState("");

  useEffect(() => {
    if (today) {
      const n: Record<string, string> = {};
      for (const f of NUTRITION_FIELDS) {
        const v = today[f.key] as number | null;
        n[f.key] = v != null ? String(v) : "";
      }
      setNutri(n);
      setBedtime(today.sleep_bedtime ?? "");
      setWake(today.sleep_wake ?? "");
    }
  }, [today]);

  const find = (name: string): HealthReference | undefined =>
    (refs ?? []).find((r) => r.filename === name);

  const schedule =
    (find("gym-split")?.frontmatter?.schedule as Record<string, string>) ?? DEFAULT_SCHEDULE;
  const todayName = new Date().toLocaleDateString("en-US", { weekday: "long" }).toLowerCase();

  const factors = today?.sleep_factors ?? [];
  const toggleFactor = (f: string) =>
    patch({ sleep_factors: factors.includes(f) ? factors.filter((x) => x !== f) : [...factors, f] });

  // ---- trends ----
  const sleepData = (range ?? [])
    .filter((d) => d.sleep_quality != null)
    .sort((a, b) => (a.date < b.date ? -1 : 1))
    .map((d) => ({ label: abbrevDate(d.date), quality: d.sleep_quality as number }));

  const nutritionData = (range ?? [])
    .sort((a, b) => (a.date < b.date ? -1 : 1))
    .map((d) => {
      const logged = ADHERENCE.filter(([k]) => d[k] != null);
      if (!logged.length) return null;
      const score =
        (logged.reduce((sum, [k, t]) => sum + Math.min((d[k] as number) / t, 1), 0) /
          logged.length) *
        100;
      return { label: abbrevDate(d.date), score: Math.round(score) };
    })
    .filter((x): x is { label: string; score: number } => x !== null);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* ZONE 1 — REFERENCE CARDS */}
      {/* alignItems:start — the nutrition card is much taller, and stretching
          the gym card to match left a block of dead space under its day row. */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 12,
          alignItems: "start",
        }}
      >
        {/* Nutrition */}
        <div style={card}>
          <div style={title}>Daily nutrition targets</div>
          <div style={{ display: "flex", gap: 20 }}>
            <RefTable rows={MACROS} heading="Macros" />
            <RefTable rows={MICROS} heading="Micros" small />
          </div>
        </div>

        {/* Gym split */}
        <div style={card}>
          <div style={title}>This week&apos;s training</div>
          <div style={{ display: "flex", gap: 6 }}>
            {GYM_DAYS.map(([key, short]) => {
              const focus = schedule[key] ?? "rest";
              const isToday = key === todayName;
              return (
                <div key={key} style={{ flex: 1, textAlign: "center" }}>
                  <div
                    style={{
                      fontSize: 11,
                      color: isToday ? "#fff" : "var(--muted)",
                      fontWeight: isToday ? 700 : 400,
                    }}
                  >
                    {short}
                  </div>
                  <div
                    style={{
                      marginTop: 6,
                      padding: "10px 4px",
                      borderRadius: 6,
                      fontSize: 11,
                      textTransform: "capitalize",
                      border: isToday ? "1px solid #4169e1" : "1px solid transparent",
                      background: FOCUS_BACKGROUNDS[focus] ?? REST_BACKGROUND,
                      color: FOCUS_BACKGROUNDS[focus] ? "#fff" : "var(--muted)",
                    }}
                  >
                    {focus}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* The "Sleep schedule" and "Daily routines" reference cards lived here.
            Both restated targets the logging inputs below already show inline,
            so they were pure duplication. */}
      </div>

      {/* ZONE 2 — DAILY LOGGING */}
      {!today ? (
        <div style={card}>
          <div style={muted}>Today&apos;s log hasn&apos;t been created yet — the cron runs at 7:00 AM.</div>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
          {/* Sleep log */}
          <div style={card}>
            <div style={title}>Last night&apos;s sleep</div>
            <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
              <label style={{ flex: 1, ...muted }}>
                Bedtime
                <input
                  type="time"
                  value={bedtime}
                  onChange={(e) => {
                    setBedtime(e.target.value);
                    patch({ sleep_bedtime: e.target.value });
                  }}
                  style={timeInput}
                />
              </label>
              <label style={{ flex: 1, ...muted }}>
                Wake
                <input
                  type="time"
                  value={wake}
                  onChange={(e) => {
                    setWake(e.target.value);
                    patch({ sleep_wake: e.target.value });
                  }}
                  style={timeInput}
                />
              </label>
            </div>
            <div style={{ ...muted, marginBottom: 6 }}>Sleep quality</div>
            <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
              {[1, 2, 3, 4, 5].map((n) => {
                const active = today.sleep_quality === n;
                return (
                  <button
                    key={n}
                    onClick={() => patch({ sleep_quality: n })}
                    style={{
                      width: 30,
                      height: 30,
                      borderRadius: 6,
                      border: "1px solid var(--border)",
                      background: active ? "var(--accent)" : "transparent",
                      color: active ? "#fff" : "var(--muted)",
                      fontWeight: active ? 600 : 400,
                    }}
                  >
                    {n}
                  </button>
                );
              })}
            </div>
            <div style={{ ...muted, marginBottom: 6 }}>Factors</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
              {SLEEP_FACTORS.map((f) => {
                const active = factors.includes(f);
                return (
                  <button key={f} onClick={() => toggleFactor(f)} style={pill(active)}>
                    {f}
                  </button>
                );
              })}
            </div>
            <button
              onClick={() => patch({ supplements_taken: !today.supplements_taken })}
              style={pill(!!today.supplements_taken)}
            >
              Took supplements
            </button>
          </div>

          {/* Nutrition log */}
          <div style={card}>
            <div style={title}>Today&apos;s nutrition</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              {NUTRITION_FIELDS.map((f) => {
                const raw = nutri[f.key] ?? "";
                const num = raw === "" ? null : parseFloat(raw);
                return (
                  <div key={f.key}>
                    <label style={{ ...muted, fontSize: 11 }}>
                      {f.label} ({f.unit})
                    </label>
                    <input
                      type="number"
                      value={raw}
                      onChange={(e) => setNutri((s) => ({ ...s, [f.key]: e.target.value }))}
                      onBlur={() => patch({ [f.key]: raw === "" ? null : parseFloat(raw) })}
                      style={{
                        ...numInput,
                        color: valueColor(Number.isNaN(num as number) ? null : num, f.target, f.lowerBetter),
                      }}
                    />
                    <div style={{ fontSize: 10, color: "var(--muted)" }}>target {f.targetLabel}</div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Routine check-off */}
          <div style={card}>
            <div style={title}>Today&apos;s routines</div>
            <div style={{ display: "flex", gap: 16 }}>
              {([
                ["Morning", ROUTINE_AM],
                ["Evening", ROUTINE_PM],
              ] as [string, [keyof DailyProgress, string][]][]).map(([heading, items]) => (
                <div key={heading} style={{ flex: 1 }}>
                  <div style={{ ...muted, fontWeight: 600, marginBottom: 8 }}>{heading}</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {items.map(([key, lbl]) => (
                      <label key={key} style={{ display: "flex", gap: 8, fontSize: 12, alignItems: "flex-start" }}>
                        <input
                          type="checkbox"
                          checked={!!today[key]}
                          onChange={(e) => patch({ [key]: e.target.checked })}
                        />
                        <span style={{ color: today[key] ? "var(--muted)" : "var(--fg)" }}>{lbl}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ZONE 3 — TRENDS */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div style={card}>
          <div style={title}>Sleep quality — last 14 days</div>
          {sleepData.length < 2 ? (
            <div style={empty}>No sleep data yet</div>
          ) : (
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={sleepData} margin={{ top: 8, right: 8, bottom: 0, left: -24 }}>
                <XAxis dataKey="label" tick={{ fill: "#8d95a3", fontSize: 11 }} stroke="#2b313b" />
                <YAxis
                  domain={[1, 5]}
                  ticks={[1, 2, 3, 4, 5]}
                  tick={{ fill: "#8d95a3", fontSize: 11 }}
                  stroke="#2b313b"
                />
                <Tooltip
                  contentStyle={{ background: "#1b1f26", border: "1px solid #2b313b", borderRadius: 8 }}
                />
                <Line type="monotone" dataKey="quality" stroke="#4169e1" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        <div style={card}>
          <div style={title}>Nutrition adherence — last 14 days</div>
          {nutritionData.length === 0 ? (
            <div style={empty}>No nutrition data yet</div>
          ) : (
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={nutritionData} margin={{ top: 8, right: 8, bottom: 0, left: -24 }}>
                <XAxis dataKey="label" tick={{ fill: "#8d95a3", fontSize: 11 }} stroke="#2b313b" />
                <YAxis
                  domain={[0, 100]}
                  tick={{ fill: "#8d95a3", fontSize: 11 }}
                  stroke="#2b313b"
                />
                <Tooltip
                  contentStyle={{ background: "#1b1f26", border: "1px solid #2b313b", borderRadius: 8 }}
                  formatter={(v) => [`${v as number}%`, "Adherence"]}
                />
                <Bar dataKey="score">
                  {nutritionData.map((d, i) => (
                    <Cell key={i} fill={d.score > 80 ? "#4169e1" : "#2b313b"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  );
}

function RefTable({ rows, heading, small }: { rows: [string, string][]; heading: string; small?: boolean }) {
  return (
    <div style={{ flex: 1 }}>
      <div style={{ ...muted, fontWeight: 600, marginBottom: 6 }}>{heading}</div>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: small ? 11 : 12 }}>
        <tbody>
          {rows.map(([k, v]) => (
            <tr key={k}>
              <td style={{ color: "var(--muted)", padding: "2px 0" }}>{k}</td>
              <td style={{ color: "var(--fg)", padding: "2px 0", textAlign: "right" }}>{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const pill = (active: boolean): React.CSSProperties => ({
  fontSize: 12,
  padding: "4px 10px",
  borderRadius: 999,
  border: "1px solid var(--border)",
  background: active ? "var(--accent)" : "transparent",
  color: active ? "#fff" : "var(--muted)",
});

const timeInput: React.CSSProperties = {
  width: "100%",
  marginTop: 4,
  background: "#101216",
  border: "1px solid var(--border)",
  borderRadius: 8,
  color: "var(--fg)",
  padding: "6px 8px",
  fontSize: 13,
};

const numInput: React.CSSProperties = {
  width: "100%",
  marginTop: 2,
  background: "#101216",
  border: "1px solid var(--border)",
  borderRadius: 8,
  padding: "6px 8px",
  fontSize: 14,
};

const empty: React.CSSProperties = {
  height: 180,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  color: "var(--muted)",
  fontSize: 14,
};

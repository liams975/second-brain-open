"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bar,
  BarChart,
  Cell,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { getRingRange, syncRing, type RingDaily, type RingSyncResult } from "../lib/api";
import {
  ZONE_COLORS,
  ZONE_LABELS,
  abbrevDate,
  describeFlag,
  fmt,
  fmtDuration,
  hasData,
  zoneModelNote,
} from "../lib/ring";

const RANGE_DAYS = 30;

export default function RingPage() {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["ring", "range", RANGE_DAYS],
    queryFn: () => getRingRange(RANGE_DAYS),
  });
  const sync = <SyncButton />;

  if (isLoading) return <div style={card}>Loading ring data…</div>;

  // A failed request is not the same as "the ring has not synced yet" — an
  // outage and an unworn ring must not look identical.
  if (isError) {
    return (
      <div style={card}>
        <div style={errorTitle}>Can’t reach the API</div>
        <div style={muted}>{(error as Error).message}</div>
      </div>
    );
  }

  const days = (data ?? []).slice().sort((a, b) => (a.date < b.date ? -1 : 1));
  const withData = days.filter(hasData);
  const latest = withData.length ? withData[withData.length - 1] : null;

  if (!latest) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ ...card, color: "var(--muted)" }}>
          No ring data yet. Wear the ring, then sync — it syncs itself every 2 hours, or press
          the button to pull now.
          {days.length > 0 && (
            <div style={{ marginTop: 8, fontSize: 13 }}>
              {days.length} day{days.length === 1 ? "" : "s"} synced, none with recorded data.
            </div>
          )}
        </div>
        {sync}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {sync}
      <Summary day={latest} synced={withData.length} total={days.length} />
      <Battery day={latest} />
      <Zones day={latest} />
      <Trends days={withData} />
    </div>
  );
}

function SyncButton() {
  const qc = useQueryClient();
  const [result, setResult] = useState<RingSyncResult | null>(null);

  const mutation = useMutation({
    mutationFn: syncRing,
    onSuccess: (r) => {
      setResult(r);
      if (r.ok) qc.invalidateQueries({ queryKey: ["ring"] });
    },
    onError: (e: Error) => setResult({ ok: false, error: e.message }),
  });

  const busy = mutation.isPending;

  return (
    <div style={{ ...card, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
      <button
        onClick={() => {
          setResult(null);
          mutation.mutate();
        }}
        disabled={busy}
        style={{
          ...syncBtn,
          opacity: busy ? 0.6 : 1,
          cursor: busy ? "progress" : "pointer",
        }}
      >
        {busy ? "Syncing…" : "Sync ring now"}
      </button>
      <div style={{ fontSize: 12, color: "var(--muted)", flex: 1, minWidth: 180 }}>
        {busy && "Scanning for the ring — this can take up to a minute."}
        {!busy && !result && "Syncs automatically every 2 hours."}
        {!busy && result?.ok && (
          <span style={{ color: result.reached ? "var(--color-text-success)" : "var(--muted)" }}>
            {result.message}
            {result.reached && !result.changed && " No new data since the last sync."}
          </span>
        )}
        {!busy && result && !result.ok && (
          <span style={{ color: "var(--color-text-danger)" }}>{result.error}</span>
        )}
      </div>
    </div>
  );
}

function Battery({ day }: { day: RingDaily }) {
  const hist = day.device.batteryHistory;
  const samples = hist?.samples ?? [];

  if (samples.length === 0) {
    return (
      <div style={card}>
        <div style={cardTitle}>Battery</div>
        <div style={muted}>
          {day.device.battery === null ? "No reading yet." : `${day.device.battery}% at last sync.`}
        </div>
      </div>
    );
  }

  const rose = samples.some((s, i) => i > 0 && s.percent > samples[i - 1].percent);
  const series = samples.map((s) => ({
    label: s.at.slice(11, 16),
    at: s.at,
    percent: s.percent,
  }));

  return (
    <div style={card}>
      <div style={rowBetween}>
        <div style={cardTitle}>Battery</div>
        <div style={{ ...muted, fontSize: 12 }}>
          {hist.latest}% latest{hist.charging ? " · charging" : ""}
        </div>
      </div>

      {series.length < 2 ? (
        <div style={{ ...muted, fontSize: 13, marginTop: 6 }}>
          One reading so far — a drain rate needs at least two.
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={140}>
          <LineChart data={series} margin={{ top: 8, right: 8, bottom: 0, left: -24 }}>
            <XAxis dataKey="label" tick={{ fill: "#8d95a3", fontSize: 11 }} stroke="#2b313b" />
            <YAxis domain={[0, 100]} tick={{ fill: "#8d95a3", fontSize: 11 }} stroke="#2b313b" width={40} />
            <Tooltip
              contentStyle={tooltip}
              labelFormatter={(_, p) => (p && p.length ? p[0].payload.at.slice(0, 16) : "")}
              formatter={(v) => [`${v}%`, "Battery"]}
            />
            <Line type="monotone" dataKey="percent" stroke="#4169e1" strokeWidth={2} dot={{ r: 3 }} />
          </LineChart>
        </ResponsiveContainer>
      )}

      <div style={{ ...muted, fontSize: 12, marginTop: 8 }}>
        {hist.drainPctPerHour !== null ? (
          <>
            Draining about <strong>{hist.drainPctPerHour}%/hour</strong> — roughly{" "}
            {(100 / hist.drainPctPerHour).toFixed(1)}h from full.
          </>
        ) : rose ? (
          "The level rose during the day, so it was charged — no drain rate can be read from this."
        ) : (
          "Not enough of a continuous discharge yet to estimate a drain rate."
        )}
        {" "}
        Readings taken during a sync can read low: the gauge appears voltage-based and sags under
        load, so treat a single dip with suspicion.
      </div>
    </div>
  );
}

function Summary({ day, synced, total }: { day: RingDaily; synced: number; total: number }) {
  const { activity, restingHR, sleep, training, device, quality } = day;
  const stepPct =
    activity.steps === null ? null : Math.min((activity.steps / activity.stepGoal) * 100, 100);

  return (
    <div style={card}>
      <div style={rowBetween}>
        <div style={cardTitle}>Latest — {day.date}</div>
        <div style={{ ...muted, fontSize: 12 }}>
          {device.battery === null ? "—" : `${device.battery}% battery`}
          {" · "}
          {synced}/{total} days with data
        </div>
      </div>

      <div style={statGrid}>
        <Stat
          label="Resting HR"
          value={fmt(restingHR.bpm)}
          unit="bpm"
          sub={
            restingHR.rolling7d === null
              ? `n=${restingHR.n}`
              : `7d ${fmt(restingHR.rolling7d, 1)} · 30d ${fmt(restingHR.rolling30d, 1)}`
          }
        />
        <Stat label="Sleep" value={fmtDuration(sleep.totalMin)} sub={sleepSub(day)} />
        <Stat
          label="Steps"
          value={activity.steps === null ? "—" : activity.steps.toLocaleString()}
          sub={`goal ${activity.stepGoal.toLocaleString()}`}
          bar={stepPct}
        />
        <Stat
          label="Zone 2"
          value={fmt(training.zone2Minutes)}
          unit="min"
          sub={training.zoneModel === "tanaka-estimate-v1" ? "estimated zones" : "calibrated"}
        />
      </div>

      {quality.flags.length > 0 && (
        <div style={flagRow}>
          {quality.flags.map((f) => (
            <span key={f} style={flagPill}>
              {describeFlag(f)}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function sleepSub(day: RingDaily): string {
  const { sleep } = day;
  if (sleep.totalMin === null) return "not recorded";
  const parts = [`deep ${fmtDuration(sleep.deepMinEstimate)}`];
  // null REM means the firmware exposes no REM stage at all. Saying "0m" there
  // would assert something the ring never measured.
  if (sleep.remMin !== null) parts.push(`REM ${fmtDuration(sleep.remMin)}`);
  return `${parts.join(" · ")} (estimates)`;
}

function Zones({ day }: { day: RingDaily }) {
  const entries = Object.entries(day.training.zoneMinutes);
  const total = entries.reduce((sum, [, v]) => sum + (v ?? 0), 0);

  return (
    <div style={card}>
      <div style={cardTitle}>Training zones</div>
      {total === 0 ? (
        <div style={muted}>No time in zones 2–5 on this day.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
          {entries.map(([zone, minutes]) => (
            <div key={zone} style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 130, fontSize: 13 }}>{ZONE_LABELS[zone] ?? `Zone ${zone}`}</div>
              <div style={zoneTrack}>
                <div
                  style={{
                    width: `${total ? ((minutes ?? 0) / total) * 100 : 0}%`,
                    background: ZONE_COLORS[zone] ?? "#4169e1",
                    height: "100%",
                    borderRadius: 3,
                  }}
                />
              </div>
              <div style={{ width: 52, textAlign: "right", fontSize: 13 }}>
                {fmt(minutes)} min
              </div>
            </div>
          ))}
        </div>
      )}
      {/* §9 rule 6 — never present a number with more precision than its
          provenance supports. The caveat travels with the numbers. */}
      <div style={{ ...muted, fontSize: 12, marginTop: 10 }}>
        {zoneModelNote(day.training.zoneModel, day.training.hrMaxEstimate)}
      </div>
    </div>
  );
}

function Trends({ days }: { days: RingDaily[] }) {
  // Nulls are filtered out rather than zero-filled, so a gap in the line is a
  // real gap. Recharts skips missing points; it would happily plot a zero.
  const rhr = days
    .filter((d) => d.restingHR.bpm !== null)
    .map((d) => ({ label: abbrevDate(d.date), date: d.date, bpm: d.restingHR.bpm }));

  const steps = days
    .filter((d) => d.activity.steps !== null)
    .slice(-14)
    .map((d) => ({
      label: abbrevDate(d.date),
      date: d.date,
      steps: d.activity.steps as number,
      goal: d.activity.stepGoal,
    }));

  return (
    <div style={trendGrid}>
      <div style={card}>
        <div style={cardTitle}>Resting HR — 30 days</div>
        {rhr.length < 2 ? (
          <div style={empty}>Not enough resting-HR data yet</div>
        ) : (
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={rhr} margin={{ top: 8, right: 8, bottom: 0, left: -24 }}>
              <XAxis
                dataKey="label"
                interval="preserveStartEnd"
                tick={{ fill: "#8d95a3", fontSize: 11 }}
                stroke="#2b313b"
              />
              <YAxis tick={{ fill: "#8d95a3", fontSize: 11 }} stroke="#2b313b" width={40} />
              <Tooltip
                contentStyle={tooltip}
                labelFormatter={(_, p) => (p && p.length ? p[0].payload.date : "")}
                formatter={(v) => [`${v} bpm`, "Resting HR"]}
              />
              <Line
                type="monotone"
                dataKey="bpm"
                stroke="#4169e1"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
        <div style={{ ...muted, fontSize: 12, marginTop: 6 }}>
          A falling 30-day baseline is the strongest aerobic-fitness signal this ring can give —
          it is measured overnight, motionless, under the sensor’s best conditions.
        </div>
      </div>

      <div style={card}>
        <div style={cardTitle}>Steps — 14 days</div>
        {steps.length < 2 ? (
          <div style={empty}>Not enough step data yet</div>
        ) : (
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={steps} margin={{ top: 8, right: 8, bottom: 0, left: -24 }}>
              <XAxis
                dataKey="label"
                interval="preserveStartEnd"
                tick={{ fill: "#8d95a3", fontSize: 11 }}
                stroke="#2b313b"
              />
              <YAxis tick={{ fill: "#8d95a3", fontSize: 11 }} stroke="#2b313b" width={40} />
              <Tooltip
                contentStyle={tooltip}
                labelFormatter={(_, p) => (p && p.length ? p[0].payload.date : "")}
                formatter={(v) => [(v as number).toLocaleString(), "Steps"]}
              />
              <ReferenceLine
                y={steps[0].goal}
                stroke="#6b8bf0"
                strokeDasharray="4 2"
                strokeWidth={1}
              />
              <Bar dataKey="steps">
                {steps.map((d) => (
                  <Cell key={d.date} fill={d.steps >= d.goal ? "#4169e1" : "#2b313b"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  unit,
  sub,
  bar,
}: {
  label: string;
  value: string;
  unit?: string;
  sub?: string;
  bar?: number | null;
}) {
  return (
    <div style={statBox}>
      <div style={{ ...muted, fontSize: 12 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 700, lineHeight: 1.2 }}>
        {value}
        {unit && value !== "—" && (
          <span style={{ fontSize: 13, fontWeight: 400, color: "var(--muted)" }}> {unit}</span>
        )}
      </div>
      {bar !== undefined && bar !== null && (
        <div style={goalTrack}>
          <div style={{ width: `${bar}%`, height: "100%", background: "#4169e1", borderRadius: 2 }} />
        </div>
      )}
      {sub && <div style={{ ...muted, fontSize: 11, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

const card: React.CSSProperties = {
  background: "var(--card)",
  border: "1px solid var(--border)",
  borderRadius: 10,
  padding: "14px 16px",
};

const cardTitle: React.CSSProperties = { fontSize: 14, fontWeight: 600, marginBottom: 4 };
const muted: React.CSSProperties = { color: "var(--muted)" };
const errorTitle: React.CSSProperties = {
  color: "var(--color-text-danger)",
  fontWeight: 600,
  marginBottom: 4,
};
const rowBetween: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "baseline",
  flexWrap: "wrap",
  gap: 8,
};

// auto-fit is the only grid pattern in this codebase that survives an iPhone
// viewport — fixed column counts overflow at 390pt.
const statGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
  gap: 12,
  marginTop: 12,
};

const trendGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
  gap: 16,
};

const statBox: React.CSSProperties = {
  background: "var(--card-raised)",
  border: "1px solid var(--border-soft)",
  borderRadius: 8,
  padding: "10px 12px",
};

const goalTrack: React.CSSProperties = {
  height: 4,
  background: "var(--border)",
  borderRadius: 2,
  marginTop: 6,
  overflow: "hidden",
};

const zoneTrack: React.CSSProperties = {
  flex: 1,
  height: 8,
  background: "var(--border)",
  borderRadius: 3,
  overflow: "hidden",
};

const flagRow: React.CSSProperties = { display: "flex", flexWrap: "wrap", gap: 6, marginTop: 12 };

const flagPill: React.CSSProperties = {
  fontSize: 11,
  color: "var(--muted)",
  border: "1px solid var(--border)",
  borderRadius: 999,
  padding: "2px 8px",
};

const code: React.CSSProperties = {
  background: "var(--card-raised)",
  border: "1px solid var(--border-soft)",
  borderRadius: 4,
  padding: "1px 5px",
  fontSize: 12,
};

const empty: React.CSSProperties = {
  height: 180,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  color: "var(--muted)",
  fontSize: 13,
};

const syncBtn: React.CSSProperties = {
  background: "var(--accent)",
  color: "#fff",
  border: "none",
  borderRadius: 8,
  padding: "8px 14px",
  fontSize: 13,
  fontWeight: 600,
};

const tooltip: React.CSSProperties = {
  background: "#1b1f26",
  border: "1px solid #2b313b",
  borderRadius: 8,
  color: "#dde2ea",
};

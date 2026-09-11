"use client";

import { useQuery } from "@tanstack/react-query";
import { getVaultStats } from "../lib/api";

function BarRow({ label, count, max }: { label: string; count: number; max: number }) {
  const pct = max > 0 && count > 0 ? (count / max) * 100 : 0;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
      <div style={{ width: 130, flexShrink: 0, fontSize: 12, color: "var(--muted)" }}>
        {label}
      </div>
      <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
        <div
          style={{
            height: 10,
            borderRadius: 3,
            background: "#4169e1",
            width: count > 0 ? `${pct}%` : 8,
            opacity: count > 0 ? 1 : 0.08,
            minWidth: count > 0 ? 4 : 8,
            transition: "width 0.2s",
          }}
        />
        <span style={{ fontSize: 11, color: "var(--muted)" }}>{count}</span>
      </div>
    </div>
  );
}

function Section({ title, entries }: { title: string; entries: [string, number][] }) {
  const max = Math.max(0, ...entries.map(([, c]) => c));
  return (
    <div>
      <div style={sectionLabel}>{title}</div>
      {entries.map(([label, count]) => (
        <BarRow key={label} label={label} count={count} max={max} />
      ))}
    </div>
  );
}

export default function KnowledgeGrowth() {
  const { data } = useQuery({ queryKey: ["vault-stats"], queryFn: getVaultStats });

  if (!data) return null;

  if (data.total === 0) {
    return (
      <div style={{ color: "var(--muted)", fontSize: 13 }}>
        Your vault is empty — start adding notes to see your knowledge grow.
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <Section title="Domains" entries={Object.entries(data.domains)} />
      <Section title="Media" entries={Object.entries(data.media)} />
      <div style={{ fontSize: 12, color: "var(--muted)", textAlign: "right" }}>
        {data.total} notes
      </div>
    </div>
  );
}

const sectionLabel: React.CSSProperties = {
  fontSize: 11,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  color: "var(--muted)",
  marginBottom: 8,
};

"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getMonthlyFocus, patchMonthlyFocus } from "../lib/api";

// Themes are a fixed-length list in the file; render this many slots so empty
// ones are still editable rather than invisible.
const THEME_SLOTS = 3;

export default function MonthlyFocus() {
  const queryClient = useQueryClient();
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["monthly-focus"],
    queryFn: getMonthlyFocus,
  });

  const mutation = useMutation({
    mutationFn: (updates: { vision?: string; themes?: string[] }) =>
      patchMonthlyFocus(updates),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["monthly-focus"] }),
  });

  const [vision, setVision] = useState("");
  const [themes, setThemes] = useState<string[]>([]);

  useEffect(() => {
    if (data) {
      setVision(data.vision ?? "");
      const t = data.themes ?? [];
      setThemes(
        Array.from({ length: Math.max(THEME_SLOTS, t.length) }, (_, i) => t[i] ?? "")
      );
    }
  }, [data]);

  if (isLoading) return <div style={muted}>Loading focus…</div>;

  if (isError) {
    return (
      <div style={{ ...muted, color: "var(--color-text-danger)" }}>
        Can&apos;t reach the API — {(error as Error)?.message ?? "unknown error"}
      </div>
    );
  }

  if (!data) {
    return <div style={muted}>No monthly focus set — create Focus/monthly-focus.md</div>;
  }

  // Trailing blanks are dropped so clearing a slot removes it from the file
  // rather than writing an empty string into the YAML list.
  const commitThemes = (next: string[]) => {
    const trimmed = [...next];
    while (trimmed.length > 0 && trimmed[trimmed.length - 1].trim() === "") trimmed.pop();
    mutation.mutate({ themes: trimmed });
  };

  return (
    <div>
      <div style={label}>
        {data.month} {data.year} focus
      </div>

      <textarea
        value={vision}
        onChange={(e) => setVision(e.target.value)}
        onBlur={() => {
          if (vision !== (data.vision ?? "")) mutation.mutate({ vision });
        }}
        rows={2}
        placeholder="What this month is for…"
        style={visionInput}
      />

      <div style={{ display: "flex", flexDirection: "column", gap: 2, marginTop: 6 }}>
        {themes.map((t, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ color: "var(--accent-bright)", fontSize: 12, lineHeight: 1 }}>–</span>
            <input
              type="text"
              value={t}
              placeholder={`Theme ${i + 1}`}
              onChange={(e) =>
                setThemes((s) => s.map((x, j) => (j === i ? e.target.value : x)))
              }
              onBlur={() => {
                const current = data.themes ?? [];
                if (themes[i] !== (current[i] ?? "")) commitThemes(themes);
              }}
              style={themeInput}
            />
          </div>
        ))}
      </div>

      {mutation.isError && (
        <div style={{ ...muted, color: "var(--color-text-danger)", marginTop: 8 }}>
          Save failed: {(mutation.error as Error)?.message ?? "unknown error"}
        </div>
      )}
    </div>
  );
}

const label: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  color: "var(--accent-bright)",
};

const muted: React.CSSProperties = {
  color: "var(--muted)",
  fontSize: 13,
};

const visionInput: React.CSSProperties = {
  width: "100%",
  marginTop: 8,
  background: "transparent",
  border: "1px solid transparent",
  borderRadius: 8,
  color: "var(--fg)",
  fontSize: 15,
  lineHeight: 1.5,
  padding: "4px 6px",
  resize: "vertical",
  outline: "none",
};

const themeInput: React.CSSProperties = {
  flex: 1,
  background: "transparent",
  border: "none",
  borderBottom: "1px solid transparent",
  color: "var(--muted)",
  fontSize: 12.5,
  padding: "3px 0",
  outline: "none",
};

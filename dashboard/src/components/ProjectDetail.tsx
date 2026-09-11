"use client";

import { useQuery } from "@tanstack/react-query";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import { getProject } from "../lib/api";

const STATUS_STYLES: Record<string, React.CSSProperties> = {
  active: { background: "rgba(65,105,225,0.15)", color: "#4169e1" },
  planned: { background: "rgba(245,158,11,0.15)", color: "#b45309" },
  paused: { background: "rgba(138,138,138,0.15)", color: "var(--color-text-secondary)" },
};

export default function ProjectDetail({
  slug,
  onBack,
}: {
  slug: string;
  onBack: () => void;
}) {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["project", slug],
    queryFn: () => getProject(slug),
  });

  return (
    <div style={wrapper}>
      <button onClick={onBack} style={backButton}>
        ← Projects
      </button>

      {isLoading && <div style={muted}>Loading project…</div>}

      {isError && (
        <div style={{ ...muted, color: "var(--color-text-danger)" }}>
          Can&apos;t reach the API — {(error as Error)?.message ?? "unknown error"}
        </div>
      )}

      {!isLoading && !isError && !data && (
        <div style={muted}>
          No note found for <code>{slug}</code> — expected
          obsidian-vault/Projects/{slug}.md
        </div>
      )}

      {data && (
        <>
          <header style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <h1 style={{ fontSize: 24, fontWeight: 700, lineHeight: 1.2 }}>{data.title}</h1>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <span style={{ ...pill, ...(STATUS_STYLES[data.status] ?? STATUS_STYLES.paused) }}>
                {data.status}
              </span>
              {data.phase && <span style={muted}>{data.phase}</span>}
            </div>
            {data.summary && (
              <p style={{ ...muted, fontSize: 14, maxWidth: "70ch" }}>{data.summary}</p>
            )}
          </header>

          <hr style={rule} />

          {/* The note body is authored in Obsidian; this only renders it. */}
          <div className="sb-markdown" style={{ overflowX: "auto" }}>
            <ReactMarkdown
              remarkPlugins={[remarkGfm, remarkMath]}
              rehypePlugins={[rehypeKatex]}
            >
              {data.body}
            </ReactMarkdown>
          </div>
        </>
      )}
    </div>
  );
}

const wrapper: React.CSSProperties = {
  background: "var(--grad-card)",
  border: "1px solid var(--border)",
  borderRadius: 14,
  padding: "1.25rem 1.5rem",
  boxShadow: "var(--shadow-card)",
  display: "flex",
  flexDirection: "column",
  gap: 12,
};

const backButton: React.CSSProperties = {
  alignSelf: "flex-start",
  background: "transparent",
  border: "none",
  padding: 0,
  font: "inherit",
  fontSize: 13,
  color: "var(--muted)",
  cursor: "pointer",
};

const pill: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 500,
  padding: "2px 8px",
  borderRadius: 999,
  textTransform: "capitalize",
};

const rule: React.CSSProperties = {
  border: "none",
  height: 1,
  background: "var(--border)",
  margin: 0,
};

const muted: React.CSSProperties = { color: "var(--muted)", fontSize: 13 };

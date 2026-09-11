"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getProjects, patchProject, Project, ProjectUpdates } from "../lib/api";

const STATUS_STYLES: Record<string, React.CSSProperties> = {
  active: { background: "rgba(65,105,225,0.15)", color: "#4169e1" },
  planned: { background: "rgba(245,158,11,0.15)", color: "#b45309" },
  paused: { background: "rgba(138,138,138,0.15)", color: "var(--color-text-secondary)" },
};

// status sort order so the grid reads grouped by status
const STATUS_ORDER = ["active", "planned", "paused", "completed"];

function statusRank(status: string): number {
  const i = STATUS_ORDER.indexOf(status);
  return i === -1 ? STATUS_ORDER.length : i;
}

function slugOf(p: Project): string {
  return p._file.replace(/\.md$/, "");
}

function ProjectCard({
  project,
  onOpen,
  onSave,
}: {
  project: Project;
  onOpen: (slug: string) => void;
  onSave: (slug: string, updates: ProjectUpdates) => void;
}) {
  const slug = slugOf(project);
  const [summary, setSummary] = useState(project.summary ?? "");
  const [phase, setPhase] = useState(project.phase ?? "");

  // Re-sync when a refetch brings new values in (e.g. edited in Obsidian),
  // but not while the field is focused or it would yank text mid-edit.
  useEffect(() => {
    setSummary(project.summary ?? "");
    setPhase(project.phase ?? "");
  }, [project.summary, project.phase]);

  const pill = STATUS_STYLES[project.status] ?? STATUS_STYLES.paused;

  return (
    <div style={cardStyle}>
      <button
        className="sb-title-link"
        onClick={() => onOpen(slug)}
        title="Open project note"
        style={titleButton}
      >
        {project.title}
      </button>

      <select
        value={project.status}
        onChange={(e) => onSave(slug, { status: e.target.value })}
        style={{ ...pillBase, ...pill, ...selectReset }}
      >
        {STATUS_ORDER.map((s) => (
          <option key={s} value={s} style={{ background: "var(--bg)", color: "var(--fg)" }}>
            {s}
          </option>
        ))}
      </select>

      <textarea
        className="sb-field"
        value={summary}
        onChange={(e) => setSummary(e.target.value)}
        onBlur={() => {
          if (summary !== (project.summary ?? "")) onSave(slug, { summary });
        }}
        rows={2}
        placeholder="One-line summary…"
        style={{ ...fieldBase, resize: "vertical" }}
      />

      <input
        className="sb-field"
        type="text"
        value={phase}
        onChange={(e) => setPhase(e.target.value)}
        onBlur={() => {
          if (phase !== (project.phase ?? "")) onSave(slug, { phase });
        }}
        placeholder="Current phase…"
        style={{ ...fieldBase, color: "var(--muted)" }}
      />
    </div>
  );
}

export default function ProjectTracker({ onOpen }: { onOpen: (slug: string) => void }) {
  const queryClient = useQueryClient();
  const { data } = useQuery({ queryKey: ["projects"], queryFn: getProjects });

  const mutation = useMutation({
    mutationFn: ({ slug, updates }: { slug: string; updates: ProjectUpdates }) =>
      patchProject(slug, updates),
    onSuccess: (_res, vars) => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      queryClient.invalidateQueries({ queryKey: ["project", vars.slug] });
    },
  });

  const projects = [...(data ?? [])].sort(
    (a, b) => statusRank(a.status) - statusRank(b.status)
  );

  if (projects.length === 0) {
    return (
      <div style={{ color: "var(--muted)", fontSize: 13 }}>
        No projects yet — add .md files to obsidian-vault/Projects/ to track them here.
      </div>
    );
  }

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
        gap: 10,
      }}
    >
      {projects.map((p: Project) => (
        <ProjectCard
          key={p._file}
          project={p}
          onOpen={onOpen}
          onSave={(slug, updates) => mutation.mutate({ slug, updates })}
        />
      ))}
    </div>
  );
}

const cardStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "flex-start",
  gap: 6,
  background: "var(--color-background-secondary)",
  borderRadius: "var(--border-radius-md)",
  padding: "0.7rem 0.85rem",
};

const titleButton: React.CSSProperties = {
  background: "none",
  border: "none",
  padding: 0,
  textAlign: "left",
  font: "inherit",
  fontSize: 14,
  fontWeight: 500,
  color: "var(--fg)",
  cursor: "pointer",
  textDecoration: "underline",
  textDecorationColor: "transparent",
  textUnderlineOffset: 3,
  transition: "text-decoration-color 120ms",
};

const pillBase: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 500,
  padding: "2px 8px",
  borderRadius: 999,
  textTransform: "capitalize",
};

// Strip the native select chrome so it reads as the status pill it replaced.
const selectReset: React.CSSProperties = {
  border: "none",
  appearance: "none",
  cursor: "pointer",
  font: "inherit",
  fontSize: 11,
  fontWeight: 500,
};

// Inputs are invisible until hovered or focused, so the card still reads as a
// summary rather than as a form.
const fieldBase: React.CSSProperties = {
  width: "100%",
  background: "transparent",
  border: "1px solid transparent",
  borderRadius: 6,
  padding: "2px 4px",
  margin: 0,
  font: "inherit",
  fontSize: 12,
  lineHeight: 1.45,
  color: "var(--fg)",
  outlineColor: "var(--accent-bright)",
};

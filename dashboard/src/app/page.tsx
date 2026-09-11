"use client";

import { useState } from "react";
import DailyLogger from "../components/DailyLogger";
import FocusChart from "../components/FocusChart";
import WeeklyGoals from "../components/WeeklyGoals";
import HabitHeatmap from "../components/HabitHeatmap";
import TaskCompletionBar from "../components/TaskCompletionBar";
import WeeklySummary from "../components/WeeklySummary";
import CalendarHeatmap from "../components/CalendarHeatmap";
import ProjectTracker from "../components/ProjectTracker";
import KnowledgeGrowth from "../components/KnowledgeGrowth";
import MonthlyFocus from "../components/MonthlyFocus";
import DailyBriefing from "../components/DailyBriefing";
import HealthPage from "../components/HealthPage";
import RingPage from "../components/RingPage";
import ProjectDetail from "../components/ProjectDetail";
import ApiKeyGate from "../components/ApiKeyGate";

function todayLabel(): string {
  return new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

function Card({
  title,
  children,
  grow,
}: {
  title: string;
  children: React.ReactNode;
  grow?: boolean;
}) {
  return (
    <div style={{ ...cardStyle, ...(grow ? cardGrow : null) }}>
      <div style={cardTitle}>{title}</div>
      <div style={grow ? { flex: 1, minHeight: 0 } : undefined}>{children}</div>
    </div>
  );
}

function TabButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        background: "transparent",
        border: "none",
        borderBottom: active ? "2px solid var(--accent)" : "2px solid transparent",
        color: active ? "var(--fg)" : "var(--muted)",
        fontWeight: active ? 600 : 400,
        fontSize: 14,
        padding: "4px 10px",
      }}
    >
      {label}
    </button>
  );
}

function ProgressView({ onOpenProject }: { onOpenProject: (slug: string) => void }) {
  return (
    <>
      {/* SUMMARY */}
      <WeeklySummary />

      {/* MAIN GRID */}
      <main style={{ display: "flex", gap: GAP, alignItems: "stretch" }}>
        {/* Left column */}
        <div style={{ flex: "0 0 380px", width: 380, display: "flex" }}>
          <DailyLogger />
        </div>

        {/* Right column */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: GAP, minWidth: 0 }}>
          <div style={cardStyle}>
            <MonthlyFocus />
          </div>

          <Card title="Focus Score — last 30 days">
            <FocusChart />
          </Card>

          <div style={{ display: "flex", gap: GAP, alignItems: "stretch" }}>
            <div style={{ flex: 1, minWidth: 0, display: "flex" }}>
              <Card title="This Week's Goals" grow>
                <WeeklyGoals />
              </Card>
            </div>
            <div style={{ flex: 1, minWidth: 0, display: "flex" }}>
              <Card title="Task Completion — last 14 days" grow>
                <TaskCompletionBar />
              </Card>
            </div>
          </div>

          <Card title="Habit Streaks — last 90 days">
            <HabitHeatmap />
          </Card>
        </div>
      </main>

      {/* CALENDAR */}
      <Card title="Activity — last 6 months">
        <CalendarHeatmap />
      </Card>

      {/* PROJECTS + VAULT */}
      <div style={{ display: "flex", gap: GAP, alignItems: "stretch" }}>
        <div style={{ flex: 1, minWidth: 0, display: "flex" }}>
          <Card title="Projects" grow>
            <ProjectTracker onOpen={onOpenProject} />
          </Card>
        </div>
        <div style={{ flex: 1, minWidth: 0, display: "flex" }}>
          <Card title="Vault" grow>
            <KnowledgeGrowth />
          </Card>
        </div>
      </div>

    </>
  );
}

export default function Home() {
  const [view, setView] = useState<"progress" | "briefing" | "health" | "ring">("progress");
  // Detail is a view swap rather than a route: the site is a static export, so
  // a real /projects/[slug] page could only exist for projects present at build
  // time. This way a note added in Obsidian opens with no rebuild.
  const [openProject, setOpenProject] = useState<string | null>(null);

  return (
    <div style={container}>
      <ApiKeyGate />
      {/* HEADER */}
      <header style={header}>
        <h1 style={{ fontSize: 22, fontWeight: 700 }}>Second brain</h1>
        <nav style={{ display: "flex", gap: 4 }}>
          <TabButton
            label="Progress"
            active={view === "progress"}
            onClick={() => {
              setOpenProject(null);
              setView("progress");
            }}
          />
          <TabButton
            label="Briefing"
            active={view === "briefing"}
            onClick={() => {
              setOpenProject(null);
              setView("briefing");
            }}
          />
          <TabButton
            label="Health"
            active={view === "health"}
            onClick={() => {
              setOpenProject(null);
              setView("health");
            }}
          />
          <TabButton
            label="Ring"
            active={view === "ring"}
            onClick={() => {
              setOpenProject(null);
              setView("ring");
            }}
          />
        </nav>
        <div style={{ color: "var(--muted)", fontSize: 14 }}>{todayLabel()}</div>
      </header>

      {view === "progress" &&
        (openProject ? (
          <ProjectDetail slug={openProject} onBack={() => setOpenProject(null)} />
        ) : (
          <ProgressView onOpenProject={setOpenProject} />
        ))}
      {view === "briefing" && <DailyBriefing />}
      {view === "health" && <HealthPage />}
      {view === "ring" && <RingPage />}
    </div>
  );
}

const GAP = 12;

const container: React.CSSProperties = {
  maxWidth: 1280,
  margin: "0 auto",
  padding: "1.5rem",
  display: "flex",
  flexDirection: "column",
  gap: GAP,
};

const header: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
};

const cardStyle: React.CSSProperties = {
  background: "var(--grad-card)",
  border: "1px solid var(--border)",
  borderRadius: 14,
  padding: "1rem 1.25rem",
  boxShadow: "var(--shadow-card)",
};

const cardGrow: React.CSSProperties = {
  flex: 1,
  display: "flex",
  flexDirection: "column",
};

const cardTitle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  letterSpacing: "0.04em",
  textTransform: "uppercase",
  color: "var(--muted)",
  marginBottom: 12,
};

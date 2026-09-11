"use client";

import { useQuery } from "@tanstack/react-query";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { getRange, DailyProgress } from "../lib/api";

function abbrevDate(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
}

export default function TaskCompletionBar() {
  const { data } = useQuery({
    queryKey: ["daily", "range", 14],
    queryFn: () => getRange(14),
  });

  if (!data || data.length === 0) {
    return <div style={empty}>No task data yet</div>;
  }

  const chartData = [...data]
    .sort((a: DailyProgress, b: DailyProgress) => (a.date < b.date ? -1 : 1))
    .map((d) => {
      // Only count filled-in goals; blank slots don't count as tasks.
      const tasks = (Array.isArray(d.tasks) ? d.tasks : []).filter((t) => t.text.trim() !== "");
      const done = tasks.filter((t) => t.done).length;
      return {
        label: abbrevDate(d.date),
        date: d.date,
        done,
        pending: tasks.length - done,
      };
    });

  return (
    <ResponsiveContainer width="100%" height={160}>
      <BarChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
        <XAxis
          dataKey="label"
          tick={{ fill: "#8d95a3", fontSize: 11 }}
          stroke="#2b313b"
        />
        <YAxis
          allowDecimals={false}
          tick={{ fill: "#8d95a3", fontSize: 11 }}
          stroke="#2b313b"
        />
        <Tooltip
          contentStyle={{
            background: "#1b1f26",
            border: "1px solid #2b313b",
            borderRadius: 8,
            color: "#dde2ea",
          }}
          labelFormatter={(_, payload) =>
            payload && payload.length ? payload[0].payload.date : ""
          }
          formatter={(_value, name, item) => {
            // stacked bars call this once per series; emit text only once
            if (name !== "done") return [null, null];
            const p = item.payload;
            return [`${p.done} done, ${p.pending} pending`, ""];
          }}
        />
        <Bar dataKey="done" stackId="t" fill="#4169e1" />
        <Bar dataKey="pending" stackId="t" fill="#232830" />
      </BarChart>
    </ResponsiveContainer>
  );
}

const empty: React.CSSProperties = {
  height: 160,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  color: "#8d95a3",
  fontSize: 14,
};

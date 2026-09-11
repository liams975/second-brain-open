"use client";

import { useQuery } from "@tanstack/react-query";
import {
  LineChart,
  Line,
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

export default function FocusChart() {
  const { data } = useQuery({
    queryKey: ["daily", "range", 30],
    queryFn: () => getRange(30),
  });

  // ascending by date, keep only non-null focus scores
  const points = (data ?? [])
    .filter((d: DailyProgress) => d.focus_score != null)
    .sort((a, b) => (a.date < b.date ? -1 : 1));

  if (points.length < 2) {
    return <div style={empty}>No focus data yet</div>;
  }

  // 7-day rolling average over the filtered series
  const chartData = points.map((p, i) => {
    const window = points.slice(Math.max(0, i - 6), i + 1);
    const avg =
      window.reduce((sum, w) => sum + (w.focus_score as number), 0) /
      window.length;
    return {
      date: p.date,
      label: abbrevDate(p.date),
      focus: p.focus_score as number,
      avg: Math.round(avg * 10) / 10,
    };
  });

  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
        <XAxis
          dataKey="label"
          interval={6}
          tick={{ fill: "#8d95a3", fontSize: 11 }}
          stroke="#2b313b"
        />
        <YAxis
          domain={[0, 10]}
          ticks={[0, 2, 4, 6, 8, 10]}
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
          formatter={(value, name) => [
            value as number,
            name === "focus" ? "Focus" : "7-day avg",
          ]}
        />
        <Line
          type="monotone"
          dataKey="focus"
          stroke="#4169e1"
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4 }}
        />
        <Line
          type="monotone"
          dataKey="avg"
          stroke="#6b8bf0"
          strokeDasharray="4 2"
          strokeWidth={2}
          dot={false}
          activeDot={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

const empty: React.CSSProperties = {
  height: 220,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  color: "#8d95a3",
  fontSize: 14,
};

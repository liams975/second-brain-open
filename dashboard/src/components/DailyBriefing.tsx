"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  getBriefing,
  type BriefingDay,
  type BriefingHeadline,
  type BriefingHour,
  type BriefingIndex,
  type BriefingMarket,
} from "../lib/api";

/* ---------- helpers ---------- */

const num = (v: number | null | undefined, digits = 0) =>
  v == null || Number.isNaN(v) ? "—" : v.toFixed(digits);

const hourLabel = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const h = d.getHours();
  return `${h % 12 === 0 ? 12 : h % 12}${h < 12 ? "am" : "pm"}`;
};

const dayLabel = (iso: string) => {
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { weekday: "short" });
};

// Map Open-Meteo's condition text to a glyph. Substring matching keeps this
// working as the upstream wording shifts ("Slight rain" vs "Rain showers").
function weatherGlyph(conditions: string | undefined): string {
  const c = (conditions ?? "").toLowerCase();
  if (c.includes("thunder")) return "⚡";
  if (c.includes("snow")) return "❄";
  if (c.includes("drizzle")) return "🌦";
  if (c.includes("rain") || c.includes("shower")) return "🌧";
  if (c.includes("fog")) return "🌫";
  if (c.includes("overcast")) return "☁";
  if (c.includes("cloud")) return "⛅";
  return "☀";
}

// Deterministic hue offset per source so a given outlet always gets the same
// fallback tile — stable across reloads rather than random.
function sourceHue(source: string): number {
  let h = 0;
  for (let i = 0; i < source.length; i++) h = (h * 31 + source.charCodeAt(i)) % 360;
  return h;
}

// Accepts both the current `indices` array and the older sp500/nasdaq pair, so
// a briefing file committed before the schema change still renders.
function readIndices(market: BriefingMarket): BriefingIndex[] {
  if (Array.isArray(market.indices) && market.indices.length > 0) return market.indices;
  const legacy: BriefingIndex[] = [];
  if (market.sp500) legacy.push({ name: "S&P 500", ...market.sp500 });
  if (market.nasdaq) legacy.push({ name: "Nasdaq", ...market.nasdaq });
  return legacy;
}

/* ---------- panels ---------- */

// Shown beside "Weather". Set NEXT_PUBLIC_LOCATION_LABEL at build time; with
// it unset the panel just reads "Weather" rather than naming someone's city.
const LOCATION_LABEL = process.env.NEXT_PUBLIC_LOCATION_LABEL || "";

function WeatherPanel({
  temperature,
  feels_like,
  high,
  low,
  conditions,
  humidity,
  wind_kph,
  precipitation_mm,
  hours,
  days,
}: {
  temperature: number;
  feels_like: number;
  high: number;
  low: number;
  conditions: string;
  humidity: number;
  wind_kph: number;
  precipitation_mm: number;
  hours: BriefingHour[];
  days: BriefingDay[];
}) {
  return (
    <section style={panel}>
      <div style={panelHead}>
        <span style={panelTitle}>{LOCATION_LABEL ? `Weather — ${LOCATION_LABEL}` : "Weather"}</span>
        <span style={{ ...meta, fontSize: 12 }}>{conditions}</span>
      </div>

      <div style={{ display: "flex", alignItems: "flex-start", gap: 22, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <span style={{ fontSize: 44, lineHeight: 1 }}>{weatherGlyph(conditions)}</span>
          <div>
            <div style={{ fontSize: 42, fontWeight: 700, lineHeight: 1.05, letterSpacing: "-0.02em" }}>
              {num(temperature)}°
            </div>
            <div style={meta}>Feels {num(feels_like)}°</div>
          </div>
        </div>

        <div style={statGrid}>
          <Stat label="High" value={`${num(high)}°`} />
          <Stat label="Low" value={`${num(low)}°`} />
          <Stat label="Humidity" value={`${num(humidity)}%`} />
          <Stat label="Wind" value={`${num(wind_kph, 1)} km/h`} />
          <Stat label="Precip" value={`${num(precipitation_mm, 1)} mm`} />
        </div>
      </div>

      {hours.length > 0 && (
        <>
          <div style={sectionRule} />
          <div style={subLabel}>Next 12 hours</div>
          <div style={scrollRow}>
            {hours.map((h) => (
              <div key={h.time} style={hourCell}>
                <div style={{ ...meta, fontSize: 11 }}>{hourLabel(h.time)}</div>
                <div style={{ fontSize: 17, margin: "5px 0 3px" }}>{weatherGlyph(h.conditions)}</div>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{num(h.temperature)}°</div>
                <div style={{ ...meta, fontSize: 10, color: "var(--accent-bright)" }}>
                  {h.precip_chance == null ? "" : `${h.precip_chance}%`}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {days.length > 0 && (
        <>
          <div style={sectionRule} />
          <div style={subLabel}>7-day outlook</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {days.map((d, i) => (
              <div key={d.date} style={{ ...dayCell, ...(i === 0 ? dayCellToday : null) }}>
                <div style={{ ...meta, fontSize: 11, fontWeight: 600 }}>
                  {i === 0 ? "Today" : dayLabel(d.date)}
                </div>
                <div style={{ fontSize: 18, margin: "6px 0 4px" }}>{weatherGlyph(d.conditions)}</div>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{num(d.high)}°</div>
                <div style={{ ...meta, fontSize: 11 }}>{num(d.low)}°</div>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

function MarketPanel({ market }: { market: BriefingMarket }) {
  const indices = readIndices(market);
  if (indices.length === 0) {
    return (
      <section style={panel}>
        <div style={panelHead}>
          <span style={panelTitle}>Markets</span>
        </div>
        <div style={meta}>Market data unavailable</div>
      </section>
    );
  }

  return (
    <section style={panel}>
      <div style={panelHead}>
        <span style={panelTitle}>Markets</span>
        {market.session_date && <span style={{ ...meta, fontSize: 12 }}>Close {market.session_date}</span>}
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        {indices.map((idx) => {
          const up = idx.direction === "up" || (idx.change_pct ?? 0) > 0;
          const tint = up ? "var(--color-text-success)" : "var(--color-text-danger)";
          return (
            <div key={idx.name} style={indexCard}>
              <div style={{ ...meta, fontSize: 11, fontWeight: 600, letterSpacing: "0.03em" }}>
                {idx.name}
              </div>
              <div style={{ fontSize: 22, fontWeight: 700, margin: "6px 0 2px", letterSpacing: "-0.01em" }}>
                {idx.value == null
                  ? "—"
                  : idx.value.toLocaleString("en-US", { maximumFractionDigits: 2 })}
              </div>
              <div style={{ color: tint, fontSize: 13, fontWeight: 600 }}>
                {up ? "▲" : "▼"} {num(Math.abs(idx.change_pct ?? 0), 2)}%
              </div>
              {/* Proportional bar — a quick read of relative move size. */}
              <div style={moveTrack}>
                <div
                  style={{
                    height: "100%",
                    borderRadius: 999,
                    background: up
                      ? "linear-gradient(90deg, var(--accent), var(--color-text-success))"
                      : "linear-gradient(90deg, var(--accent-deep), var(--color-text-danger))",
                    width: `${Math.min(100, Math.abs(idx.change_pct ?? 0) * 40)}%`,
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {market.notable && (
        <>
          <div style={sectionRule} />
          <div style={{ fontSize: 13.5, lineHeight: 1.55, color: "var(--fg)" }}>{market.notable}</div>
        </>
      )}
    </section>
  );
}

function HeadlineCard({ h }: { h: BriefingHeadline }) {
  // Roughly half of scraped og:images are missing or hotlink-blocked (403), so
  // a load failure has to degrade to the gradient tile at render time too.
  const [broken, setBroken] = useState(false);
  const hue = sourceHue(h.source ?? "");
  const showImage = Boolean(h.image) && !broken;

  return (
    <a href={h.url} target="_blank" rel="noopener noreferrer" style={headlineCard}>
      <div
        style={{
          ...thumb,
          background: showImage
            ? "var(--card-raised)"
            : `linear-gradient(140deg, hsl(${hue} 42% 30%) 0%, var(--accent-deep) 55%, hsl(${hue} 38% 20%) 100%)`,
        }}
      >
        {showImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={h.image as string}
            alt=""
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={() => setBroken(true)}
            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
          />
        ) : (
          <span style={{ fontSize: 20, opacity: 0.85 }}>◈</span>
        )}
      </div>
      <div style={{ padding: "11px 13px 13px" }}>
        <div style={{ ...meta, fontSize: 11, fontWeight: 600, color: "var(--accent-bright)" }}>
          {h.source}
        </div>
        <div style={{ fontSize: 13.5, lineHeight: 1.4, marginTop: 5 }}>{h.title}</div>
      </div>
    </a>
  );
}

/* ---------- page ---------- */

export default function DailyBriefing() {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["briefing"],
    queryFn: getBriefing,
  });

  if (isLoading) return <div style={{ ...panel, ...meta }}>Loading briefing…</div>;

  if (isError) {
    return (
      <div style={{ ...panel, color: "var(--color-text-danger)" }}>
        Can&apos;t reach the API — {(error as Error)?.message ?? "unknown error"}
      </div>
    );
  }

  const weather = data?.weather ?? null;
  const market = data?.market ?? null;
  const headlines = data?.headlines ?? null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* The cron records why a section is empty; without this an outage and a
          quiet news day look identical. */}
      {data?.error && (
        <div style={{ ...panel, borderColor: "var(--color-text-danger)" }}>
          <div style={{ color: "var(--color-text-danger)", fontSize: 13, fontWeight: 600 }}>
            Briefing partially failed
          </div>
          <div style={{ ...meta, marginTop: 4, wordBreak: "break-word" }}>{data.error}</div>
        </div>
      )}

      {weather ? (
        <WeatherPanel
          {...weather}
          hours={weather.forecast_hourly ?? []}
          days={weather.forecast_daily ?? []}
        />
      ) : (
        <div style={{ ...panel, ...meta }}>Weather unavailable</div>
      )}

      {market ? <MarketPanel market={market} /> : <div style={{ ...panel, ...meta }}>Markets unavailable</div>}

      <section style={panel}>
        <div style={panelHead}>
          <span style={panelTitle}>Today&apos;s headlines</span>
          {headlines && <span style={{ ...meta, fontSize: 12 }}>{headlines.length} stories</span>}
        </div>
        {headlines && headlines.length > 0 ? (
          <div style={headlineGrid}>
            {headlines.map((h, i) => (
              <HeadlineCard key={`${h.url}-${i}`} h={h} />
            ))}
          </div>
        ) : (
          <div style={meta}>No headlines available</div>
        )}
      </section>

      {data?.generated_at && (
        <div style={{ ...meta, textAlign: "right", fontSize: 12 }}>
          Updated at {data.generated_at}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ ...meta, fontSize: 11 }}>{label}</div>
      <div style={{ fontSize: 15, fontWeight: 600, marginTop: 2 }}>{value}</div>
    </div>
  );
}

/* ---------- styles ---------- */

const panel: React.CSSProperties = {
  background: "var(--grad-card)",
  border: "1px solid var(--border)",
  borderRadius: 14,
  padding: "1rem 1.25rem",
  boxShadow: "var(--shadow-card)",
};

const panelHead: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "baseline",
  marginBottom: 14,
  gap: 12,
};

const panelTitle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  letterSpacing: "0.05em",
  textTransform: "uppercase",
  color: "var(--muted)",
};

const meta: React.CSSProperties = { color: "var(--muted)", fontSize: 13 };

const subLabel: React.CSSProperties = {
  ...meta,
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: "0.05em",
  textTransform: "uppercase",
  marginBottom: 10,
};

const sectionRule: React.CSSProperties = {
  height: 1,
  background: "var(--grad-hairline)",
  margin: "16px 0 14px",
};

const statGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(74px, 1fr))",
  gap: "10px 18px",
  flex: 1,
  minWidth: 240,
};

const scrollRow: React.CSSProperties = {
  display: "flex",
  gap: 6,
  overflowX: "auto",
  paddingBottom: 4,
};

const hourCell: React.CSSProperties = {
  flex: "0 0 auto",
  minWidth: 54,
  textAlign: "center",
  padding: "8px 6px",
  borderRadius: 10,
  background: "var(--grad-accent-soft)",
  border: "1px solid var(--border-soft)",
};

const dayCell: React.CSSProperties = {
  flex: "1 1 78px",
  minWidth: 78,
  textAlign: "center",
  padding: "10px 6px",
  borderRadius: 10,
  background: "var(--card-raised)",
  border: "1px solid var(--border-soft)",
};

const dayCellToday: React.CSSProperties = {
  background: "var(--grad-accent-soft)",
  borderColor: "var(--accent)",
};

const indexCard: React.CSSProperties = {
  flex: "1 1 150px",
  minWidth: 150,
  padding: "12px 14px",
  borderRadius: 12,
  background: "var(--grad-card-raised)",
  border: "1px solid var(--border-soft)",
};

const moveTrack: React.CSSProperties = {
  height: 4,
  borderRadius: 999,
  background: "var(--border)",
  marginTop: 9,
  overflow: "hidden",
};

const headlineGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))",
  gap: 12,
};

const headlineCard: React.CSSProperties = {
  display: "block",
  borderRadius: 12,
  overflow: "hidden",
  background: "var(--card-raised)",
  border: "1px solid var(--border-soft)",
  transition: "border-color 0.15s",
};

const thumb: React.CSSProperties = {
  height: 108,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  overflow: "hidden",
};

"use client";

import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { setApiKey, UNAUTHORIZED_EVENT } from "../lib/api";

// Inert until some request 401s. The key is deliberately not baked into the
// bundle at build time (the site is a public static export), so this is how it
// gets back into the browser after site data is cleared.
export default function ApiKeyGate() {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const queryClient = useQueryClient();

  useEffect(() => {
    const onUnauthorized = () => setOpen(true);
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
  }, []);

  if (!open) return null;

  const save = () => {
    const key = value.trim();
    if (!key) return;
    setApiKey(key);
    setValue("");
    setOpen(false);
    // Refetch every panel in place rather than reloading the page.
    queryClient.invalidateQueries();
  };

  return (
    <div style={overlay} role="dialog" aria-modal="true" aria-labelledby="api-key-title">
      <div style={panel}>
        <div id="api-key-title" style={title}>
          API key needed
        </div>
        <p style={message}>
          The API rejected this browser (401). Your key is stored only here, so
          clearing site data removes it. Paste it again to reconnect.
        </p>
        <input
          type="password"
          value={value}
          autoFocus
          placeholder="Paste your API key"
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") save();
          }}
          style={input}
        />
        <button onClick={save} disabled={!value.trim()} style={button}>
          Save and retry
        </button>
      </div>
    </div>
  );
}

const overlay: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(16, 18, 22, 0.72)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 100,
  padding: 16,
};

const panel: React.CSSProperties = {
  background: "var(--card)",
  border: "1px solid var(--border)",
  borderRadius: "var(--border-radius-md)",
  padding: 20,
  width: "100%",
  maxWidth: 380,
  display: "flex",
  flexDirection: "column",
  gap: 12,
};

const title: React.CSSProperties = {
  color: "var(--fg-strong)",
  fontSize: 15,
  fontWeight: 600,
};

const message: React.CSSProperties = {
  color: "var(--muted)",
  fontSize: 13,
  lineHeight: 1.5,
  margin: 0,
};

const input: React.CSSProperties = {
  background: "var(--bg-deep)",
  border: "1px solid var(--border)",
  borderRadius: 6,
  color: "var(--fg)",
  fontSize: 13,
  padding: "8px 10px",
  width: "100%",
  boxSizing: "border-box",
};

const button: React.CSSProperties = {
  background: "var(--accent)",
  border: "none",
  borderRadius: 6,
  color: "#fff",
  cursor: "pointer",
  fontSize: 13,
  fontWeight: 600,
  padding: "8px 12px",
};

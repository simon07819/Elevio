"use client";

import { useState, useEffect } from "react";
import { Badge } from "@/components/superadmin/Badge";
import { resolveAppError } from "@/lib/superadminActions";

type LogLevel = "info" | "warning" | "error" | "critical";
type LogEntry = {
  time: string;
  tag: string;
  message: string;
  level: LogLevel;
  data?: unknown;
  errorId?: string;
  resolved?: boolean;
};

const LEVELS: LogLevel[] = ["info", "warning", "error", "critical"];
const TAGS = ["general", "dispatch", "auth", "billing", "sync", "api", "ui", "operator", "passenger", "Analytics", "Error", "Performance", "Sync"];

export function SuperadminLogViewer() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [filterLevel, setFilterLevel] = useState<LogLevel | "all">("all");
  const [filterTag, setFilterTag] = useState<string>("all");
  const [loading, setLoading] = useState(true);
  const [resolving, setResolving] = useState<string | null>(null);

  useEffect(() => {
    async function fetchLogs() {
      try {
        const res = await fetch("/api/superadmin/logs");
        if (res.ok) {
          const data = await res.json();
          setLogs(data.logs ?? []);
        }
      } catch {
        // API not available
      }
      setLoading(false);
    }
    fetchLogs();
    const interval = setInterval(fetchLogs, 15000);
    return () => clearInterval(interval);
  }, []);

  async function handleResolve(errorId: string) {
    setResolving(errorId);
    const result = await resolveAppError(errorId);
    if (result.ok) {
      setLogs((prev) =>
        prev.map((l) => l.errorId === errorId ? { ...l, resolved: true } : l)
      );
    }
    setResolving(null);
  }

  const filtered = logs.filter((l) => {
    if (filterLevel !== "all" && l.level !== filterLevel) return false;
    if (filterTag !== "all" && l.tag !== filterTag) return false;
    return true;
  });

  if (loading) {
    return <p className="text-slate-400">Chargement des logs…</p>;
  }

  return (
    <div>
      {/* Filters */}
      <div className="mb-4 flex flex-wrap gap-3">
        <div>
          <label className="mb-1 block text-xs font-black uppercase text-slate-400">Niveau</label>
          <select
            className="rounded-lg border border-white/10 bg-slate-800 px-3 py-1.5 text-sm font-bold text-white"
            value={filterLevel}
            onChange={(e) => setFilterLevel(e.target.value as LogLevel | "all")}
          >
            <option value="all">Tous</option>
            {LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-black uppercase text-slate-400">Catégorie</label>
          <select
            className="rounded-lg border border-white/10 bg-slate-800 px-3 py-1.5 text-sm font-bold text-white"
            value={filterTag}
            onChange={(e) => setFilterTag(e.target.value)}
          >
            <option value="all">Tous</option>
            {TAGS.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
      </div>

      {/* Log entries */}
      <div className="space-y-1.5 max-h-[70vh] overflow-y-auto">
        {filtered.length === 0 && (
          <p className="text-center text-slate-500">Aucun log trouvé.</p>
        )}
        {filtered.map((l, i) => (
          <div
            key={i}
            className={`rounded-lg border p-3 text-xs font-mono ${
              l.resolved
                ? "border-white/5 bg-white/3 opacity-50"
                : l.level === "error" || l.level === "critical"
                ? "border-red-400/20 bg-red-400/5"
                : l.level === "warning"
                ? "border-yellow-400/20 bg-yellow-400/5"
                : "border-white/5 bg-white/3"
            }`}
          >
            <div className="flex items-center gap-2 mb-1">
              <span className="text-slate-500">{l.time}</span>
              <Badge variant={l.level === "error" || l.level === "critical" ? "red" : l.level === "warning" ? "yellow" : "default"}>
                {l.level}
              </Badge>
              <Badge variant="default">{l.tag}</Badge>
              {l.resolved && <Badge variant="green">Résolu</Badge>}
              {l.errorId && !l.resolved && (
                <button
                  className="ml-auto rounded bg-emerald-400/15 px-2 py-0.5 text-xs font-bold text-emerald-400 hover:bg-emerald-400/25 disabled:opacity-50"
                  disabled={resolving === l.errorId}
                  onClick={() => handleResolve(l.errorId!)}
                >
                  {resolving === l.errorId ? "…" : "Résoudre"}
                </button>
              )}
            </div>
            <p className="text-slate-300">{l.message}</p>
            {l.data != null && (
              <pre className="mt-1 text-slate-500 overflow-x-auto">{String(JSON.stringify(l.data, null, 2))}</pre>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

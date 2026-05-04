import { NextResponse } from "next/server";
import { getErrorLogs, getPerformanceLogs, getLogHistory } from "@/lib/structuredLogger";

export async function GET() {
  // Combine error logs, performance logs, and general history
  const errors = getErrorLogs(50).map((e) => ({
    time: e.timestamp,
    tag: e.tag,
    message: e.message,
    level: "error" as const,
    data: e.data,
  }));

  const perf = getPerformanceLogs(50).map((e) => ({
    time: e.timestamp,
    tag: e.tag,
    message: e.message,
    level: "info" as const,
    data: e.data,
  }));

  const general = getLogHistory(100).map((e) => ({
    time: e.timestamp,
    tag: e.tag,
    message: e.message,
    level: (e.tag === "Error" ? "error" : e.tag === "Performance" ? "info" : "info") as "info" | "warning" | "error",
    data: e.data,
  }));

  // Deduplicate by timestamp+message
  const seen = new Set<string>();
  const all = [...errors, ...perf, ...general]
    .filter((l) => {
      const key = `${l.time}|${l.message}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => b.time.localeCompare(a.time))
    .slice(0, 200);

  return NextResponse.json({ logs: all });
}

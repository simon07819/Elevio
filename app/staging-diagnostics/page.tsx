"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import type { RealtimeChannel } from "@supabase/supabase-js";

interface OperatorState {
  id: string;
  name: string;
  operator_session_id: string | null;
  operator_display_name: string | null;
  current_load: number;
  direction: string;
  manual_full: boolean;
  service_start: string | null;
  service_end: string | null;
}

interface RequestState {
  id: string;
  status: string;
  from_floor_id: string;
  to_floor_id: string;
  elevator_id: string | null;
  passenger_count: number;
  created_at: string;
  updated_at: string;
}

interface WebsocketEvent {
  timestamp: string;
  type: string;
  table: string;
  id: string;
  status?: string;
}

export default function StagingDiagnosticsPage() {
  const [operators, setOperators] = useState<OperatorState[]>([]);
  const [requests, setRequests] = useState<RequestState[]>([]);
  const [wsEvents, setWsEvents] = useState<WebsocketEvent[]>([]);
  const [connectionStatus, setConnectionStatus] = useState<string>("disconnected");
  const [projectId, setProjectId] = useState("");
  const [mounted, setMounted] = useState(false);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const supabaseRef = useRef<ReturnType<typeof createClient> | null>(null);

  useEffect(() => {
    setMounted(true);
    const client = createClient();
    supabaseRef.current = client;
    return () => {
      if (channelRef.current && client) {
        client.removeChannel(channelRef.current);
      }
    };
  }, []);

  const connectRealtime = useCallback(() => {
    if (!supabaseRef.current || !projectId) return;

    // Clean up existing channel
    if (channelRef.current) {
      supabaseRef.current.removeChannel(channelRef.current);
    }

    const client = supabaseRef.current;

    const channel = client
      .channel(`staging-diag:${projectId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "requests", filter: `project_id=eq.${projectId}` }, (payload) => {
        setWsEvents((prev) => [{
          timestamp: new Date().toISOString(),
          type: payload.eventType,
          table: "requests",
          id: (payload.new as Record<string, unknown>)?.id as string ?? "",
          status: (payload.new as Record<string, unknown>)?.status as string,
        }, ...prev].slice(0, 200));
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "elevators", filter: `project_id=eq.${projectId}` }, (payload) => {
        setWsEvents((prev) => [{
          timestamp: new Date().toISOString(),
          type: payload.eventType,
          table: "elevators",
          id: (payload.new as Record<string, unknown>)?.id as string ?? "",
        }, ...prev].slice(0, 200));
      })
      .subscribe((status) => {
        setConnectionStatus(status);
      });

    channelRef.current = channel;
  }, [projectId]);

  const refreshData = useCallback(async () => {
    const client = supabaseRef.current;
    if (!client || !projectId) return;

    const [opsRes, reqsRes] = await Promise.all([
      client.from("elevators").select("id,name,operator_session_id,operator_display_name,current_load,direction,manual_full,service_start,service_end").eq("project_id", projectId),
      client.from("requests").select("id,status,from_floor_id,to_floor_id,elevator_id,passenger_count,created_at,updated_at").eq("project_id", projectId).in("status", ["pending", "assigned", "arriving", "boarded"]).order("created_at", { ascending: false }),
    ]);

    if (opsRes.data) setOperators(opsRes.data as OperatorState[]);
    if (reqsRes.data) setRequests(reqsRes.data as RequestState[]);
  }, [projectId]);

  const statusColor = (status: string) => {
    const colors: Record<string, string> = {
      pending: "bg-yellow-100 text-yellow-800",
      assigned: "bg-blue-100 text-blue-800",
      arriving: "bg-indigo-100 text-indigo-800",
      boarded: "bg-green-100 text-green-800",
      completed: "bg-gray-100 text-gray-600",
      cancelled: "bg-red-100 text-red-800",
    };
    return colors[status] ?? "bg-gray-100 text-gray-800";
  };

  if (!mounted) return null;

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">Staging Diagnostics</h1>
          <span className={`px-3 py-1 rounded-full text-sm font-medium ${connectionStatus === "SUBSCRIBED" ? "bg-green-100 text-green-800" : connectionStatus === "CHANNEL_ERROR" ? "bg-red-100 text-red-800" : "bg-yellow-100 text-yellow-800"}`}>
            WS: {connectionStatus}
          </span>
        </div>

        {/* Project selector */}
        <div className="bg-white rounded-lg shadow p-4 mb-4">
          <div className="flex gap-3">
            <input
              type="text"
              placeholder="Project ID"
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              className="flex-1 px-3 py-2 border rounded text-sm font-mono"
            />
            <button onClick={connectRealtime} className="px-4 py-2 bg-blue-600 text-white rounded text-sm">Connect</button>
            <button onClick={refreshData} className="px-4 py-2 bg-gray-600 text-white rounded text-sm">Refresh</button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Operators */}
          <div className="bg-white rounded-lg shadow p-4">
            <h2 className="text-lg font-semibold mb-3">Operators ({operators.length})</h2>
            {operators.length === 0 ? (
              <p className="text-gray-400 text-sm">No operators</p>
            ) : (
              <div className="space-y-2">
                {operators.map((op) => (
                  <div key={op.id} className={`p-2 rounded border ${op.operator_session_id ? "border-green-300 bg-green-50" : "border-gray-200"}`}>
                    <div className="font-medium text-sm">{op.name}</div>
                    <div className="text-xs text-gray-500">
                      {op.operator_session_id ? `Active: ${op.operator_display_name ?? "unknown"}` : "Inactive"}
                      {" | "}Load: {op.current_load} | Dir: {op.direction}
                      {op.manual_full ? " | FULL" : ""}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Active requests */}
          <div className="bg-white rounded-lg shadow p-4">
            <h2 className="text-lg font-semibold mb-3">Active Requests ({requests.length})</h2>
            {requests.length === 0 ? (
              <p className="text-gray-400 text-sm">No active requests</p>
            ) : (
              <div className="space-y-1 max-h-96 overflow-y-auto">
                {requests.map((req) => (
                  <div key={req.id} className="p-2 rounded border border-gray-200 flex items-center justify-between">
                    <span className="text-xs font-mono text-gray-500">{req.id.slice(0, 8)}</span>
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${statusColor(req.status)}`}>{req.status}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* WebSocket events */}
          <div className="bg-white rounded-lg shadow p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold">WS Events ({wsEvents.length})</h2>
              <button onClick={() => setWsEvents([])} className="text-xs text-gray-400 hover:text-gray-600">Clear</button>
            </div>
            {wsEvents.length === 0 ? (
              <p className="text-gray-400 text-sm">No events yet</p>
            ) : (
              <div className="space-y-1 max-h-96 overflow-y-auto">
                {wsEvents.map((evt, i) => (
                  <div key={i} className="text-xs font-mono">
                    <span className="text-gray-400">{new Date(evt.timestamp).toLocaleTimeString()}</span>{" "}
                    <span className={evt.type === "INSERT" ? "text-green-600" : evt.type === "UPDATE" ? "text-blue-600" : "text-red-600"}>{evt.type}</span>{" "}
                    <span className="text-gray-600">{evt.table}</span>{" "}
                    <span className="text-gray-500">{evt.id.slice(0, 8)}</span>
                    {evt.status && <span className="text-gray-600">→{evt.status}</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

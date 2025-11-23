// src/components/LiveDashboard.tsx
import React, { useEffect, useState } from "react";

type MetricPayload = {
  metrics: {
    heartRate: { bpm: number; lastUpdated: string } | null;
    steps: { today: number; goal: number; lastUpdated: string } | null;
    sleep: { lastNightHours: number; quality: string; lastUpdated: string } | null;
    source?: string;
  };
  alerts: Array<{ level: string; message: string }>;
};

export default function LiveDashboard() {
  const [data, setData] = useState<MetricPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function fetchLatest() {
    try {
      const res = await fetch("/api/realtime/latest", { credentials: "include" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const j = await res.json();
      setData(j);
      setError(null);
      setLoading(false);
    } catch (e: any) {
      console.error("fetchLatest error", e);
      setError(String(e?.message || e));
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchLatest(); // immediate fetch
    const id = setInterval(fetchLatest, 5000); // every 5 seconds
    return () => clearInterval(id);
  }, []);

  if (loading) return <div className="p-6">Loading live metrics...</div>;
  if (error) return <div className="p-6 text-red-400">Error: {error}</div>;
  if (!data) return <div className="p-6">No data</div>;

  const m = data.metrics;
  return (
    <div className="p-6 space-y-4 max-w-xl">
      <h2 className="text-2xl font-bold">Live Tracking</h2>
      <div className="bg-gray-800 p-4 rounded">
        <div className="text-sm text-gray-400">Source: {m.source ?? "unknown"}</div>
        <div className="mt-2">
          <div><strong>Heart rate:</strong> {m.heartRate?.bpm ?? "--"} bpm <span className="text-xs text-gray-400">({m.heartRate?.lastUpdated ?? ""})</span></div>
          <div><strong>Steps:</strong> {m.steps?.today ?? "--"} / {m.steps?.goal ?? "--"} <span className="text-xs text-gray-400">({m.steps?.lastUpdated ?? ""})</span></div>
          <div><strong>Sleep (last night):</strong> {m.sleep?.lastNightHours ?? "--"} h — {m.sleep?.quality ?? ""}</div>
        </div>
      </div>

      <div>
        <h3 className="font-semibold">Alerts</h3>
        {data.alerts && data.alerts.length ? (
          <ul className="space-y-1 mt-2">
            {data.alerts.map((a, i) => (
              <li key={i} className={`p-2 rounded ${a.level === "critical" ? "bg-red-600" : a.level === "warning" ? "bg-yellow-600" : "bg-gray-700"}`}>
                {a.message}
              </li>
            ))}
          </ul>
        ) : (
          <div className="text-sm text-gray-400">No alerts</div>
        )}
      </div>
    </div>
  );
}

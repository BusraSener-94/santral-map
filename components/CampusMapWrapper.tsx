"use client";

import dynamic from "next/dynamic";

const CampusMapLeaflet = dynamic(() => import("./CampusMapLeaflet"), {
  ssr: false,
  loading: () => (
    <div style={{ height: "100vh", background: "#0f172a", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 12 }}>
      <div style={{ width: 40, height: 40, border: "4px solid #7c2d12", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.9s linear infinite" }} />
      <p style={{ color: "#94a3b8", fontSize: 13, fontFamily: "'Segoe UI', sans-serif" }}>Harita yükleniyor…</p>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  ),
});

export default function CampusMapWrapper() {
  return <CampusMapLeaflet />;
}

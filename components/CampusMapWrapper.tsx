"use client";

import dynamic from "next/dynamic";

const CampusMap = dynamic(() => import("./CampusMap"), {
  ssr: false,
  loading: () => (
    <div className="w-full max-w-[460px] h-screen mx-auto flex items-center justify-center"
      style={{ background: "#fef9ef" }}>
      <div className="flex flex-col items-center gap-3">
        <div className="w-10 h-10 border-4 rounded-full animate-spin"
          style={{ borderColor: "#b45309", borderTopColor: "transparent" }} />
        <p className="text-sm font-semibold" style={{ color: "#b45309" }}>
          Harita yükleniyor…
        </p>
      </div>
    </div>
  ),
});

export default function CampusMapWrapper() {
  return <CampusMap />;
}

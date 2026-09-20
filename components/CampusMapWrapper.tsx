"use client";

import dynamic from "next/dynamic";

const CampusMapLeaflet = dynamic(() => import("./CampusMapLeaflet"), {
  ssr: false,
  loading: () => <div style={{ height: "100dvh", background: "#0c1828" }} />,
});

export default function CampusMapWrapper() {
  return <CampusMapLeaflet />;
}

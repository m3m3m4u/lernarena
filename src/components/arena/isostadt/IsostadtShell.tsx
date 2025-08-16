"use client";

import { useEffect, useState } from "react";
import IsostadtCanvas from "./IsostadtCanvas";

export default function IsostadtShell() {
  const [topOffset, setTopOffset] = useState(0);

  useEffect(() => {
    const header = (document.querySelector('header[role="banner"], [role="banner"], header') as HTMLElement) || null;
    const h = header ? Math.ceil(header.getBoundingClientRect().height) : 0;
    setTopOffset(h);
  }, []);

  return (
    <div className="fixed bg-white" style={{ left: 0, right: 0, bottom: 0, top: topOffset }}>
      <a
        href="/arena"
        className="absolute left-3 top-3 z-10 rounded bg-white/90 backdrop-blur px-3 py-1.5 text-sm font-medium text-gray-800 shadow hover:bg-white"
      >
        ← Zurück
      </a>
      <IsostadtCanvas />
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";

export function useOnline(): boolean {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    setOnline(navigator.onLine);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    // Also sync on visibility change — Chrome can report stale navigator.onLine after sleep
    const onVis = () => setOnline(navigator.onLine);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  return online;
}

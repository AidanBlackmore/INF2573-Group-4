"use client";

import { useEffect, useState } from "react";

// Whole seconds until a deadline (ISO timestamp from the database), ticking
// a few times a second. null when there is no deadline, or before the first tick.
export function useSecondsLeft(deadline: string | null): number | null {
  // The clock is only read in the effect: Next.js prerenders pages, and a time
  // read during render would be frozen into the prerendered page.
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    if (!deadline) return;
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const timer = setInterval(tick, 250);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [deadline]);

  if (!deadline || now === null) return null;
  return Math.max(0, Math.ceil((Date.parse(deadline) - now) / 1000));
}

// 75 -> "1:15"
export function formatSeconds(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

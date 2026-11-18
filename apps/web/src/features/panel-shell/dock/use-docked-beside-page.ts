"use client";

// Whether the assistant is a column beside the page rather than a sheet behind a
// button (`panel-shell.css`, the 720px breakpoint). A column is on screen from
// the start, so the chat must be mounted from the start: mounting it only on
// the first open left the visible column empty with no hint (live walk-through, D9).

import { useEffect, useState } from "react";

const BESIDE_PAGE = "(min-width: 721px)";

export function useDockedBesidePage(): boolean {
  const [beside, setBeside] = useState(false);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const query = window.matchMedia(BESIDE_PAGE);
    setBeside(query.matches);
    const onChange = (event: MediaQueryListEvent) => setBeside(event.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);
  return beside;
}

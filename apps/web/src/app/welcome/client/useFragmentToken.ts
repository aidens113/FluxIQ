"use client";

import { useEffect, useState } from "react";
import { readFragmentToken } from "./readFragmentToken";

export type FragmentToken = { state: "reading" } | { state: "none" } | { state: "token"; token: string };

/** Takes the link token out of the URL fragment on mount and removes it from the address bar and history at once. */
export function useFragmentToken(): FragmentToken {
  const [found, setFound] = useState<FragmentToken>({ state: "reading" });
  useEffect(() => {
    const token = readFragmentToken(window.location.hash);
    if (token !== null) window.history.replaceState(null, "", window.location.pathname + window.location.search);
    setFound(token === null ? { state: "none" } : { state: "token", token });
  }, []);
  return found;
}

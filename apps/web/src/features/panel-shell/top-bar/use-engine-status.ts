"use client";

import { useEffect, useState } from "react";
import { ENGINE_UNKNOWN, engineStatusFromHttp, type EngineStatus } from "./engine-status";

const REFRESH_MS = 30_000;

/** Asks the panel's readiness endpoint now and every half minute. A failed ask is "—", not "Not ready". */
export function useEngineStatus(): EngineStatus {
  const [status, setStatus] = useState<EngineStatus>(ENGINE_UNKNOWN);
  useEffect(() => {
    let live = true;
    const ask = async () => {
      try {
        const response = await fetch("/api/ready", { cache: "no-store" });
        if (live) setStatus(engineStatusFromHttp(response.status));
      } catch {
        if (live) setStatus(ENGINE_UNKNOWN);
      }
    };
    void ask();
    const timer = setInterval(() => void ask(), REFRESH_MS);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, []);
  return status;
}

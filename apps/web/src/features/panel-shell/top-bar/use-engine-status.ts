"use client";

import type { EngineStatus } from "./engine";
import { useEngineReading } from "./use-engine-reading";

/** The engine's state for the top bar: "—" until it is known. */
export function useEngineStatus(): EngineStatus {
  return useEngineReading().status;
}

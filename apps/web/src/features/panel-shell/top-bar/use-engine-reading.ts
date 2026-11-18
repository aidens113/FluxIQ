"use client";

import { useSyncExternalStore } from "react";
import { ENGINE_NOT_READ, type EngineReading, engineSource } from "./engine";

/** The engine's state with whether it has been read yet; one shared poller serves every caller. */
export function useEngineReading(): EngineReading {
  return useSyncExternalStore(engineSource.subscribe, engineSource.getSnapshot, () => ENGINE_NOT_READ);
}

import { ENGINE_UNKNOWN, type EngineStatus } from "./status";

/** The engine's last known state. `loaded` flips once the first check ends, either way. */
export type EngineReading = { status: EngineStatus; loaded: boolean };

export const ENGINE_NOT_READ: EngineReading = { status: ENGINE_UNKNOWN, loaded: false };

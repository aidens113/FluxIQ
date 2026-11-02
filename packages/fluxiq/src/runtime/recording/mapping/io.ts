import type { IoRegistry } from "../../../io/index.ts";

/** Only the registered action/input/output facts candidate validation reads. */
export type RecordingMappingIo = Pick<IoRegistry, "hasOutput" | "getInput" | "getOutput">;

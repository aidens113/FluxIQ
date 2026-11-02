import type { IoRegistry } from "../../../io/index.ts";
export type OutputDispatchIo = Pick<IoRegistry, "getOutput" | "hasOutput" | "dispatchOutput" | "waitForInput">;

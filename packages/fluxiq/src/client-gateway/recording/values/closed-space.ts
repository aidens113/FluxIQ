import type { ClosedClientRecording } from "../internal/index.ts";
import { CLOSED_RECORDING_MEMORY } from "./closed-memory.ts";
export function reserveClosedRecordingOwner(closed: Map<string, ClosedClientRecording>, ownerKey: string): void {
  if (closed.has(ownerKey)) return;
  while (closed.size >= CLOSED_RECORDING_MEMORY) {
    const oldest = closed.keys().next();
    if (oldest.done) break;
    closed.delete(oldest.value);
  }
}

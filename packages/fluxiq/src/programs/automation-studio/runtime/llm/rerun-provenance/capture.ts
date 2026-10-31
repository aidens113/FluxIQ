import { automationStudioLlmRerunFrame } from "./context.ts";
import type { AutomationStudioLlmRerunCaptureAccess } from "./types.ts";

/** A provisional producer sink exists only inside a Core-owned ordinary call. */
export function automationStudioLlmRerunCapture(): AutomationStudioLlmRerunCaptureAccess {
  const frame = automationStudioLlmRerunFrame();
  if (frame?.kind === "capture") return frame.read();
  return Object.freeze({ kind: "unavailable", reason: frame?.kind === "unavailable" ? frame.reason : frame ? "not_capturing" : "inactive" });
}

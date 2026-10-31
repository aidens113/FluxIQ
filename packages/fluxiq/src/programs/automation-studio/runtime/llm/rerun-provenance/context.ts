import { AsyncLocalStorage } from "node:async_hooks";
import type {
  AutomationStudioLlmRerunCaptureAccess,
  AutomationStudioLlmRerunExecutionAccess,
  AutomationStudioLlmRerunExecutionInput,
  AutomationStudioLlmRerunUnavailableReason
} from "./types.ts";

/** Capability closures stay with their creating Core copy; copies share only context. */
export type AutomationStudioLlmRerunFrame =
  | Readonly<{ kind: "capture"; read(): AutomationStudioLlmRerunCaptureAccess }>
  | Readonly<{ kind: "execution"; read(input: AutomationStudioLlmRerunExecutionInput): AutomationStudioLlmRerunExecutionAccess }>
  | Readonly<{ kind: "unavailable"; reason: AutomationStudioLlmRerunUnavailableReason }>;

// The panel bundles Core while a dynamically loaded domain imports another copy.
// A module-local ALS would silently lose the producer's private execution channel.
const STORE = Symbol.for("fluxiq.automation-studio.rerun-provenance.v1");
type Store = AsyncLocalStorage<AutomationStudioLlmRerunFrame>;
const holder = globalThis as typeof globalThis & { [STORE]?: Store };
const frames: Store = holder[STORE] ??= new AsyncLocalStorage<AutomationStudioLlmRerunFrame>();

/** Core-private; never re-exported from a public runtime/SDK barrel. */
export function runWithAutomationStudioLlmRerunFrame<T>(frame: AutomationStudioLlmRerunFrame, run: () => T): T {
  return frames.run(frame, run);
}

/** Only the two adapter readers use this outside the creating closure. */
export function automationStudioLlmRerunFrame(): AutomationStudioLlmRerunFrame | undefined {
  return frames.getStore();
}

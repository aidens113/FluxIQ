// A task whose key locks waits for the person rather than failing (the user's hard
// rule: a task ends only with its result, its budget gone, or a person stopping
// it). The wait spends nothing and holds no deadline: it runs before a provider
// attempt starts its clock (`../retry/call.ts`), and a person's Stop ends it through
// the call's own signal.

import type { AutomationStudioTaskAttemptWaitReason } from "@fluxiq/contracts/automation";
import { automationStudioSessionKeyLocked, type AutomationStudioSessionKeyOptions, type AutomationStudioSessionKeyPorts } from "./session-key.ts";
import type { AutomationStudioLlmProviderId } from "../catalog/index.ts";

/** The closed wait reason a locked key waits under. */
export const AUTOMATION_STUDIO_LOCKED_KEY_WAIT_REASON: AutomationStudioTaskAttemptWaitReason = "model_key_locked";

/** What the wait tells the host, once as it begins and once as it ends. */
export type AutomationStudioLockedKeyWaitEvent = {
  phase: "waiting" | "resumed";
  status: "waiting_for_person";
  waitingFor: AutomationStudioTaskAttemptWaitReason;
};

/**
 * Returns once the caller's key can be released, when `signal` aborts, or at
 * once when nothing can wake it (ports without `whenUnlockChanges`, or nothing
 * about the key is locked). A refusal that is not a lock, such as no key at all,
 * is left to the release, which says it in words.
 */
export async function waitWhileAutomationStudioSessionKeyLocked(
  ports: AutomationStudioSessionKeyPorts,
  caller: { userId: string; sessionId: string | null },
  options: AutomationStudioSessionKeyOptions & { provider: AutomationStudioLlmProviderId; model?: string; signal?: AbortSignal | undefined; onWait?: ((event: AutomationStudioLockedKeyWaitEvent) => void | Promise<void>) | undefined }
): Promise<void> {
  if (!ports.whenUnlockChanges || !ports.sessionHoldsKey) return;
  let waited = false;
  while (options.signal?.aborted !== true && (await automationStudioSessionKeyLocked(ports, caller, options))) {
    // Asked for before it is told, so a key unlocked while it says so still wakes this.
    const changed = ports.whenUnlockChanges(caller.userId, options.signal);
    if (!waited) {
      waited = true;
      await tell(options.onWait, "waiting");
    }
    await changed;
  }
  if (waited && options.signal?.aborted !== true) await tell(options.onWait, "resumed");
}

/** A host's trouble saying so never stops the wait or the work. */
async function tell(onWait: ((event: AutomationStudioLockedKeyWaitEvent) => void | Promise<void>) | undefined, phase: AutomationStudioLockedKeyWaitEvent["phase"]): Promise<void> {
  try {
    await onWait?.({ phase, status: "waiting_for_person", waitingFor: AUTOMATION_STUDIO_LOCKED_KEY_WAIT_REASON });
  } catch (error) {
    // The thread misses a line, and the work goes on.
    console.warn(`A task could not say it is waiting for a person (${error instanceof Error ? error.name : "non_error"}).`);
  }
}

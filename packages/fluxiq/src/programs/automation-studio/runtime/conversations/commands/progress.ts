// How far a command got, so a failure is never a bare verdict.
//
// A command is several registry calls in a row -- create, save, build, apply --
// and a person told only "it failed" cannot tell whether a Flow was left
// behind, whether what they said was kept, or whether trying again would make
// a second one. So each command records every step that landed, and a failure
// says why it stopped and how far it had got.

import type { AutomationStudioConversationCommandCallResult, AutomationStudioConversationCommandOutcome } from "./command.ts";

type Ids = Pick<AutomationStudioConversationCommandOutcome, "flowId" | "runId" | "adaptationId">;

export type AutomationStudioConversationCommandProgress = {
  /** Records a step that landed, in words that finish "I ...". */
  landed(step: string): void;
  /** Remembers an id the result should carry, whether it ends well or not. */
  carry(ids: Ids): void;
  succeeded(summary: string): AutomationStudioConversationCommandOutcome;
  /** `cause` finishes "... because ...". */
  failed(cause: string): AutomationStudioConversationCommandOutcome;
};

export function automationStudioConversationCommandProgress(title: string, keyLocked: boolean): AutomationStudioConversationCommandProgress {
  const steps: string[] = [];
  const ids: Ids = {};
  return {
    landed: (step) => { steps.push(step); },
    carry: (next) => { Object.assign(ids, Object.fromEntries(Object.entries(next).filter(([, value]) => typeof value === "string" && value))); },
    succeeded: (summary) => ({ status: "done", summary, ...ids }),
    failed: (cause) => {
      const distance = steps.length ? `Before that I ${joined(steps)}.` : "Nothing was changed.";
      const locked = keyLocked ? " Your model key is locked for this browser: unlock your keys in FluxIQ, then ask again." : "";
      return { status: "failed", summary: `"${title}" stopped because ${cause}. ${distance}${locked}`, error: cause, ...ids };
    }
  };
}

/**
 * Why a registry call failed, in a clause that finishes "because ...". A build
 * that failed carries Core's own diagnostic, whose stage and code say more
 * than the sentence around them.
 */
export function automationStudioConversationCallCause(what: string, response: AutomationStudioConversationCommandCallResult): string {
  const diagnostic = (response.payload as { diagnostic?: { code?: unknown; stage?: unknown; ending?: { message?: unknown } } } | undefined)?.diagnostic;
  // A build that could not finish carries a message written for the person --
  // not doable and why, or the budget that ran out -- which says more than any
  // code, so it is what they read (`flow-bootstrap/generation-failure/build-ending.ts`).
  const ending = diagnostic?.ending?.message;
  if (typeof ending === "string" && ending.trim()) return `${what} could not finish. ${ending.trim().replace(/\.$/u, "")}`;
  const detail = diagnostic && typeof diagnostic.code === "string"
    ? ` (${typeof diagnostic.stage === "string" ? `${diagnostic.stage}: ` : ""}${diagnostic.code})`
    : "";
  const error = (response.error ?? "no reason was given").replace(/\.$/u, "");
  return `${what} failed: ${error}${detail}`;
}

function joined(steps: readonly string[]): string {
  if (steps.length <= 1) return steps[0] ?? "";
  return `${steps.slice(0, -1).join(", ")} and ${steps[steps.length - 1]}`;
}

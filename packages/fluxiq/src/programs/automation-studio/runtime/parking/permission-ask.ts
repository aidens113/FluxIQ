// Putting one permission request to a person, and waiting for the answer.
//
// There is one of these in Core and every entry point into the improvement loop
// uses it. Flow creation, a runtime failure and improving an existing Flow are
// three ways into one loop, so a permission question that parks a build and
// kills a repair is the loop half-built -- which is exactly what it was until
// 2026-09-22, when the build learned to park and
// `recovery/runtime-exploration.ts` still threw the terminal refusal the build
// had just stopped throwing.
//
// The whole mechanism is the gate's, and nothing here decides anything. The
// gate raises the request; this opens it as the ask the conversation already
// has, keyed by the request's own `requestId`, and answers whether it came back
// granted. What the caller does with a grant is the caller's: it settles its
// own gate and asks the same check again, so nothing decides permission twice.
//
// **A thread that cannot be written to is not a run that dies.** An unreachable
// thread, a port that cannot wait, a store that threw -- each leaves the caller
// with the refusal it already had, which is the outcome it would have had
// anyway. That is deliberately not the parking port's own rule, where a
// question reaching nobody fails the run: losing a build's Flow, or a repair's
// exploration, over an unreachable thread is worse than carrying on with the
// refusal and saying a person still has to answer.

import type { AutomationStudioActionPermissionRequest } from "../action-permissions/index.ts";
import type { AutomationStudioAsk } from "./ask.ts";
import type { AutomationStudioParkingPort } from "./port.ts";

/**
 * How long any caller waits for an answer, at most.
 *
 * Short on purpose. A waiting caller holds a provider grant and its own
 * request open, so this is the cost of nobody being there, paid once. A person
 * watching the thread answers in seconds; one who is not never had a build or a
 * repair to rescue. A caller with nobody in front of it passes no timeout and
 * does not wait -- the question is still asked, and the answer releases
 * whatever it comes back to.
 */
export const AUTOMATION_STUDIO_PERMISSION_ASK_TIMEOUT_MS = 120_000;

/** Where a permission question goes, and where its answer comes back from. */
export type AutomationStudioPermissionAsk = {
  port: AutomationStudioParkingPort;
  /** Absent, or not positive, opens the question without waiting for it. */
  timeoutMs?: number | undefined;
  /** The caller's own cancellation, so cancelled work stops waiting. */
  signal?: AbortSignal | undefined;
  now?: (() => number) | undefined;
};

/**
 * How long this caller waits, or nothing when it opens the question and carries
 * on.
 *
 * Capped rather than taken as given. The caller decides *whether* to wait; how
 * long work may be held open is Core's, because a caller asking for a week
 * would hold a provider grant and its own request for a week.
 */
export function automationStudioPermissionAskWaitMs(timeoutMs: number | undefined): number | undefined {
  if (typeof timeoutMs !== "number" || !Number.isFinite(timeoutMs) || timeoutMs <= 0) return undefined;
  return Math.min(Math.round(timeoutMs), AUTOMATION_STUDIO_PERMISSION_ASK_TIMEOUT_MS);
}

/** Puts one request to a person and waits, or carries on without an answer. */
export async function automationStudioAskedAndGranted(
  ask: AutomationStudioPermissionAsk,
  request: AutomationStudioActionPermissionRequest
): Promise<boolean> {
  const now = ask.now ?? Date.now;
  const waitMs = automationStudioPermissionAskWaitMs(ask.timeoutMs);
  // The ask always says what it would wait for, whether or not this caller
  // does: the row is how a person reads the question and how it expires if
  // nobody answers, and neither of those is this process's business.
  const timeoutMs = waitMs ?? AUTOMATION_STUDIO_PERMISSION_ASK_TIMEOUT_MS;
  const raised: AutomationStudioAsk = {
    // The request's own id, which its payload already calls the key a store
    // would hold it under. Nothing invents a second one.
    askId: request.requestId,
    kind: "permission",
    // True whether or not this caller waits. `parks` is what tells a person
    // that answering releases something, and it does either way: the work
    // while it waits, and whatever it produced afterwards, which cannot be
    // approved or applied until this is granted.
    parks: true,
    timeoutMs,
    onTimeout: "deny",
    options: null,
    routes: null,
    consequences: [...request.consequences],
    missing: [...request.missing],
    control: { name: request.control.name, kind: request.control.kind },
    permissionRequest: request,
    status: "pending",
    text: request.sentence,
    // The request already says which stage raised it, and a second source for
    // one fact is how the two come to disagree.
    raisedBy: { stage: request.reason.stage, definitionId: request.action.id }
  };
  try {
    await ask.port.open(raised);
    if (waitMs === undefined) return false;
    const answer = await ask.port.awaitAnswer?.(raised, {
      expiresAtMs: now() + waitMs,
      ...(ask.signal ? { signal: ask.signal } : {})
    });
    return answer?.kind === "grant";
  } catch {
    return false;
  }
}

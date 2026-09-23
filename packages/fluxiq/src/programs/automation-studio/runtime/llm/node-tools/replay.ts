// Asking the caller to run a step again, and reading what it answers.
//
// The dry run (`../../flow-draft/dry-run.ts`) decides *that* a draft must be
// replayed; this is *how* one step of it is asked for. Two calls, both sent
// through the same executor an ordinary tool call goes through:
//
//   { replay: "reset", from }        put the target back the way the draft's
//                                    first step found it. `from` is the
//                                    caller's own token, carried unread.
//   { replay: "step", ...ranWith }   run this step again with exactly what the
//                                    Flow will run it with, and say whether it
//                                    reproduced `produced`.
//
// **Why the executor rather than a seam of its own.** Everything a replay needs
// is already on that path and already right there: the permission gate wraps
// every call the loop makes (`flow-bootstrap/action-permissions.ts`), so a
// replay cannot do something the person has not permitted, and it cannot do it
// by accident either -- the same `checkFor` runs, with the same grant. A second
// seam would have been a second place for that gate to be forgotten.
//
// **Why the reserved key rather than a tool of its own.** A tool the host has
// not registered is refused by the host, so a new tool id would have needed
// every host to be edited before any replay could run. The key travels inside
// the argument of the tool that ran the step, which the host is already
// dispatching, and a host that does not implement it answers `failed` -- which
// is the honest answer, since it cannot replay.
//
// **The vocabulary is closed and Core's own.** The caller answers in
// `resultCode` with one of the codes below and nothing else, because Core has
// to read the answer and knows none of any domain's codes. What actually
// happened, in the caller's own words, belongs in the evidence beside it.

import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioFlowDraftReplayStatus, AutomationStudioFlowDraftStep } from "../../flow-draft/index.ts";

/** The key a replay call carries, which no ordinary call of any tool may use. */
export const AUTOMATION_STUDIO_NODE_REPLAY_KEY = "replay";

/** What one replay call asks for. */
export const AUTOMATION_STUDIO_NODE_REPLAY_KINDS = ["reset", "step"] as const;

export type AutomationStudioNodeReplayKind = (typeof AUTOMATION_STUDIO_NODE_REPLAY_KINDS)[number];

/** The only codes a replay may answer with, and what each one means. */
export const AUTOMATION_STUDIO_NODE_REPLAY_RESULT_CODES = {
  /** It ran, and produced what it produced before. */
  replayed: "core.replay.replayed",
  /** It did not run. */
  failed: "core.replay.failed",
  /** It ran and produced nothing where it had produced something. */
  changed: "core.replay.changed",
  /** Putting the target back could not undo this step's own effect. */
  unreproducible: "core.replay.unreproducible",
  /** The target could not be put back at all, so nothing was replayed. */
  resetFailed: "core.replay.reset_failed"
} as const;

const STATUS_BY_CODE: Readonly<Record<string, AutomationStudioFlowDraftReplayStatus>> = Object.freeze({
  [AUTOMATION_STUDIO_NODE_REPLAY_RESULT_CODES.replayed]: "replayed",
  [AUTOMATION_STUDIO_NODE_REPLAY_RESULT_CODES.failed]: "failed",
  [AUTOMATION_STUDIO_NODE_REPLAY_RESULT_CODES.changed]: "changed",
  [AUTOMATION_STUDIO_NODE_REPLAY_RESULT_CODES.unreproducible]: "unreproducible"
});

/** The call that puts the target back where the draft's first step found it. */
export function automationStudioNodeReplayResetCall(from: JsonObject): JsonObject {
  return { [AUTOMATION_STUDIO_NODE_REPLAY_KEY]: "reset", from };
}

/**
 * The call that runs one step again.
 *
 * `ranWith` is what the step really ran with and what the Flow keeps, so a
 * replay is the Flow's own step and not a second rendering of it. `produced` is
 * handed back so the caller can compare rather than Core: what "the same again"
 * means about a list of rows or a downloaded file is not something a framework
 * can judge.
 */
export function automationStudioNodeReplayStepCall(step: AutomationStudioFlowDraftStep): JsonObject | undefined {
  const ranWith = step.ranWith;
  if (!ranWith || AUTOMATION_STUDIO_NODE_REPLAY_KEY in ranWith) return undefined;
  return {
    ...ranWith,
    [AUTOMATION_STUDIO_NODE_REPLAY_KEY]: "step",
    ...(step.replay?.produced === undefined ? {} : { produced: step.replay.produced })
  };
}

/** Which tool a step's replay is sent to: the one that ran it. */
export function automationStudioNodeReplayToolId(step: AutomationStudioFlowDraftStep): string {
  return step.toolId ?? step.actionId;
}

/**
 * The status a replay's result code names, or `failed` for a code Core does not
 * know.
 *
 * Unknown means failed, deliberately. A caller that answered something else
 * either does not implement the replay or answered an error of its own, and
 * both are "this step did not demonstrably run again" -- which is the reading
 * that refuses the proposal rather than the one that waves it through.
 */
export function automationStudioNodeReplayStatus(resultCode: string | undefined): AutomationStudioFlowDraftReplayStatus {
  return (resultCode !== undefined && STATUS_BY_CODE[resultCode]) || "failed";
}

// Asking the caller to run a step again, and reading what it answers.
//
// The dry run (`../../flow-draft/dry-run.ts`) decides *that* a draft must be
// replayed; this is *how* one step of it is asked for. Three calls, all sent
// through the same executor an ordinary tool call goes through:
//
//   { replay: "reset", from }        put the target back the way the draft's
//                                    first step found it. `from` is the
//                                    caller's own token, carried unread.
//   { replay: "step", ...ranWith,    run this step again with exactly what the
//     from? }                        Flow will run it with, and say whether it
//                                    reproduced `produced`. `from` is where the
//                                    step found the target, so a host can tell
//                                    a target the site's memory removed from
//                                    the step's own page (`remembered`) from
//                                    one on a page the draft no longer reaches
//                                    (`../../flow-draft/site-memory.ts`).
//   { replay: "verify", ...ranWith,  check this step could run now, or that
//     from? }                        its effect is already in place, and run
//                                    nothing: its effect lasts, and a dry run
//                                    never repeats a lasting effect. `from`
//                                    is where the step found the target, the
//                                    caller's own token, carried unread
//                                    (`../../flow-draft/verify-only.ts`).
//
// **Why the executor rather than a seam of its own.** Everything a replay needs
// is already on that path and already right there: the permission gate wraps
// every call the loop makes (`flow-bootstrap/action-permissions.ts`), so a
// replay cannot do something the person has not permitted, and it cannot do it
// by accident either -- the same `checkFor` runs, with the same permitted
// consequences. A second
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
//
// **A test pass (t252).** A step inside a repeat is sent once per row its
// listing returned in the test, so both calls also take the pass: the row,
// carried under `item` exactly as the Flow's For Each hands it to a node that
// declares one, and the step's parameters with their bindings already resolved
// for that row, in place of the `ranWith.parameters` that hold the bindings
// themselves. Neither is sent when no pass is given, so every call made before
// is made unchanged.
//
// **A written step (t252).** `core.run_node` with `write: true` asks the host
// to check a step and freeze what it names without doing it, and the host
// answers `core.run_node.written`. A list read's rows come back beside the
// evidence under `outputs`, never shown to the model. These names are Core's,
// exported here so a host mirrors them rather than restating them.

import type { JsonObject } from "../../../../../core/index.ts";
import {
  AUTOMATION_STUDIO_FLOW_DRAFT_REPLAY_PRESENT_CODE,
  AUTOMATION_STUDIO_FLOW_DRAFT_REPLAY_REMEMBERED_CODE,
  AUTOMATION_STUDIO_FLOW_DRAFT_REPLAY_VERIFIED_CODE,
  type AutomationStudioFlowDraftReplayMode,
  type AutomationStudioFlowDraftReplayStatus,
  type AutomationStudioFlowDraftStep
} from "../../flow-draft/index.ts";

/** The key a replay call carries, which no ordinary call of any tool may use. */
export const AUTOMATION_STUDIO_NODE_REPLAY_KEY = "replay";

/** The key that asks for a step to be written rather than run (`./run-node.ts`). */
export const AUTOMATION_STUDIO_NODE_WRITE_KEY = "write";

/** The key a test pass's row travels under: the name a For Each pass's row has in run state. */
export const AUTOMATION_STUDIO_NODE_REPLAY_ITEM_KEY = "item";

/** The execution result member a node's output values travel in: carried, never shown. */
export const AUTOMATION_STUDIO_NODE_OUTPUTS_KEY = "outputs";

/**
 * The code a host answers a written step with: checked, frozen and not done.
 * Not a replay code: a replay answered with it did not run, so
 * `automationStudioNodeReplayStatus` reads it as `failed`.
 */
export const AUTOMATION_STUDIO_NODE_WRITTEN_CODE = "core.run_node.written";

/**
 * One pass of a test over a repeat: the row the pass is on, and the step's
 * parameters with their bindings resolved for it. Either may be absent.
 */
export type AutomationStudioNodeReplayPass = { item?: JsonObject; parameters?: JsonObject };

/** What one replay call asks for. */
export const AUTOMATION_STUDIO_NODE_REPLAY_KINDS = ["reset", "step", "verify"] as const;

export type AutomationStudioNodeReplayKind = (typeof AUTOMATION_STUDIO_NODE_REPLAY_KINDS)[number];

/** The only codes a replay may answer with, and what each one means. */
export const AUTOMATION_STUDIO_NODE_REPLAY_RESULT_CODES = {
  /** It ran, and produced what it produced before. */
  replayed: "core.replay.replayed",
  /** Asked to check, it could run now and was not run: its target is there and would take the action. */
  verified: AUTOMATION_STUDIO_FLOW_DRAFT_REPLAY_VERIFIED_CODE,
  /** Asked to check, its effect is already in place on the page it acted on, and nothing was run. */
  present: AUTOMATION_STUDIO_FLOW_DRAFT_REPLAY_PRESENT_CODE,
  /** Asked to run, its target is gone from the very page it acted on: the site remembers what it did. */
  remembered: AUTOMATION_STUDIO_FLOW_DRAFT_REPLAY_REMEMBERED_CODE,
  /** It did not run. */
  failed: "core.replay.failed",
  /** It ran and produced nothing where it had produced something. */
  changed: "core.replay.changed",
  /** Its target was not there, on a page other than the one it acted on. */
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
 * can judge. `from` is handed back for the same reason: only the caller can
 * say whether the target it stands on now is where this step found it.
 * `pass`, on a step a test repeats, is the row and the resolved parameters.
 */
export function automationStudioNodeReplayStepCall(step: AutomationStudioFlowDraftStep, pass: AutomationStudioNodeReplayPass = {}): JsonObject | undefined {
  const ranWith = step.ranWith;
  if (!ranWith || AUTOMATION_STUDIO_NODE_REPLAY_KEY in ranWith) return undefined;
  return {
    ...ranWith,
    ...passed(pass),
    [AUTOMATION_STUDIO_NODE_REPLAY_KEY]: "step",
    ...(step.replay?.from === undefined ? {} : { from: step.replay.from }),
    ...(step.replay?.produced === undefined ? {} : { produced: step.replay.produced })
  };
}

/**
 * The call that checks one step without running it.
 *
 * The same argument the step would run with, so the host resolves the same
 * target the Flow would act on; where the step found the target, so the host
 * can tell an effect already in place from a page the steps before it no
 * longer reach; and no `produced`: nothing is run, so there is nothing to
 * compare. `pass` as for the step call.
 */
export function automationStudioNodeReplayVerifyCall(step: AutomationStudioFlowDraftStep, pass: AutomationStudioNodeReplayPass = {}): JsonObject | undefined {
  const ranWith = step.ranWith;
  if (!ranWith || AUTOMATION_STUDIO_NODE_REPLAY_KEY in ranWith) return undefined;
  return {
    ...ranWith,
    ...passed(pass),
    [AUTOMATION_STUDIO_NODE_REPLAY_KEY]: "verify",
    ...(step.replay?.from === undefined ? {} : { from: step.replay.from })
  };
}

/**
 * What a pass puts over what the step ran with: its resolved parameters in
 * place of the bindings, and its row. Nothing for no pass.
 */
function passed(pass: AutomationStudioNodeReplayPass): JsonObject {
  return {
    ...(pass.parameters === undefined ? {} : { parameters: pass.parameters }),
    ...(pass.item === undefined ? {} : { [AUTOMATION_STUDIO_NODE_REPLAY_ITEM_KEY]: pass.item })
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
 * A check (`mode` `verify`) also passes on `verified` and `present`, and a
 * step run again on `remembered`; the outcome's own `mode` and code are what
 * tell a reader it was only checked, or that the site remembered it.
 *
 * Unknown means failed, deliberately. A caller that answered something else
 * either does not implement the replay or answered an error of its own, and
 * both are "this step did not demonstrably run again" -- which is the reading
 * that refuses the proposal rather than the one that waves it through.
 */
export function automationStudioNodeReplayStatus(resultCode: string | undefined, mode: AutomationStudioFlowDraftReplayMode = "replay"): AutomationStudioFlowDraftReplayStatus {
  // A check's two passing answers pass only a check. A step that was asked to
  // run and answered that it was not run did not demonstrably run again.
  if (resultCode === AUTOMATION_STUDIO_NODE_REPLAY_RESULT_CODES.verified || resultCode === AUTOMATION_STUDIO_NODE_REPLAY_RESULT_CODES.present) {
    return mode === "verify" ? "replayed" : "failed";
  }
  // And the other way: a check is answered `present` for the same finding, so
  // a check answered `remembered` is a host that did not check.
  if (resultCode === AUTOMATION_STUDIO_NODE_REPLAY_RESULT_CODES.remembered) return mode === "replay" ? "replayed" : "failed";
  return (resultCode !== undefined && STATUS_BY_CODE[resultCode]) || "failed";
}

// What state routing made of the page, projected from a saved attempt onto the
// run detail (t250).
//
// The executor stamps every attempt whose step could not run with a routing
// record (`executor/contracts.ts`, `AutomationStudioStateRoutingRecord`). The
// run detail carried only the routed case, as `skipped`, so a step whose
// routing found no way on read exactly like a step that never consulted the
// page, and a step passed over because the page already showed its effect
// read like one that matched another step's starting page. This keeps the
// outcome, the Core code that asked, and a node id -- never the record's
// `reason` sentence, which repeats the host's words, nor its counts.
//
// Session traces are read back from storage, so the record is parsed, not typed.
import type { AutomationStudioFlowRunActionAttemptRecord } from "../../../model/index.ts";
import type { AutomationStudioNodeAttemptTrace } from "../../executor/index.ts";

type RunDetailStateRouting = NonNullable<AutomationStudioFlowRunActionAttemptRecord["stateRouting"]>;

/** The shape of a Core code (`web.target.not_found`, `executor.ready_state.not_shown`): dotted lowercase words, at most 120 characters. */
const CORE_CODE = /^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+$/u;
/** The shape of a Flow node id: no whitespace, at most 200 characters. */
const NODE_ID = /^[^\s]{1,200}$/u;

const NOT_ROUTED = new Set(["no_match", "unobserved", "no_pre_states"]);

/**
 * The run detail's `stateRouting` for one attempt, or `undefined` when the
 * attempt carries no routing record or one outside Core's closed outcomes.
 * `failureCode` is the attempt's parsed failure code.
 */
export function automationStudioRunDetailStateRouting(attempt: AutomationStudioNodeAttemptTrace, failureCode: string | undefined): RunDetailStateRouting | undefined {
  const record: unknown = attempt.stateRouting;
  if (typeof record !== "object" || record === null || Array.isArray(record)) return undefined;
  const { outcome, toNodeId } = record as Record<string, unknown>;
  // `skipped` already carries where a passed-over step went, which way, and on which code.
  if (outcome === "routed" || outcome === "effect_holds") return { outcome };
  const code = askedCode(attempt, failureCode);
  const coded = code !== undefined && code.length <= 120 && CORE_CODE.test(code) ? { code } : {};
  if (outcome === "guard_stopped") return typeof toNodeId === "string" && NODE_ID.test(toNodeId) ? { outcome, ...coded, toNodeId } : undefined;
  if (typeof outcome === "string" && NOT_ROUTED.has(outcome)) return { outcome: outcome as "no_match" | "unobserved" | "no_pre_states", ...coded };
  return undefined;
}

/**
 * The code that asked state routing. The executor asks before dispatch when a
 * readiness gate judged at least one condition and did not hold
 * (`executor/graph-run.ts`, `automationStudioNotShownAttempt`), and the
 * attempt keeps that gate's reading; otherwise it asked on the attempt's own
 * `target_not_found` failure.
 */
function askedCode(attempt: AutomationStudioNodeAttemptTrace, failureCode: string | undefined): string | undefined {
  const readiness = attempt.readiness;
  if (readiness && readiness.satisfied === false && readiness.checkedConditionCount > 0) return "executor.ready_state.not_shown";
  return failureCode;
}

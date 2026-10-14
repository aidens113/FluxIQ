import type { JsonObject } from "../../../../../core/index.ts";
import { AUTOMATION_STUDIO_SUBFLOW_BRIEF_MIN_CALLS } from "../../flow-bootstrap/subflow-candidate/index.ts";
import type { AutomationStudioLlmBuildPurse } from "../../llm/build-purse/index.ts";
import type { AutomationStudioProjectStructurePlan } from "../contracts/index.ts";

// Core sizes each brief it dispatches (t570). On A8 round 1 the supervisor
// guessed every brief's money and turns: `project.allowance_unavailable` twice
// on crossborder (0.24 asked of 0.2259, then 0.22 of 0.2057), and briefs of 12
// to 40 turns whose call caps (three calls a turn) added up to twice the
// build's 64 calls, so the first builder spent the calls its siblings needed.
//
// So what can still be given out is split evenly over every brief that still
// needs it: the briefs being sent, the plan's subflows that have no done
// proposal and are not among them (each will need a brief of its own), and one
// share more for the build's own finishing -- the reset before the whole test,
// assembly, and the supervisor's last decisions. Dollars are split from what
// the purse can carve (its judging reserve never among it), calls from the
// calls it can carve (`purse.allocatableCalls`, which also leaves what it keeps
// back from every allowance). A reset brief is that finishing work: its calls
// come from what is kept back for it, less the supervisor's own last decisions.
//
// The supervisor may still lower one: an `allowanceUsd` or `maxIterations` it
// gives below the share stands; above it, the share stands, and the answer says
// what each brief was given. A brief whose share is too small to finish at all
// -- no money, or fewer calls than a builder's wrap-up needs
// (`AUTOMATION_STUDIO_SUBFLOW_BRIEF_MIN_CALLS`) -- is refused with the figures,
// which only a build that has spent its money or calls can reach.

/** A reset brief's least calls: one decision that undoes, and one that completes. */
const MIN_RESET_CALLS = 2;
/** A brief's turns where the purse caps no calls and the supervisor gave none. */
const DEFAULT_ITERATIONS = 30;
/** The most turns a brief may be given (`../contracts/subflow-brief.ts`). */
const MAX_ITERATIONS = 1000;
/** The money no brief is given less than. */
const MIN_USD = 1e-6;

/** What one brief was given, by its place in what was sent. */
export type AutomationStudioProjectSupervisorBriefSize = { allowanceUsd: number; maxIterations: number; maxCalls?: number };

export type AutomationStudioProjectSupervisorBriefSizing =
  | { ok: true; sizes: AutomationStudioProjectSupervisorBriefSize[] }
  | { ok: false; canGiveUsd: number; canGiveCalls?: number; shares: number };

/**
 * The size of every brief sent, or the figures that refuse them (header).
 * `sent` is the dispatch's raw briefs; `done` the subflows with a done
 * proposal; `supervisorCalls` the supervisor's own last decisions, which a
 * reset's calls leave.
 */
export function automationStudioProjectSupervisorBriefSizing(input: {
  sent: readonly JsonObject[];
  purse: AutomationStudioLlmBuildPurse;
  structure: AutomationStudioProjectStructurePlan;
  done: ReadonlySet<string>;
  supervisorCalls: number;
}): AutomationStudioProjectSupervisorBriefSizing {
  const { sent, purse, structure } = input;
  const sending = new Set(sent.map((brief) => brief.subflowKey).filter((key): key is string => typeof key === "string"));
  const waiting = structure.plan.subflows.filter((subflow) => (structure.partOf[subflow.key] ?? []).length > 0 && !input.done.has(subflow.key) && !sending.has(subflow.key)).length;
  const shares = sent.length + waiting + 1;
  const canGiveUsd = purse.allocatableUsd();
  const canGiveCalls = purse.allocatableCalls();
  const usdShare = canGiveUsd / shares;
  const callShare = canGiveCalls === undefined ? undefined : Math.floor(canGiveCalls / shares);
  const resetCalls = (() => {
    const kept = purse.allocatableCalls({ fromKeptBack: true });
    return kept === undefined ? undefined : Math.max(0, kept - input.supervisorCalls);
  })();
  const sizes: AutomationStudioProjectSupervisorBriefSize[] = [];
  for (const brief of sent) {
    const reset = brief.kind === "reset";
    const calls = reset ? resetCalls : callShare;
    const least = reset ? MIN_RESET_CALLS : AUTOMATION_STUDIO_SUBFLOW_BRIEF_MIN_CALLS;
    if (usdShare < MIN_USD || (calls !== undefined && calls < least)) return { ok: false, canGiveUsd, ...(canGiveCalls !== undefined ? { canGiveCalls } : {}), shares };
    const allowanceUsd = lowered(brief.allowanceUsd, usdShare);
    // One turn is at least one call, so a call share bounds the turns too.
    const maxIterations = Math.min(MAX_ITERATIONS, lowered(brief.maxIterations, calls ?? DEFAULT_ITERATIONS, true));
    sizes.push({ allowanceUsd, maxIterations, ...(calls !== undefined ? { maxCalls: calls } : {}) });
  }
  return { ok: true, sizes };
}

/** What the supervisor wrote, when it is a positive number below the share; else the share. */
function lowered(written: unknown, share: number, whole = false): number {
  if (typeof written !== "number" || !Number.isFinite(written) || written <= 0 || (whole && !Number.isInteger(written))) return share;
  return Math.min(written, share);
}

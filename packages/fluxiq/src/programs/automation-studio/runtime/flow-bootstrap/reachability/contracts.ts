// Whether the Flow a build wrote could reach the place it starts, and what a
// refusal tells the model.
//
// The vocabulary here is about *arrival*, never about a route. How a Flow gets
// to where it starts is the domain's business and the model's: one Flow opens
// an address, another resumes a session, another is handed a document. What is
// not a route at all is a Flow with no step that goes anywhere, whose every
// other step acts on something nobody opened: `run-muht9lpw-a39aa056` built one
// node -- a list extraction with no navigation before it -- and replay failed
// on the blank tab the run starts on, `Cannot access contents of url
// "about:blank"`. Its exploration had navigated, dismissed the page's
// interruptions and read the list; the amendments that followed reduced the
// draft to the reading alone, and every completion check passed it.
//
// That is knowable from the plan and the start location alone, without a model
// call, and it is the only thing judged here. It is the plan-side statement of
// the rule the bound domain already enforces while the build explores -- the
// node that goes to the start location "is also the Flow's own first step,
// because the Flow is built from the steps that ran"
// (`domain/src/runtime/llm-evidence/node-run/start-location.ts`, downstream) --
// so a Flow refused here is one that could not have run under the rule its own
// build ran under.
import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioFlowBootstrapIssue } from "../plan/index.ts";

/** What the Flow a build wrote does about where it starts, read off the plan. */
export type AutomationStudioFlowBootstrapPlanLocations = {
  /** Keys of the steps that act on or read the bound domain's own target. */
  acting: string[];
  /** Keys of the steps that carry where the Flow starts among their parameters. */
  reaching: string[];
  /** Every step's definition id, in authored order: what the Flow can do at all. */
  steps: string[];
};

/**
 * Whether the plan may be proposed, or what the model is told instead.
 *
 * A refusal is not the end of a build. It is fed back exactly as a refused
 * parameter is, and the exploration asks again on the same budget, cost and
 * no-progress guards -- so nothing here can spin.
 */
export type AutomationStudioFlowBootstrapReachability =
  | { ok: true }
  | {
    ok: false;
    /** The issue that refuses the completed plan. */
    issue: AutomationStudioFlowBootstrapIssue;
    /** Where the Flow starts and what it lacks, as the model is shown it. */
    cannotReach: JsonObject;
    /** What to do about it, in Core's own words. */
    instruction: string;
  };

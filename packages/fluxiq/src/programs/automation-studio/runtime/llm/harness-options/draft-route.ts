// The route the person named, beside a Flow Bootstrap's draft and at its
// completion (D phase 2).
//
// The user's rule: a route the person names must be followed; a Flow may start
// where the work begins unless the person names the route. The build's one
// read of the instructions says which (`../../service/instruction-authority.ts`,
// `../../action-permissions/instruction-route/`), and this hands the loop two
// things from it (`../loop-configuration.ts`, `draft.route` and
// `draft.routeCheck`):
//
// - **What the draft shows.** Once the read has settled and still matches the
//   active instructions: the route in the person's words with each place's
//   words in order (`r1` first), or that they named none. Nothing otherwise.
// - **What completion refuses.** A named route holds the Flow to the places
//   the model says its steps are on (`place`, `../../flow-draft/route-places/`):
//   every place has a step in the Flow, in order. And a Flow whose first step
//   goes straight to a deeper address than the start location -- a shortcut
//   past the route -- is refused unless the read said the person named no
//   route. It is no shortcut when that step says it is on the route's first
//   place, since then it is the route's own first step.
//
// **The read stays lazy.** It is an ordinary paid call, so it is sent from here
// only for a shortcut, only while nothing has read it, and at most once; every
// other completion is judged on what is already known. A route still unread
// then is no route: nothing is shown and nothing is refused.

import type { AutomationStudioInstructionRouteAccessor, AutomationStudioInstructionRouteReading, AutomationStudioInstructionText } from "../../action-permissions/index.ts";
import { currentAutomationStudioInstructionRoute } from "../../action-permissions/index.ts";
import { automationStudioFlowBootstrapDraftStepGoesToLocation } from "../../flow-bootstrap/index.ts";
import type { AutomationStudioFlowDraftRoute, AutomationStudioFlowDraftStep } from "../../flow-draft/index.ts";
import { automationStudioFlowDraftRouteCoverage, automationStudioFlowDraftStepIsProposed } from "../../flow-draft/index.ts";
import type { AutomationStudioLlmEvidenceCompletionCheck } from "../evidence-loop/index.ts";
import type { AutomationStudioLlmEvidenceRuntimeBinding } from "./index.ts";

type Refusal = Extract<AutomationStudioLlmEvidenceCompletionCheck, { ok: false }>;
type Named = Extract<AutomationStudioInstructionRouteReading, { state: "named" }>;

/** The loop's two route callbacks for one build, or none when the build has no route to read. */
export function automationStudioFlowBootstrapDraftRoute(input: {
  route?: AutomationStudioInstructionRouteAccessor | undefined;
  /** The instructions active now: a reading taken from another set is stale, and no route. */
  activeInstructions?: readonly AutomationStudioInstructionText[] | undefined;
  startLocation?: string | undefined;
  arrival?: NonNullable<AutomationStudioLlmEvidenceRuntimeBinding["runsNodes"]>["arrival"] | undefined;
}): {
  route?: () => AutomationStudioFlowDraftRoute | undefined;
  routeCheck?: (steps: readonly AutomationStudioFlowDraftStep[]) => Promise<Refusal | undefined>;
} {
  const accessor = input.route;
  if (!accessor) return {};
  const current = (reading: AutomationStudioInstructionRouteReading) =>
    currentAutomationStudioInstructionRoute({ reading, activeInstructions: input.activeInstructions ?? [] });
  let sent: Promise<AutomationStudioInstructionRouteReading> | undefined;
  return {
    route: () => shown(current(accessor.peek())),
    routeCheck: async (steps) => {
      let reading = current(accessor.peek());
      const first = steps.find(automationStudioFlowDraftStepIsProposed);
      if (reading.state === "unread" && shortcut(first, reading, input)) reading = current(await (sent ??= accessor.read()));
      const skips = shortcut(first, reading, input);
      if (reading.state === "named") return refused(reading, skips, automationStudioFlowDraftRouteCoverage(steps, reading.waypoints.length));
      if (skips && reading.state !== "open") return refusal([["bootstrap.route_unconfirmed", UNCONFIRMED]]);
      return undefined;
    }
  };
}

const UNCONFIRMED = "Whether the person named a route could not be confirmed, so the Flow's first step cannot go straight to a deeper address: rerun step 1 with startLocation and keep the steps that travel from there.";

/** What the draft shows of a reading that still stands. */
function shown(reading: AutomationStudioInstructionRouteReading): AutomationStudioFlowDraftRoute | undefined {
  if (reading.state === "open") return { state: "open" };
  if (reading.state === "named") return { state: "named", quote: reading.quote, places: places(reading) };
  return undefined;
}

/** Each place's words, `r1` first. */
function places(reading: Named): string[] {
  return [...reading.waypoints].sort((left, right) => left.order - right.order).map((waypoint) => waypoint.quote);
}

/**
 * Whether the Flow's first step goes to the start location by a deeper
 * address than the start location itself. Not on a named route when that step
 * says it is on the route's first place.
 */
function shortcut(
  first: AutomationStudioFlowDraftStep | undefined,
  reading: AutomationStudioInstructionRouteReading,
  input: { startLocation?: string | undefined; arrival?: { node: string; parameter: string } | undefined }
): boolean {
  const startLocation = input.startLocation?.trim();
  if (!first || !startLocation || !input.arrival) return false;
  if (!automationStudioFlowBootstrapDraftStepGoesToLocation(first, startLocation, input.arrival)) return false;
  const parameters = (first.ranWith ?? first.input).parameters;
  const declared = typeof parameters === "object" && parameters !== null && !Array.isArray(parameters) ? parameters[input.arrival.parameter] : undefined;
  if (typeof declared !== "string" || bare(declared) === bare(startLocation)) return false;
  return !(reading.state === "named" && first.places?.includes("r1") === true);
}

/** A location with its trailing `/` left off. */
function bare(location: string): string {
  return location.trim().replace(/\/+$/u, "");
}

/** A named route's refusal, or nothing when the Flow follows it. */
function refused(reading: Named, skips: boolean, coverage: { missing: readonly string[]; outOfOrder: readonly string[] }): Refusal | undefined {
  const words = places(reading);
  const place = (id: string) => `${id} (${words[Number(id.slice(1)) - 1]})`;
  const issues: [string, string][] = [];
  if (skips) issues.push(["bootstrap.route_shortcut", `The person named the route "${reading.quote}": the Flow goes through ${words.join(", then ")} in that order, so its first step cannot go straight to a deeper address. Rerun step 1 with startLocation, keep a step in the Flow on each place, and say which with place.`]);
  const [missing] = coverage.missing;
  if (missing) issues.push(["bootstrap.route_place_missing", `The person named the route "${reading.quote}". No step in the Flow is on ${coverage.missing.map(place).join(", ")}: keep or add the steps that go through it, in order, and say which with place (place "${missing}").`]);
  const [late] = coverage.outOfOrder;
  if (late) issues.push(["bootstrap.route_out_of_order", `The person named the route "${reading.quote}". ${place(late)} is reached before a place that comes earlier on it: the Flow goes through the places in order, so reorder the steps or correct their place.`]);
  return issues.length ? refusal(issues) : undefined;
}

/** A refused completion in the shape the loop feeds back (`../evidence-loop/completion-check.ts`). */
function refusal(issues: readonly [string, string][]): Refusal {
  return {
    ok: false,
    issueCodes: issues.map(([code]) => code),
    feedback: { ok: false, code: "flow_bootstrap.completion_refused", refusal: "flow_bootstrap.route_not_followed", issues: issues.map(([code]) => ({ code })), instruction: issues.map(([, sentence]) => sentence).join(" ") }
  };
}

import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioRecoveryContextSection } from "../context.ts";
import { AUTOMATION_STUDIO_RECOVERY_GRAPH_TRIMS } from "./graph-trim.ts";
import { automationStudioCappedProse } from "./prose-cap.ts";
import { AUTOMATION_STUDIO_RECOVERY_STEP_TRIMS } from "./steps-trim.ts";
import type { AutomationStudioRecoverySectionTrim } from "./trim-step.ts";

/**
 * The failure record and the two transitions are ids, codes and a few
 * sentences; only the sentences can give, so their ladder is the prose cap
 * alone. 480 keeps the judge's advice (at most 500) nearly whole, and the
 * failure record's `expected` -- which restates that same advice and Core's fix
 * line inside 1,024 characters -- is what the first rung actually shortens.
 */
const PROSE_TRIMS: readonly AutomationStudioRecoverySectionTrim[] = Object.freeze([
  (section) => automationStudioCappedProse(section, 480),
  (section) => automationStudioCappedProse(section, 240),
  (section) => automationStudioCappedProse(section, 120)
]);

/**
 * A refuted result's failure record says the directive twice: its `expected` is
 * built from nothing but the directive's own `expected`, fix lines and advice
 * (`result-verification/core-observation.ts`), and the directive rides beside
 * it structured. So the first rung drops that copy -- it loses nothing -- and
 * the prose rungs after it stop at 240, because the judge's advice is the one
 * sentence in the request that says what to change.
 */
const FAILURE_TRIMS: readonly AutomationStudioRecoverySectionTrim[] = Object.freeze([
  withoutRestatedDirective,
  PROSE_TRIMS[0]!,
  PROSE_TRIMS[1]!
]);

function withoutRestatedDirective(section: JsonObject): JsonObject {
  const failure = section.failure;
  if (!failure || typeof failure !== "object" || Array.isArray(failure) || failure.repair === undefined || failure.expected === undefined) return section;
  const { expected: _restated, ...rest } = failure;
  return { ...section, failure: { ...rest, expectedIsRepair: true } };
}

const LADDERS: Partial<Record<AutomationStudioRecoveryContextSection, readonly AutomationStudioRecoverySectionTrim[]>> = {
  failure: FAILURE_TRIMS,
  expected_transition: PROSE_TRIMS,
  actual_transition: PROSE_TRIMS,
  flow_graph: AUTOMATION_STUDIO_RECOVERY_GRAPH_TRIMS,
  step_parameters: AUTOMATION_STUDIO_RECOVERY_STEP_TRIMS
};

/**
 * `built` reduced by the first `level` rungs of its section's ladder and marked
 * `trimmedToFit`, or `undefined` when the ladder has no rung that deep (or the
 * section has none at all). Always computed from the section as built, so the
 * same level of the same section is the same object every time.
 */
export function automationStudioRecoverySectionAtTrimLevel(
  section: AutomationStudioRecoveryContextSection,
  built: JsonObject,
  level: number,
  failedNodeId: string | undefined
): JsonObject | undefined {
  const ladder = LADDERS[section];
  if (!ladder || level < 1 || level > ladder.length) return undefined;
  const trimmed = ladder.slice(0, level).reduce((value, rung) => rung(value, failedNodeId), built);
  return { ...trimmed, trimmedToFit: true };
}

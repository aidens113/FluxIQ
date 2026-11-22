// A build test's observations, as trail steps (`../trail.ts`): the test's own record of each answer, in the order the
// test got them, for the judge of a build's trial (`../../build-test/summary.ts`).
//
// `did` is the step's action, with its pass where it repeats; `outcome` the answer's result code; `where` the address
// its evidence gives as `location`; `found` the evidence whole, the page it shows included -- the per-step account
// beside it leaves the page out (`../../build-test/observation.ts`), and this is where the judge sees it.

import type { JsonObject, JsonValue } from "../../../../core/index.ts";
import type { AutomationStudioResultTrailStep } from "../../contracts/index.ts";
import { automationStudioResultTrailSemanticStep, type AutomationStudioResultTrailSemanticOptions } from "../semantic/index.ts";
import { automationStudioResultFrameworkOutcome } from "../framework-outcome.ts";

type Observation = { step: number; resultCode?: string | undefined; evidence: JsonValue; pass?: number | undefined; of?: number | undefined; records?: readonly JsonObject[] | undefined; recordSchema?: JsonValue; effectApplied?: boolean; failure?: unknown };

export function automationStudioResultTrailOfObservations(observations: readonly Observation[] | undefined, actionOf: (step: number) => string | undefined, semantic?: AutomationStudioResultTrailSemanticOptions): AutomationStudioResultTrailStep[] {
  return (observations ?? []).map((observation) => {
    const action = actionOf(observation.step) ?? "step";
    const pass = observation.pass !== undefined ? ` (pass ${observation.pass}${observation.of !== undefined ? ` of ${observation.of}` : ""})` : "";
    const said = isObject(observation.evidence) ? observation.evidence : undefined;
    const where = typeof said?.location === "string" && said.location.trim() ? said.location.trim() : undefined;
    const { location: _shownAsWhere, ...found } = said ?? {};
    const step: AutomationStudioResultTrailStep = {
      did: `step ${observation.step}: ${action}${pass}`,
      ...(observation.resultCode ? { outcome: observation.resultCode } : {}),
      ...(where !== undefined ? { where } : {}),
      ...(said ? (Object.keys(found).length ? { found } : {}) : { found: observation.evidence })
    };
    if (semantic === undefined) return step;
    const envelope: JsonObject = { evidence: observation.evidence, source: { step: observation.step, ...(observation.pass === undefined ? {} : { pass: observation.pass }) }, ...(observation.records === undefined ? {} : { records: [...observation.records] }), ...(observation.recordSchema === undefined ? {} : { recordSchema: observation.recordSchema }) };
    return automationStudioResultTrailSemanticStep(step, { source: "build-observation", definitionId: action, evidence: envelope }, semantic, automationStudioResultFrameworkOutcome(observation));
  });
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

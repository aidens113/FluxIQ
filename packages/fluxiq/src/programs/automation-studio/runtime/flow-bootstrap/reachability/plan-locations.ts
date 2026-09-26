// What the Flow a build wrote does about where it starts, read off the plan.
//
// Two questions, and both are answered from what the plan names rather than
// from what any step means:
//
//   - which steps act on the bound domain's own target. A node the domain
//     registered is one of them by definition -- that is what a domain node is
//     -- and so is one of Core's own nodes that has been told to dispatch a
//     domain output, which it says by naming that output in the parameter its
//     definition marks as a reference to an action. Core's other nodes touch
//     nothing outside the run, so a Flow made only of those has no target to
//     arrive at and is not asked to;
//   - which steps carry where the Flow starts. Core never parses a start
//     location (`../start-location.ts`): the spelling belongs to the domain, so
//     this compares text and nothing else.
//
// **The comparison is deliberately loose.** A build told to start at
// `https://shop.test/collections/audio` may legitimately write the step that
// goes there with the site's front page, a deeper page, or a neighbouring one,
// and refusing any of those would be refusing a Flow that runs. So a step
// counts as going there when one of its values agrees with the start location
// from the first character for twelve characters, or for the whole start
// location when it is shorter than that. Twelve is longer than any scheme and
// separator a location begins with -- `https://` is eight -- so agreement that
// short is agreement about nothing, and agreement longer than it is about a
// place. What no reading of twelve characters can stretch to is a plan with no
// text in it that resembles the start location at all, which is the case this
// exists to catch.
import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import type { AutomationStudioNodeDefinition, AutomationStudioNodeRegistry, AutomationStudioNodeRegistryResolution } from "../../../nodes/index.ts";
import type { AutomationStudioFlowBootstrapNode, AutomationStudioFlowBootstrapPlan } from "../plan/index.ts";
import type { AutomationStudioFlowBootstrapPlanLocations } from "./contracts.ts";

/** How much of the start location a value must agree with to be about it. */
const MIN_SHARED_LOCATION_CHARACTERS = 12;

/** What one step's parameters are walked for: bounded, because a plan is a model's writing. */
const MAX_VALUES_PER_STEP = 64;
const MAX_VALUE_DEPTH = 6;

export function automationStudioFlowBootstrapPlanLocations(input: {
  plan: AutomationStudioFlowBootstrapPlan;
  registry: AutomationStudioNodeRegistry;
  resolution: AutomationStudioNodeRegistryResolution;
  /** Where the Flow starts, in the bound domain's own spelling. */
  startLocation: string;
}): AutomationStudioFlowBootstrapPlanLocations {
  const acting: string[] = [];
  const reaching: string[] = [];
  const steps: string[] = [];
  for (const subflow of input.plan.subflows) {
    for (const node of subflow.nodes) {
      steps.push(node.definitionId);
      // A definition the resolution does not offer refuses the plan in
      // validation under its own code; it is not this check's to answer.
      const definition = input.registry.get(node.definitionId, input.resolution);
      if (!definition) continue;
      if (actsOnTheTarget(definition, node)) acting.push(node.key);
      if (carriesTheStartLocation(node.parameters, input.startLocation)) reaching.push(node.key);
    }
  }
  return { acting, reaching, steps };
}

/** A node the bound domain registered, or one of Core's told to dispatch a domain output. */
function actsOnTheTarget(definition: AutomationStudioNodeDefinition, node: AutomationStudioFlowBootstrapNode): boolean {
  if (definition.availability.kind === "domain") return true;
  const reference = definition.parameters.find((candidate) => candidate.ui?.control === "reference" && candidate.ui.referenceType === "action");
  const named = reference ? node.parameters?.[reference.id] : undefined;
  return typeof named === "string" && named.trim().length > 0;
}

/** Whether any value this step was written with is about where the Flow starts. */
function carriesTheStartLocation(parameters: JsonObject | undefined, startLocation: string): boolean {
  const wanted = startLocation.trim().toLowerCase();
  const needed = Math.min(MIN_SHARED_LOCATION_CHARACTERS, wanted.length);
  if (!needed) return false;
  let seen = 0;
  const visit = (value: JsonValue, depth: number): boolean => {
    if (seen >= MAX_VALUES_PER_STEP || depth > MAX_VALUE_DEPTH) return false;
    if (typeof value === "string") {
      seen += 1;
      return sharedLeadingCharacters(value.trim().toLowerCase(), wanted) >= needed;
    }
    if (Array.isArray(value)) return value.some((item) => visit(item, depth + 1));
    if (typeof value === "object" && value !== null) return Object.values(value).some((item) => visit(item, depth + 1));
    return false;
  };
  return visit(parameters ?? {}, 0);
}

/** How many characters two texts agree on from the first. */
function sharedLeadingCharacters(left: string, right: string): number {
  const limit = Math.min(left.length, right.length);
  let shared = 0;
  while (shared < limit && left[shared] === right[shared]) shared += 1;
  return shared;
}

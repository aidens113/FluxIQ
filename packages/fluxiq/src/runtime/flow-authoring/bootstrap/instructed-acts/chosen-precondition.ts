// An option the act's step did because the page had it chosen, written into
// the Flow as a precondition of that act's node (t1030).
//
// **The gap this closes.** t1023 counts the person's option (a size, a colour,
// a fulfilment) done by the act's own step when the host says the page showed
// it chosen, by its typed state, as that step ran (`./standing-option.ts`). No
// step of such a Flow chooses the option, so a later run on a page that
// arrives with another option chosen did the lasting act with the wrong option,
// and nothing refused it.
//
// **The rule.** Every choice the standing loop (`./standing.ts`) answers by
// that credit (`stood`), on the Flow's own steps, puts its option on the act
// step's node under `requiresChosen`: a list of `{ at, words }`, `at` being the
// host's own way of finding the control again (`../../draft/step.ts`,
// `AutomationStudioFlowDraftStepChosen`), carried unread. The host checks each
// before the act, from the page's typed state; one that does not stand chosen
// refuses the act unrun, as a step that cannot run (`AUTOMATION_STUDIO_OPTION_NOT_CHOSEN_CODE_END`),
// so the run routes by page state and a repair may add the step that chooses it.
// The host never guesses it from page words.
//
// **Core owns the parameter.** It is derived from the steps every time a Flow
// is assembled, so a step that carried one from an earlier Flow has it
// replaced: once a step named for the choice makes it, the credit no longer
// applies, and neither does the precondition. It is written only on a node
// whose definition declares it, only from an option whose host said `at`, and
// never for a quantity, which `./standing-option.ts` never credits.
//
// Nothing here calls a provider or reads a page; it is the draft, the
// instruction and the registry.
import type { JsonObject } from "../../../../core/index.ts";
import type { AutomationStudioNodeRegistry, AutomationStudioNodeRegistryResolution } from "../../../../framework/automation-service/nodes/index.ts";
import { automationStudioFlowDraftStepId, type AutomationStudioFlowDraftStep } from "../../draft/index.ts";
import type { AutomationStudioFlowDraftWrittenStep } from "../authoring/index.ts";
import { automationStudioInstructedActs } from "./instruction-acts.ts";
import { automationStudioInstructedActsStanding } from "./standing.ts";

/** The node parameter a saved act's standing options are written under, which a host's act node declares to take them. */
export const AUTOMATION_STUDIO_REQUIRES_CHOSEN_PARAMETER = "requiresChosen";

/**
 * The last segment of the failure code a host refuses such an act with
 * (`web.precondition.option_not_chosen` in the web's case): the option is not
 * chosen, so the act did not run. Core says it in its own words
 * (`framework/automation-service/service/candidate-trial/happened.ts`).
 */
export const AUTOMATION_STUDIO_OPTION_NOT_CHOSEN_CODE_END = "option_not_chosen";

type Write = (step: AutomationStudioFlowDraftStep) => AutomationStudioFlowDraftWrittenStep | undefined;

/**
 * For each of `steps` that does an act with one of the person's options
 * standing chosen and no step making it, by step id, the options its node
 * requires chosen: `{ at, words }` each, only those whose host said `at`.
 */
export function automationStudioInstructedStandingPreconditions(input: { instructionText?: string | undefined; steps: readonly AutomationStudioFlowDraftStep[] }): Map<string, JsonObject[]> {
  const required = new Map<string, JsonObject[]>();
  const acts = automationStudioInstructedActs(input.instructionText ?? "");
  if (!acts.length || !input.steps.length) return required;
  const standing = automationStudioInstructedActsStanding({ acts, steps: input.steps, onlyArrives: () => false });
  for (const stood of standing.values()) {
    if (!("done" in stood) || !stood.stood?.at) continue;
    const id = automationStudioFlowDraftStepId(stood.done);
    const options = required.get(id) ?? [];
    if (!options.some((option) => JSON.stringify(option.at) === JSON.stringify(stood.stood!.at))) options.push({ at: structuredClone(stood.stood.at), words: stood.stood.words });
    required.set(id, options);
  }
  return required;
}

/**
 * `write`, with each written step's `requiresChosen` set from the steps as they
 * stand (header): any the step carried is dropped, and the derived one is
 * written where the step's node declares it.
 */
export function automationStudioFlowDraftWriteWithStandingOptions(write: Write, input: {
  steps: readonly AutomationStudioFlowDraftStep[];
  instructionText?: string | undefined;
  registry: AutomationStudioNodeRegistry;
  resolution: AutomationStudioNodeRegistryResolution;
}): Write {
  const required = automationStudioInstructedStandingPreconditions(input);
  const takes = (node: string | undefined): boolean => node !== undefined
    && input.registry.get(node, input.resolution)?.parameters.some((parameter) => parameter.id === AUTOMATION_STUDIO_REQUIRES_CHOSEN_PARAMETER) === true;
  return (step) => {
    const written = write(step);
    if (!written) return written;
    const entries = (written.entries ?? []).filter((entry) => entry.key !== AUTOMATION_STUDIO_REQUIRES_CHOSEN_PARAMETER);
    const options = required.get(automationStudioFlowDraftStepId(step));
    const own = options?.length && takes(written.node) ? [{ key: AUTOMATION_STUDIO_REQUIRES_CHOSEN_PARAMETER, value: JSON.stringify(options) }] : [];
    if (!own.length && entries.length === (written.entries ?? []).length) return written;
    return { ...written, entries: [...entries, ...own] };
  };
}

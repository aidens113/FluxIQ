// Completion refusal decoration: the authored Core sentences that may travel
// with an issue, and its place in the writing or original draft. This is an
// implementation detail of bootstrap-completion, not a public authoring seam.
import type { JsonObject } from "../../../../core/index.ts";
import type { AutomationStudioFlowBootstrapIssue, AutomationStudioFlowScriptPlace } from "../../../flow-authoring/bootstrap/index.ts";

/**
 * The refusals of a draft's routing (`flow-bootstrap/authoring/draft-routing.ts`):
 * a repeat, guard or recovery that cannot be wired as stated. Each sentence is
 * Core's own and quotes nothing but step numbers and the amendment that fixes
 * it, so it may travel with the code. The issue feedback carries only its listed
 * authored codes' sentences, and these were not among them: run
 * `run-musr9pv3-f4bf6256` (decision 0072) was shown
 * `repeat_not_after_its_source` at two paths and nothing else, and looped
 * fifteen turns on a fix the sentence named.
 */
const DRAFT_ROUTING_CODES: ReadonlySet<string> = new Set([
  "flow_draft.check_not_before_step",
  "flow_draft.recovery_behind_step",
  "flow_draft.recovery_is_routed",
  "flow_draft.repeat_span_unknown",
  "flow_draft.repeat_not_after_its_source",
  "flow_draft.repeat_body_is_routed"
]);

/**
 * The refusals of the plan checks made after registry validation: a step inside
 * a loop whose record output replaces the run's rows (t498), and a lasting
 * repeat over a listing ordered only in its saved answer (t741). Each sentence
 * is Core's own and quotes nothing the model or the page wrote, so it travels
 * with the code, as the routing codes' do.
 */
const PLAN_CHECK_CODES: ReadonlySet<string> = new Set(["record_output.replace_in_repeat", "record_output.process_order_in_repeat"]);

/** A feedback entry with its trusted original place and any allowed Core sentence. */
export function automationStudioFlowBootstrapCompletionIssueFeedback(entry: JsonObject, source: AutomationStudioFlowBootstrapIssue | undefined, place: AutomationStudioFlowScriptPlace | undefined): JsonObject {
  const sentence = source && entry.message === undefined && source.message && entry.code === source.code
    && (DRAFT_ROUTING_CODES.has(source.code) || PLAN_CHECK_CODES.has(source.code))
    ? { ...entry, message: source.message } : entry;
  if (!place) return sentence;
  const { code, path, message, ...rest } = sentence;
  return {
    ...(code === undefined ? {} : { code }),
    ...(path === undefined ? {} : { path }),
    ...(message === undefined ? {} : { message }),
    step: place.step,
    ...(place.label === undefined ? {} : { label: place.label }),
    ...(place.line === undefined ? {} : { line: place.line }),
    ...(place.draftStep === undefined ? {} : { draftStep: place.draftStep }),
    ...(place.draftStepId === undefined ? {} : { draftStepId: place.draftStepId }),
    ...(place.nodeDefinition === undefined ? {} : { nodeDefinition: place.nodeDefinition }),
    ...rest
  };
}

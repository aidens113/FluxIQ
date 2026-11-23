// `core.set_result_processing` in a live attempt (t970, phase 2): offered beside the domain's tools in every round
// (`../attempt/round.ts`), answered here and never sent to the domain, since it touches no page.
//
// **What a call does.** It reads the declaration against the rows the answer is made from, before any processing
// (`../../result-feed/feed.ts`, `collected`), with the contract's own parser and the store's own function
// (`runtime/llm/node-tools/result/answer.ts`), holds it on the attempt (`resultProcessing`), and hands it to the
// result feed, which merges it over the output step's own declaration from then on: the answer the completion check
// judges, the person is shown and the store publishes is the processed one. A refused declaration changes nothing.
// The attempt has one result, so a call names no other list (`dataset` is not read).
//
// **Columns.** A declaration naming none shows the columns the person asked for, where the request names them
// surely and the rows hold every one: a mark read only to filter by is then never a column of the answer.
//
// **It is part of how the result was got.** The call goes on the attempt's trail (`../../trail/`, t963) with its answer,
// so the judge, which sees all the run did plus the final data, sees the declaration and what it left out as well as
// `resultEvidence.processing` (`runtime/result-verification/result-evidence/types.ts`).
//
// **Saved with the Flow, in its steps.** A saved Flow is assembled from its saved steps every time it runs
// (`../../flow-run/assemble.ts`: "the steps are the source of truth, not a stored plan"), so the declaration is written into
// the record output of each step whose pages are the answer (`withResultProcessing`) before the steps are checked and
// kept (`../attempt/draft-save.ts`, `../attempt/remember.ts`). Each later run then applies it in the store at its end with no model call,
// and assembly reads it as the step's own, so the plan saved and the plan run later are the same. It is never handed to
// the completion as `draftResultProcessing` besides: that would make the plan saved differ from the plan its own steps
// assemble to.
import type { AutomationStudioRecordProcessing, AutomationStudioRecordSchema } from "@fluxiq/contracts/automation";
import type { JsonObject } from "../../../../../core/index.ts";
import { AUTOMATION_STUDIO_FLOW_DRAFT_RESULT_KEY, type AutomationStudioFlowDraftResultProcessing, type AutomationStudioFlowDraftStep } from "../../../../../runtime/flow-authoring/draft/index.ts";
import {
  AUTOMATION_STUDIO_LLM_SET_RESULT_PROCESSING_TOOL_ID,
  automationStudioLlmSetResultProcessing,
  automationStudioLlmSetResultProcessingTool,
  type AutomationStudioLlmEvidenceLoopInput,
  type AutomationStudioLlmEvidenceTool,
  type AutomationStudioLlmEvidenceToolExecutionResult
} from "../../../../../runtime/llm/index.ts";
import { automationStudioResultTrailStepOfCall, type AutomationStudioResultTrailStep } from "../../../../../runtime/result-verification/index.ts";
import type { AutomationStudioAnswerFirstResultFeed } from "../result-feed/index.ts";
import { automationStudioAnswerFirstAmendProcessing } from "./amend.ts";

type Execute = AutomationStudioLlmEvidenceLoopInput["executeTool"];

/** What of an attempt's run the tool reads and writes (`../attempt/state.ts`). */
type AttemptRun = {
  result: AutomationStudioAnswerFirstResultFeed;
  trail: AutomationStudioResultTrailStep[];
  resultProcessing?: AutomationStudioFlowDraftResultProcessing | undefined;
  steps: AutomationStudioFlowDraftStep[];
  processingReferenceTimeMs?: number | undefined;
};

/** The round's tools with the tool after them, where they do not already offer one under its id. */
export function automationStudioAnswerFirstResultProcessingTools(tools: readonly AutomationStudioLlmEvidenceTool[]): AutomationStudioLlmEvidenceTool[] {
  return tools.some((tool) => tool.toolId === AUTOMATION_STUDIO_LLM_SET_RESULT_PROCESSING_TOOL_ID) ? [...tools] : [...tools, automationStudioLlmSetResultProcessingTool()];
}

/** The round's executor, answering the tool's calls here and passing every other call on (header). */
export function automationStudioAnswerFirstResultProcessingExecutor(run: Pick<AttemptRun, "result" | "trail" | "resultProcessing" | "processingReferenceTimeMs">, next: Execute): Execute {
  return (async (call) => call.toolId === AUTOMATION_STUDIO_LLM_SET_RESULT_PROCESSING_TOOL_ID
    ? automationStudioAnswerFirstResultProcessingCall(run, { callId: call.callId, toolId: call.toolId, value: call.value })
    : next(call)) as Execute;
}

/** One call of the tool, answered from the attempt's own result (header). */
export function automationStudioAnswerFirstResultProcessingCall(
  run: Pick<AttemptRun, "result" | "trail" | "resultProcessing" | "processingReferenceTimeMs">,
  call: { callId: string; toolId: string; value: JsonObject }
): AutomationStudioLlmEvidenceToolExecutionResult {
  const { dataset: _one, ...value } = call.value;
  const collected = run.result.collected();
  const asked = run.result.port.answer().columns;
  const process = value.process;
  // The person's columns where the declaration names none and the rows hold them all (header).
  const shown = isObject(process) && process.columns === undefined && asked.length && collected && asked.every((id) => collected.schema.fields.some((field) => field.id === id))
    ? { ...value, process: { ...process, columns: [...asked] } }
    : value;
  const automatic = run.result.processingDeclaration() !== undefined;
  const made = automatic ? { held: run.resultProcessing, answer: automationStudioAnswerFirstAmendProcessing(run.result, value) }
    : automationStudioLlmSetResultProcessing({ value: shown, held: run.resultProcessing, rowsOf: () => collected, now: run.processingReferenceTimeMs });
  if (!automatic) {
    run.resultProcessing = made.held;
    run.result.setProcessing(made.held?.[AUTOMATION_STUDIO_FLOW_DRAFT_RESULT_KEY]);
  }
  try {
    run.trail.push(automationStudioResultTrailStepOfCall({ callId: call.callId, toolId: call.toolId, value: shown }, made.answer));
  } catch {
    /* best-effort: the trail is evidence for a later check, never a reason to lose the call's answer */
  }
  return made.answer;
}

/** The steps with the held declaration written into the record output of each step whose pages are the answer (header); the steps as they are where none is held. */
export function automationStudioAnswerFirstStepsWithResultProcessing(run: Pick<AttemptRun, "result" | "resultProcessing" | "steps">): AutomationStudioFlowDraftStep[] {
  const declared = run.result.processingDeclaration() === undefined ? run.resultProcessing?.[AUTOMATION_STUDIO_FLOW_DRAFT_RESULT_KEY] : run.result.storedProcessing();
  if (!declared) return run.steps;
  const output = new Set(run.result.port.outputGroup().map((step) => step.id));
  const schema = declared.declaration === undefined ? undefined : run.result.collected()?.schema;
  return run.steps.map((step) => (output.has(run.result.idOf(step)) ? withResultProcessing(step, declared, schema) : step));
}

/** The step with `declared` merged over its record output's own processing, key by key. */
function withResultProcessing(step: AutomationStudioFlowDraftStep, declared: AutomationStudioRecordProcessing | JsonObject, schema: AutomationStudioRecordSchema | undefined): AutomationStudioFlowDraftStep {
  const input = step.input;
  const parameters = isObject(input.parameters) ? input.parameters : undefined;
  const holder = parameters ?? input;
  const base = isObject(holder.recordOutput) ? holder.recordOutput : {};
  // An automatic declaration is the task's own (kept in its memory and applied by the result feed), so it is
  // written only into a record output the step already has. A step that never had one may run a node that
  // takes none: inventing one would leave the saved steps unassemblable for every data task that reads it.
  if (declared.declaration !== undefined && !isObject(holder.recordOutput) && !isObject(step.settings?.recordOutput)) return step;
  const output = declared.declaration !== undefined && isObject(step.settings?.recordOutput) ? { ...base, ...step.settings.recordOutput } : base;
  const own = isObject(output.process) ? output.process : {};
  const canonical = JSON.parse(JSON.stringify(declared)) as JsonObject;
  const recordOutput: JsonObject = { ...output, ...(schema === undefined ? {} : { schema: JSON.parse(JSON.stringify(schema)) as JsonObject }), process: declared.declaration === undefined ? { ...own, ...canonical } : canonical };
  // The real writer takes ranWith first, then settings. Keep the actual call record intact and carry
  // this framework-applied data configuration through its existing later-settings seam too.
  return { ...step, input: parameters ? { ...input, parameters: { ...parameters, recordOutput } } : { ...input, recordOutput }, ...(declared.declaration === undefined ? {} : { settings: { ...step.settings, recordOutput } }) };
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

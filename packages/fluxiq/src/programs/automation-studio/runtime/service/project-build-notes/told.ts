import type { JsonObject } from "../../../../../core/index.ts";
import { AUTOMATION_STUDIO_ACTION_CONSEQUENCES } from "../../action-permissions/index.ts";
import { AUTOMATION_STUDIO_SITE_RESET_UNDOES_KEY } from "../../flow-bootstrap/site-reset/index.ts";
import { automationStudioSubflowEntryLeft } from "../../flow-bootstrap/subflow-candidate/index.ts";
import { automationStudioLlmEvidenceIsOpeningCallId as isOpeningCall } from "../../llm/evidence-loop/index.ts";
import type { AutomationStudioLlmEvidenceLoopInput, AutomationStudioLlmEvidenceToolExecutionResult } from "../../llm/index.ts";
import { automationStudioProjectBuildEvidenceBeside as beside } from "./beside.ts";

// What a brief's loop is told beside its own calls' answers (`../project-build/brief-ports.ts`,
// header). A call that names an act under `undoes` is the undo a trial refusal
// or a reset demands, in any role, so it is never "outside the brief" (t772
// R4). A landed call that declared a lasting class the brief's parts do not ask
// for is recorded as the build's act, to undo before a trial; its note never
// forbids the step, because the request may need it and only the plan's classes
// are then wrong (t772, office r6 cause 2).

type Execute = AutomationStudioLlmEvidenceLoopInput["executeTool"];
type Ran = Awaited<ReturnType<Execute>>;

/** The key Core's opening look of a builder on its prepared entry carries, which the web domain reads as its arrival (`../project-build/brief-ports.ts`, header). */
const ARRIVED_KEY = "arrived";
/** The key beside a brief's opening look that says how its start was made (`../project-build/phase-start-told.ts`). */
const PHASE_START_KEY = "phaseStart";

/**
 * `loop` with Core's own words beside two results: the opening's, saying how
 * the brief's start was made (`phaseStart`, t593) and whether the entry was
 * prepared, and a landed call's that declared a lasting act its brief's parts
 * do not ask for. The domain's evidence is kept whole; a key is added beside
 * it, never in its place. `arrived`: the opening call is sent marked as the
 * builder's arrival. `role: "reset"`: the note speaks to a reset, which writes
 * no subflow.
 */
export function automationStudioProjectBuildBriefTold<L extends { executeTool: Execute }>(loop: L, said: { start: JsonObject | undefined; entry: JsonObject | undefined; permittedActs: readonly string[]; arrived: boolean; role?: "reset" }): L {
  const inner = loop.executeTool;
  const executeTool: Execute = async (call) => {
    const opening = isOpeningCall(call.callId);
    const ran = await inner(said.arrived && opening ? { ...call, value: { ...call.value, [ARRIVED_KEY]: true } } : call);
    if (opening && (said.start || said.entry)) {
      const started = said.start ? beside(ran, PHASE_START_KEY, said.start) : ran;
      return said.entry ? beside(started, automationStudioSubflowEntryLeft.entryKey, said.entry) : started;
    }
    if (call.value[AUTOMATION_STUDIO_SITE_RESET_UNDOES_KEY] !== undefined) return ran;
    const outside = landedOutside(call.value, ran, said.permittedActs);
    if (!outside.length) return ran;
    if (said.role === "reset") {
      return beside(ran, "outsideBrief", { consequences: outside, note: `This call declared ${outside.join(", ")} and named no act under ${AUTOMATION_STUDIO_SITE_RESET_UNDOES_KEY}, so it was outside this reset, which only undoes the build's listed acts. It ran, and it stays on the site as this build's act: where the site can undo it, it is listed with the acts to undo. Do nothing on the site but undo the listed acts.` });
    }
    const asked = said.permittedActs.length ? `they ask only for ${said.permittedActs.join(", ")}` : "they ask for no lasting act";
    return beside(ran, "outsideBrief", { consequences: outside, note: `This call declared ${outside.join(", ")}, which your brief's parts do not ask for (${asked}). It ran, and it is recorded as this build's act, which is undone before a trial. If the request needs this kind of change, the plan's lasting classes are wrong: say so in your return, so the supervisor can amend the plan with project.amend_plan.` });
  };
  return { ...loop, executeTool };
}

/** The lasting classes `value` declared that `permitted` leaves out, when its call landed: applied an effect and did not refuse itself. */
function landedOutside(value: JsonObject, ran: Ran, permitted: readonly string[]): string[] {
  if (!isExecution(ran) || ran.effectApplied !== true || isObject(ran.evidence) && ran.evidence.ok === false) return [];
  const declared = Array.isArray(value.consequences) ? value.consequences : [];
  return AUTOMATION_STUDIO_ACTION_CONSEQUENCES.filter((consequence) => declared.includes(consequence) && !permitted.includes(consequence));
}

function isExecution(ran: Ran): ran is AutomationStudioLlmEvidenceToolExecutionResult {
  return isObject(ran) && ran.kind === "llm_evidence_tool_execution";
}

function isObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

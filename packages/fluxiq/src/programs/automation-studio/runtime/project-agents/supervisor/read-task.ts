import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioLlmEvidenceToolExecutionResult } from "../../llm/evidence-loop.ts";
import type { AutomationStudioProjectSupervisorContext } from "./context.ts";
import { AUTOMATION_STUDIO_PROJECT_SUPERVISOR_GUIDANCE as GUIDANCE } from "./guidance.ts";
import { automationStudioProjectSupervisorToolAnswer as answer } from "./tool-answer.ts";

/**
 * `project.read_task`, the supervisor's free first look (no provider call):
 * the person's active instructions under the ids a part names them by, the
 * build record's summary -- what a supervisor started again on this build, or
 * a later one for the same Flow, reads first, as an agent here reads `Current
 * State` -- the money it can still give builders beside what it keeps back for
 * the judged whole run, the lasting acts still on the target, and how to work.
 */
export async function automationStudioProjectSupervisorReadTask(context: AutomationStudioProjectSupervisorContext): Promise<AutomationStudioLlmEvidenceToolExecutionResult> {
  const { ports } = context;
  const summary = await ports.record.summary(ports.build);
  const purse = ports.purse;
  const inPlace = ports.projectLedger.snapshot().acts.filter((act) => act.inPlace).length;
  const evidence: JsonObject = {
    ok: true,
    instructions: ports.sources.map((source) => ({ sourceId: source.sourceId, text: source.text })),
    buildRecord: summary ? (JSON.parse(JSON.stringify(summary)) as JsonObject) : null,
    money: purse ? { canGiveUsd: usd(purse.allocatableUsd()), keptBackUsd: usd(purse.keptBackUsd()), leftUsd: usd(purse.leftUsd()), ...calls(purse.allocatableCalls()) } : null,
    lastingActsInPlace: inPlace,
    howToWork: GUIDANCE.howToWork,
    example: GUIDANCE.example
  };
  return answer.answered(evidence);
}

/** The calls builders can still be given, where the build caps its calls (t570). */
function calls(canGive: number | undefined): JsonObject {
  return canGive === undefined ? {} : { canGiveCalls: canGive };
}

function usd(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}

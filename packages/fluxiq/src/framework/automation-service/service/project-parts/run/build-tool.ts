import { automationStudioLlmRunPartBundle, type AutomationStudioHarnessOptionBundle } from "../../../../../runtime/llm/index.ts";
import type { AutomationStudioSiteResetTrialAct } from "../../../../../runtime/flow-authoring/bootstrap/site-reset/index.ts";
import type { ProjectPartAdmit, ProjectPartSettled } from "./settled-calls.ts";
import type { AutomationStudioProjectPartRunInput, AutomationStudioProjectPartRunRefusal, AutomationStudioProjectPartRunResult } from "./types.ts";

/**
 * What a model is told when a part it ran was called per row and handed none: why, and the two lines its next try writes.
 * Model guidance: generic, as the script format's own sentence is (`flow-authoring/bootstrap/plan/flow-script-format.ts`).
 */
const ROW_NOT_HANDED_INSTRUCTION = "This saved part cannot do this as it stands: it acts on one row of a list but does not take the row, so nothing tells it which row's control to use. Write it in your Flow so that the part declares `input: row` and the step that calls it inside `repeat over:` gives it `row: $row`, or do the step yourself.";

/**
 * `core.run_part` for one brief of a project build: the one runner as a build asks it,
 * under the classes this brief was permitted, and the acts a run lands told to the
 * brief's ledger and the build's record as a subflow trial's are (`project-build/brief-ports.ts`).
 * `done` is the build's, so a later brief is refused what an earlier one already did.
 */
export function automationStudioProjectBuildRunPartBundle(input: {
  parts: { runAs(input: AutomationStudioProjectPartRunInput): Promise<AutomationStudioProjectPartRunResult | AutomationStudioProjectPartRunRefusal> };
  permittedConsequences: readonly string[];
  done: Set<string>;
  landed(acts: readonly AutomationStudioSiteResetTrialAct[], runId: string): void;
  /** Told each lasting step's call as it happens, where something keeps a record of them by that (`./settled-calls.ts`). */
  settled?: ProjectPartSettled | undefined;
  /** Asked before each lasting step, where something keeps a record of a task's acts (`./settled-calls.ts`). */
  admit?: ProjectPartAdmit | undefined;
}): AutomationStudioHarnessOptionBundle {
  return automationStudioLlmRunPartBundle<AutomationStudioSiteResetTrialAct>({
    done: input.done,
    port: {
      landed: input.landed,
      run: async (call) => {
        const answer = await input.parts.runAs({ ...call, signal: call.signal, version: call.version, caller: "build", permittedConsequences: [...input.permittedConsequences], ...(input.settled ? { settled: input.settled } : {}), ...(input.admit ? { admit: input.admit } : {}) } as AutomationStudioProjectPartRunInput);
        if ("ok" in answer) return { refused: answer.code, message: answer.message };
        const { response } = answer;
        return { runId: response.runId, status: response.status, outputs: response.outputs, ...(response.stoppedAt ? { stoppedAt: response.stoppedAt } : {}), classes: response.acts, landed: answer.landedActs, partId: answer.partId, version: answer.version, ...(answer.stoppedFor === "row_not_handed" ? { instruction: ROW_NOT_HANDED_INSTRUCTION } : {}) };
      }
    }
  });
}

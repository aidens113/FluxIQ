import { automationStudioLlmRunPartBundle, type AutomationStudioHarnessOptionBundle } from "../../../../../runtime/llm/index.ts";
import type { AutomationStudioSiteResetTrialAct } from "../../../../../runtime/flow-authoring/bootstrap/site-reset/index.ts";
import type { ProjectPartSettled } from "./settled-calls.ts";
import type { AutomationStudioProjectPartRunInput, AutomationStudioProjectPartRunRefusal, AutomationStudioProjectPartRunResult } from "./types.ts";

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
}): AutomationStudioHarnessOptionBundle {
  return automationStudioLlmRunPartBundle<AutomationStudioSiteResetTrialAct>({
    done: input.done,
    port: {
      landed: input.landed,
      run: async (call) => {
        const answer = await input.parts.runAs({ ...call, signal: call.signal, version: call.version, caller: "build", permittedConsequences: [...input.permittedConsequences], ...(input.settled ? { settled: input.settled } : {}) } as AutomationStudioProjectPartRunInput);
        if ("ok" in answer) return { refused: answer.code, message: answer.message };
        const { response } = answer;
        return { runId: response.runId, status: response.status, outputs: response.outputs, ...(response.stoppedAt ? { stoppedAt: response.stoppedAt } : {}), classes: response.acts, landed: answer.landedActs, partId: answer.partId, version: answer.version };
      }
    }
  });
}

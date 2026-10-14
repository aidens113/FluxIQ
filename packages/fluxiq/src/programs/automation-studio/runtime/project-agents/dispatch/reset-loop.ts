import type { AutomationStudioSiteResetNamedAct } from "../../flow-bootstrap/site-reset/index.ts";
import type { AutomationStudioLlmBuildPurse } from "../../llm/build-purse/index.ts";
// From its own module, as the subflow builder imports it: through the `llm` barrel it arrived undefined under the test loader (a module cycle).
import { runAutomationStudioLlmEvidenceLoop, type AutomationStudioLlmEvidenceLoopResult } from "../../llm/evidence-loop.ts";
import type { AutomationStudioProjectSubflowBrief } from "../contracts/index.ts";
import type { AutomationStudioProjectResetPorts } from "./types.ts";

// A reset brief's run (automation-project-agents-plan, `reset` brief kind;
// user rule, 2026-10-12): the same evidence loop a builder runs, with the
// tools the caller gives it to reverse this build's own lasting acts through
// the site's controls, and no proposal. It may complete only once nothing of
// this build is left to undo; until then each completion is refused with the
// acts still in place, so the model is told exactly what is left.
//
// The acts are its task from the first decision, not only once a completion
// is refused (t585, social debug root cause 2): the caller's ports put them in
// the loop's own instruction, with how each was done and on which page
// (`service/project-build/brief-ports.ts`). A refusal names what each act
// changed that is still there, when the reset went back and looked.

/** The code a reset's completion is refused under while acts are still in place. */
const RESET_INCOMPLETE = "project.reset_acts_in_place";

export async function runAutomationStudioProjectResetLoop(input: {
  brief: AutomationStudioProjectSubflowBrief;
  ports: AutomationStudioProjectResetPorts;
  remainingActs: () => Promise<readonly AutomationStudioSiteResetNamedAct[]>;
  allowance: AutomationStudioLlmBuildPurse;
  signal: AbortSignal;
  callScope: string | undefined;
}): Promise<AutomationStudioLlmEvidenceLoopResult> {
  return await runAutomationStudioLlmEvidenceLoop({
    ...input.ports.loop,
    draft: false,
    dryRun: false,
    maxIterations: input.brief.maxIterations,
    signal: input.signal,
    purse: input.allowance,
    ...(input.callScope !== undefined ? { callScope: input.callScope } : {}),
    completionSchema: { type: "object", properties: { summary: { type: "string" } }, additionalProperties: false },
    checkCompletion: async () => {
      const left = await input.remainingActs();
      if (!left.length) return { ok: true };
      return {
        ok: false,
        issueCodes: [RESET_INCOMPLETE],
        feedback: {
          code: RESET_INCOMPLETE,
          actsToUndo: left.map((act) => ({ act: act.act, did: act.did, ...(act.stillThere?.length ? { stillThere: [...act.stillThere] } : {}) })),
          instruction: "Some lasting acts this build made are still on the site. Undo each listed act through the site's own controls, on the page your task names for it, naming it under undoes, and leave everything that was there before the build began. Complete once none is left."
        }
      };
    }
  });
}

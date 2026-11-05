// One model decision of an attempt, as the template's (`../../../service.ts`'s evidence round) with
// three differences.
//
// **The role's guidance on the provider** (`../../../../../runtime/answer-first/guidance/`), through
// the seam the project supervisor's takes.
//
// **A fresh round's note in front of the evidence.** It is constant for the round, so every
// request stays a byte prefix of the next, and being a `core.` entry it is read as Core's.
//
// **A silent model service is waited out in place.** The loop would give up after three
// unanswered calls and lose its evidence window, and all a new round could do is look again at
// what this one already held. So the wait happens here, inside the decision, with nothing else
// changed: the same state, the same evidence, asked again (the keep-going table decides the
// wait, and an empty balance ends it). It costs nothing, the chat says so, and a Stop wakes it.

import { automationStudioAnswerFirstNext } from "../../../../../runtime/answer-first/keep-going/index.ts";
import { automationStudioActivityDecisionReason } from "../../../../../runtime/automation-activity/index.ts";
import { flowBootstrapHarnessFailure } from "../../../../../runtime/flow-authoring/bootstrap/index.ts";
import type { AutomationStudioLlmEvidenceLoopInput, AutomationStudioLlmProvider, AutomationStudioLlmTaskResult } from "../../../../../runtime/llm/index.ts";
import { automationStudioLlmProviderUnanswered, automationStudioLlmUnusableDecisionError } from "../../../../../runtime/llm/index.ts";
import { AutomationStudioLlmProviderError, type AutomationStudioLlmProviderErrorCode } from "../../../../../runtime/models/failures/index.ts";
import type { JsonObject } from "../../../../../core/index.ts";
import { AUTOMATION_STUDIO_ANSWER_FIRST_COMPLETION_SCHEMA } from "../completion/index.ts";
import { automationStudioAnswerFirstKeep } from "./keep.ts";
import { automationStudioAnswerFirstSay } from "./say.ts";
import type { AutomationStudioAnswerFirstAttemptRun } from "./state.ts";

const BALANCE_CODE = "llm.provider_balance_exhausted";
const SERVER_ERROR_CODE = "llm.provider_http_error";
const NOTE_TOOL_ID = "core.attempt_note";

type Decide = AutomationStudioLlmEvidenceLoopInput["decide"];

/** The loop's `decide` for one round. */
export function automationStudioAnswerFirstDecide(run: AutomationStudioAnswerFirstAttemptRun, round: { ordinal: number; note: JsonObject | undefined; provider: AutomationStudioLlmProvider; startLocation: string | undefined }): Decide {
  const { input } = run;
  const denied = input.binding?.deniedEvidenceKeys ?? [];
  return input.routing.observing(async ({ iteration, tools, evidence, decisionSchema, canComplete, signal }) => {
    input.cancellation.checkpoint();
    input.creation.endIfReadingRefused();
    run.decidedAt = iteration;
    const window = round.note ? [{ callId: `${NOTE_TOOL_ID}.${round.ordinal}`, toolId: NOTE_TOOL_ID, value: round.note }, ...evidence] : evidence;
    const shown = input.routing.shown(window, denied);
    for (;;) {
      const decision = await input.runHarness({
        taskKind: "evidence_tool_decision", projectId: input.projectId, flowId: input.flowId, ...input.promptInstructions,
        evidenceLoop: { iteration, tools, evidence: shown.evidence.map((item) => ({ ...item })), decisionSchema, completionSchema: AUTOMATION_STUDIO_ANSWER_FIRST_COMPLETION_SCHEMA, canComplete },
        flowBootstrap: { registry: input.registry, resolution: input.resolution, size: input.size, routing: shown.context, describedNodeIds: input.nodeDescriptions.ids(), ...(round.startLocation === undefined ? {} : { startLocation: round.startLocation }) },
        provider: round.provider,
        ...(input.provider.tokenLimits ? { tokenLimits: input.provider.tokenLimits } : {}),
        ...(input.provider.timeoutMs !== undefined ? { timeoutMs: input.provider.timeoutMs } : {}),
        expectedOutput: "evidence_tool_decision",
        ...(signal ? { signal } : {})
      });
      counted(run, decision);
      if (decision.ok && decision.response?.kind === "evidence_tool_decision") {
        run.backoffs = 0;
        run.decidedAfterRun = true;
        run.claim = decision.response.decision.kind === "tool_call" ? decision.response.decision.act : undefined;
        // What this spent is on the row before it can act, so a process that dies leaves it counted.
        await automationStudioAnswerFirstKeep(run);
        return automationStudioActivityDecisionReason.attach({ ...decision.response.decision, ...(decision.usage ? { usage: decision.usage } : {}) }, decision.response.summary);
      }
      const codes = decision.diagnostics.filter((diagnostic) => diagnostic.severity === "error").map((diagnostic) => diagnostic.code);
      if (codes.includes(BALANCE_CODE)) throw new AutomationStudioLlmProviderError(BALANCE_CODE, "The model service says the account has no balance left.");
      const silent = automationStudioLlmProviderUnanswered(codes) ? await waitedOut(run, codes, signal) : false;
      if (!silent) throw automationStudioLlmUnusableDecisionError(decision) ?? flowBootstrapHarnessFailure(decision);
    }
  });
}

/** The wait the table gives this silence, taken. False where the table says it is not one to wait for. */
async function waitedOut(run: AutomationStudioAnswerFirstAttemptRun, codes: readonly string[], signal: AbortSignal | undefined): Promise<boolean> {
  const code = codes[0] as AutomationStudioLlmProviderErrorCode;
  const error = new AutomationStudioLlmProviderError(code, "The model service gave no answer.", false, code === SERVER_ERROR_CODE ? 503 : undefined);
  const next = automationStudioAnswerFirstNext({ end: { kind: "thrown", error }, aborted: false, purseRefused: false, achieved: false, backoffs: run.backoffs });
  if (next.kind !== "backoff") return false;
  automationStudioAnswerFirstSay("Waiting for the model service", next.say);
  run.backoffs += 1;
  run.waitedMs += next.waitMs;
  await run.ports.sleep(next.waitMs, signal);
  run.input.cancellation.checkpoint();
  return true;
}

function counted(run: AutomationStudioAnswerFirstAttemptRun, decision: AutomationStudioLlmTaskResult): void {
  run.usage.estimatedInputTokens += decision.request.estimatedInputTokens;
  run.usage.inputTokens += decision.usage?.inputTokens ?? 0;
  run.usage.outputTokens += decision.usage?.outputTokens ?? 0;
  run.usage.totalTokens += decision.usage?.totalTokens ?? 0;
}

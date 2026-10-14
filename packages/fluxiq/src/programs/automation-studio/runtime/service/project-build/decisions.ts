import { randomUUID } from "node:crypto";
import type { JsonObject } from "../../../../../core/index.ts";
import { automationStudioActivityDecisionReason } from "../../activity/index.ts";
import { flowBootstrapHarnessFailure, sanitizedBootstrapAccounting, type AutomationStudioBootstrapAccounting } from "../../flow-bootstrap/index.ts";
import { automationStudioLlmUnusableDecisionError, type AutomationStudioLlmEvidenceLoopInput, type AutomationStudioLlmHarnessInput, type AutomationStudioLlmTaskResult } from "../../llm/index.ts";
import type { generateAutomationStudioFlowCandidateDraft } from "../flow-bootstrap-commands/index.ts";

// Every model decision of a project build (unit A5c): the supervisor's, each
// builder's and each reset's, made as the candidate build makes its own
// (`../flow-bootstrap-commands/candidate-generation.ts`) -- one harness call
// for an `evidence_tool_decision` under the loop's own completion schema --
// and counted together, so the build's accounting is every agent's decisions,
// the instruction reading and every trial's judges.

type DraftInput = Parameters<typeof generateAutomationStudioFlowCandidateDraft>[0];
type Decide = AutomationStudioLlmEvidenceLoopInput["decide"];
type Spend = { inputTokens: number; outputTokens: number; totalTokens: number; estimatedCostUsd: number };

const NOTHING: Spend = Object.freeze({ inputTokens: 0, outputTokens: 0, totalTokens: 0, estimatedCostUsd: 0 });

export class AutomationStudioProjectBuildDecisions {
  private estimatedInputTokens = 0;
  private readonly used: Spend = { ...NOTHING };
  private readonly requestId = `project.${randomUUID()}`;

  constructor(
    private readonly draft: Pick<DraftInput, "harness" | "beforeDecision" | "progress" | "authorityUsage">,
    /** What every trial's judges have spent so far, whole and partial. */
    private readonly judged: () => ReadonlyArray<Spend | undefined>
  ) {}

  /** A decide for one agent's loop: `runHarness` carries that agent's own routing; `completionSchema` is its loop's. */
  decide(input: {
    runHarness(request: AutomationStudioLlmHarnessInput): Promise<AutomationStudioLlmTaskResult>;
    wrapDecision?: ((decide: Decide) => Decide) | undefined;
    completionSchema: JsonObject | undefined;
  }): Decide {
    const decide: Decide = async ({ iteration, tools, evidence, decisionSchema, canComplete, signal }) => {
      this.draft.beforeDecision();
      this.draft.progress(this.accounting(), "provider_request");
      const decision = await input.runHarness({
        ...this.draft.harness, taskKind: "evidence_tool_decision", expectedOutput: "evidence_tool_decision",
        evidenceLoop: { iteration, tools, evidence: evidence.map((entry) => ({ ...entry })), decisionSchema, completionSchema: input.completionSchema ?? { type: "object" }, canComplete },
        ...(signal ? { signal } : {})
      });
      this.estimatedInputTokens += decision.request.estimatedInputTokens;
      for (const key of ["inputTokens", "outputTokens", "totalTokens", "estimatedCostUsd"] as const) this.used[key] += decision.usage?.[key] ?? 0;
      const unusable = decision.ok && decision.response?.kind === "evidence_tool_decision" ? undefined : automationStudioLlmUnusableDecisionError(decision);
      // A reply arrived, usable or not: a failure from here is about the answer (as the candidate build's).
      this.draft.progress(this.accounting(), decision.ok || (unusable !== undefined && !unusable.providerUnanswered) ? "provider_output_validation" : "provider_request");
      if (!decision.ok || decision.response?.kind !== "evidence_tool_decision") throw unusable ?? flowBootstrapHarnessFailure(decision);
      return automationStudioActivityDecisionReason.attach({ ...decision.response.decision, ...(decision.usage ? { usage: decision.usage } : {}) }, decision.response.summary);
    };
    return input.wrapDecision ? input.wrapDecision(decide) : decide;
  }

  /** The build's spend so far: every decision, the instruction reading and every judge. */
  accounting(): AutomationStudioBootstrapAccounting {
    const authority = this.draft.authorityUsage;
    const judged = this.judged().reduce<Spend>((total, spent) => ({
      inputTokens: total.inputTokens + (spent?.inputTokens ?? 0),
      outputTokens: total.outputTokens + (spent?.outputTokens ?? 0),
      totalTokens: total.totalTokens + (spent?.totalTokens ?? 0),
      estimatedCostUsd: total.estimatedCostUsd + (spent?.estimatedCostUsd ?? 0)
    }), { ...NOTHING });
    return sanitizedBootstrapAccounting({
      requestId: this.requestId, estimatedInputTokens: this.estimatedInputTokens + authority.estimatedInputTokens,
      provider: this.draft.harness.provider.metadata.provider, model: this.draft.harness.provider.metadata.model,
      inputTokens: this.used.inputTokens + authority.inputTokens + judged.inputTokens, outputTokens: this.used.outputTokens + authority.outputTokens + judged.outputTokens,
      totalTokens: this.used.totalTokens + authority.totalTokens + judged.totalTokens, estimatedCostUsd: this.used.estimatedCostUsd + authority.estimatedCostUsd + judged.estimatedCostUsd
    });
  }
}

import { AutomationStudioLlmRunBudgetLedger } from "../run-budget.ts";
import type { AutomationStudioLlmRunBudgetProfile } from "./profile.ts";
import type { AutomationStudioFlowRunDetail, AutomationStudioRuntimeSession } from "../../../model/index.ts";

/** One invocation's owner of a run's canonical ledger, including conservative persisted reentry. */
export class AutomationStudioLlmRunPurse {
  current?: { budget: AutomationStudioLlmRunBudgetProfile; ledger: AutomationStudioLlmRunBudgetLedger };
  diagnostic?: { code: string; message: string };
  private runId: string | undefined;

  constructor(readonly history?: { runId: string; gate: unknown }) {}

  /** Queuing alone incurs no activity; any execution or paid evidence makes the receipt mandatory. */
  static forRuntimeSession(session: AutomationStudioRuntimeSession | null, detail: AutomationStudioFlowRunDetail | null): AutomationStudioLlmRunPurse {
    const unused = session?.status === "queued" && session.startedAt === undefined && session.finishedAt === undefined && session.trace === undefined
      && !detail?.interventions.length && !detail?.actionAttempts?.length && !detail?.summary.interventionCount && !detail?.summary.actionAttemptCount
      && !detail?.adaptationIds.length && !detail?.changeProposalIds.length
      && [session.metadata, detail?.metadata, detail?.summary.metadata].every((metadata) => metadata?.llmGate === undefined && metadata?.resultVerification === undefined && metadata?.recoveryTrace === undefined);
    return new AutomationStudioLlmRunPurse(session && !unused ? { runId: session.runId, gate: detail?.metadata?.llmGate } : undefined);
  }

  open(runId: string, budget: AutomationStudioLlmRunBudgetProfile): AutomationStudioLlmRunBudgetLedger | undefined {
    if (this.diagnostic) return undefined;
    if (this.runId !== undefined && this.runId !== runId || this.history && this.history.runId !== runId) return this.refuse("llm_budget.accounting_run_mismatch");
    this.runId = runId;
    if (this.current) {
      // Keep the first whole-run ceilings. A later per-call grant is independent;
      // a lower global profile cannot be safely substituted for an active ledger.
      if (Object.entries(budget.ledger).some(([key, limit]) => limit < this.current!.budget.ledger[key as keyof typeof budget.ledger])) return this.refuse("llm_budget.accounting_profile_incompatible");
      return this.current.ledger;
    }
    const ledger = new AutomationStudioLlmRunBudgetLedger(budget.ledger);
    if (this.history && !ledger.restore(runId, this.history.gate)) return this.refuse("llm_budget.accounting_history_unavailable");
    this.current = { budget, ledger };
    return ledger;
  }

  private refuse(code: string): undefined {
    this.diagnostic = { code, message: "Paid dispatch refused: this run's canonical accounting cannot safely continue." };
    return undefined;
  }
}

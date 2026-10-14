import type { AutomationStudioSiteResetNamedAct } from "../../flow-bootstrap/site-reset/index.ts";
import type { AutomationStudioSubflowBuilderOutcome, AutomationStudioSubflowProposal } from "../../flow-bootstrap/subflow-candidate/index.ts";
import type { AutomationStudioLlmBuildPurse } from "../../llm/build-purse/index.ts";
import type { AutomationStudioLlmEvidenceLoopResult } from "../../llm/index.ts";
import type { AutomationStudioProjectBuilderReturn, AutomationStudioProjectReceiptRef, AutomationStudioProjectSubflowBrief } from "../contracts/index.ts";

// Every way a brief can end, as the return the supervisor reads
// (`contracts/builder-return.ts`). A throw, an allowance refusal or a stop is
// the brief's ending, `partial` when a proposal of its subflow stands and
// `blocked` when none does, with its reason in plain words -- never the
// dispatcher's failure. `done` is said only of a build whose latest proposal's
// trial answered yes, and of a reset that left nothing to undo.

/** What a return's reason may hold (`contracts/builder-return.ts`). */
const MAX_REASON = 2000;
const MAX_ERROR_WORDS = 300;

/** What a brief spent and tried, whichever way it ended. */
export type AutomationStudioProjectDispatchSpend = {
  allowance: AutomationStudioLlmBuildPurse | undefined;
  trials: readonly AutomationStudioProjectReceiptRef[];
  /** The latest proposal Core accepted, for a builder whose loop then threw. */
  accepted?: Readonly<AutomationStudioSubflowProposal> | undefined;
};

export const automationStudioProjectDispatchEnding = Object.freeze({
  /** A brief that never started: nothing spent, nothing tried. */
  notStarted(brief: AutomationStudioProjectSubflowBrief, reason: string): AutomationStudioProjectBuilderReturn {
    return { briefId: brief.briefId, outcome: "blocked", reason: clip(reason), trials: [], spentUsd: 0, calls: 0 };
  },

  /** A builder loop that returned. */
  built(brief: AutomationStudioProjectSubflowBrief, outcome: AutomationStudioSubflowBuilderOutcome, spend: AutomationStudioProjectDispatchSpend): AutomationStudioProjectBuilderReturn {
    const proposal = outcome.proposal ?? spend.accepted;
    if (outcome.loop.ok && proposal) {
      const verdict = outcome.trial?.verdict;
      if (verdict === "yes") return returned(brief, "done", `Revision ${proposal.revision} of the subflow was tried on its own and its trial answered yes.`, spend, proposal);
      const why = verdict === undefined
        ? `The builder completed revision ${proposal.revision}, but no subflow trial could run here, so it stands untried.`
        : `The builder completed revision ${proposal.revision}, but its latest trial answered ${verdict}.`;
      return returned(brief, "partial", why, spend, proposal);
    }
    const ended = outcome.loop.ok ? "The builder completed without a proposal of its subflow." : stopReason(outcome.loop, spend.allowance);
    return returned(brief, proposal ? "partial" : "blocked", ended, spend, proposal);
  },

  /** A builder or reset that threw, or was stopped. */
  thrown(brief: AutomationStudioProjectSubflowBrief, error: unknown, stopped: boolean, spend: AutomationStudioProjectDispatchSpend): AutomationStudioProjectBuilderReturn {
    const refusal = spend.allowance?.refusal;
    const why = stopped
      ? "The build was stopped before this brief finished."
      : refusal
        ? `This brief's allowance could not pay for its next call (${refusal.code}).`
        : `The builder failed: ${errorWords(error)}`;
    return returned(brief, spend.accepted ? "partial" : "blocked", why, spend, spend.accepted);
  },

  /** A reset loop that returned, and what it left to undo. */
  reset(brief: AutomationStudioProjectSubflowBrief, loop: AutomationStudioLlmEvidenceLoopResult, left: readonly AutomationStudioSiteResetNamedAct[], spend: AutomationStudioProjectDispatchSpend): AutomationStudioProjectBuilderReturn {
    if (loop.ok && !left.length) return returned(brief, "done", "Every lasting act this build made is undone; the site is as the build found it.", spend, undefined);
    const still = left.length ? ` ${left.length} act${left.length === 1 ? " is" : "s are"} still to undo: ${left.map((act) => `${act.act} (${act.did})`).join(", ")}.` : "";
    const ended = loop.ok ? "The reset completed." : stopReason(loop, spend.allowance);
    return returned(brief, "blocked", `${ended}${still}`, spend, undefined);
  }
});

function returned(
  brief: AutomationStudioProjectSubflowBrief,
  outcome: AutomationStudioProjectBuilderReturn["outcome"],
  reason: string,
  spend: AutomationStudioProjectDispatchSpend,
  proposal: Readonly<AutomationStudioSubflowProposal> | undefined
): AutomationStudioProjectBuilderReturn {
  const value: AutomationStudioProjectBuilderReturn = {
    briefId: brief.briefId,
    outcome,
    reason: clip(reason),
    trials: spend.trials.map((trial) => ({ ...trial })),
    spentUsd: spend.allowance?.spentUsd() ?? 0,
    calls: spend.allowance?.spentCalls() ?? 0
  };
  if (proposal) value.proposal = { subflowKey: proposal.scope.subflowKey, revision: proposal.revision, digest: proposal.digest };
  return value;
}

/** Why a loop ended without completing: its allowance, when that refused, otherwise its own code. */
function stopReason(loop: Extract<AutomationStudioLlmEvidenceLoopResult, { ok: false }>, allowance: AutomationStudioLlmBuildPurse | undefined): string {
  const refusal = allowance?.refusal;
  if (refusal) return `This brief's allowance could not pay for its next call (${refusal.code}), so the builder stopped.`;
  return `The builder stopped before completing (${loop.code}).`;
}

function errorWords(error: unknown): string {
  const words = error instanceof Error ? error.message : String(error);
  const trimmed = words.trim() || "no reason was given";
  return trimmed.length > MAX_ERROR_WORDS ? `${trimmed.slice(0, MAX_ERROR_WORDS - 3)}...` : trimmed;
}

function clip(reason: string): string {
  return reason.length > MAX_REASON ? `${reason.slice(0, MAX_REASON - 3)}...` : reason;
}

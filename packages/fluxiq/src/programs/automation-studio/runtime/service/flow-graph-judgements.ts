// The service's one write of a verdict against the graph versions it judged.
//
// It is a free function rather than a member because `AutomationStudioService`
// is at its own ratcheted method budget, and because the whole of it is: open
// the project's store, write the rows, close. `run-outcome.ts` decides what the
// verdict is and which versions it was about; this only puts it somewhere.
//
// A failure here propagates, exactly as `saveFlowRunDetail` and
// `writeRuntimeSession` already do on the same path. A project database that
// cannot be written is an operator's problem, and a bookkeeping write that
// quietly did nothing would leave a Flow's history with a hole in it that
// nothing later could tell apart from a run that was never judged -- which is
// the one distinction this whole table exists to hold.
import type { AutomationStudioFlowGraphJudgement } from "../flow-version/index.ts";
import { AutomationStudioProjectFlowGraphJudgementStore, type AutomationStudioProjectDatabasePool } from "../../storage/index.ts";

export async function recordAutomationStudioFlowGraphJudgements(input: {
  pool: AutomationStudioProjectDatabasePool;
  projectId: string;
  judgement: AutomationStudioFlowGraphJudgement;
}): Promise<void> {
  const store = await AutomationStudioProjectFlowGraphJudgementStore.open({ pool: input.pool, projectId: input.projectId });
  try {
    await store.record({
      runId: input.judgement.runId,
      status: input.judgement.status,
      code: input.judgement.code,
      instructionDigest: input.judgement.instructionDigest,
      decidedAtMs: input.judgement.decidedAtMs,
      versions: input.judgement.versions.map((version) => ({ graphFlowId: version.graphFlowId, revision: version.revision, ...(version.subflowId ? { subflowId: version.subflowId } : {}) }))
    });
  } finally {
    await store.close();
  }
}

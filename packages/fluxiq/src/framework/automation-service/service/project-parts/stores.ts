// The two stores the library reads, opened together and held for one call, and what
// a version's trust is read from. A project database that cannot be reached is the
// closed `parts.unavailable` answer, never an error the caller has to catch.
import type { AutomationStudioSubflowCard } from "@fluxiq/contracts/automation";
import { automationStudioPartTrustEvidenceFromJudgements, automationStudioPartTrustEvidenceFromRuns, completeAutomationStudioPartCard, lastAutomationStudioPartVerdict, type AutomationStudioPartTrustEvidence } from "../../../../runtime/project-parts/index.ts";
import {
  AutomationStudioProjectFlowGraphJudgementStore,
  AutomationStudioProjectPartStore,
  AutomationStudioProjectStoreUnavailableError,
  type AutomationStudioFlowGraphJudgementRecord,
  type AutomationStudioProjectDatabasePool,
  type AutomationStudioProjectPartVersionRecord
} from "../../../persistence/automation/index.ts";
import type { AutomationStudioProjectPartsRefusal } from "./library-types.ts";

export const PARTS_UNAVAILABLE: AutomationStudioProjectPartsRefusal = { ok: false, code: "parts.unavailable", message: "This project's library of saved parts is not available right now." };

export type AutomationStudioProjectPartStores = {
  parts: AutomationStudioProjectPartStore;
  /** The card of a version as it stands now: stored words with the trust its evidence earns. Undefined for a stored card the contract no longer accepts. */
  cardOf(version: AutomationStudioProjectPartVersionRecord): Promise<AutomationStudioSubflowCard | undefined>;
  /** Where the version's most recent verdict stands: `failed` while the newest is a failure, and nothing when no run has said. */
  verdictOf(version: AutomationStudioProjectPartVersionRecord): Promise<"passed" | "failed" | undefined>;
};

export async function withProjectPartStores<T>(pool: AutomationStudioProjectDatabasePool | undefined, projectId: string, use: (stores: AutomationStudioProjectPartStores) => Promise<T>): Promise<T | AutomationStudioProjectPartsRefusal> {
  if (!pool) return PARTS_UNAVAILABLE;
  const opened = await openStores(pool, projectId);
  if ("ok" in opened) return opened;
  try {
    return await use(storesOf(opened.parts, opened.judgements));
  } finally {
    await opened.judgements.close();
    await opened.parts.close();
  }
}

async function openStores(pool: AutomationStudioProjectDatabasePool, projectId: string): Promise<{ parts: AutomationStudioProjectPartStore; judgements: AutomationStudioProjectFlowGraphJudgementStore } | AutomationStudioProjectPartsRefusal> {
  try {
    const parts = await AutomationStudioProjectPartStore.open({ pool, projectId });
    try {
      return { parts, judgements: await AutomationStudioProjectFlowGraphJudgementStore.open({ pool, projectId }) };
    } catch (error) {
      await parts.close();
      throw error;
    }
  } catch (error) {
    if (AutomationStudioProjectStoreUnavailableError.is(error)) return PARTS_UNAVAILABLE;
    throw error;
  }
}

function storesOf(parts: AutomationStudioProjectPartStore, judgements: AutomationStudioProjectFlowGraphJudgementStore): AutomationStudioProjectPartStores {
  const judged = new Map<string, Promise<AutomationStudioFlowGraphJudgementRecord[]>>();
  const judgementsOf = (flowId: string) => {
    if (!judged.has(flowId)) judged.set(flowId, judgements.listForFlow({ flowId, limit: 500 }));
    return judged.get(flowId)!;
  };
  const evidenceOf = async (version: AutomationStudioProjectPartVersionRecord): Promise<AutomationStudioPartTrustEvidence[]> => {
    // Every graph the version was saved from: judged runs of a second Flow's copy, or of the applied copy of a part first saved from a draft, are its evidence too.
    const sources = [{ graphFlowId: version.sourceGraphFlowId, revision: version.sourceGraphRevision }, ...(await parts.listVersionSources(version.partId, version.version))];
    const rows: AutomationStudioFlowGraphJudgementRecord[] = [];
    const seen = new Set<string>();
    for (const source of sources) {
      const key = `${source.graphFlowId}@${source.revision}`;
      if (source.revision === null || seen.has(key)) continue;
      seen.add(key);
      rows.push(...(await judgementsOf(source.graphFlowId)).filter((row) => row.revisionNumber === source.revision));
    }
    // A judged run's verdict left on the version's own run row counts once: where a judgement row of the same run is read for it, that row is the evidence.
    const judgedRuns = new Set(rows.map((row) => row.runId));
    const runs = (await parts.listRuns({ partId: version.partId, version: version.version })).filter((run) => !(run.judged && judgedRuns.has(run.runId)));
    return [...automationStudioPartTrustEvidenceFromJudgements(rows), ...automationStudioPartTrustEvidenceFromRuns(runs)];
  };
  return {
    parts,
    async cardOf(version) {
      const completed = completeAutomationStudioPartCard(version.card, await evidenceOf(version));
      return completed.ok ? completed.card : undefined;
    },
    async verdictOf(version) {
      return lastAutomationStudioPartVerdict(await evidenceOf(version));
    }
  };
}

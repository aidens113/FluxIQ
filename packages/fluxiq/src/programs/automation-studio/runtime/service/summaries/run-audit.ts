import { createHash } from "node:crypto";
import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioFlowAdaptation } from "../../../model/index.ts";
import { uniqueStrings } from "../collections.ts";
import { compactJsonObject } from "../compact-json.ts";
import type { AutomationStudioFacadePorts } from "../facade-ports.ts";
import { isJsonRecord } from "../json-values.ts";
import { flowRunSummaryWithInterventionSummaries } from "./conversions.ts";

function adaptationMutationEvidence(adaptation: AutomationStudioFlowAdaptation): JsonObject[] {
  const record = isJsonRecord(adaptation.metadata?.applicationRecord) ? adaptation.metadata.applicationRecord : undefined;
  const mutations = Array.isArray(record?.mutations) ? record.mutations.filter(isJsonRecord) : [];
  return mutations.map((mutation) => compactJsonObject({
    patchKind: mutation.patchKind,
    artifactKind: mutation.artifactKind,
    artifactId: mutation.artifactId,
    targetKind: mutation.targetKind,
    targetId: mutation.targetId,
    before: mutation.before,
    after: mutation.after,
    rollback: mutation.rollback,
    validation: mutation.validation
  }));
}

// One Flow run read back as an auditable document: the run detail, and the
// adaptations that touched it with the before/after of every mutation they
// applied. It holds no state of its own -- everything it needs it reads
// through the service's own accessors.
export class AutomationStudioFlowRunAudit {
  constructor(
    private readonly facade: AutomationStudioFacadePorts
  ) {}

  async exportFlowRunAudit(projectId: string, runId: string): Promise<JsonObject | null> {
    const detail = await this.facade.getFlowRunDetail(projectId, runId);
    if (!detail) return null;
    const adaptationIds = uniqueStrings(detail.adaptationIds ?? []);
    const adaptations = (await Promise.all(adaptationIds.map(async (adaptationId) => {
      const flowId = detail.summary.flowId;
      const adaptation = await this.facade.getFlowAdaptation(projectId, flowId, adaptationId).catch(() => null);
      if (!adaptation) return null;
      return compactJsonObject({
        adaptationId: adaptation.adaptationId,
        flowId: adaptation.flowId,
        trigger: adaptation.trigger,
        status: adaptation.status,
        riskLevel: adaptation.riskLevel,
        createdAt: adaptation.createdAt,
        updatedAt: adaptation.updatedAt,
        patch: adaptation.patch,
        validationResults: adaptation.validationResults,
        mutationEvidence: adaptationMutationEvidence(adaptation),
        approvalDecision: adaptation.metadata?.approvalDecision
      });
    }))).filter(isJsonRecord);
    const runDetailJson = JSON.stringify(detail);
    return compactJsonObject({
      schemaVersion: "0.1",
      exportedAt: Date.now(),
      projectId,
      runId,
      manifest: {
        actionCount: detail.actionAttempts?.length ?? detail.summary.actionAttemptCount ?? 0,
        recoveryCount: detail.recoveryAttempts?.length ?? 0,
        routeDecisionCount: detail.routeDecisions.length,
        subflowEntryCount: detail.subflows.length,
        interventionCount: detail.interventions.length,
        adaptationCount: adaptations.length,
        evidenceCount: detail.evidence?.length ?? 0
      },
      integrity: { algorithm: "sha256", runDetailHash: createHash("sha256").update(runDetailJson).digest("hex") },
      runDetail: detail,
      interventionSummaries: flowRunSummaryWithInterventionSummaries(detail).interventionSummaries ?? [],
      adaptations,
      retention: {
        rawPromptsRetained: false,
        compactContextRetained: true,
        sensitiveValuesRedacted: true
      }
    });
  }
}

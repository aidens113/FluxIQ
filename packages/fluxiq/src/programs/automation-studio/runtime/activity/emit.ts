import type { AutomationStudioActivityEmission } from "./contracts.ts";
import { automationStudioActivityHub } from "./default-hub.ts";
import { automationStudioActivityStorage } from "./storage.ts";

/**
 * Publishes one activity event under the current unit of work. Outside a
 * scope, or in a run not yet bound, it does nothing. It never throws: the
 * stream reports the work and must not be able to fail it.
 */
export function emitAutomationStudioActivity(emission: AutomationStudioActivityEmission): void {
  const frame = automationStudioActivityStorage.getStore();
  if (!frame || frame.pending) return;
  const { scope } = frame;
  try {
    automationStudioActivityHub.publish({
      activityId: `${scope.kind}:${scope.id}`,
      subject: { kind: scope.kind, id: scope.id, projectId: scope.projectId, ...(scope.flowId === undefined ? {} : { flowId: scope.flowId }) },
      phase: emission.phase,
      label: emission.label,
      ...(emission.step === undefined ? {} : { step: emission.step }),
      ...(emission.detail === undefined ? {} : { detail: emission.detail }),
      ...(scope.conversationId === undefined ? {} : { conversationId: scope.conversationId }),
      ...(emission.final === undefined ? {} : { final: emission.final })
    });
  } catch { /* best-effort: the activity stream must never fail the work it reports */ }
}

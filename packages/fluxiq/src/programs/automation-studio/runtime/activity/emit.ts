import type { AutomationStudioActivityEmission } from "./contracts.ts";
import { automationStudioActivityHub } from "./default-hub.ts";
import { automationStudioActivityStorage } from "./storage.ts";
import { currentAutomationStudioConversation } from "../conversations/context/index.ts";

/**
 * Publishes one activity event under the current unit of work. Outside a
 * scope, or in a run not yet bound, it does nothing. It never throws: the
 * stream reports the work and must not be able to fail it.
 *
 * A scope that names no thread takes the chat thread the work was started
 * from, when there is one for the same project, so a build or run the chat
 * started is shown in that chat and its reader knows to refresh.
 */
export function emitAutomationStudioActivity(emission: AutomationStudioActivityEmission): void {
  const frame = automationStudioActivityStorage.getStore();
  if (!frame || frame.pending) return;
  const { scope } = frame;
  try {
    const conversationId = scope.conversationId ?? currentAutomationStudioConversation(scope.projectId)?.conversationId;
    automationStudioActivityHub.publish({
      activityId: `${scope.kind}:${scope.id}`,
      subject: { kind: scope.kind, id: scope.id, projectId: scope.projectId, ...(scope.flowId === undefined ? {} : { flowId: scope.flowId }) },
      phase: emission.phase,
      label: emission.label,
      ...(emission.step === undefined ? {} : { step: emission.step }),
      ...(emission.detail === undefined ? {} : { detail: emission.detail }),
      ...(conversationId === undefined ? {} : { conversationId }),
      ...(emission.final === undefined ? {} : { final: emission.final })
    });
  } catch { /* best-effort: the activity stream must never fail the work it reports */ }
}

export type AutomationStudioWebContext = {
  operatorUserId: string;
  clientId?: string;
  activeProjectId: string | null;
  activeFlowId?: string | null;
  updatedAt: number;
};

export function setAutomationStudioContext(
  contexts: Record<string, AutomationStudioWebContext>,
  input: { operatorUserId: string; clientId?: string; activeProjectId: string | null; activeFlowId?: string | null },
  now = Date.now()
): void {
  contexts[automationStudioContextKey(input.operatorUserId, input.clientId)] = {
    operatorUserId: input.operatorUserId,
    ...(input.clientId ? { clientId: input.clientId } : {}),
    activeProjectId: input.activeProjectId,
    activeFlowId: input.activeProjectId ? input.activeFlowId ?? null : null,
    updatedAt: now
  };
}

export function resolveAutomationStudioContext(
  contexts: Record<string, AutomationStudioWebContext>,
  operatorUserId: string,
  clientId?: string
): AutomationStudioWebContext | undefined {
  if (clientId) {
    const clientContext = contexts[automationStudioContextKey(operatorUserId, clientId)];
    if (clientContext) return clientContext;
  }
  return contexts[automationStudioContextKey(operatorUserId)];
}

/**
 * The project a recording a paired client starts goes into: the person's current project, as the panel and
 * their clients last set it (`POST /api/client-gateway/automation-studio-context`).
 *
 * This used to hold for five minutes only (`AUTOMATION_STUDIO_CONTEXT_LEASE_MS`). That lease was never
 * authority: who may start a recording is settled by pairing, by the operator identity on the gateway
 * session, and by the permission of the route that sets the context. It was a staleness guard. The value
 * was then written only by an open Studio page, as a mark that the page was still there with that project
 * open, so a browser that vanished could not go on directing recordings into the project it last held.
 *
 * Since t1095 the value is the person's lasting current project, one per person, which the panel writes on
 * every switch and adopts on load, and which a paired client may set for itself. It no longer says that a
 * page is open, so its age says nothing, and the lease would refuse a recording just because nobody switched
 * project for five minutes. The guard it stood for now lives where the value is set: each write is decided by
 * IAM and the domain, a client bound to one project can set no other, and clearing it is an explicit write.
 *
 * A request that names another project than the current one is still refused
 * (`recording.project_context_mismatch`), and one with no current project is `recording.project_required`.
 */
export function resolveClientRecordingProject(
  contexts: Record<string, AutomationStudioWebContext>,
  input: { operatorUserId?: string; clientId: string; requestedProjectId?: string | null }
):
  | { ok: true; projectId: string; taskId?: string }
  | { ok: false; code: "recording.project_required" | "recording.project_context_mismatch"; activeProjectId: string | null; contextUpdatedAt: number } {
  const context = input.operatorUserId ? resolveAutomationStudioContext(contexts, input.operatorUserId, input.clientId) : undefined;
  if (!context?.activeProjectId) {
    return { ok: false, code: "recording.project_required", activeProjectId: context?.activeProjectId ?? null, contextUpdatedAt: context?.updatedAt ?? 0 };
  }
  if (input.requestedProjectId && input.requestedProjectId !== context.activeProjectId) {
    return { ok: false, code: "recording.project_context_mismatch", activeProjectId: context.activeProjectId, contextUpdatedAt: context.updatedAt };
  }
  return { ok: true, projectId: context.activeProjectId, ...(context.activeFlowId ? { taskId: context.activeFlowId } : {}) };
}

function automationStudioContextKey(operatorUserId: string, clientId?: string): string {
  return `${encodeURIComponent(operatorUserId)}:${clientId ? encodeURIComponent(clientId) : "*"}`;
}

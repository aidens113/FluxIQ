export type AutomationStudioWebContext = {
  operatorUserId: string;
  clientId?: string;
  activeProjectId: string | null;
  updatedAt: number;
};

export function setAutomationStudioContext(
  contexts: Record<string, AutomationStudioWebContext>,
  input: { operatorUserId: string; clientId?: string; activeProjectId: string | null },
  now = Date.now()
): void {
  contexts[automationStudioContextKey(input.operatorUserId, input.clientId)] = {
    operatorUserId: input.operatorUserId,
    ...(input.clientId ? { clientId: input.clientId } : {}),
    activeProjectId: input.activeProjectId,
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

export function resolveClientRecordingProject(
  contexts: Record<string, AutomationStudioWebContext>,
  input: { operatorUserId?: string; clientId: string; requestedProjectId?: string | null },
  now = Date.now(),
  freshnessMs = 10_000
):
  | { ok: true; projectId: string }
  | { ok: false; code: "recording.project_required" | "recording.project_context_mismatch"; activeProjectId: string | null; contextUpdatedAt: number } {
  const context = input.operatorUserId ? resolveAutomationStudioContext(contexts, input.operatorUserId, input.clientId) : undefined;
  const isFresh = context ? now - context.updatedAt < freshnessMs : false;
  if (!context?.activeProjectId || !isFresh) {
    return { ok: false, code: "recording.project_required", activeProjectId: context?.activeProjectId ?? null, contextUpdatedAt: context?.updatedAt ?? 0 };
  }
  if (input.requestedProjectId && input.requestedProjectId !== context.activeProjectId) {
    return { ok: false, code: "recording.project_context_mismatch", activeProjectId: context.activeProjectId, contextUpdatedAt: context.updatedAt };
  }
  return { ok: true, projectId: context.activeProjectId };
}

function automationStudioContextKey(operatorUserId: string, clientId?: string): string {
  return `${encodeURIComponent(operatorUserId)}:${clientId ? encodeURIComponent(clientId) : "*"}`;
}

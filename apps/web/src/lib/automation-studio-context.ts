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
 * How long a stamped Automation Studio context keeps directing recordings that
 * a paired client starts.
 *
 * This bounds the liveness of the approving Studio page. It is not a limit on
 * how long an operator's decision stays usable: who may start a recording is
 * settled by pairing, by the operator identity on the gateway session, and by
 * the `runtime.control` permission on the endpoint that stamps this context.
 * All the timestamp decides is whether a Studio page is still there with that
 * project open, so a browser that vanished cannot go on redirecting later
 * recordings into the project it last held.
 *
 * A page that closes cleanly clears its context at once, in
 * `observeAutomationStudioGatewayContext`, so this window covers only a Studio
 * that died without saying goodbye: a crash, a kill, a lost machine. It is
 * measured from the last moment the page said it was alive, and before an
 * extension-initiated recording that moment is the operator switching away from
 * Studio to the page they mean to record. The window therefore has to cover the
 * whole excursion that follows: opening the target site, signing in, reaching
 * the right screen, then pressing Record.
 *
 * It was 10 s while the Studio republished its context every 3 s, so two missed
 * beats expired it. That heartbeat was removed on 2026-08-27 (b891e67, under
 * "idle Studio does no application polling") and the 10 s outlived it, which
 * left an extension-initiated recording refused unless the operator had touched
 * the Studio tab within the previous ten seconds. The heartbeat cannot simply
 * come back: browsers throttle timers in a hidden tab to roughly once a minute,
 * so the one case that needs it is the one case it would not serve.
 */
export const AUTOMATION_STUDIO_CONTEXT_LEASE_MS = 300_000;

export function resolveClientRecordingProject(
  contexts: Record<string, AutomationStudioWebContext>,
  input: { operatorUserId?: string; clientId: string; requestedProjectId?: string | null },
  now = Date.now(),
  freshnessMs = AUTOMATION_STUDIO_CONTEXT_LEASE_MS
):
  | { ok: true; projectId: string; taskId?: string }
  | { ok: false; code: "recording.project_required" | "recording.project_context_mismatch"; activeProjectId: string | null; contextUpdatedAt: number } {
  const context = input.operatorUserId ? resolveAutomationStudioContext(contexts, input.operatorUserId, input.clientId) : undefined;
  const isFresh = context ? now - context.updatedAt < freshnessMs : false;
  if (!context?.activeProjectId || !isFresh) {
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

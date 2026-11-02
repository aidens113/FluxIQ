import type { AutomationStudioTrialChangeAct, AutomationStudioTrialChangeSession } from "../trial-change/index.ts";
import { AutomationStudioSiteResetCallbackPolicies } from "./policies.ts";
import { AutomationStudioSiteResetObservation } from "./scope.ts";
import { AutomationStudioSiteResetSessions } from "./sessions.ts";
import { automationStudioSiteResetTrialContext } from "./trial-context.ts";

/** Deferred reads enter under the current original trial, never a closed before-trial child. */
export async function finishAutomationStudioSiteResetSession(invocation: object, session: AutomationStudioTrialChangeSession, acts: readonly AutomationStudioTrialChangeAct[], signal?: AbortSignal): Promise<Awaited<ReturnType<AutomationStudioTrialChangeSession["finish"]>>> {
  const original = AutomationStudioSiteResetSessions.of(session);
  const current = automationStudioSiteResetTrialContext(invocation);
  if (original && (!current || current.parent.reservation !== original.reservation || current.originalRoot !== original.root || Object.getOwnPropertyDescriptor(session, "finish")?.value !== original.finish)) throw new Error("site_reset.session_origin_changed");
  const finish = original?.finish ?? session.finish;
  const args: Parameters<typeof finish> = [acts, signal];
  const call = { receiver: session, callback: finish, args };
  if (!current) return await finish.apply(session, args);
  const previous = AutomationStudioSiteResetObservation.of(original?.invocation);
  const callbacks = current.callbacks;
  AutomationStudioSiteResetCallbackPolicies.manage(callbacks, call);
  const managed = callbacks.isManaged(call);
  const prepared = await callbacks.prepare(callbacks.forParent(current.parent), call, signal);
  const scope = original ? new AutomationStudioSiteResetObservation(original.invocation, { ...current, parent: callbacks.context(prepared) }, original.options, previous) : undefined;
  try {
    signal?.throwIfAborted();
    const returned = await callbacks.invoke(prepared, call);
    if (!managed) callbacks.unknown(prepared);
    await callbacks.flush();
    return returned;
  } finally { scope?.close(); }
}

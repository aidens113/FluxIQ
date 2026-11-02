import type { ExecutionEntry, ExecutionObservationContext } from "../../../../../runtime/execution-admission/index.ts";
import type { AutomationStudioTrialChangeSession } from "../trial-change/index.ts";
import { AutomationStudioSiteResetCallbackPolicies } from "./policies.ts";
import { AutomationStudioSiteResetObservation } from "./scope.ts";

/** Only the actual Core session factory attaches its original deferred callback and options. */
export class AutomationStudioSiteResetSessions {
  private static readonly originals = new WeakMap<AutomationStudioTrialChangeSession, { readonly finish: AutomationStudioTrialChangeSession["finish"]; readonly invocation: object; readonly options: object; readonly root: ExecutionEntry | undefined; readonly reservation: ExecutionObservationContext["reservation"] }>();

  static bind(session: AutomationStudioTrialChangeSession, invocation: object | undefined): void {
    const scope = AutomationStudioSiteResetObservation.of(invocation);
    if (!scope || !invocation) return;
    if (this.originals.has(session)) throw new Error("site_reset.session_rebound");
    const finish = session.finish;
    this.originals.set(session, { finish, invocation, options: scope.options, root: scope.context.originalRoot, reservation: scope.context.parent.reservation });
    AutomationStudioSiteResetCallbackPolicies.remember(session, finish, "frame");
  }

  static of(session: AutomationStudioTrialChangeSession) { return this.originals.get(session); }
}

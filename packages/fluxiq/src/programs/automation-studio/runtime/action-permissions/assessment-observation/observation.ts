import { readAutomationStudioResolvedActionEffect, type AutomationStudioResolvedActionEffect } from "../../../nodes/action-effect/index.ts";
import { automationStudioActionAssessmentScopes } from "./context.ts";
import type { AutomationStudioActionAssessmentSettled, AutomationStudioActionAssessmentSource, AutomationStudioActionAssessmentTicket } from "./types.ts";

/** Begin before parsing so an unreadable or unfinished assessment stays visible. */
export function beginAutomationStudioActionAssessment(source?: AutomationStudioActionAssessmentSource): AutomationStudioActionAssessmentTicket {
  const scopes = automationStudioActionAssessmentScopes();
  const identity = Object.freeze({});
  const owned = source === undefined ? undefined : Object.freeze({ kind: source.kind, id: source.id, ref: source.ref });
  for (const scope of scopes) {
    scope.observe(owned === undefined ? { kind: "started", identity } : { kind: "started", identity, source: owned });
  }
  return Object.freeze({
    veto(effect: AutomationStudioResolvedActionEffect) {
      let denied = false;
      for (const scope of scopes) {
        try {
          const input = owned === undefined ? { identity, effect } : { identity, source: owned, effect };
          if (scope.veto?.(input) === true) denied = true;
        } catch {
          denied = true;
        }
      }
      return denied;
    },
    settle(value: AutomationStudioActionAssessmentSettled) {
      const effect = readAutomationStudioResolvedActionEffect(value.effect);
      Object.freeze(effect.permissionConsequences);
      Object.freeze(effect);
      const settled = Object.freeze({ effect, permitted: value.permitted });
      for (const scope of scopes) scope.observe({ kind: "settled", identity, value: settled });
    }
  });
}

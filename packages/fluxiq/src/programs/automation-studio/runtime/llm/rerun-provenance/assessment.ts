import { automationStudioResolvedActionEffectRepeatSafe, combineAutomationStudioResolvedActionEffects, readAutomationStudioResolvedActionEffect, type AutomationStudioResolvedActionEffect } from "../../../nodes/action-effect/index.ts";
import type { AutomationStudioActionAssessmentEvent, AutomationStudioActionAssessmentPreflight, AutomationStudioActionAssessmentScope, AutomationStudioActionAssessmentSource } from "../../action-permissions/assessment-observation/index.ts";

type Assessment = {
  source: AutomationStudioActionAssessmentSource | undefined;
  settled: boolean;
  preflight?: AutomationStudioResolvedActionEffect;
};

/** Host-local per-call proof. No observation or missing primary is never an empty safe floor. */
export function createAutomationStudioLlmRerunAssessment(input: Readonly<{
  callId: string;
  toolId: string;
  active(): boolean;
  execution?: Readonly<{
    envelope: AutomationStudioResolvedActionEffect;
    available(): boolean;
    held(): void;
  }>;
}>) {
  const assessments = new Map<object, Assessment>();
  let combined: AutomationStudioResolvedActionEffect | undefined;
  let primary = false;
  let invalid = false;
  let vetoed = false;

  function observe(event: AutomationStudioActionAssessmentEvent): void {
    if (!input.active()) return;
    try {
      if (event.kind === "started") {
        if (assessments.has(event.identity)) {
          invalid = true;
          return;
        }
        assessments.set(event.identity, { source: event.source, settled: false });
        return;
      }
      const assessment = assessments.get(event.identity);
      if (!assessment || assessment.settled || typeof event.value.permitted !== "boolean"
        || (input.execution !== undefined && assessment.preflight === undefined)) {
        invalid = true;
        return;
      }
      const effect = readAutomationStudioResolvedActionEffect(event.value.effect);
      assessment.settled = true;
      if (!event.value.permitted) invalid = true;
      if (event.value.permitted && owns(assessment.source)) primary = true;
      combined = combineAutomationStudioResolvedActionEffects([combined, effect]);
    } catch {
      invalid = true;
    }
  }

  function owns(source: AutomationStudioActionAssessmentSource | undefined): boolean {
    return source?.kind === "exploration_step" && source.id === input.toolId && source.ref === input.callId;
  }

  function veto(value: AutomationStudioActionAssessmentPreflight): boolean {
    const execution = input.execution;
    if (!execution) return false;
    let denied = !input.active() || invalid || vetoed;
    try {
      const assessment = assessments.get(value.identity);
      const effect = readAutomationStudioResolvedActionEffect(value.effect);
      if (!assessment || assessment.settled || assessment.preflight) denied = true;
      else assessment.preflight = effect;
      if (!execution.available() || !automationStudioResolvedActionEffectRepeatSafe(effect)
        || !within(effect, execution.envelope)) denied = true;
      for (const [identity, pending] of assessments) {
        if (identity !== value.identity && !pending.settled && pending.preflight === undefined) denied = true;
      }
    } catch {
      denied = true;
    }
    if (denied) {
      vetoed = true;
      execution.held();
    }
    return denied;
  }

  function proof(): AutomationStudioResolvedActionEffect | undefined {
    if (invalid || vetoed || !primary || !combined) return undefined;
    for (const assessment of assessments.values()) if (!assessment.settled) return undefined;
    const owned = readAutomationStudioResolvedActionEffect(combined);
    if (input.execution && (!automationStudioResolvedActionEffectRepeatSafe(owned) || !within(owned, input.execution.envelope))) return undefined;
    Object.freeze(owned.permissionConsequences);
    return Object.freeze(owned);
  }

  const scope: AutomationStudioActionAssessmentScope = input.execution === undefined ? { observe } : { observe, veto };
  return Object.freeze({ scope: Object.freeze(scope), proof, vetoed: () => vetoed });
}

function within(effect: AutomationStudioResolvedActionEffect, envelope: AutomationStudioResolvedActionEffect): boolean {
  const accepted = readAutomationStudioResolvedActionEffect(envelope);
  const rank = { observe: 0, state: 1, commit: 2 };
  return rank[effect.effectClass] <= rank[accepted.effectClass]
    && effect.permissionConsequences.every((consequence) => accepted.permissionConsequences.includes(consequence))
    && (effect.effectClass !== "state" || (effect.repeatSafe === true && accepted.repeatSafe === true));
}

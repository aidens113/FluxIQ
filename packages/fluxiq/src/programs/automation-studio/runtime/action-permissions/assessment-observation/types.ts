import type { AutomationStudioResolvedActionEffect } from "../../../nodes/action-effect/index.ts";

/** Trusted call ownership supplied by the gate's host, never declaration JSON. */
export type AutomationStudioActionAssessmentSource = Readonly<{
  kind: "exploration_step" | "flow_step";
  id: string;
  ref: string;
}>;

export type AutomationStudioActionAssessmentSettled = Readonly<{
  effect: AutomationStudioResolvedActionEffect;
  permitted: boolean;
}>;

export type AutomationStudioActionAssessmentEvent =
  | Readonly<{ kind: "started"; identity: object; source?: AutomationStudioActionAssessmentSource }>
  | Readonly<{ kind: "settled"; identity: object; value: AutomationStudioActionAssessmentSettled }>;

export type AutomationStudioActionAssessmentPreflight = Readonly<{
  identity: object;
  source?: AutomationStudioActionAssessmentSource;
  effect: AutomationStudioResolvedActionEffect;
}>;

/** Private deny-only observer. False/absence leaves ordinary permission in charge. */
export type AutomationStudioActionAssessmentScope = Readonly<{
  observe(event: AutomationStudioActionAssessmentEvent): void;
  veto?(input: AutomationStudioActionAssessmentPreflight): boolean;
}>;

export type AutomationStudioActionAssessmentTicket = Readonly<{
  veto(effect: AutomationStudioResolvedActionEffect): boolean;
  settle(value: AutomationStudioActionAssessmentSettled): void;
}>;

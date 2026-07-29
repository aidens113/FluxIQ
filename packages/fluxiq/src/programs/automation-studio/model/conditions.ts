import type { JsonObject } from "../../../core";

export type AutomationConditionOperator =
  | "equals"
  | "not_equals"
  | "exists"
  | "greater_than"
  | "less_than"
  | "contains"
  | "matches"
  | "similar_to"
  | "changed"
  | "increased"
  | "decreased"
  | "became_true"
  | "became_false"
  | "stable_for";

export type AutomationCondition = {
  signalPath: string;
  operator: AutomationConditionOperator;
  expected?: unknown;
  weight?: number;
  required?: boolean;
  tolerance?: number;
  metadata?: JsonObject;
};

export type WeightedAutomationCondition = AutomationCondition & {
  weight: number;
};

export type AutomationConditionExpression = AutomationCondition | AutomationConditionGroup;

export type AutomationConditionGroup =
  | { type: "all"; conditions: AutomationConditionExpression[]; metadata?: JsonObject }
  | { type: "any"; conditions: AutomationConditionExpression[]; metadata?: JsonObject }
  | { type: "none"; conditions: AutomationConditionExpression[]; metadata?: JsonObject }
  | { type: "weighted"; threshold: number; conditions: WeightedAutomationCondition[]; metadata?: JsonObject };

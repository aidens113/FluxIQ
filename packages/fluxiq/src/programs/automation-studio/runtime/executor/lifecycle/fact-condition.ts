// Fact conditions and their three-valued results (state-aware recovery plan, C9).
//
// This module owns the shapes only. Core never interprets `fact`: it is a host
// path or check kind, evaluated in one batch through the host's
// `fact-evaluation` capability, which answers `true`, `false` or `unknown` per
// condition with an evidence reference and the time it was captured. A fact is
// never a model's claim and never a Flow variable.

import type { JsonObject } from "../../../../../core/index.ts";

/** The comparisons a fact condition may ask of its fact. */
export const AUTOMATION_STUDIO_FACT_CONDITION_OPS = Object.freeze(["exists", "absent", "visible", "enabled", "equals", "contains", "matches", "count"] as const);

/** One comparison a fact condition may ask. */
export type AutomationStudioFactConditionOp = (typeof AUTOMATION_STUDIO_FACT_CONDITION_OPS)[number];

/** What a condition compares its fact with: a literal, a bound interface input, or a named run value. */
export type AutomationStudioFactConditionValue =
  | string
  | number
  | boolean
  | null
  | { input: string }
  | { value: string };

/**
 * One declarative condition over the host's observed state. `target` is a
 * durable target in the host's own form, carried and never read by Core.
 */
export type AutomationStudioFactCondition = {
  fact: string;
  op: AutomationStudioFactConditionOp;
  value?: AutomationStudioFactConditionValue;
  target?: JsonObject;
};

/**
 * A condition's answer. `unknown` is its own value: it never satisfies a
 * guard, and it is not `false` either -- a `when` with an `unknown` part does
 * not run its handler, and an entry with one is not eligible.
 */
export type AutomationStudioFactTruth = "true" | "false" | "unknown";

/** What the host answered for one condition. */
export type AutomationStudioFactConditionResult = {
  truth: AutomationStudioFactTruth;
  evidenceRef?: string;
  capturedAt: number;
};

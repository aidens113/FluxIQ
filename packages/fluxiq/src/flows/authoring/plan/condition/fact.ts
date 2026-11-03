import type { JsonObject } from "../../../../core/index.ts";

/**
 * A fact a run observes on the page, as the state-aware recovery contract
 * names it (C9): what to check (`fact`, a check kind the host interprets), how
 * (`op`), against what (`value`, a literal or a Flow input by name) and where
 * (`target`, the handle the evidence printed, a locator the host interprets,
 * written by a hand-authored Flow (t402), or a dialog by its kind and
 * name). Core never interprets `fact` or `target`; the host evaluates the
 * condition and answers true, false or unknown, and unknown never holds.
 *
 * A handle is resolved at bootstrap completion, as a step's target is
 * (`../../llm/harness-options/plan-fact-targets.ts`), into the durable target
 * the domain answers with, in its own form: so a validated plan's target is a
 * dialog or that object, and never a handle.
 *
 * Mirrors the contract's `FactCondition` by name and shape, so the runtime's own
 * type (R1, `executor/lifecycle/`) can replace it without the plan changing.
 */
export type AutomationStudioFlowBootstrapFactCondition = {
  fact: string;
  op: "exists" | "absent" | "visible" | "enabled" | "equals" | "contains" | "matches" | "count";
  value?: string | number | boolean | { input: string } | { value: string };
  target?: { handle: string } | { locator: string } | { kind: "dialog"; role: string; name: string } | JsonObject;
};

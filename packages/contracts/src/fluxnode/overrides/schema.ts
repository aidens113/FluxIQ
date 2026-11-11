// Overrides: the typed way a developer changes how Core does a FluxNode's work, without
// touching what the task is. Strict and bounded, and every refusal is named (`params.code`).
// It never reaches the mechanical gates (scope, permissions, robot-check detection, secret
// and denied-evidence screening); the locks only keep the words that describe them.

import { z } from "zod";
import { FLUXNODE_OVERRIDE_LIMITS } from "./limits.ts";
import { refuseFluxNodeOverrides } from "./refusals.ts";
import { fluxNodeOverridesShape } from "./shape.ts";

export type FluxNodeOverrides = z.infer<typeof fluxNodeOverridesShape>;

/**
 * - `prompts`: by section id (`FLUXNODE_PROMPT_SECTIONS`), append to or replace a section's
 *   text; `{ mode: "default" }` (per run) undoes a declared entry;
 * - `judgeCriteria`: extra things the judge must hold the result to;
 * - `tools`: by tool id, the description only (`FLUXNODE_CORE_TOOL_POLICIES`);
 * - `models`: a model id per role: explore, judge, repair;
 * - `deadlines`: the longest a model call, the judge, a person's answer, and the backoff after
 *   a silent model may wait;
 * - `retryWaits`: the waits between retries of a step, per node and per run;
 * - `pace`: the least gap between steps.
 *
 * Total override text is at most 32,000 characters. Unknown keys are refused; one that names
 * a safety gate is refused as `overrides.safety_not_overridable`.
 */
export const fluxNodeOverridesSchema: z.ZodType<FluxNodeOverrides, z.ZodTypeDef, unknown> = z.unknown().transform((value, context): FluxNodeOverrides => {
  const add = (path: (string | number)[], code: string, message: string): void => context.addIssue({ code: z.ZodIssueCode.custom, path, message, params: { code } });
  const { namedUnknownPaths } = refuseFluxNodeOverrides(value, add);
  const inner = fluxNodeOverridesShape.safeParse(value);
  if (!inner.success) {
    for (const issue of inner.error.issues) {
      if (issue.code === z.ZodIssueCode.unrecognized_keys && issue.keys.every((key) => namedUnknownPaths.has([...issue.path, key].join("\u0000")))) continue;
      context.addIssue(issue);
    }
  } else {
    const data = inner.data;
    const total =
      Object.values(data.prompts ?? {}).reduce((sum, entry) => sum + (entry.mode === "default" ? 0 : entry.text.length), 0) +
      Object.values(data.tools ?? {}).reduce((sum, entry) => sum + (entry.mode === "default" ? 0 : entry.text.length), 0) +
      (data.judgeCriteria ?? []).reduce((sum, text) => sum + text.length, 0);
    if (total > FLUXNODE_OVERRIDE_LIMITS.totalTextMax) {
      add([], "overrides.too_large", `Override text totals ${total} characters; the most is ${FLUXNODE_OVERRIDE_LIMITS.totalTextMax}.`);
    }
  }
  // Any issue added above fails the parse, so the data is only read when there were none.
  return inner.success ? inner.data : z.NEVER;
});

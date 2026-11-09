// A FluxNode: a Flow declared in code (plan, FluxNode and N1-N8). The declaration is
// what the SDK sends Core; the developer's check function stays in their process and
// is reached over the event stream, so the spec only says whether there is one.

import { z } from "zod";
import { flowInputNames, flowInputsSchema, fluxNodeNameSchema } from "../flow/index.ts";
import { parseWithZod, type FluxNodeParseResult } from "../issue/index.ts";
import { jsonTypeSchemaSchema } from "../type-schema/index.ts";
import { readFluxNodeGoal } from "./goal.ts";
import { fluxNodeOptionsSchema } from "./options.ts";
import { fluxNodeRuntimeSchema } from "./runtime.ts";
import { fluxNodeScopeAllowsSite, fluxNodeScopeSchema } from "./scope.ts";

/** How long a goal and a start may be, in characters, and how many other FluxNodes one may use. */
export const FLUXNODE_SPEC_LIMITS = Object.freeze({ goalMaxLength: 4000, startMaxLength: 2048, usesMax: 64 });

const NO_CONTROL = /^[^\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]*$/u;

/**
 * - `name`: the FluxNode's name (`isFluxNodeName`); with the spec hash, the task key;
 * - `runtime`: where its steps run (`FLUXNODE_KNOWN_RUNTIMES`, or another host's id);
 * - `goal`: what to achieve, trimmed; each `{placeholder}` names a declared input;
 * - `start`: where a run starts. For `web`, an http or https address inside the
 *   scope's sites; for another runtime, that runtime's own start (an app, a screen);
 * - `inputs`, `outputs`: optional exact types (`JsonTypeSchema`); inputs are an object;
 * - `scope`: the standing grant (`fluxNodeScopeSchema`);
 * - `hasCheck`: whether the program registered a check, run before any judge;
 * - `uses`: other FluxNodes this one calls, by name; never itself;
 * - `options`: `fluxNodeOptionsSchema`, every one optional.
 *
 * Unknown keys are refused.
 */
export const fluxNodeSpecSchema = z
  .object({
    name: fluxNodeNameSchema,
    runtime: fluxNodeRuntimeSchema,
    goal: z.string().trim().min(1).max(FLUXNODE_SPEC_LIMITS.goalMaxLength).regex(NO_CONTROL, "no control characters"),
    start: z.string().trim().min(1).max(FLUXNODE_SPEC_LIMITS.startMaxLength).regex(NO_CONTROL, "no control characters"),
    inputs: flowInputsSchema.optional(),
    outputs: jsonTypeSchemaSchema.optional(),
    scope: fluxNodeScopeSchema,
    hasCheck: z.boolean().default(false),
    uses: z
      .array(fluxNodeNameSchema)
      .max(FLUXNODE_SPEC_LIMITS.usesMax)
      .transform((names) => [...new Set(names)])
      .optional(),
    options: fluxNodeOptionsSchema.optional()
  })
  .strict()
  .superRefine((spec, context) => {
    const reading = readFluxNodeGoal(spec.goal);
    if (!reading.ok) for (const message of reading.problems) context.addIssue({ code: z.ZodIssueCode.custom, path: ["goal"], message, params: { code: "spec.goal_bad_brace" } });
    else {
      const declared = new Set(flowInputNames(spec.inputs));
      for (const name of reading.inputs) {
        if (!declared.has(name)) context.addIssue({ code: z.ZodIssueCode.custom, path: ["goal"], message: `The goal uses {${name}}, but no input "${name}" is declared under inputs.properties.`, params: { code: "spec.goal_undeclared_input" } });
      }
    }
    if (spec.runtime === "web") checkWebStart(spec.start, spec.scope, context);
    if (spec.uses?.includes(spec.name)) context.addIssue({ code: z.ZodIssueCode.custom, path: ["uses"], message: "A FluxNode does not list itself under uses.", params: { code: "spec.uses_self" } });
  });

export type FluxNodeSpec = z.infer<typeof fluxNodeSpecSchema>;

/** What a developer writes, before defaults are filled: `hasCheck` may be left out. */
export type FluxNodeSpecInput = z.input<typeof fluxNodeSpecSchema>;

/** Parses an untrusted value into a FluxNode spec, or every reason it is not one. */
export function parseFluxNodeSpec(value: unknown): FluxNodeParseResult<FluxNodeSpec> {
  return parseWithZod(fluxNodeSpecSchema, value);
}

function checkWebStart(start: string, scope: z.infer<typeof fluxNodeScopeSchema>, context: z.RefinementCtx): void {
  const address = URL.canParse(start) ? new URL(start) : null;
  if (address === null || (address.protocol !== "https:" && address.protocol !== "http:")) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["start"], message: 'A web FluxNode starts at an http or https address, such as "https://market.example/".', params: { code: "spec.start_not_address" } });
    return;
  }
  if (!fluxNodeScopeAllowsSite(scope, address.host)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["start"], message: `The start's site "${address.host}" is outside scope.sites; add it there.`, params: { code: "spec.start_out_of_scope" } });
  }
}

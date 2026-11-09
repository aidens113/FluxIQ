// Whether a run's outputs are right, and what settled it (plan, N4). The type is
// checked first, then the developer's check, then the judge only as configured.

import { z } from "zod";
import { fluxNodeFieldSchemas } from "../fields/index.ts";

/** `confirmed` and `refuted` each need something to have checked; `unverified` says nothing settled it. */
export const FLUXNODE_VERDICT_LABELS = Object.freeze(["confirmed", "refuted", "unverified"] as const);

export type FluxNodeVerdictLabel = (typeof FLUXNODE_VERDICT_LABELS)[number];

/** What settled a verdict: the declared type, the developer's check, or the judge. */
export const FLUXNODE_VERDICT_SOURCES = Object.freeze(["type", "check", "judge"] as const);

export type FluxNodeVerdictSource = (typeof FLUXNODE_VERDICT_SOURCES)[number];

/**
 * `by` is present exactly when the label is `confirmed` or `refuted`. A `refuted`
 * verdict says why in `reason`, as a failed check's "no" does.
 */
export const fluxNodeVerdictSchema = z
  .object({
    label: z.enum(FLUXNODE_VERDICT_LABELS),
    by: z.enum(FLUXNODE_VERDICT_SOURCES).optional(),
    reason: fluxNodeFieldSchemas.personText.optional()
  })
  .strict()
  .superRefine((verdict, context) => {
    if ((verdict.label === "unverified") !== (verdict.by === undefined)) {
      const message = verdict.label === "unverified" ? "An unverified verdict was settled by nothing, so it has no by." : `A ${verdict.label} verdict says what settled it in by.`;
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["by"], message, params: { code: "verdict.by" } });
    }
    if (verdict.label === "refuted" && verdict.reason === undefined) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["reason"], message: "A refuted verdict says why.", params: { code: "verdict.reason_missing" } });
    }
  });

export type FluxNodeVerdict = z.infer<typeof fluxNodeVerdictSchema>;

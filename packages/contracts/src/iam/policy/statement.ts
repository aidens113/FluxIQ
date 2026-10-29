import { z } from "zod";
import { iamPolicyConditionSchema } from "./condition/index.ts";
import { isIamActionPattern, isIamResourcePattern } from "./pattern.ts";

/** Most entries one `Action`, `NotAction`, `Resource`, `NotResource` or `Principal` element may list. */
export const IAM_STATEMENT_MAX_ENTRIES = 100;

function oneOrMany<TEntry extends z.ZodTypeAny>(entry: TEntry) {
  return z.union([entry, z.array(entry).min(1).max(IAM_STATEMENT_MAX_ENTRIES)]);
}

const actionElement = oneOrMany(z.string().refine(isIamActionPattern, "an action is * or <service>:<pattern>"));
const resourceElement = oneOrMany(z.string().refine(isIamResourcePattern, "a resource is * or an frn:fluxiq: pattern"));
const principalElement = oneOrMany(z.string().refine(isIamResourcePattern, "a principal is an frn:fluxiq:iam: pattern"));

/**
 * One policy statement, in the AWS IAM shape:
 *
 * - `Sid`: optional; letters and digits, unique within its document; the audit
 *   cites it as the matched statement;
 * - `Effect`: `Allow` or `Deny`;
 * - exactly one of `Action` and `NotAction` (`isIamActionPattern`);
 * - exactly one of `Resource` and `NotResource` (`isIamResourcePattern`),
 *   except in a trust policy, which has neither;
 * - `Condition`: optional (`iamPolicyConditionSchema`);
 * - `Principal`: only in a trust policy, `{ FluxIQ: <principal FRN pattern(s)> }`.
 *
 * Each element takes one string or a list of them. Unknown fields are refused,
 * so a misspelt element is an error rather than a statement that grants more.
 */
export const iamPolicyStatementSchema = z
  .object({
    Sid: z.string().regex(/^[A-Za-z0-9]{1,64}$/u).optional(),
    Effect: z.enum(["Allow", "Deny"]),
    Principal: z.object({ FluxIQ: principalElement }).strict().optional(),
    Action: actionElement.optional(),
    NotAction: actionElement.optional(),
    Resource: resourceElement.optional(),
    NotResource: resourceElement.optional(),
    Condition: iamPolicyConditionSchema.optional()
  })
  .strict()
  .superRefine((statement, context) => {
    if ((statement.Action === undefined) === (statement.NotAction === undefined)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["Action"], message: "a statement has exactly one of Action and NotAction" });
    }
    if (statement.Resource !== undefined && statement.NotResource !== undefined) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["Resource"], message: "a statement has at most one of Resource and NotResource" });
    }
  });

/** A statement as parsed. Each list element is a string or a non-empty list of strings. */
export type IamPolicyStatement = z.infer<typeof iamPolicyStatementSchema>;

import { z } from "zod";
import type { IamPolicyKind } from "./policy-kind.ts";
import { iamPolicyStatementSchema, type IamPolicyStatement } from "./statement.ts";

/** The policy language version every document names in `Version`. */
export const IAM_POLICY_LANGUAGE_VERSION = "2026-10-30";

/** Most statements in one document. */
export const IAM_POLICY_MAX_STATEMENTS = 100;

/** A parsed policy document: `{Version, Id?, Statement[]}`. */
export type IamPolicyDocument = {
  Version: typeof IAM_POLICY_LANGUAGE_VERSION;
  Id?: string | undefined;
  Statement: IamPolicyStatement[];
};

const ASSUME_ROLE = "iam:AssumeRole";

const documentSchema = z
  .object({
    Version: z.literal(IAM_POLICY_LANGUAGE_VERSION),
    Id: z.string().regex(/^[A-Za-z0-9._-]{1,128}$/u).optional(),
    Statement: z.array(iamPolicyStatementSchema).min(1).max(IAM_POLICY_MAX_STATEMENTS)
  })
  .strict();

/**
 * The schema for a policy document of one kind (`IAM_POLICY_KINDS`). Common
 * rules: the exact `Version`, at least one statement, unique `Sid`s. By kind:
 * a non-trust statement names `Resource` or `NotResource` and no `Principal`;
 * a `guardrail` holds only `Deny` statements; a `trust` statement names a
 * `Principal`, uses `Action: "iam:AssumeRole"` and has no resource element.
 */
export function iamPolicyDocumentSchema(kind: IamPolicyKind): z.ZodType<IamPolicyDocument, z.ZodTypeDef, unknown> {
  return documentSchema.superRefine((document, context) => {
    const sids = new Set<string>();
    document.Statement.forEach((statement, index) => {
      const at = (field: string) => ["Statement", index, field];
      if (statement.Sid !== undefined) {
        if (sids.has(statement.Sid)) context.addIssue({ code: z.ZodIssueCode.custom, path: at("Sid"), message: `duplicate Sid ${statement.Sid}` });
        sids.add(statement.Sid);
      }
      const hasResource = statement.Resource !== undefined || statement.NotResource !== undefined;
      if (kind === "trust") {
        if (statement.Principal === undefined) context.addIssue({ code: z.ZodIssueCode.custom, path: at("Principal"), message: "a trust statement names a Principal" });
        if (hasResource) context.addIssue({ code: z.ZodIssueCode.custom, path: at("Resource"), message: "a trust statement has no Resource" });
        if (statement.Action !== ASSUME_ROLE) context.addIssue({ code: z.ZodIssueCode.custom, path: at("Action"), message: `a trust statement's Action is ${ASSUME_ROLE}` });
        return;
      }
      if (statement.Principal !== undefined) context.addIssue({ code: z.ZodIssueCode.custom, path: at("Principal"), message: "only a trust policy names a Principal" });
      if (!hasResource) context.addIssue({ code: z.ZodIssueCode.custom, path: at("Resource"), message: "a statement has exactly one of Resource and NotResource" });
      if (kind === "guardrail" && statement.Effect !== "Deny") context.addIssue({ code: z.ZodIssueCode.custom, path: at("Effect"), message: "a guardrail only denies" });
    });
  });
}

/** Parses an untrusted policy document of one kind; `success: false` carries every refusal with its path. */
export function parseIamPolicyDocument(value: unknown, kind: IamPolicyKind): z.SafeParseReturnType<unknown, IamPolicyDocument> {
  return iamPolicyDocumentSchema(kind).safeParse(value);
}

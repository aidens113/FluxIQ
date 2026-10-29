import { parseIamPolicyDocument, type IamPolicyDocument, type IamPolicyKind } from "@fluxiq/contracts/iam";
import { IamStoreError } from "../errors/index.ts";

/** Parses a document of one kind or throws `invalid_document` listing every refusal with its path. */
export function parsePolicyDocument(value: unknown, kind: IamPolicyKind): IamPolicyDocument {
  const parsed = parseIamPolicyDocument(value, kind);
  if (parsed.success) return parsed.data;
  const issues = parsed.error.issues.map((issue) => `${issue.path.join(".") || "(document)"}: ${issue.message}`);
  throw new IamStoreError("invalid_document", `The ${kind} policy document is invalid. ${issues.join("; ")}`);
}

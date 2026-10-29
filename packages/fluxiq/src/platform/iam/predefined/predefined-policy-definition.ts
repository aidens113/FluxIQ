import type { IamPolicy } from "../types.ts";

/**
 * A predefined (FluxIQ-managed, read-only) policy: an `IamPolicy` whose
 * document passed `parseIamPolicyDocument` for its kind, frozen to the leaves,
 * and the version of that document (`v1`, `v2`, ... as customer-managed policy
 * versions are numbered). A changed document takes the next version, so an
 * audit record citing a predefined policy can be read against the document
 * that decided it.
 */
export type IamPredefinedPolicyDefinition = IamPolicy & {
  version: string;
};

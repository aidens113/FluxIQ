import { IAM_RESOURCE_TAG_KEY_PREFIX } from "@fluxiq/contracts/iam";
import type { IamConditionFacts } from "./types.ts";

/** A condition key's value in one request: a string, `MfaPresent`'s boolean, or `CurrentTime` in epoch milliseconds. */
export type IamConditionFact = string | boolean | number;

function resourceTag(facts: IamConditionFacts, key: string): string | undefined {
  const tags = facts.resource?.tags;
  if (tags === undefined || !Object.hasOwn(tags, key)) return undefined;
  const value = tags[key];
  return typeof value === "string" ? value : undefined;
}

/**
 * The value a global condition key holds for one request, or undefined when
 * the key is missing (its fact is absent or null). The keys and where each is
 * read from:
 *
 * - `fluxiq:PrincipalId`, `fluxiq:PrincipalType`: the acting principal;
 * - `fluxiq:WorkspaceId`, `fluxiq:RequestOrigin`, `fluxiq:SourceIp`,
 *   `fluxiq:MfaPresent`, `fluxiq:Profile`, `fluxiq:CurrentTime`: the request
 *   context (`CurrentTime` is `currentTimeMs`);
 * - `fluxiq:ConnectedBrowserId`: the context's `connectedClientId`;
 * - `fluxiq:ResourceOwner`: the resource's `ownerId`;
 * - `fluxiq:ResourceTag/<key>`: the resource's own tag `<key>` (never an
 *   inherited property such as `constructor`).
 */
export function resolveIamConditionKey(key: string, facts: IamConditionFacts): IamConditionFact | undefined {
  const { principal, resource, context } = facts;
  if (key.startsWith(IAM_RESOURCE_TAG_KEY_PREFIX)) return resourceTag(facts, key.slice(IAM_RESOURCE_TAG_KEY_PREFIX.length));
  switch (key) {
    case "fluxiq:PrincipalId":
      return principal.id;
    case "fluxiq:PrincipalType":
      return principal.type;
    case "fluxiq:WorkspaceId":
      return context.workspaceId ?? undefined;
    case "fluxiq:ResourceOwner":
      return resource?.ownerId ?? undefined;
    case "fluxiq:RequestOrigin":
      return context.origin;
    case "fluxiq:ConnectedBrowserId":
      return context.connectedClientId;
    case "fluxiq:SourceIp":
      return context.sourceIp;
    case "fluxiq:MfaPresent":
      return context.mfaPresent;
    case "fluxiq:Profile":
      return context.profile;
    case "fluxiq:CurrentTime":
      return Number.isFinite(context.currentTimeMs) ? context.currentTimeMs : undefined;
    default:
      return undefined;
  }
}

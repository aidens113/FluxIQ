import type { IamConditionValueType } from "./operators.ts";

/** One global condition key and the value type it holds. */
export type IamConditionKeyDefinition = { key: string; valueType: IamConditionValueType };

/**
 * The global condition keys at launch. `fluxiq:RequestOrigin` holds one of
 * `FLUXIQ_REQUEST_ORIGINS`; `fluxiq:Profile` one of `FLUXIQ_PROFILES`;
 * `fluxiq:SourceIp` the caller's address as audited; `fluxiq:CurrentTime` an
 * ISO 8601 instant. Resource tags are `fluxiq:ResourceTag/<key>` (strings).
 */
export const IAM_CONDITION_KEYS: readonly IamConditionKeyDefinition[] = Object.freeze([
  { key: "fluxiq:PrincipalId", valueType: "string" },
  { key: "fluxiq:PrincipalType", valueType: "string" },
  { key: "fluxiq:WorkspaceId", valueType: "string" },
  { key: "fluxiq:ResourceOwner", valueType: "string" },
  { key: "fluxiq:RequestOrigin", valueType: "string" },
  { key: "fluxiq:ConnectedBrowserId", valueType: "string" },
  { key: "fluxiq:SourceIp", valueType: "ip" },
  { key: "fluxiq:MfaPresent", valueType: "bool" },
  { key: "fluxiq:Profile", valueType: "string" },
  { key: "fluxiq:CurrentTime", valueType: "date" }
] satisfies IamConditionKeyDefinition[]);

/** The prefix of a resource-tag condition key. */
export const IAM_RESOURCE_TAG_KEY_PREFIX = "fluxiq:ResourceTag/";

const TAG_KEY_PATTERN = /^[A-Za-z0-9._:+=@-]{1,128}$/u;
const KEY_TYPES: ReadonlyMap<string, IamConditionValueType> = new Map(IAM_CONDITION_KEYS.map((definition) => [definition.key, definition.valueType]));

/** The value type a condition key holds, or null for a key that is not defined. */
export function iamConditionKeyValueType(key: string): IamConditionValueType | null {
  if (key.startsWith(IAM_RESOURCE_TAG_KEY_PREFIX)) return TAG_KEY_PATTERN.test(key.slice(IAM_RESOURCE_TAG_KEY_PREFIX.length)) ? "string" : null;
  return KEY_TYPES.get(key) ?? null;
}

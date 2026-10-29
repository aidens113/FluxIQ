import { IAM_DEFAULT_ACCESS_LEVEL_BY_CLASSIFICATION, type IamAccessLevel } from "@fluxiq/contracts/iam";
import { IAM_ACCESS_LEVEL_OVERRIDES } from "./access-level-overrides.ts";

/** The access level of one endpoint's action: override, then `list-` rule, then classification default. */
export function iamEndpointAccessLevel(action: string, endpoint: string, classification: string): IamAccessLevel {
  const override = Object.hasOwn(IAM_ACCESS_LEVEL_OVERRIDES, action) ? IAM_ACCESS_LEVEL_OVERRIDES[action] : undefined;
  if (override !== undefined) return override;
  if (endpoint.startsWith("list-")) return "List";
  const fallback = Object.hasOwn(IAM_DEFAULT_ACCESS_LEVEL_BY_CLASSIFICATION, classification) ? IAM_DEFAULT_ACCESS_LEVEL_BY_CLASSIFICATION[classification] : undefined;
  if (fallback === undefined) throw new TypeError(`Classification ${JSON.stringify(classification)} of ${action} has no default access level; add an override.`);
  return fallback;
}

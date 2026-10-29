import { FRN_MAX_LENGTH, FRN_PREFIX } from "../frn/index.ts";
import { isIamService } from "../service.ts";
import { replaceIamPolicyVariables } from "./policy-variables.ts";

const ACTION_PART_PATTERN = /^[A-Za-z0-9*?]{1,128}$/u;
const SERVICE_PATTERN = /^[a-z*?-]{1,32}$/u;
const WORKSPACE_PATTERN = /^[A-Za-z0-9._~@+=,*?-]{0,128}$/u;
const RESOURCE_PATTERN = /^[A-Za-z0-9._~@+=,*?/-]{1,900}$/u;
const VARIABLE_STAND_IN = "v";

/**
 * True for a policy `Action` or `NotAction` element: `*`, or
 * `<service>:<pattern>` where the service is one of `IAM_SERVICES` (never a
 * wildcard) and the pattern holds letters, digits, `*` (any run) and `?` (one
 * character), as in `studio:Read*` or `platform:*Account*`. No variables.
 */
export function isIamActionPattern(value: unknown): value is string {
  if (typeof value !== "string") return false;
  if (value === "*") return true;
  const separator = value.indexOf(":");
  if (separator < 0) return false;
  return isIamService(value.slice(0, separator)) && ACTION_PART_PATTERN.test(value.slice(separator + 1));
}

/**
 * True for a policy `Resource` or `NotResource` element: `*`, or an FRN
 * pattern `frn:fluxiq:<service>:<workspace>:<resource>` in which any segment
 * may use `*` and `?` and the policy variables (`IAM_POLICY_VARIABLES`), as in
 * `frn:fluxiq:*:${fluxiq:WorkspaceId}:*` or
 * `frn:fluxiq:studio:${fluxiq:WorkspaceId}:project/*`. A service without a
 * wildcard must be one of `IAM_SERVICES`. Resource types are not checked
 * against the vocabulary, so a pattern written before a type exists still
 * parses; it simply matches nothing.
 */
export function isIamResourcePattern(value: unknown): value is string {
  if (typeof value !== "string" || value.length > FRN_MAX_LENGTH) return false;
  if (value === "*") return true;
  if (!value.startsWith(FRN_PREFIX)) return false;
  const bound = replaceIamPolicyVariables(value.slice(FRN_PREFIX.length), VARIABLE_STAND_IN);
  if (bound === null) return false;
  const parts = bound.split(":");
  if (parts.length !== 3) return false;
  const [service, workspace, resource] = parts as [string, string, string];
  if (!SERVICE_PATTERN.test(service)) return false;
  if (!/[*?]/u.test(service) && !isIamService(service)) return false;
  return WORKSPACE_PATTERN.test(workspace) && RESOURCE_PATTERN.test(resource);
}

import { PLATFORM_PROVISIONING_OPERATIONS } from "@fluxiq/contracts/platform";
import { compileIamPolicySet, evaluateIamRequest, iamPrincipalFrn } from "../../iam/index.ts";
import type { CompiledIamPolicySet, IamPolicy, IamPrincipal, IamRequestContext } from "../../iam/index.ts";

const PROBE_WORKSPACE = "provisioning-probe-workspace";
const PROBE_USER = "provisioning-probe-user";

const PROBE_PRINCIPAL: IamPrincipal = {
  type: "user",
  id: PROBE_USER,
  workspaceId: PROBE_WORKSPACE,
  frn: iamPrincipalFrn("user", PROBE_WORKSPACE, PROBE_USER)
};

/** Platform resources outside the member's own workspace: an account, and another workspace. */
const PROBE_RESOURCES = ["frn:fluxiq:platform::account/provisioning-probe-account", "frn:fluxiq:platform::workspace/provisioning-probe-other"];

/** Every provisioning action, and the workspace lifecycle a platform grant would also reach. */
const PROBE_ACTIONS = [...Object.values(PLATFORM_PROVISIONING_OPERATIONS).map((operation) => operation.action), "platform:CreateWorkspace", "platform:DeleteWorkspace"];

/**
 * True when a policy, attached to a member of some workspace, would allow a
 * `platform:` action on a platform resource beyond that workspace (an
 * account, or another workspace): the "anything granting `platform:*`" rule of
 * `forbidden_policy`. Decided by the evaluator itself rather than by reading
 * patterns, so a wildcard in any form is caught the way a request would meet
 * it. A policy that will not compile counts as granting.
 */
export function policyGrantsPlatformAccess(policy: IamPolicy, nowMs: number): boolean {
  let compiled: CompiledIamPolicySet;
  try {
    compiled = compileIamPolicySet({ identity: [policy], guardrails: [], sessions: [], boundary: null }, PROBE_PRINCIPAL, PROBE_WORKSPACE);
  } catch {
    return true;
  }
  const request: IamRequestContext = { workspaceId: PROBE_WORKSPACE, origin: "provisioning", currentTimeMs: nowMs };
  return PROBE_ACTIONS.some((action) => PROBE_RESOURCES.some((frn) => evaluateIamRequest(compiled, PROBE_PRINCIPAL, action, [{ frn }], request).decision === "allow"));
}

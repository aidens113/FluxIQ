import { iamActionName } from "@fluxiq/contracts/iam";
import type { FluxIQProfile } from "@fluxiq/contracts/platform";
import { iamProgramService, type IamEndpointRegistration } from "../catalog/index.ts";
import { compileIamPolicySet, evaluateIamRequest } from "../evaluate/index.ts";
import { iamPrincipalFrn, iamProgramFrn, iamWorkspaceFrn } from "../frn/index.ts";
import type { IamPrincipal, IamRequestContext } from "../types.ts";
import type { IamParityReport } from "./parity-report.ts";
import type { IamParityRole } from "./parity-role.ts";

type Mismatch = IamParityReport["mismatches"][number];
type RoleCounts = IamParityReport["byRole"][string];

const DEFAULT_WORKSPACE = "parity-workspace";
const DEFAULT_PROFILES: readonly FluxIQProfile[] = Object.freeze(["local", "self-hosted"]);
const DEFAULT_TIME_MS = Date.parse("2026-10-28T00:00:00Z");

/**
 * The resource an endpoint's action evaluates against today: an operator
 * program's action acts on the program (`iamProgramFrn`); every other action
 * has catalog `resourceTypes` `["*"]` (no declared resource yet), so it acts
 * on the workspace, as a top-level create or list does (`iamWorkspaceFrn`).
 * When registrations declare resources (lane B3), this is where the parity
 * check starts reading them.
 */
function resourceFor(service: string, programId: string, workspaceId: string): string {
  return service === "ops" ? iamProgramFrn(workspaceId, programId) : iamWorkspaceFrn(workspaceId);
}

/**
 * Compares, for every registration and role, today's check
 * (`role.permissions.includes(registration.permission)`, as
 * `GlobalProgramApiRegistry.call` does) with IAM: the role's policies compiled
 * as identity policies (no guardrail, session policy or boundary), and the
 * endpoint's action (`iamActionName(iamProgramService(programId), endpoint)`)
 * evaluated for a user of the workspace on the resource it acts on, from the
 * panel, under each profile (local and self-hosted by default: the profiles
 * the switch must leave unchanged). Pure: no storage, clock or registry; the
 * caller passes the registrations.
 */
export function compareIamRoleParity(input: {
  registrations: readonly IamEndpointRegistration[];
  roles: readonly IamParityRole[];
  workspaceId?: string;
  profiles?: readonly FluxIQProfile[];
  currentTimeMs?: number;
}): IamParityReport {
  const workspaceId = input.workspaceId ?? DEFAULT_WORKSPACE;
  const profiles = input.profiles ?? DEFAULT_PROFILES;
  const currentTimeMs = input.currentTimeMs ?? DEFAULT_TIME_MS;
  const contexts: Array<{ profile: FluxIQProfile; context: IamRequestContext }> = profiles.map((profile) => ({ profile, context: { workspaceId, origin: "panel", currentTimeMs, profile } }));
  const targets = input.registrations.map((registration) => {
    const service = iamProgramService(registration.programId);
    return { registration, action: iamActionName(service, registration.endpoint), resource: resourceFor(service, registration.programId, workspaceId) };
  });
  const mismatches: Mismatch[] = [];
  const byRole: Record<string, RoleCounts> = {};
  let allows = 0;
  let denies = 0;
  for (const role of input.roles) {
    const principal: IamPrincipal = { type: "user", id: `parity-${role.id}`, workspaceId, frn: iamPrincipalFrn("user", workspaceId, `parity-${role.id}`) };
    const compiled = compileIamPolicySet({ identity: role.policies, guardrails: [], sessions: [], boundary: null }, principal, workspaceId);
    const counts = { compared: 0, allows: 0, denies: 0, iamAllows: 0, iamDenies: 0, fullAccess: 0, mismatches: 0 };
    for (const { registration, action, resource } of targets) {
      const today = role.permissions.includes(registration.permission) ? "allow" : "deny";
      counts.compared += 1;
      if (today === "allow") counts.allows += 1;
      else counts.denies += 1;
      for (const { profile, context } of contexts) {
        const decision = evaluateIamRequest(compiled, principal, action, [{ frn: resource }], context);
        if (decision.decision === "allow") counts.iamAllows += 1;
        else counts.iamDenies += 1;
        if (decision.fullAccess) counts.fullAccess += 1;
        if (decision.decision === today) continue;
        counts.mismatches += 1;
        mismatches.push({ roleId: role.id, programId: registration.programId, endpoint: registration.endpoint, permission: registration.permission, action, resource, profile, today, iam: decision.decision, matched: decision.matched });
      }
    }
    byRole[role.id] = counts;
    allows += counts.allows;
    denies += counts.denies;
  }
  const compared = targets.length * input.roles.length;
  return { registrations: targets.length, roles: input.roles.length, profiles, compared, decisions: compared * profiles.length, allows, denies, byRole, mismatches };
}

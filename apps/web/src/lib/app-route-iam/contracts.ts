import type { AppRouteIamContract, AppRouteResource, AppRouteResourceInput } from "./types";

// The one table of authenticated app routes outside the program route (lane
// B3, t803-H2). Each route and method names its IAM action, the permission it
// required of each caller before IAM (exactly, `none` where it checked only
// authentication), and where its resources come from. `appRouteIamContract`
// throws for a route that is not here, so a new route cannot be decided
// unclassified. The program route (`/api/programs/[programId]/[endpoint]`) is
// not here: `GlobalProgramApiRegistry.call` decides it by each registration's
// own declaration (`APP_ROUTES_DECIDED_BY_REGISTRY`).
//
// The resources are the narrowest honest ones:
//
// - a route naming a project (state assets) acts on it; one naming a run's
//   dataset acts on that dataset, under its project, as `export-run-dataset` does;
// - approving a pairing binds a browser to the caller's own account and to no
//   one else's, so it acts on the caller's own user. The pairing reference is
//   never put in an FRN: it is what approves a browser, and the audit keeps FRNs;
// - a paired client's trace upload acts on its own browser (`browser/<trusted
//   client id>`, plan, Resources);
// - the Automation Studio context acts on the project and Flow it opens, or on
//   the caller's own user when it clears them;
// - a list across the workspace (recordings, client sessions, the program
//   directory) and dismissing a pending pairing, which no one owns yet, act on
//   the workspace;
// - framework setup, migration and I/O act on the framework's own program FRN;
// - the accounts routes (W5) require `identity.manage` of a panel caller, as
//   Identity Access's own people endpoints do: the list and an invite act on
//   the workspace, a change to one person on that person's user
//   (`frn:fluxiq:iam:<ws>:user/<id>`). On `service` only
//   `FluxIQAdministratorAccess` and `FluxIQOwnerFullAccess` grant them;
// - reading the workspace's activity (the IAM audit) is `identity.manage` on
//   the workspace too: who did what is the administrators' to read;
// - the hosted plans (`/api/platform/v1/commerce/checkout`): reading the
//   workspace's billing and starting a Checkout act on the workspace, under
//   `iam` (the account's own administration, which `FluxIQServiceGuardrail`
//   leaves to the workspace's policies, unlike `platform`). They check only
//   authentication before IAM, so on `service` the caller's policies decide:
//   administrators and owners, not ordinary members.

const FRAMEWORK_PROGRAM_ID = "framework";

function text(input: AppRouteResourceInput, name: string): string | null {
  const value = input[name];
  return typeof value === "string" && value !== "" ? value : null;
}

const workspace: AppRouteResource = { from: "the workspace", of: () => ({ kind: "workspace" }) };
const frameworkProgram: AppRouteResource = { from: "the framework's program FRN", of: () => ({ kind: "program" }) };
const selfUser: AppRouteResource = { from: "the caller's own user", of: () => ({ kind: "user", self: true }) };

const project: AppRouteResource = {
  from: "the project of route param projectId",
  of: (input) => ({ kind: "project", projectId: input.projectId })
};

const runDataset: AppRouteResource = {
  from: "the dataset of route param datasetId, under the project of route param projectId",
  of: (input) => ({ kind: "project-child", projectId: input.projectId, child: "dataset", childId: input.datasetId })
};

const pairedBrowser: AppRouteResource = {
  from: "the paired client's own browser (its session's trustedClientId)",
  of: (input) => ({ kind: "client", clientId: input.trustedClientId })
};

const studioContext: AppRouteResource = {
  from: "the Flow of body activeFlowId under the project of body activeProjectId; the project alone without a Flow; the caller's own user when neither",
  of: (input) => {
    const projectId = text(input, "activeProjectId");
    if (projectId === null) return { kind: "user", self: true };
    const flowId = text(input, "activeFlowId");
    return flowId === null ? { kind: "project", projectId } : { kind: "project-child", projectId, child: "flow", childId: flowId };
  }
};

const person: AppRouteResource = {
  from: "the user of body userId",
  of: (input) => ({ kind: "user", userId: input.userId })
};

const ACCOUNT_MEMBER_PATH = "/api/accounts/member";

function memberChange(variant: string, action: string): AppRouteIamContract {
  return { path: ACCOUNT_MEMBER_PATH, method: "POST", variant, action, callers: { panel: "identity.manage" }, resource: person };
}

function framework(method: "GET" | "POST", path: string, action: string, permission: "programs.read" | "programs.write", variant?: string): AppRouteIamContract {
  return { path, method, ...(variant === undefined ? {} : { variant }), action, callers: { panel: permission }, programId: FRAMEWORK_PROGRAM_ID, resource: frameworkProgram };
}

export const APP_ROUTE_IAM_CONTRACTS: readonly AppRouteIamContract[] = Object.freeze([
  { path: "/api/connect/authorize", method: "POST", action: "gateway:ApprovePairing", callers: { panel: "none" }, resource: selfUser },
  { path: "/api/keys", method: "GET", action: "iam:ListApiKeys", callers: { panel: "none" }, resource: selfUser },
  { path: "/api/keys", method: "POST", action: "iam:EnrollApiKey", callers: { panel: "none" }, resource: selfUser },
  { path: "/api/keys", method: "DELETE", action: "iam:RevokeApiKey", callers: { panel: "none" }, resource: selfUser },
  { path: "/api/client-gateway/approve-pairing", method: "POST", action: "gateway:ApprovePairing", callers: { panel: "runtime.control" }, resource: selfUser },
  { path: "/api/client-gateway/first-project", method: "POST", action: "gateway:CreateFirstProject", callers: { "paired-client": "none" }, resource: workspace },
  { path: "/api/client-gateway/dismiss-pairing", method: "POST", action: "gateway:DismissPairing", callers: { panel: "runtime.control" }, resource: workspace },
  { path: "/api/client-gateway/automation-studio-context", method: "POST", action: "gateway:SetAutomationStudioContext", callers: { panel: "runtime.control" }, resource: studioContext },
  { path: "/api/client-gateway/snapshot", method: "GET", action: "gateway:Snapshot", callers: { panel: "none", "paired-client": "none" }, resource: workspace },
  { path: "/api/client-gateway/trace-artifacts/[sha256]", method: "PUT", action: "gateway:PutTraceArtifact", callers: { "paired-client": "none" }, resource: pairedBrowser },
  framework("GET", "/api/framework/setup", "ops:InspectFrameworkSetup", "programs.read"),
  framework("POST", "/api/framework/setup", "ops:SetupFramework", "programs.write", "setup"),
  framework("POST", "/api/framework/setup", "ops:MigrateFrameworkStorage", "programs.write", "migrate"),
  framework("POST", "/api/framework/setup", "ops:RollbackFrameworkStorageMigration", "programs.write", "rollback-migration"),
  framework("GET", "/api/framework/io", "ops:InspectFrameworkIo", "programs.read"),
  framework("POST", "/api/framework/io/validate", "ops:ValidateFrameworkIo", "programs.read"),
  // The panel's one change stream (t920): a watch over what the caller may read, so decided as the
  // filtered conversation list is; each event is then decided as the read it prompts (the gateway
  // snapshot as its own route, a thread as `get-conversation` or `get-panel-thread`, activity as
  // `get-activity`). A paired client hears only the gateway, as the snapshot serves it.
  { path: "/api/panel/changes", method: "GET", action: "studio:ListConversations", callers: { panel: "programs.read", "paired-client": "none" }, resource: workspace },
  { path: "/api/programs", method: "GET", action: "studio:ListPrograms", callers: { panel: "none" }, resource: workspace },
  { path: "/api/programs/automation-studio/run-datasets/[projectId]/[runId]/[datasetId]", method: "GET", action: "studio:StreamRunDataset", callers: { panel: "programs.read" }, resource: runDataset },
  { path: "/api/programs/automation-studio/state-assets/[projectId]/[sha256]", method: "GET", action: "studio:ReadStateAsset", callers: { panel: "programs.read" }, resource: project },
  { path: "/api/programs/automation-studio/state-assets/[projectId]/[sha256]", method: "PUT", action: "studio:WriteStateAsset", callers: { panel: "programs.write", "paired-client": "none" }, resource: project },
  { path: "/api/recordings", method: "GET", action: "studio:ListRecordingSummaries", callers: { panel: "none", "paired-client": "none" }, resource: workspace },
  { path: "/api/accounts/members", method: "GET", action: "iam:ListMembers", callers: { panel: "identity.manage" }, resource: workspace },
  { path: "/api/accounts/invite", method: "POST", action: "iam:InviteMember", callers: { panel: "identity.manage" }, resource: workspace },
  memberChange("set-role", "iam:SetMemberRole"),
  memberChange("turn-off", "iam:DisableMember"),
  memberChange("turn-on", "iam:EnableMember"),
  memberChange("remove", "iam:RemoveMember"),
  memberChange("resend-invite", "iam:ResendInvite"),
  memberChange("revoke-invite", "iam:RevokeInvite"),
  { path: "/api/security/audit", method: "GET", action: "iam:ListAuditEvents", callers: { panel: "identity.manage" }, resource: workspace },
  { path: "/api/platform/v1/commerce/checkout", method: "GET", action: "iam:GetBillingStatus", callers: { panel: "none" }, resource: workspace },
  { path: "/api/platform/v1/commerce/checkout", method: "POST", action: "iam:StartCheckout", callers: { panel: "none" }, resource: workspace }
] satisfies AppRouteIamContract[]);

import { defineIamPredefinedPolicy } from "./define-predefined-policy.ts";

/**
 * The Identity Access endpoints that administer a workspace instance's own
 * user store: they make or change people, passwords, PINs, sessions and the
 * vault there. Under the hosted service a person signs in only through the
 * platform directory, so anyone made here could never sign in, and accounts
 * come only from provisioning (the accounts routes and `fluxiq accounts`).
 * A person's own sign-in security (authenticator, preferences, the
 * capitals of their name, their own sessions) is not here: in a tenant it
 * acts on the platform directory instead (Identity Access's directory).
 */
const LOCAL_IDENTITY_ADMINISTRATION_ACTIONS = Object.freeze([
  "iam:CreateUser",
  "iam:UpdateUser",
  "iam:SetPassword",
  "iam:SetPin",
  "iam:CreateSession",
  "iam:UnlockVault"
] as const);

/**
 * `FluxIQServiceGuardrail` (guardrail, deny-only): the program availability
 * policy of the hosted service, applied to every principal in a workspace.
 *
 * - `DenyOperatorPrograms`: `ops:*`, every operator program (Database
 *   Manager, Deployment Sync, Compute Control, root Docs, background tasks,
 *   the runtime and the production runner). That covers framework migrate,
 *   whose action is `ops:RunMigration` (Database Manager), and
 *   `ops:RegisterNode` (Compute Control's compute nodes).
 * - `DenyPlatform`: `platform:*`; accounts and workspaces are provisioned,
 *   never reached from inside a workspace.
 * - `DenyLocalIdentityAdministration` (v2):
 *   the actions above, which would only make or
 *   change tenant-local people who can never sign in. Local and self-hosted
 *   installs (one workspace, no guardrail) keep them.
 * - Not yet denied, because no action exists: custom-node registration (no
 *   endpoint registers a custom node; Studio only lists native node
 *   definitions). Framework setup is the operator's `fluxiq storage`
 *   command, and its panel route is operator-only.
 * - `studio:MigrateFlows` and `studio:MigrateLegacyFlowRepresentation` are a
 *   user's own Flow migrations, not the framework's, and stay allowed.
 */
export const IAM_SERVICE_GUARDRAIL = defineIamPredefinedPolicy("FluxIQServiceGuardrail", "v2", [
  { Sid: "DenyOperatorPrograms", Effect: "Deny", Action: "ops:*", Resource: "*" },
  { Sid: "DenyPlatform", Effect: "Deny", Action: "platform:*", Resource: "*" },
  { Sid: "DenyLocalIdentityAdministration", Effect: "Deny", Action: [...LOCAL_IDENTITY_ADMINISTRATION_ACTIONS], Resource: "*" }
]);

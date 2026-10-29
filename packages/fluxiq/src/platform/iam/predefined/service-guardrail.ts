import { defineIamPredefinedPolicy } from "./define-predefined-policy.ts";

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
 * - Not yet denied, because no action exists: custom-node registration (no
 *   endpoint registers a custom node; Studio only lists native node
 *   definitions) and framework setup (a command-line step, not an endpoint).
 *   Each gets a statement when its action is registered.
 * - `studio:MigrateFlows` and `studio:MigrateLegacyFlowRepresentation` are a
 *   user's own Flow migrations, not the framework's, and stay allowed.
 */
export const IAM_SERVICE_GUARDRAIL = defineIamPredefinedPolicy("FluxIQServiceGuardrail", "v1", [
  { Sid: "DenyOperatorPrograms", Effect: "Deny", Action: "ops:*", Resource: "*" },
  { Sid: "DenyPlatform", Effect: "Deny", Action: "platform:*", Resource: "*" }
]);

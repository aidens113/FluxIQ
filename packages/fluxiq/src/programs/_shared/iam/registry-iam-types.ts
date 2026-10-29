import type { FluxIQRequestOrigin } from "@fluxiq/contracts/iam";
import type { FluxIQProfile } from "@fluxiq/contracts/platform";
import type { IamPolicySource } from "../../../platform/iam/authorize/index.ts";
import type { IamAuditSink, IamDecision } from "../../../platform/iam/index.ts";
import type { Permission } from "../../identity-access/index.ts";
import type { ProgramApiActor, ProgramApiResponse } from "../api.ts";
import type { ProgramResourceRef } from "./types.ts";

/**
 * How `GlobalProgramApiRegistry` decides (constructor option `iam`).
 *
 * - `profile`: `local` (the default) and `self-hosted` decide exactly as
 *   today's `actor.permissions.includes(registration.permission)` did, through
 *   the IAM engine; `service` decides by the policies `source` attaches to the
 *   caller, under `FluxIQServiceGuardrail`.
 * - `workspaceId`: the workspace every FRN is in; `workspace-main` by default.
 * - `source`: where `service` reads a principal's policies (an `IamStore`).
 *   Without one, `service` denies everything.
 * - `audit`: where every decision is recorded. The default discards them; it
 *   never keeps an unbounded buffer.
 */
export type ProgramApiIamOptions = {
  profile?: FluxIQProfile;
  workspaceId?: string;
  source?: IamPolicySource;
  audit?: IamAuditSink;
};

/**
 * A decision an app route asks the registry for (`GlobalProgramApiRegistry.authorize`):
 *
 * - `action`: the route's action name (`<service>:<Action>`);
 * - `permission`: the permission the route required before IAM, which
 *   `local` and `self-hosted` still decide by;
 * - `resources`: what the route acts on (the workspace when absent);
 * - `programId`: the operator program a `{ kind: "program" }` ref names;
 * - `origin`: the request origin; by default `extension-chat` for a paired
 *   client and `panel` otherwise.
 */
export type ProgramApiAuthorizeInput = {
  actor?: ProgramApiActor;
  action: string;
  permission: Permission;
  resources?: ProgramResourceRef | readonly ProgramResourceRef[];
  programId?: string;
  origin?: FluxIQRequestOrigin;
};

/**
 * The outcome: allowed with the decision, or refused with the response the
 * route returns (`authorization.required` without an actor,
 * `authorization.forbidden` on a deny, the error when deciding failed).
 */
export type ProgramApiAuthorization =
  | { allowed: true; decision: IamDecision }
  | { allowed: false; decision: IamDecision | null; response: ProgramApiResponse<never> };

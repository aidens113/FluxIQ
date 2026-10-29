import type { IamDecision, IamPrincipal } from "../types.ts";
import type { IamAuthorizeOptions } from "./authorize-options.ts";

/**
 * The outcome of `assumeRole`. On success: the role-session principal and the
 * options that make later `authorize` calls evaluate as that role. On refusal:
 * the denial that was audited.
 */
export type IamRoleSession =
  | { allowed: true; principal: IamPrincipal; options: IamAuthorizeOptions }
  | { allowed: false; decision: IamDecision };

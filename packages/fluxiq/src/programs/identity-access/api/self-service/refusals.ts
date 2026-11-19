import { IDENTITY_DIRECTORY_ERRORS } from "../contracts.ts";

/** A refusal by its named code. */
export type NamedRefusal = { ok: false; error: string; errorCode: string };

/** The refusals of a person's own sign-in security where their sign-in is held by another directory. */
export const SELF_SERVICE_REFUSALS = Object.freeze({
  authenticationRequired: Object.freeze({ ok: false, error: "Authentication is required for this program operation.", errorCode: "authorization.required" }) as NamedRefusal,
  directorySelfOnly: Object.freeze({
    ok: false,
    error: "Only your own sign-in can be changed here: a person's sign-in belongs to their account, not to this workspace.",
    errorCode: IDENTITY_DIRECTORY_ERRORS.selfOnly
  }) as NamedRefusal
});

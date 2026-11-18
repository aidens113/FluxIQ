import { randomUUID } from "node:crypto";
import type { PlatformProvisioningCaller } from "fluxiq/platform";
import type { AccountLinkResponse } from "../../welcome/server";
import { refuse } from "../../welcome/server";
import { readSignupForm } from "./readSignupForm";
import type { SignupDeps } from "./SignupDeps";

/** A sign-up is a caller inside the server; the person is not signed in, so there is no acting user. */
const SIGNUP_CALLER: PlatformProvisioningCaller = { kind: "in-process", actorUserId: null, transport: "in-process" };

/**
 * What a sign-up gets: a personal workspace of its own (sign-up is open only
 * on the multi-tenant `service` profile) that it administers, as the service
 * profile's owner claim and the website's provisioning do.
 */
const SIGNUP_POLICY = "FluxIQAdministratorAccess";

/** The one answer to every accepted sign-up, new address or not. */
const CHECK_YOUR_EMAIL: AccountLinkResponse = { status: 200, body: { ok: true } };

/**
 * Signs a person up through `platform.provisioning`, in-process: a pending
 * account (no password; email unverified) in a new personal workspace, with
 * the accepted terms version, and the welcome email whose link sets the
 * password and signs them in.
 *
 * The answer never says whether the address already has an account. An
 * address in use is `email_taken` in-process; then `sendWelcome` mails it
 * instead (a verified account gets "you already have an account" with the
 * sign-in and reset links; one never activated gets a fresh welcome link),
 * no second account is made, and the answer is the same `{ ok: true }`.
 * Mail failures never change the answer (provisioning reports them).
 */
export async function submitSignup(request: Request, deps: SignupDeps): Promise<AccountLinkResponse> {
  const read = await readSignupForm(request);
  if (!read.ok) return read.response;
  const { email, displayName, termsVersion } = read.form;
  const created = await deps.provisioning.run(
    "createAccount",
    { requestId: `signup-${randomUUID()}`, email, displayName, policies: [SIGNUP_POLICY], workspace: "new", termsVersion, sendWelcome: true },
    SIGNUP_CALLER
  );
  if (created.ok) return CHECK_YOUR_EMAIL;
  if (created.error.code === "email_taken") {
    const noticed = await deps.provisioning.run("sendWelcome", { requestId: `signup-notice-${randomUUID()}`, email }, SIGNUP_CALLER);
    if (noticed.ok) return CHECK_YOUR_EMAIL;
    return failed(deps, noticed.error.code);
  }
  if (created.error.code === "invalid_input") return refuse(400, invalidField(created.error.issues));
  return failed(deps, created.error.code);
}

/** Which field the person should fix: the email, else the name. */
function invalidField(issues: { path: string }[] | undefined): "invalid_email" | "invalid_name" {
  return (issues ?? []).some((issue) => issue.path.split(".")[0] === "email") ? "invalid_email" : "invalid_name";
}

function failed(deps: SignupDeps, code: string): AccountLinkResponse {
  (deps.log ?? console.warn)(`FluxIQ sign-up: provisioning refused a sign-up (${code}).`);
  return refuse(500, "signup_failed");
}

import { randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";
import type { PlatformProvisioningCaller, PlatformProvisioningErrorCode } from "fluxiq/platform";
import { ownerClaimPaths } from "./owner-claim-paths";
import { readOwnerClaimMarker } from "./read";
import { retireDefaultAdmin } from "./retire-default-admin";
import type { OwnerClaimDeps, OwnerClaimForm, OwnerClaimMarker, OwnerClaimOutcome, OwnerClaimRefusalCode } from "./types";
import { writePrivateFile } from "./write-private-file";

/** The owner claim is an in-process caller: the only one that may attach `FluxIQOwnerFullAccess` (single tenancy, never over HTTP). */
const OWNER_CLAIM_CALLER: PlatformProvisioningCaller = { kind: "in-process", actorUserId: null, transport: "in-process" };

/**
 * One fixed idempotency key: a claim interrupted after the account was made
 * replays the same account on a retry with the same email and name, instead
 * of leaving a second owner behind. A retry with other details is refused.
 */
const CREATE_REQUEST_ID = "owner-claim";

/** The contract's field names as the setup form names them. */
const FORM_FIELDS: Readonly<Record<string, string>> = { email: "username", displayName: "displayName", password: "password" };

let queue: Promise<unknown> = Promise.resolve();

/**
 * Claims the instance for its owner. The caller has already checked the
 * setup code. Runs one claim at a time in this process and re-reads the
 * marker inside, so two valid submissions cannot make two owners.
 *
 * In order: `createAccount` in-process with `FluxIQOwnerFullAccess` in the
 * single workspace (`"new"` is the one workspace under single tenancy),
 * `setPassword` (so a replayed account takes this attempt's password), the
 * default `admin` retired (`retireDefaultAdmin`), the marker written, and a
 * generated code file removed (never the operator's `FLUXIQ_SETUP_CODE_FILE`).
 * The marker comes after the admin is retired, so a failure before it leaves
 * the claim open to retry rather than claimed with admin/admin still live.
 *
 * On every profile the owner's username is the email as the contract
 * normalises it (trimmed, lower-cased, refused unless email-shaped), because
 * `createAccount` signs every account in by its email. The email starts
 * unverified: the setup code comes from a file on the server (generated, or
 * the operator's `FLUXIQ_SETUP_CODE_FILE`) and is never mailed, so knowing it
 * proves control of the server, not of the mailbox. Only redeeming a link
 * mailed to the address verifies it.
 */
export function claimOwner(form: OwnerClaimForm, deps: OwnerClaimDeps): Promise<OwnerClaimOutcome> {
  const run = queue.then(() => claimExclusively(form, deps));
  queue = run.then(() => undefined, () => undefined);
  return run;
}

async function claimExclusively(form: OwnerClaimForm, deps: OwnerClaimDeps): Promise<OwnerClaimOutcome> {
  const log = deps.log ?? console.info;
  if ((await readOwnerClaimMarker(deps.fluxiqDir)) !== null) return { ok: false, code: "already_claimed" };
  try {
    const created = await deps.provisioning.run(
      "createAccount",
      { requestId: CREATE_REQUEST_ID, email: form.username, displayName: form.displayName, password: form.password, policies: ["FluxIQOwnerFullAccess"], workspace: "new" },
      OWNER_CLAIM_CALLER
    );
    if (!created.ok) return refusal(created.error.code, created.error.issues, log);
    if (created.result.status !== "created") return refusal("internal_error", undefined, log);
    const { userId } = created.result;
    const password = await deps.provisioning.run("setPassword", { requestId: `owner-claim-password-${randomUUID()}`, userId, password: form.password }, OWNER_CLAIM_CALLER);
    if (!password.ok) return refusal(password.error.code, password.error.issues, log);

    const defaultAdmin = await retireDefaultAdmin(deps.identityAccess);
    const paths = ownerClaimPaths(deps.fluxiqDir);
    const marker: OwnerClaimMarker = { schemaVersion: 1, claimedAt: new Date().toISOString(), ownerUserId: userId };
    await writePrivateFile(paths.marker, `${JSON.stringify(marker, null, 2)}\n`);
    if (deps.settings.setupCodeFile === null) await rm(paths.generatedCode, { force: true });
    log(`FluxIQ setup: the owner account was claimed; the default admin account was ${defaultAdmin === "absent" ? "not present" : defaultAdmin}.`);
    return { ok: true, userId, defaultAdmin };
  } catch (error) {
    log(`FluxIQ setup: the owner claim failed (${error instanceof Error ? error.name : "unknown error"}).`);
    return { ok: false, code: "claim_failed" };
  }
}

function refusal(code: PlatformProvisioningErrorCode, issues: { path: string }[] | undefined, log: (line: string) => void): OwnerClaimOutcome {
  const mapped = refusalCode(code);
  log(`FluxIQ setup: the owner claim was refused (${mapped}).`);
  if (mapped !== "invalid_input") return { ok: false, code: mapped };
  const fields = [...new Set((issues ?? []).map((issue) => FORM_FIELDS[issue.path.split(".")[0] ?? ""]).filter((field): field is string => field !== undefined))];
  return { ok: false, code: mapped, fields };
}

function refusalCode(code: PlatformProvisioningErrorCode): OwnerClaimRefusalCode {
  switch (code) {
    case "invalid_input": return "invalid_input";
    case "weak_password": return "weak_password";
    case "email_taken": return "username_taken";
    case "request_conflict": return "claim_incomplete";
    default: return "claim_failed";
  }
}

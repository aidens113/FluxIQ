import { IdentityUsernameTakenError } from "fluxiq";
import type { LocalClaimIdentity, LocalClaimOutcome, LocalOwnerForm } from "./types";

const TEMPORARY_ADMIN = { userId: "admin", password: "admin" } as const;

let queue: Promise<unknown> = Promise.resolve();

/**
 * Makes the person who opened the setup link the owner. The caller has
 * checked the code and the form. One claim runs at a time in this process and
 * the first-run state is read inside it, so two valid submissions cannot make
 * two owners.
 *
 * - No account yet: the owner is created as an administrator, signing in with
 *   the name they chose.
 * - The default admin on its temporary password: that account becomes the
 *   owner's (renamed, and its password changed as its own change, with the
 *   temporary password as the current one, so the keys sealed to it follow).
 *   Its other sessions end; the proof's session is revoked whatever happens.
 * - An owner already: refused.
 */
export function claimLocalOwner(form: LocalOwnerForm, identity: LocalClaimIdentity, log: (line: string) => void = console.info): Promise<LocalClaimOutcome> {
  const run = queue.then(() => claimExclusively(form, identity, log));
  queue = run.then(() => undefined, () => undefined);
  return run;
}

async function claimExclusively(form: LocalOwnerForm, identity: LocalClaimIdentity, log: (line: string) => void): Promise<LocalClaimOutcome> {
  const state = await identity.firstRun.state();
  if (state === "claimed") return { ok: false, code: "already_claimed" };
  try {
    const userId = state === "unclaimed" ? await createOwner(form, identity) : await adoptTemporaryAdmin(form, identity);
    log(`FluxIQ setup: the owner account was ${state === "unclaimed" ? "created" : "made from the default admin account"}.`);
    return { ok: true, userId };
  } catch (error) {
    if (error instanceof IdentityUsernameTakenError) return { ok: false, code: "username_taken" };
    log(`FluxIQ setup: the owner claim failed (${error instanceof Error ? error.name : "unknown error"}).`);
    return { ok: false, code: "claim_failed" };
  }
}

async function createOwner(form: LocalOwnerForm, identity: LocalClaimIdentity): Promise<string> {
  const owner = await identity.upsertUser({ username: form.username, displayName: form.username, roleId: "admin", password: form.password });
  return owner.id;
}

async function adoptTemporaryAdmin(form: LocalOwnerForm, identity: LocalClaimIdentity): Promise<string> {
  // By its current name: a claim that renamed it and then failed is retried as the same account.
  const admin = (await identity.snapshot()).users.find((user) => user.id === TEMPORARY_ADMIN.userId);
  if (!admin) throw new Error("The default admin account is missing.");
  const proof = await identity.authenticate({ username: admin.username, password: TEMPORARY_ADMIN.password });
  try {
    await identity.updateUser({ id: TEMPORARY_ADMIN.userId, username: form.username, displayName: form.username });
    await identity.setPasswordAuthorized({
      userId: TEMPORARY_ADMIN.userId,
      password: form.password,
      sessionId: proof.session.id,
      authorizationPassword: TEMPORARY_ADMIN.password,
      authorizationPin: undefined,
      authorizationTotp: undefined
    });
  } finally {
    await identity.revokeSession(proof.session.id);
  }
  return TEMPORARY_ADMIN.userId;
}

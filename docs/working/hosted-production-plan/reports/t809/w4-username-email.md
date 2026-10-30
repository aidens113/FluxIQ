# t809 W4: email usernames and the owner's verified email (service profile)

## Outcome

Partial. The brief assumed that a provisioned username "may not be email-shaped" today. That is not the case: both goals already hold in code, on every profile. No provisioning code changed. I added tests that pin both goals and a doc comment that states the verification rule. The acceptance checks that need the shared heavy-check lock did not run. The lock had been held by another agent since 19:01:56 and was still held at 19:15. The web tests also refuse to run until Core's dist is rebuilt, because another worker's edit to `programs/automation-studio/api/handlers/conversations.ts` made it stale.

## Findings (evidence)

- **(a) Username is the email.** `createAccount` sets `username: input.email` (`operations/create-account.ts:49`). `input` was parsed by the contract schema `field.email = z.string().trim().toLowerCase().max(254).email()` (`packages/contracts/src/platform/provisioning/fields.ts:33`) for both transports (`service/parse-provisioning-input.ts`). No other provisioning path writes a username (`updateUser` calls change only enabled and role). The owner claim passes the form's `username` as `email` (`apps/web/src/server/owner-claim/claim-owner.ts`), so a non-email is refused as `invalid_input` on field `username`, and the existing tests show this. The rule does not depend on the profile, so `local` and `self-hosted` are unchanged.
- **(b) Verified only when proven. Rule chosen: the claim never proves the email, so the owner starts unverified.** The setup code is either generated into `<fluxiq>/security/setup-code` or read from the operator's `FLUXIQ_SETUP_CODE_FILE`. It is never mailed. Knowing it proves control of the server, not of the mailbox. `createAccount` writes `emailVerifiedAtMs: null`. The only code that sets it is `links/redeem-account-link.ts:53`, when a link mailed to the address is redeemed. That is already today's behaviour, so nothing needed changing.

## What changed and why

- New `packages/fluxiq/src/platform/provisioning/tests/account-username.test.ts` (14 tests). It covers multi tenancy (the shape of `service`) and single tenancy (`local` and `self-hosted`), and the listener, command-line and in-process callers. It checks four things:
  - the username equals the normalised email, which equals `account.email`;
  - five non-email forms are refused with `invalid_input` on the `email` path, and nothing is created;
  - the email starts unverified and stays unverified when the welcome mail is only sent;
  - redeeming the welcome link verifies it.
- `apps/web/src/server/owner-claim/tests/claim-owner.test.ts`: three tests added.
  - On `service` and on `self-hosted`, an owner claimed with `"  Owner.Name@Example.TEST "` gets the username `owner.name@example.test`, equal to the account email, and `emailVerifiedAtMs` is null.
  - On `service`, the username `owner` is refused with `invalid_input` on `["username"]`, and only `admin` exists afterwards.
- `apps/web/src/server/owner-claim/claim-owner.ts`: a doc comment only, stating the username rule and the verification rule.

## Commands run and observed results

- From packages/fluxiq, `pnpm exec vitest run src/platform/provisioning/tests/account-username.test.ts` printed "Test Files 1 passed (1)" and "Tests 14 passed (14)".
- From apps/web, `pnpm exec vitest run src/server/owner-claim/tests/claim-owner.test.ts` failed at startup with "Core's library build is 9 minute(s) behind its source". The stale file was `packages/fluxiq/src/programs/automation-studio/api/handlers/conversations.ts`, which belongs to another worker.
- `pnpm --filter @fluxiq/contracts --filter fluxiq build` was queued under the heavy-check lock and never acquired it. Its log file was never created. The queued job ends with this run, and it held no lock.

## Not verified

- The new apps/web claim-owner tests have not run (dist is stale).
- Core `pnpm exec tsc --noEmit` was not run (lock busy).
- `pnpm test src/platform` from packages/fluxiq was not run (lock busy). Only my new file ran.
- apps/web tsc and `vitest run src/server src/lib src/app` were not run.
- `pnpm structure:check` was not run on the new test file.

## Open questions or contradictions found

1. The brief's premise was wrong. Usernames are already email-only for every provisioned account and for the owner, on every profile, so no `platform/provisioning` change was needed.
2. Under `service` the owner has no way to verify their email. Every option has a cost:
   - The claim could pass `sendWelcome: true` (no contract change). Redeeming that link resets the password and revokes sessions, which leaves any keys sealed under the claim password unreadable.
   - A dedicated "verify email" link needs a new link purpose in `platform/store` (not owned) and a page.
   I did not implement either. This becomes urgent once the plan's rule ("a verified email is required before connecting or building") is enforced.
3. Uniqueness is not enforced, and this is a separate risk outside my scope. Identity-access's `createUser` and `updateUser` endpoints (`programs/identity-access/api/handlers.ts`, not owned) accept any username, including another account's email, on `service`. `upsertUser` does not refuse a duplicate username, and `authenticate` takes the first match. Accounts made outside provisioning can therefore break the "username = email, unique" rule.

Outcome: Partial
Changed: packages/fluxiq/src/platform/provisioning/tests/account-username.test.ts (new); apps/web/src/server/owner-claim/tests/claim-owner.test.ts; apps/web/src/server/owner-claim/claim-owner.ts (comment only)
Validation: `pnpm exec vitest run src/platform/provisioning/tests/account-username.test.ts` (packages/fluxiq) -> "Tests 14 passed (14)"; web claim-owner test -> refused at startup, Core dist stale; tsc and directory suites not run (heavy lock held by another agent)
Not verified: the new web tests, Core and web tsc, `pnpm test src/platform`, the web vitest directories, structure:check
Report: docs/working/hosted-production-plan/reports/t809/w4-username-email.md
Notes: Both goals already held, so the rule chosen is "the setup code never proves the mailbox, so the owner starts unverified". No contract change was needed. Two follow-ups: the owner has no way to verify their email, and identity-access does not enforce unique usernames.

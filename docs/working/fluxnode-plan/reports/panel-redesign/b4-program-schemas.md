# P9-B4: input schemas and assistant declarations, nine programs

## Outcome
Done, except the fluxiq typecheck (not run: free memory 1032 MB, below the 3000 MB bar).

## What changed
- `packages/contracts/src/program-api/<program>/` (new: background-tasks, compute-control, database-manager, deployment-sync, docs, identity-access, production-runner, runtime, secret-keys/snapshot.ts) with schemas, barrels and a `tests/` file each; export lines added to `program-api/index.ts`. The runtime program's id is `runtime`, so its directory is `runtime/`.
- Every endpoint in the nine `packages/fluxiq/src/programs/<program>/api/handlers.ts` now has an `assistant` entry (tool or hidden reason). The three secret-keys endpoints already declared were left alone. Handler behaviour is unchanged (no handler adopts the schema; the schemas only describe).
- One `api/tests/assistant-inputs.test.ts` per program: each exposed endpoint is called as the admin with its schema's minimal example, and must not answer with a payload error.

## Exposed vs hidden (exposed / hidden / total)
background-tasks 2/4/6; compute-control 1/7/8; database-manager 1/6/7; deployment-sync 1/5/6; docs 2/2/4; identity-access 3/9/12; production-runner 1/5/6; runtime-control 5/0/5; secret-keys 1 new (+3 already declared)/6/10. Total 17 new exposed, 44 hidden.

Exposed: snapshot of each program; background-tasks detail; docs get-page; runtime list-clients, list-capabilities, list-runs, get-run; identity-access update-user (only username and display name; role, enabled and every credential field are not in the schema) and revoke-session (by digest); secret-keys snapshot (lists key names, never values). identity-access and secret-keys derive as `security`.

## Hidden, one line each
- background-tasks run, set-enabled, save-schedule, control: operator actions on the task engine.
- compute-control register-node, heartbeat, poll-commands, complete-command: only client processes call them; command, acquire-lease, release-lease: operator/client-process actions.
- database-manager authorize-store: takes password, PIN, TOTP; list-records, get-record, put-record, delete-record: raw records, may be protected stores needing credentials; run-migration: operator migration.
- deployment-sync upsert-target, upsert-artifact, dry-run, sync, rollback: operator deployment steps.
- docs rebuild, register-source: operator steps.
- identity-access create-user (password and recheck credentials), set-password, set-pin, confirm-totp, begin-totp, disable-totp, create-session, unlock-vault (all take or require credentials); lock-vault: operator step.
- production-runner register-target, start, advance, stop, cancel: operator steps.
- secret-keys unlock, create-key, rotate-key, reveal-key, delete-key, update-key: all need a key value or the person's password.

## Commands run and observed
- Parity: `cd packages/fluxiq && npx vitest run src/programs/_shared/assistant/tests/assistant-parity.test.ts --pool=forks --poolOptions.forks.singleFork` -> `{"registrations":255,"undeclared":0,"byProgram":{}}`, 5 tests passed.
- `cd packages/contracts && npx vitest run src/program-api --pool=forks ...` -> 21 files, 57 tests passed.
- Nine programs' directories under packages/fluxiq (all existing api tests plus the new ones) -> 40 files, 351 tests passed.
- `node scripts/structure-audit.mjs` -> `structure-audit: passed (536 warning(s), 1095 baselined)`.

## Not verified
- fluxiq typecheck: not run (memory 1032 MB, lock not taken). The supervisor should run it; the only type risk is the new `@fluxiq/contracts/program-api-inputs` imports and `phrases` arrays in the handlers.
- The generated assistant-tools catalog was not regenerated (as briefed).

## Open questions
- The brief asked for "rename model keys" and "add or remove a person" to be exposed. `update-key` requires the person's password in its payload and `create-user` requires a password plus the caller's recheck credentials, so under the credentials rule both are hidden. identity-access has no delete-user endpoint (removing is `update-user` with `enabled: false`, which needs a credential recheck, so it is not offered either). Renaming a person is exposed. If renaming a key or adding a person by assistant is wanted, the endpoints need a path that does not carry credentials in the payload (for example approval-gated at the panel); that is a design choice for the supervisor.

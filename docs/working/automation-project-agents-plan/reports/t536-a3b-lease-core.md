# t536 A3b — host lease carried on every host command (Core)

## Outcome

Done, including the supervisor's follow-up that scopes strict mode to a session.
Uncommitted in `fxwork/t536/!FluxIQ`, branch `task/t536-host-lease-wire`.
I did not change the shape of the contracts type (`ClientGatewayHostLease`,
`CLIENT_GATEWAY_HOST_LEASE_REFUSAL_CODES`, `ClientGatewayActionCommand.lease?`). The session id
stays on Core's lease and never goes on the wire lease.

## Follow-up: strict mode is per session, not process-wide

- **Session on the grant.** `AutomationStudioHostResourceGrant` (`host-resources/types.ts`) has a new
  optional `sessionId?: string`: the gateway session the resource lives on, which the web port always
  sets. `scheduler.ts` changes only as far as carrying it:
  - `admit` refuses a `sessionId` that is not a non-empty string, with a port-contract error.
  - `admit` copies the session id onto the frozen lease only when the grant has one.
- **Session in the gateway check.** `ClientGatewayHostLeaseSource.requiresLease(sessionId)` now takes
  the session a command is addressed to:
  - `clientGatewayHostLeaseStamp(command, source, sessionId)` passes it through.
  - `commands.ts` passes the `executeAction` session, and the durable `dispatch.ts` passes it through
    `stampLease(input, sessionId)`.
- **Per-session refusal.** The lease scope registers strictly held leases with their session.
  `requiresLease(s)` is true only while a current strict lease whose `sessionId` is `s` is held, or
  one with no `sessionId`. A grant without a session keeps the conservative behaviour, strict for
  every session. The doc comments on the grant, the source and the scope all say so.
- **Tests added:**
  - `lease-scope.test.ts`: a strict lease on session A refuses an unleased command to A and lets one
    to session B through, unstamped. A strict lease whose grant has no session refuses unleased
    commands to both A and B.
  - `scheduler.test.ts`: the grant's session is carried onto the lease and left off a grant without
    one. An empty or non-string session is a contract error.
  - `stamp.test.ts`: `requiresLease` is asked about the command's own session.
  - `commands-host-lease.test.ts`: strict on session A refuses to A and sends to B.
  - `dispatch-host-lease.test.ts`: strict on another session lets the durable command through to its
    claim and send.
- **Tests updated:** existing call sites now pass a session id.

## What changed and why

**Lease scope**: `project-agents/host-resources/lease-scope.ts` (new)
- `AutomationStudioHostLeaseScope(scheduler, { strict? })`. Its `run(holder, work, options)`
  is `scheduler.run` with `{ lease, scheduler }` held in a module AsyncLocalStorage for the
  duration of the work. `static current()` returns the lease in scope.
- `static gatewaySource` is the `ClientGatewayHostLeaseSource` that the host gives to the gateway:
  - `current()` returns the lease in scope.
  - `isCurrent(lease)` is true only when the lease equals the scope's lease and the scope's own
    scheduler still calls it current.
  - `requiresLease(sessionId)` is true while a strict scope holds a current lease on that session,
    or on no named session.
- `strict` defaults to true, following the plan's invariant that Core refuses a command from a
  role without a current lease. The check is per session; see the follow-up section.
- Work that outlives its lease (a promise left running) keeps the scope. Its later commands are
  refused as `host_lease.stale`.

**Gateway side**: new `client-gateway/service/host-lease/`, with a barrel exported from `service/index.ts`
- `source.ts` defines the port type `ClientGatewayHostLeaseSource { current, isCurrent, requiresLease }`.
  The gateway never imports `programs/`.
- `stamp.ts` holds `clientGatewayHostLeaseStamp(command, source)`. It returns either `{ command }` or
  `{ refused: code }`:
  - A lease the caller supplied that is not the scope's own is refused as `host_lease.holder_mismatch`.
    This includes a lease supplied when there is no scope or no source.
  - A scope lease that is no longer current is refused as `stale`.
  - When no lease is in scope and strict mode applies, the command is refused as `missing`.
  - When no lease is in scope otherwise, the caller's own object is returned unchanged, so the payload
    is byte for byte what it is today.
  - Otherwise it returns a copy with only the lease's wire fields.
- `refusal.ts` holds `clientGatewayHostLeaseRefusal(commandId, code)`. It returns `failed` with
  `{category: blocked_by_capability_or_policy, code, retryable: false, stage: dispatch, effect: unacted}`
  plus an `error` text.
- `shape.ts` holds `isClientGatewayHostLease`: exact fields, a non-empty key, role and briefId, and a
  safe-integer epoch.

**Non-durable path**: `client-gateway/service/commands.ts`
- `executeAction` stamps the command right after `commandId` is made.
- A refusal returns `{commandId, message, result: Promise.resolve(failure)}`. The command is not sent,
  `history.opened` is not called, and the audit log records `command.host_lease_refused`.
- `message` is the would-be message. It was never sent.
- Supporting changes:
  - `hostLease` was added to `CommandCollaborators`.
  - `service/types.ts` has a new `ClientGatewayServiceOptions.hostLease` option.
  - `client-gateway/service.ts:91` passes `hostLease: options.hostLease`. This one-line pass-through
    is needed and the brief did not list it.

**Durable path**: `service/command-ledger/dispatch.ts`
- `lease` was added to the field allowlist, and `validateCommand` rejects a malformed lease as
  `durable_command.invalid_command`.
- A new private `stampLease(input)` runs before `Controller.digest`, so the request digest covers
  the lease:
  - A malformed lease the caller supplied is an `invalid_command`.
  - A stale, foreign or missing lease throws `durable_command.host_lease.stale`, `.holder_mismatch`
    or `.missing`. These are synchronous throws from `execute`, before the claim and before
    `resolveCommandLedger`.
- `Ports.hostLease` arrives through the existing `{...collaborators}` spread.

**Host runtime and wiring**
- `runtime/host-runtime.ts` has a new optional `hostResources?: AutomationStudioHostResourcePort` on
  `AutomationStudioHostRuntimeBoundary`, with its documented obligation.
- `programs/_shared/runtime.ts` passes `hostLease: AutomationStudioHostLeaseScope.gatewaySource` to
  `ClientGatewayService`, next to `commandOwner`.
- `project-agents/host-resources/index.ts` gained one line, `export { AutomationStudioHostLeaseScope }`.
  This deviates from "must not touch other host-resources files". The barrel has to publish the new
  file, and a deep import would break the one-barrel-per-directory rule. Nothing else in that
  directory changed.

**Tests (new)**
- `client-gateway/service/host-lease/tests/{stamp,refusal,shape}.test.ts`
- `client-gateway/service/tests/commands-host-lease.test.ts` checks:
  - With no scope, the payload is byte for byte today's, with and without a source.
  - The command is stamped from the scope.
  - Stale, forged, supplied-without-scope and strict-missing leases are refused, nothing is sent, the
    record parses as failed/unacted, and the refusal is audited.
- `client-gateway/service/command-ledger/tests/dispatch-host-lease.test.ts` checks:
  - With no scope, the digest is unchanged.
  - The digest includes the lease, and the sent payload carries it.
  - A malformed lease is `invalid_command`.
  - Stale, forged and strict-missing leases throw, `resolveCommandLedger` and `claim` are never
    called, and nothing is sent.
- `project-agents/host-resources/tests/lease-scope.test.ts` uses the real `ClientGatewayService`
  wired with `gatewaySource`:
  - A command inside the scope is stamped, and one outside is not.
  - Two concurrent scopes on a capacity-2 `StubHost` each stamp their own lease, on different
    resources.
  - A late command from a released lease is refused as stale and not sent.
  - Strict mode refuses an unleased command while a lease is held and allows it after release. A
    lenient scope does not require a lease.
  - A trial run (`runCanonicalAutomationStudioFlow` with an `effectDispatcher` sending through the
    gateway and a `hostRuntime` carrying `hostResources`) stamps every dispatched command, and the
    resource is freed afterwards.
- `packages/contracts/src/tests/client-gateway.test.ts` checks:
  - The lease is optional.
  - The refusal codes are frozen and exact.
  - Each code parses as a blocked, unretryable, unacted dispatch failure record.

## Commands run and observed results

All of these ran in `fxwork/t536/!FluxIQ`:

- `pnpm.cmd --filter @fluxiq/contracts build`: rebuilt, `"build-cache":"build" ... stored`.
- `pnpm.cmd --filter @fluxiq/contracts check`: passed.
- `pnpm.cmd --filter @fluxiq/contracts test`: `Test Files 14 passed (14)`, `Tests 176 passed (176)`.
  The contracts code did not change in the follow-up, and I did not re-run it then.

Re-run after the follow-up, as the final state:
- `pnpm.cmd --filter fluxiq check`: passed, with no `error TS` output (build-cache `build`, stored).
- `pnpm.cmd exec vitest run src/client-gateway src/programs/automation-studio/runtime/project-agents src/programs/automation-studio/runtime/tests/composite-executor.test.ts`
  (from `packages/fluxiq`): `Test Files 22 passed (22)`, `Tests 176 passed (176)`. This covers all
  existing client-gateway tests, including `dispatch.test.ts` and `late-action-result.test.ts`, and
  the scheduler tests.
- `node scripts/structure-audit.mjs`: passed (345 warnings, 1156 baselined). Two runs failed on
  statement-packing in my new tests, and I fixed both.
- `git diff --check`: clean (exit 0).

Pre-existing failures, unchanged by this work. The exact commands to reproduce them, run from
`packages/fluxiq` in a checkout with contracts built:

```sh
pnpm.cmd exec vitest run src/programs/automation-studio/client-gateway src/programs/automation-studio/runtime/tests/session-recovery/tests/service-wiring.test.ts
pnpm.cmd exec vitest run src/programs/_shared/tests/late-action-result-wiring.test.ts
```

- **First command:** `Test Files 3 failed | 2 passed (5)`, `Tests 34 failed | 7 passed (41)`. The
  errors are `AutomationInstructionError: Describe what this recording demonstrates before starting
  it.` (18 times) and `AutomationInstructionError: Write active instructions in this automation's
  Instructions before running or building it.` (5 times).
- **Second command:** `Tests 2 failed (2)`, also `Write active instructions ...`.
- **Check against base:** before the follow-up, I reverse-applied my whole diff with `git apply -R`
  (patch saved from `git diff`) and ran the first command again. It failed the same 34 tests, test
  for test. The second command failed both tests the same way. I then re-applied the diff, and
  `git status` showed it restored.
- **After the follow-up:** I ran both commands again with my changes in place and got the same counts.
  These failures are not caused by this change. They look like instruction-readiness gates that these
  tests' fixtures do not satisfy.

## Not verified

- No live browser or extension run. The client-side refusal (W1) and its exact failure record are not
  cross-checked against W1's code.
- Full suites were not run, per the narrow-checks rule.

## Open questions or contradictions found

1. **Strict mode is now per session (resolved by the follow-up).** It still applies to everything
   on that session. While a builder holds a strict lease on a session, the supervisor's own host
   commands to the same session (opening look, observe tools) need a lease or a non-strict scope.
   A grant with no `sessionId` is strict for every session, so the web port must set it.
2. **The durable digest now includes the lease.** A durable command re-dispatched under a reissued
   lease (epoch+1) with the same owner and command id produces a different request digest from its
   existing ledger claim. The brief asked for this. A5 or the run-recovery path should expect it.
3. **Barrel line in `host-resources/index.ts` and pass-through in `client-gateway/service.ts`.** Both
   are outside the literal "owns" list and are explained above.
4. **Malformed caller lease on the non-durable path.** The durable path calls it `invalid_command`.
   The non-durable path answers `host_lease.holder_mismatch` (refused, unsent), because it has no
   invalid-command error today.

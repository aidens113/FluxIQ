# Report: core-client-gateway-facade (Phase 7, pilot)

## Outcome

Done.

`packages/fluxiq/src/client-gateway/service.ts` is now a facade. `ClientGatewayService`
keeps all 23 public methods, in the same order, with the same signatures, and
holds no gateway state; it forwards to twelve collaborators under
`client-gateway/service/`. The class went from 43 methods to 23 and from 636
lines to 182. The barrel `client-gateway/index.ts` resolves to the same 34
exported names it did before, proved by a checker-resolved diff. A scripted
differential probe produced a **byte-identical** 31 KB behaviour transcript from
the old and the new implementation across 41 observation points.

Two things the brief assumed do not match the tree, and both matter for the
`AutomationStudioService` phase. They are in **Open questions** below.

## What changed and why

### The split

| File | Class | Methods | Lines | Owns |
| --- | --- | --- | --- | --- |
| `service/types.ts` | — | — | 49 | `InternalSession`, `PendingCommand`, and the five public-surface types |
| `service/config.ts` | — | — | 27 | `resolveClientGatewayConfig`: options with defaults applied |
| `service/audit-log.ts` | `ClientGatewayAuditLog` | 2 | 28 | the audit entries |
| `service/event-bus.ts` | `ClientGatewayEventBus` | 2 | 15 | the handler set |
| `service/sessions.ts` | `ClientGatewaySessionRegistry` | 12 | 95 | the session map |
| `service/pairings.ts` | `ClientGatewayPairingRegistry` | 8 | 77 | the pairing map, codes, expiry |
| `service/trusted-clients.ts` | `ClientGatewayTrustedClientRegistry` | 13 | 158 | trusted clients, the token-hash index, the store |
| `service/transport.ts` | `ClientGatewayTransport` | 4 | 45 | building and delivering server messages |
| `service/pairing-flow.ts` | `ClientGatewayPairingFlow` | 6 | 156 | challenge → durable trust |
| `service/lifecycle.ts` | `ClientGatewayLifecycle` | 5 | 119 | connect, hello, disconnect |
| `service/access.ts` | `ClientGatewayAccess` | 2 | 61 | `authorizeToken`, `revokeTrustedClient` |
| `service/commands.ts` | `ClientGatewayCommands` | 8 | 107 | server→client commands, pending-command table |
| `service/inbound.ts` | `ClientGatewayInbound` | 2 | 97 | the client message router |
| `service/views.ts` | `ClientGatewayViews` | 5 | 85 | `snapshot`, `summary`, `listSummaryItems` |
| `service/index.ts` | — | — | 14 | directory barrel |

15 files, so the directory sits exactly at the 15-file advisory threshold and
raises no warning. No class exceeds 13 methods; no file exceeds 182 lines.

### Dependency order, and the one cycle

Collaborators are wired in the facade constructor in strict layers, so no two
collaborators reference each other:

```
config, types
  └ audit-log, event-bus, sessions, pairings, trusted-clients
      └ transport (sessions)            commands (sessions, transport)
          └ pairing-flow                views (all registries)
              └ lifecycle
                  └ access, inbound
```

One genuine cycle exists in the original code and cannot be layered away:
`connect` starts the hello handshake, and the handshake calls `disconnect` on
the sessions a reconnecting client replaces. I merged `connect`, `disconnect`
and `handleHello` into `ClientGatewayLifecycle` rather than inventing an
indirection to break it. `handleHello` was additionally split into three private
steps (`applyHello`, `resumeTrustedSession`, and the pairing fallback) because it
was the only method that touched every container at once.

### Behaviour preserved deliberately, not incidentally

Several details in the original would silently change under a naive move, and
each was kept:

- **Clock reads.** `disconnect` reads `now()` twice (`disconnectedAt`,
  `lastSeenAt`) and `createPairing` reads it twice (`requestedAt`, `expiresAt`).
  Collapsing either to one read is invisible with a constant clock and visible
  with a counter clock. Both double reads survive.
- **Token-before-clock ordering.** `completePairing` and `handleHello` both do
  `createToken()` then `now()`. `register` and `rotateToken` therefore compute
  their own timestamp internally and return the token; the caller reuses
  `trustedClient.approvedAt` rather than reading the clock again.
- **Persist rollback.** All three persisting mutations (`register`,
  `rotateToken`, `revoke`) restore every field *and* the token-hash index before
  rethrowing, exactly as the original did. The probe exercises all three.
- **`connect` returns the pre-hello session.** `void handleHello(...)` suspends
  at its first `await`, so the returned public session still reads `connected`.
  The collaborator split preserves that suspension point.
- **Map mutation during iteration.** The reconnect and revoke fan-outs now
  snapshot the matching sessions into an array before disconnecting them.
  `disconnect` only replaces existing keys, so the visited set is identical.

### The import the plan will trip over

Collaborators import contract types from `@fluxiq/contracts/client-gateway`
(a bare specifier) rather than from `../contracts.ts`, and `JsonObject` from
`../../core/index.ts` (a barrel). This is not style. The `imports` rule counts a
relative specifier that resolves into a barrel-owning directory's *files*, and
`client-gateway/` has an `index.ts`; a file in `client-gateway/service/` that
imports `../contracts.ts` is therefore a barrel-skipping import and a new
ratcheted failure. The exemptions cover same-directory imports and
`<dir>/tests/` importing `<dir>` — not `<dir>/<child>/` importing `<dir>`.
`client-gateway/contracts.ts` happens to be a one-line re-export of
`@fluxiq/contracts/client-gateway`, so importing the package directly is exact
and costs nothing. **`runtime/` has no equivalent escape hatch.** See Open
questions.

### What did not change

`client-gateway/index.ts`, `contracts.ts`, `testing/`, and
`tests/service.test.ts` are untouched. The `service/` barrel is *not* re-exported
from `client-gateway/index.ts`; the collaborators are private to the directory,
which is the point of the facade. `service.ts` re-exports its five public types
by name from `./service/index.ts`, so the barrel surface is unchanged without
widening anything.

I did not split `tests/service.test.ts` (239 lines, 10 tests). The plan says the
test file is split "to mirror the collaborators as they appear, never ahead of
them", and at this size mirroring would add churn without adding coverage. Every
one of its tests drives the public facade and passes unchanged.

## Commands run and observed results

All from `F:\!FluxIQ` or `packages/fluxiq`.

**Type check** — `npx tsc --noEmit` in `packages/fluxiq`: exit 0, zero output,
both before the work (baseline) and after.

**Scoped tests** — `npx vitest run src/client-gateway src/runtime/tests/client-gateway-transport.test.ts src/programs/automation-studio/client-gateway src/programs/automation-studio/api/tests/handlers.test.ts`

| | Before | After |
| --- | --- | --- |
| Test files | 4 passed (4) | 4 passed (4) |
| Tests | 57 passed (57) | 57 passed (57) |

Unchanged, and green. The package's four known pre-existing failures
(`service.test.ts`, `service-subflow-pagination.test.ts`,
`runtime-llm-grants.test.ts` under `programs/automation-studio/`) are outside
this scope and were not run.

**Barrel export diff.** A TypeScript-checker script listed
`checker.getExportsOfModule` for `client-gateway/index.ts`, once with `service.ts`
reverted to HEAD and once with the facade in place:

```
$ diff barrel-before.txt barrel-after.txt
$ echo $?
0
```

**34 exported names, identical.** Every symbol the external importers name
(`ClientGatewayService`, `ClientGatewayTrustedClientStore`,
`CLIENT_GATEWAY_PROTOCOL_VERSION`, `ClientGatewaySocket`, and eleven others) is
still on that list.

**Public method-name diff.** AST extraction of the class members:

```
before: ## CLASS ClientGatewayService  public=23 private=20 totalMethods=43
after:  ## CLASS ClientGatewayService  public=23 private=0  totalMethods=23
$ diff <(public section, before) <(public section, after)
IDENTICAL
```

Same 23 names, same order. Private methods went to zero; fields went 17 → 9.

**Differential behaviour transcript.** A temporary probe (deterministic
`randomUUID` via `vi.mock("node:crypto")`, seeded `Math.random`, counter clock,
counter token minter) drove one service instance through 41 logged observations:
pairing, approval with a blank operator, reconnect with token rotation and
replaced-session disconnect, all six server→client commands, an action result
and an action timeout, every inbound message type, a message sent before
pairing, `dismissPairing`, three `listSummaryItems` pages plus a search, a
persist failure during approval, a persist failure during revocation, revoke
with fan-out, double revoke, `authorizeToken` before and after revocation,
disconnect, `clearOutbound`, the final `snapshot`, the full event list, the raw
socket traffic, and a store whose `load` throws. Run against the facade, then
against `service.ts` reverted to HEAD, then diffed:

```
$ cmp transcript-old.json transcript-new.json
BYTE-IDENTICAL   (31,268 bytes, 41 observations)
```

Byte identity also means the UUID generation order, the clock read count and the
token mint order are unchanged — the things a delegation refactor most easily
perturbs. The probe was removed from the tree afterwards; it is preserved at
`<session scratchpad>/cgw/transcript-probe.test.ts` and the recipe is above.

**Structure audit** — `node scripts/structure-audit.mjs --rule <id> --json`,
filtered to keys under `src/client-gateway`:

| Rule | Findings under `src/client-gateway` |
| --- | --- |
| `imports` | 0 |
| `exported-values` | 0 |
| `naming` | 0 |
| `directory-files` | 0 |
| `file-lines` | 0 |
| `class-methods` | 0 |
| `test-placement` | 0 |

Zero, on every rule. The one `client-gateway`-matching warning in the full run is
`programs/automation-studio/client-gateway/bridge.ts: 547 lines` — pre-existing
and a different directory. I did not run `pnpm structure:baseline`.

**The five external importers.** Each resolves; each is named below.

## The three answers for `AutomationStudioService`

### 1. Which grouping heuristic held up

**Not the prefix heuristic.** Over the 43 method names there are **37 distinct
leading verbs**. The largest group is `send` with 3 (`send`, `sendPing`,
`sendError`); then `create`, `receive`, `require`, `public` with 2 each; 33
verbs appear once. A prefix split would have produced thirty-odd collaborators
of one method and solved nothing.

The plan's Phase 7 table is built on `write` 39 / `read` 25 / `delete` 25 /
`list` 51 / `get` 33. Those groups are large because `AutomationStudioService`
is substantially a persistence facade, where the verb *is* the responsibility.
`ClientGatewayService` is a protocol state machine, where it is not. **The
prefix heuristic works on the CRUD-shaped part of a class and fails on the rest**
— so expect the persistence and retrieval extractions (192 of 422 methods) to go
roughly as the table predicts, and expect the remaining 230 to need a different
rule.

**What held up: group by the mutable state the method owns.** The 43 methods
touch seven containers (sessions, pairings, trusted clients + token index,
pending commands, handlers, audit entries, resolved config). Sorting methods by
"which container do you own" produced the six registries and low-level
collaborators immediately and unambiguously. The residue — methods touching
three or more containers — became the five flow collaborators.

**The residue is the number that matters. 25 of 43 methods (58%) touch two or
more containers.** Those methods are not made simpler by any grouping; they are
where the coupling lives, and a facade split *names* that coupling rather than
reducing it. The domain-noun count is a useful cross-check that agrees with the
state grouping (`Pairing` in 9 names, `TrustedClient` in 6, `Session` in 5,
`Recording` in 3) and is cheap to compute up front.

Concrete recommendation: before writing any code for `AutomationStudioService`,
generate a method × field access matrix from the AST and cluster on it. I did
that grouping by reading, which is viable at 43 methods and is not at 422.

### 2. What the facade cost in indirection

| | Before | After | Δ |
| --- | --- | --- | --- |
| Total lines | 636 | 1,315 | **+679 (+107%)** |
| Code lines (no blanks/comments) | 586 | 1,096 | **+510 (+87%)** |
| Files | 1 | 16 | +15 |
| Comment + blank lines | 50 | 219 | +169 |

Of the added code lines, roughly 250 are pure wiring with no behaviour:

- **111 import lines.** Twelve collaborators each re-import the types and
  siblings that were in scope for free inside one class.
- **47 `private readonly x: ClientGatewayY;` field declarations.**
- **50 `this.x = collaborators.x;` constructor assignments.**
- **6 `*Collaborators` bundle types**, ~36 member lines, which exist only
  because five constructors would otherwise take six positional arguments.

Call depth: every public method is now one hop deeper, and the deepest path is
four (`service.startRecording` → `commands` → `transport.send` →
`sessions.require`). Reading `handleHello` end to end now means opening
`lifecycle.ts`, `trusted-clients.ts`, `transport.ts`, `sessions.ts` and
`pairing-flow.ts`.

Whether that is worth it depends entirely on the denominator. At 636 lines the
honest verdict is that the facade bought testability and a clean ownership story
for a doubling of code, and the doubling is felt. At 12,482 lines the same
constant overhead is noise and the ownership story is the whole point — the
transformation is *more* worth doing there, not less. But +87% applied to 12,482
code lines is roughly **+10,000 lines**, and `runtime/service/` would land near
23,000 lines. Which leads to:

### 3. What would not scale by a factor of ten

1. **A flat collaborator directory.** I used 15 files and sat exactly on the
   25-file directory limit's advisory threshold. `runtime/service/` at the same
   granularity would hold well over 100 files and blow the hard limit
   immediately. It must be subdivided by responsibility from the first commit
   (`service/persistence/`, `service/retrieval/`, …), which in turn means
   nested barrels and a deeper import graph than I dealt with.

2. **Hand-derived layering.** I ordered twelve collaborators and broke one cycle
   by inspection. At 422 methods, cycles will be numerous and not visible by
   reading. Derive the graph mechanically first.

3. **The all-at-once cutover.** I built every collaborator, then replaced
   `service.ts` in one step, and ended with a class that has zero private
   methods. Phase 7 cannot do that — the plan already says each extraction is
   its own commit. The consequence worth stating plainly: for most of Phase 7
   the facade will be a *mixed* class, public methods delegating alongside
   private methods not yet moved. That is fine for the `class-methods` ratchet,
   which only ever falls, but it means "the class holds no state" is the end
   state, not an invariant during the work — collaborators will need the
   half-migrated class's state passed in, and that temporary coupling is the
   part most likely to leave residue. Plan for how it gets removed.

4. **The differential transcript, as built.** It worked because
   `ClientGatewayService`'s entire observable surface is (outbound messages,
   emitted events, audit log, snapshot, thrown errors) and its only I/O is an
   injected store. `AutomationStudioService` touches SQLite, the filesystem and
   LLM providers, so a byte-identical transcript is not obtainable the same way.
   **The technique transfers even though the harness does not**: freeze
   `randomUUID`/`Date`/`Math.random`, replay one scripted scenario against old
   and new, diff the JSON. At 422 methods, scenario scripts per collaborator,
   captured once before the extraction begins, would be worth more than the
   extraction itself — and cheaper to write while the monolith is still intact.

5. **`service.test.ts` at 4,790 lines.** I could leave a 239-line test file
   alone. Phase 7 cannot; and the plan's rule ("split to mirror the
   collaborators as they appear, never ahead of them") means the test file is
   edited in every one of those commits. Budget for that — it is likely the
   largest single cost in the phase, and it is serial.

6. **The `imports` rule.** The blocker. See below.

## Not verified

- **The built `dist/`.** `apps/web/src/server/client-gateway-websocket.ts`
  imports `fluxiq/client-gateway`, which the package `exports` map resolves to
  `dist/client-gateway/index.d.ts`. I did not run `pnpm --filter fluxiq build`,
  because another worker is rebuilding `packages/fluxiq/dist` concurrently and a
  race there would disrupt several people. The declaration surface is generated
  from the unchanged barrel and the export-name set is provably identical, and I
  read `scripts/rewrite-declaration-imports.mjs` to confirm it only rewrites
  `.ts` → `.js` on relative specifiers (so `./service/index.ts` →
  `./service/index.js`, no ambiguity between `service.js` and `service/`). But
  the build was not run.
- **`apps/web` tests.** Out of scope; not run.
- **The rest of `packages/fluxiq`.** Only the four consumer test files were run.
  `pnpm check` and `pnpm test` at repository scope were not run, deliberately —
  eleven workers are editing this tree.
- **Live browser behaviour.** Nothing here is browser-side.
- **`pnpm structure:baseline`.** Not run, per the brief.

## Open questions or contradictions found

**1. The brief's "five imports reach into its internals" does not match the
tree.** Zero imports reach past `client-gateway/index.ts`, before or after this
work; the `imports` rule reports no barrel-skipping importer for this directory
in either state. What does exist is exactly five **non-test source files outside
the directory that import the barrel**:

| File | Imports |
| --- | --- |
| `packages/fluxiq/src/programs/automation-studio/api/contracts/client.ts` | `ClientGatewayActionCommand` |
| `packages/fluxiq/src/programs/automation-studio/api/handlers.ts` | `ClientGatewayService` |
| `packages/fluxiq/src/programs/automation-studio/client-gateway/bridge.ts` | `ClientGatewayService` + 8 contract types |
| `packages/fluxiq/src/programs/_shared/runtime.ts` | `ClientGatewayService`, `ClientGatewayTrustedClient`, `ClientGatewayTrustedClientStore` |
| `packages/fluxiq/src/runtime/client-gateway-transport.ts` | 5 contract types incl. `ClientGatewayService` |

All five resolve: every symbol is in the 34-name barrel list, `tsc --noEmit` is
clean, and the tests covering three of them pass. Three further importers exist
and also resolve — the test files for `bridge`, `handlers` and
`client-gateway-transport`, plus `packages/fluxiq/src/index.ts` (re-export) and
`apps/web/src/server/client-gateway-websocket.ts` (via the `fluxiq/client-gateway`
subpath). Note `ClientGatewayTrustedClientStore` is the one public type declared
in `service.ts` itself rather than in the contracts package; it is now declared
in `service/types.ts` and re-exported by name, which is why the barrel diff is
the load-bearing evidence rather than a formality.

**2. The `imports` rule penalises exactly the shape Phase 7 prescribes, and this
will block `runtime/service/`.** The rule exempts same-directory imports and
`<dir>/tests/` importing `<dir>`'s own modules. It does not exempt
`<dir>/<child>/` importing `<dir>`'s own modules — so every collaborator
extracted from `runtime/service.ts` into `runtime/service/` that imports a
`runtime/*.ts` sibling becomes a new ratcheted barrel-skipping failure. This is
the Phase 1 problem again, and the Current State already records the reasoning
and the two bad workarounds (widen the barrel; raise the baseline), both of which
would be reached for again.

I escaped it only by luck: `client-gateway/contracts.ts` is a one-line re-export
of `@fluxiq/contracts/client-gateway`, so my collaborators import the package
directly and the specifier is not relative. `runtime/`'s siblings are real local
modules with no package-level equivalent.

The argument for an exemption is the same one the plan already accepted for
tests: **a collaborator extracted out of a directory's own file is not a consumer
crossing a boundary — it is that file's code relocated one level down.** I
suggest extending `rules/imports.mjs` to exempt an importer under `<dir>/<child>/`
resolving to `<dir>`'s own modules, the way `testRootDirNames` is handled today,
before Phase 7 starts. Deciding this is above a worker's brief, which is why it
is here rather than in a patch.

**3. The `class-methods` baseline entry is now stale, not lowerable.**
`packages/fluxiq/src/client-gateway/service.ts::ClientGatewayService: 43` should
be **removed** when the baseline is regenerated: at 23 methods the class is under
the 40 limit and under the 25 advisory threshold, so it produces no finding at
all and does not appear in the auditor's "9 baseline entries can be lowered"
line. Worth checking that `pnpm structure:baseline` drops stale keys rather than
only lowering live ones.

**4. Thirteen of my new files were already staged in git when I checked.**
`git status --porcelain` shows `A ` for thirteen files under `service/` that I
never `git add`-ed (`service/index.ts` and `service/views.ts` are still `??`, and
`service.ts` is ` M`). Some other process in this session is staging. Flagging it
so the supervisor is not surprised by a partially staged index — I ran no git
write command other than `git checkout -- packages/fluxiq/src/client-gateway/service.ts`,
twice, each time to produce a before/after comparison and each time immediately
restored from a scratchpad copy. The final tree carries the facade; `git diff
--stat` reports `91 insertions(+), 545 deletions(-)` on `service.ts`.

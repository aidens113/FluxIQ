# P9-S: declaration hardening (consent review S2, S3, S4)

Worker report, 2026-11-09.

## Outcome

Done. Each of the three causes is closed where it starts, in the endpoint's own declaration:

- **S2, spend.** A call's spend is whatever its endpoint declares. The assistant no longer guesses it from field names.
- **S3, consent.** Every press grant records how it was earned (`press` or `words`). That is written to the grant's audit row and to the confirmed call's row.
- **S4, target.** Every delete or security tool must say what it acts on. Any input outside that target that could widen the act makes the call show a card.

The assistant catalog generator is not regenerated; see "Not verified".

## What changed and why

### S2: spend is declared, not guessed from names

- **Contracts.** `usdAmount(description)` is new, in `packages/contracts/src/program-api/input/usd-amount.ts`. It marks a field as money.
  - The mark sits on the zod definition. The model's JSON Schema does not change: a test confirms it is identical to `z.number().min(0).describe(...)`.
  - `ProgramApiInput.moneyFields()` returns the marked fields, using `programApiMoneyFields` in `money-fields.ts`. It looks through optional, nullable and default wrappers, and through nested objects and arrays.
  - A field whose name ends in `Usd` but has no mark is refused, so a new amount cannot be added unmarked. The mark is the test; the name rule only stops someone forgetting the mark.
  - `addUsd` in `carry-on-task-attempt` now uses `usdAmount`.
- **Declaration.** `ProgramEndpointAssistantTool.spends?(input)` is new.
  - `assistantDeclarationProblem` refuses an input that has money fields and no `spends`. The registry runs this check at registration.
  - `assistantCallSpend` in `_shared/assistant/call-spend.ts` applies `spends` to the parsed input.
  - An input that does not parse, or a `spends` result that is not a number of zero or more, is read as infinite. That always shows a card.
- **Port.** `programs-port.ts` reads `projectedCostUsd` from the registration's declaration. `dollarsAdded`, the `…Usd` naming guess, is deleted. The doc in `purse.ts` is updated.
- **Which endpoints spend.** Only `carry-on-task-attempt` commits new money today. I declared `spends: (input: CarryOnTaskAttemptInput) => input.addUsd` on it.
  - `run-task-again` and the runs spend from a budget the person already set, which is not in their input. They are `per-call`, so they always get a card while their Flow is unresolved.
  - `generate-recording-proposal`'s `llm_assisted` mode never calls a model today (`not_invoked`).

### S3: how a grant was earned is audited

- **IAM.** New type `IamRequestConsent = "press" | "words"`, added to `IamRequestContext.consent` and `IamAuditRecord.consent`.
  - `recordIamDecision` writes it.
  - The audit store keeps it in the origin dictionary entry as `origin␟via␟consent`. Rows written before this change read back unchanged, and a round-trip test covers it.
  - `ProgramIamGate.open` takes `consent`.
- **Mint.** `PressGrantMintRequest.consent` is required.
  - `mintPressGrant` refuses any value other than `press` or `words`. It records the value on its decision row and stores it with the grant.
  - The page's mint endpoint always sends `press`, whatever the request body says.
  - The assistant sends `words` when the person's message clearly asked, and `press` after an Allow press. This goes through `panelAssistantRunProgramCall(turn, call, consent)` and `mintPress(…, consent)`.
- **Call.** For a destructive call, `call()` checks how its grant was earned before deciding it, using `pressGrantConsent` and `PressGrantStore.consentOf`. That lookup does not spend the grant, and returns a value only if the grant would confirm exactly this call now. The call's audit row then carries the consent; `confirmDestructiveCall` still spends the grant and decides the call.
- **No grants in the audit.** Neither the grant nor its digest is ever put into an audit row. Tests check both strings and their sha256.
- **Registration check.** A deleting endpoint whose consequence is `read`, `change` or `per-call` is now refused at registration. Otherwise it could run on a grant minted without the person's words, and the audit would wrongly say `words`.

### S4: what a call acts on is declared

- **Declaration.** `ProgramEndpointAssistantTool.target` is new: input field → the plain word for what it holds. Its shape is validated.
- **Registration check.** `assistantTargetProblem` is in `_shared/assistant/target/`. It refuses three things:
  - a `target` that names a field the input does not have;
  - a `delete` or `security` act with neither a declared `target` nor a resource a person could name. Lists and reads are exempt: a security snapshot acts on nothing and always shows a card;
  - the deleting-as-change case above.
- **How the resource's fields are found.** `assistantProbedResource` gives every field a value of its own name and sees which ones come back in the refs. The resource's `of` is pure, so this has no side effects.
- **`call-target.ts`.**
  - With a declared target, the card names the items those fields hold. Without one, it names the IAM resource, as before.
  - The target fields are the declared ones plus the fields the resource reads. Any input outside them marks the call partial, so it always shows a card, if it is:
    - an id, a list, a boolean, a number, an object, or an enum or const string;
    - a field the schema does not declare (handlers read raw payloads; `revoke-session` reads `sessionId`).
  - Free text such as a reason or a new name does not widen the act.
  - `namedOf` moved to `assistantResourceItem` so registration can use it too.
- **Targets declared:**

  | Endpoint | Target |
  | --- | --- |
  | `delete-project-category` | `categoryId: "category"` |
  | `delete-recordings` | `recordingIds: "recording"` |
  | `revoke-client-trust` | `trustedClientId: "trusted browser"` |
  | `identity-access/revoke-session` | `sessionDigest: "sign-in session"` |
  | `secret-keys/set-assistant-model` | `keyId: "key"` |

  Every other delete or security tool resolves its target from its resource.

### Other

- `endpoint-consequence.test.ts`: the overrides table now has 6 entries, because someone else added S1 (`resume-runtime-session: per-call`). I updated the test's count and its list of `per-call` endpoints.
- Two `as never` casts in my new tests were replaced with typed `JSON.parse` values, as the structure audit requires.

## Files

- **Contracts:**
  - new: `program-api/input/{usd-amount.ts, usd-amounts.ts, money-fields.ts, tests/money-fields.test.ts}`
  - edited: `input/index.ts`, `input/program-api-input.ts`, `automation-studio/runs/task-attempts.ts`
- **fluxiq `_shared/assistant`:**
  - new: `call-spend.ts`, `target/{index,probed-resource,resource-item,target-problem}.ts`, `tests/declaration-hardening.test.ts`
  - edited: `index.ts`, `types.ts`, `declaration-problem.ts`, `tests/endpoint-consequence.test.ts`
- **fluxiq `_shared`:**
  - `api.ts`: `register` validation, `call` consent, `mintPressGrant`, and a private `decideAuthorization`
  - `iam/program-iam-gate.ts`: the `consent` parameter
- **Press grants:**
  - new: `press-grant/grant-consent.ts`
  - edited: `index.ts`, `types.ts`, `press-grant-store.ts`, `register-press-grant-api.ts`, and the three tests
- **platform/iam:** `types.ts`, `authorize/record-decision.ts`, `audit/store.ts`, `audit/tests/store.test.ts`
- **Panel assistant:** `call-target.ts`, `programs-port.ts`, `tests/consent-attacks.test.ts`
- **Runtime:** `runtime/conversations/assistant/loop/{call-step,purse}.ts`, plus `types.ts` and `panel-assistant.ts` one level up
- **Handler declarations** (the `spends`/`target` additions only):
  - `task/attempt-carry-on.ts`
  - `projects.ts`
  - `recordings.ts`
  - `client-gateway.ts`
  - `identity-access/api/handlers.ts`
  - `secret-keys/api/handlers.ts`

## Commands run and observed results

- **Contracts:** `npx vitest run src/program-api` → `Test Files 23 passed (23)`, `Tests 64 passed (64)`.
- **Runtime:** `npx vitest run src/runtime/conversations --pool=forks --poolOptions.forks.singleFork` → `Test Files 40 passed (40)`, `Tests 324 passed (324)`.
- **Programs and audit:** `npx vitest run src/programs/_shared src/programs/automation-studio/api/panel-assistant src/platform/iam/audit --pool=forks --poolOptions.forks.singleFork` → `Test Files 1 failed | 40 passed (41)`, `Tests 1 failed | 315 passed (316)`.
  - The one failure is `assistant-tools.generated.json > is current with the live registry` (drift). Regenerating the catalogs is the supervisor's job.
  - None of my changes alter the generated content: `addUsd`'s JSON Schema is unchanged (a contracts test asserts this), and `spends`/`target` are not rendered.
- **After moving the target files:** `npx vitest run src/programs/_shared/assistant src/programs/automation-studio/api/panel-assistant src/programs/_shared/press-grant …` → `Tests 1 failed | 100 passed (101)`. The failure is the same drift test.
- **Acceptance tests that pass:**
  - **Money without `spends`:** "refuses an input with a money field and no spends" (`declaration-hardening.test.ts`).
  - **Spend over the allowance:**
    - the existing carry-on `addUsd: 25` card test now goes through `spends`;
    - the new "field merely named in dollars … asks nothing" (S2) test: `update-flow-settings` with `budgetUsd: 500` runs with no card. The old `dollarsAdded` would have given it a card.
  - **Audit consent:**
    - "audits how each grant was earned…" (registry: a page mint is a press, server code's mint is `words`, and a call whose grant does not confirm it has no consent);
    - "audits a delete … in words … as a press, and never the grant" (assistant, end to end: `[[undefined,"words"],["assistant","words"],[undefined,"press"],["assistant","press"]]`).
  - **Widening flag:** "asks before a delete whose input also carries a flag that could widen it": `recursive: true` and `all: false` each get a card, and the plain delete still runs.
- **Structure audit:** `node scripts/structure-audit.mjs` → `structure-audit: passed (538 warning(s), 1095 baselined).` The only warning on a file I touched is `_shared/api.ts` at 428 lines, past the 400-line advisory threshold; it was already over 400.
- **fluxiq typecheck**, run under `.p9-heavy-lock` with 3342 MB free: `node --max-old-space-size=6144 node_modules/typescript/bin/tsc --noEmit --incremental --tsBuildInfoFile node_modules/.cache/fluxiq-build/check.tsbuildinfo` → no output, `exit 0`. It was run again after the move. An earlier attempt was skipped at 2848 MB free.
- **Baseline:** the first baseline run of the brief's directories was contaminated. I edited files during it, and its fork worker exited unexpectedly after 30 files (`Worker exited unexpectedly`, 377 passed). There is no clean before/after comparison beyond the new tests themselves.

## Not verified

- **Catalog regeneration:** left to the supervisor, as the brief says. The drift test fails until it is done.
- **Web typecheck:** apps/web was not touched or typechecked.
- **Contracts typecheck:** not run on its own. It is covered only as far as fluxiq's typecheck reads contracts from source.
- **Activity log text:** the log's wording ("because you asked" / "you pressed Allow") is not written. Only the audit data that supports it exists.
- **Race on one grant:** two concurrent calls with the same valid grant both get `consent` on their decision rows, but only one passes confirmation. The other row is an IAM allow for a call that then failed confirmation. This is the same as any decision row followed by a refused confirmation.
- **Live models:** not run; the scripted model only.

## Open questions or contradictions found

- **Edits outside the listed paths:**
  - `programs/_shared/iam/program-iam-gate.ts`: a `consent` parameter on `open`.
  - `runtime/conversations/assistant/{types.ts, panel-assistant.ts}`: the `mintPress` signature, and `"press"` after Allow.
  - `contracts/src/program-api/input/**` and `task-attempts.ts`: the money mark.
  - `api.ts` beyond validation: `call` and `mintPressGrant`, which S3 requires.

  S2 and S3 cannot be done without these; each change is minimal.
- **Flags widen whether true or false.** Any boolean outside the target marks the call partial, because a handler may read either value (for example `keepData: false`). This is conservative: more cards, never fewer.
- **Free-text fields never widen.** A future destructive endpoint with a free-text filter, such as a glob pattern, would need that field in its `target`.
- **`delete-run-datasets` is unchanged.** Its `datasetId` narrows the act; when present it still marks the call partial, as before.

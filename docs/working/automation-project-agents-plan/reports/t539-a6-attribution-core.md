# t539 A6: agent attribution and project cards (Core)

## Outcome

Done. Every activity event published inside an agent frame now carries `agent`. The supervisor's plan,
briefs, returns and receipts can be emitted as `note` rows that carry a bounded `project` card. The step
log writes `role` and `briefId` in every meta file and adds index columns for them. One call
(`withAutomationStudioProjectAgent`) sets both stores. Nothing is wired into `service.ts`; A5 calls these.
Not committed.

## What changed and why

Paths are relative to `packages/fluxiq/src/programs/automation-studio/runtime/` unless they start with
`packages/`, `apps/` or `docs/`.

- `packages/contracts/src/client-gateway.ts`: the shape is unchanged. The supervisor's commit placed the
  two new types between `ClientGatewayActivity`'s doc comment ("One activity event: ...") and the type
  itself, so that comment documented `ClientGatewayActivityAgent`. I moved the two types above the comment.
  This only moves text (26+/26-).
- `packages/client-gateway-websocket/src/index.ts`: re-exports `ClientGatewayActivityAgent` and
  `ClientGatewayActivityProjectCard`.
- `activity/agent.ts` (new): an AsyncLocalStorage of its own, with `runWithAutomationStudioActivityAgent`
  and `currentAutomationStudioActivityAgent`. It stores a frozen copy, so a caller that mutates its agent
  afterwards changes nothing. It is kept separate from the scope frame, which `bind.ts` mutates.
- `activity/emit.ts`: stamps `agent` in the one publish path. No emission site changed.
- `activity/bounded.ts`: `boundedAgent` uses a closed role record keyed by the contract's union, so a new
  role fails to compile until it is bounded. An unknown role drops the field. A `briefId` that is not
  `TARGET_ID`-shaped or contains 32 or more hex characters is dropped, and the role is kept.
  `subflowName` is trimmed and cut to 160. Unknown fields are never copied. `project` is now pulled out
  of `rest` explicitly and is kept only on `note` rows.
- `activity/project-card-bounds.ts` (new): rebuilds a card field by field. Strings are cut to 160 (a
  return's `reason` to 240), and `parts`, `subflows`, `cases`, `budget` and a subflow's `parts` are cut
  to 20. A card with an unknown kind, a bad closed field, a bad or digest-shaped brief id, a negative or
  non-finite amount, or a non-integer count is dropped, and the row stays a plain note. It is a top-level
  file rather than part of `activity/project/` because `hub -> bounded -> project/index -> emitters ->
  emit -> default-hub -> hub` would be a barrel cycle.
- `activity/project/` (new, with barrel and tests):
  - `emitAutomationStudioProjectPlanCard`: title "Plan: N parts in M subflows", phase `thinking`, no ref.
    `cases` and `budget` come from the briefs passed in.
  - `emitAutomationStudioProjectBriefCard`: "Building/Surveying/Repairing <subflow>: <purpose>", status
    `started`, ref = briefId, phase `building` (`repairing` for a repair).
  - `emitAutomationStudioProjectReturnCard`: "<subflow>: done | partly done | blocked", with the reason as
    `text`. Status is `succeeded` for done, `failed` for blocked, and omitted for partial. The card counts
    trials and never carries their digests.
  - `emitAutomationStudioProjectReceiptCard`: "Subflow trial passed: <subflow>" or "Whole-Flow trial
    could not be confirmed", status `succeeded` or `failed`, ref = briefId when present.
  - Helpers: `automationStudioProjectCardWords` (collapses whitespace, replaces any run of 32 or more hex
    characters with an ellipsis, and clips), `automationStudioProjectSubflowName`, and
    `automationStudioProjectSubflowPurpose`. The purpose is the supervisor's own line if it wrote one;
    otherwise the person's verbatim quotes for the subflow's parts, joined with "; "; otherwise the
    subflow's name.
  - Contracts are imported type-only from `project-agents/contracts/index.ts`, so there is no runtime
    edge.
- `llm/step-log/scope.ts`: adds `role` and `briefId` to the context, a type
  `AutomationStudioLlmStepLogAgent`, and `scope.agent(agent, fn, env)`. The innermost agent wins whole:
  a supervisor inside a builder clears the builder's briefId. Part, round, phase and pass are kept, and it
  does nothing with the step log off.
- The three meta writers (`model-step.ts`, `tool-step.ts`, `answer-step.ts`) write
  `role: ... ?? null` and `briefId: ... ?? null` beside `part` and `round`, and pass both to the listing.
- `llm/step-log/listing.ts`: the row gains optional `role` and `briefId`, which are also read back from
  meta. `index.md` gains `| Role | Brief |` after `Kind` only once any row in the directory has a role.
  A directory no agent wrote to keeps today's table byte for byte, which keeps every existing index
  assertion unchanged. Rows outside an agent show `-`. The Lab rebuilds its own `steps/index.md` from
  meta files, not from this table.
- `llm/step-log/index.ts`: the folder-contract comment now mentions the new meta fields and columns.
- `project-agents/attribution/` (new, with barrel and tests): `withAutomationStudioProjectAgent(agent, fn,
  env?)` wraps the activity agent frame around the step-log agent scope. It is exported from
  `project-agents/index.ts` (barrel line and comment). Nothing in `activity/` imports
  `project-agents/index.ts`, so this adds no cycle.
- `docs/architecture/automation-studio/client-gateway.md`: new paragraphs in "Per-step activity and
  resolved asks" covering `agent`, `detail.project`, bounds, the Core panel, and the step-log fields and
  columns.
- `apps/web/.../conversation/activity/tests/agent-attribution.test.ts` (new test only, no source change):
  the Core panel parses stamped events and project notes, drops `agent` and `project`, and treats the
  notes as internal.

## Commands run and observed results

Run from `fxwork/t539/!FluxIQ` unless a package directory is noted:

- `pnpm.cmd --filter @fluxiq/contracts build` built, then reused the stamp on rerun.
- `pnpm.cmd --filter @fluxiq/client-gateway-websocket build` built. `pnpm.cmd --filter
  @fluxiq/client-gateway-websocket check` passed with no errors.
- `pnpm.cmd --filter @fluxiq/contracts test`: 13 files, 171 tests passed.
- `pnpm.cmd --filter fluxiq check`: passed with no errors, after the final edits.
- From `packages/fluxiq`: `pnpm.cmd exec vitest run <runtime>/activity <runtime>/llm/step-log
  <runtime>/project-agents`: 58 files, 491 tests passed. The new files are `activity/tests/agent.test.ts`
  (7), `activity/tests/agent-bounds.test.ts` (7), `activity/project/tests/cards.test.ts` (10),
  `llm/step-log/tests/agent.test.ts` (5) and `project-agents/attribution/tests/project-agent.test.ts` (3).
  All existing step-log, bounded and scope tests pass unedited.
- From `apps/web`: `pnpm.cmd exec vitest run src/features/automation-studio/conversation/activity/tests`:
  6 files, 28 tests passed, including the new one (2).
- `pnpm.cmd --filter @fluxiq/web check`: passed with no errors.
- `node scripts/structure-audit.mjs`: "structure-audit: passed (346 warning(s), 1156 baselined)". The
  only warnings on touched paths existed before this change: step-log at 18 files (no source file added
  there), and `client-gateway.ts` lines and exported values.
- `git diff --check`: clean.

## Not verified

- No live or browser run. The extension side (W2) is not exercised here.
- Nothing calls the emitters or `withAutomationStudioProjectAgent` in production code yet. That is A5's
  job.
- I did not add a type-level test for the contracts types in `packages/contracts`. The usage in Core
  (which compiles against the built `dist`) and the web panel test cover them.
- I did not run full suites, per the narrow-checks rule.

## Open questions or contradictions found

1. The wire allows `brief: "reset"`, but the A1 `AutomationStudioProjectSubflowBrief.kind` has no
   `reset`. The brief emitter therefore never sends it. A5 needs a reset brief kind in A1, or a separate
   "Resetting the site" emitter, if the chat must show one.
2. The plan card's `purpose` has no source field in A1. I derive it as described above and accept an
   optional `purposes` override, so A5 can pass the supervisor's own line.
3. The return card's status for `partial` is left unset, because it is neither success nor failure. W2
   should read `project.outcome` rather than `status`.
4. The step-log `Role` and `Brief` columns appear only once any agent has written to the directory. This
   is a choice: always-on columns would have broken the anchored index assertions in `model-step.test.ts`.
   Say if always-on columns are wanted.
5. The contracts doc-comment move is in a supervisor-written file. It changes no shape. Revert it if
   unwanted.

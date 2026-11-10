# P9-B3: project, conversation, recording and client endpoint declarations

## Outcome
Done. All 61 endpoints in projects.ts, conversations.ts, recordings.ts and client-gateway.ts are declared. No other automation-studio handler file had undeclared endpoints (the parity output lists no `automation-studio` entry).

## What changed
- Contracts, `packages/contracts/src/program-api/automation-studio/projects/`: `project.ts`, `project-category.ts`, `conversation.ts`, `recording.ts`, `recording-proposal.ts`, `client-gateway.ts`, the barrel, and `tests/projects.test.ts` (a valid sample of each parses; wrong ones are refused with the field named).
- The four handler files gained `assistant` declarations (CRLF kept) and the import from `@fluxiq/contracts/program-api-inputs`. Handler logic is unchanged and does not yet use `parse`.
- Tests: `handlers/tests/assistant/tests/{projects,conversations,recordings,client-gateway}-assistant.test.ts`.
- Consequences are all derived; `revoke-client-trust` is `security` by the overrides table, and delete-project, delete-project-category, delete-recording and delete-recordings derive to `delete`.

## Counts (exposed / hidden)
- projects.ts: 8 / 9 (17)
- conversations.ts: 2 / 4 (6)
- recordings.ts: 8 / 23 (31)
- client-gateway.ts: 3 / 4 (7)
- Total: 21 / 40 (61)

Exposed: projects, list-project-problems, create/update/delete-project, create/update/delete-project-category; list-conversations, get-conversation; get-recording-capture-policy, get-recording, update-recording, delete-recording, delete-recordings, get-proposal, generate-recording-proposal, review-recording-flow-proposal; client-gateway-snapshot, list-client-gateway-items, revoke-client-trust.

## Hidden, with reason
- performance-metrics: internal timing figures for engineers.
- snapshot: whole-workspace dump the screens draw from.
- reorder-project-categories: the projects screen sends a drag-and-drop order.
- get-project-hierarchy, list-project-hierarchy-children, list-project-change-feed: sidebar tree and refresh feed read by screens.
- save-project-hierarchy, put-project-hierarchy-node, delete-project-hierarchy-node: workspace autosaves filing while a person drags items.
- open-conversation: the chat panel opens a thread itself.
- append-conversation-turn: how the chat sends what a person types.
- answer-conversation-ask: answered with the panel's own buttons, never on a person's behalf by the assistant.
- get-conversation-attachment: fetched by the panel to draw a turn.
- get-recording-entry-state, get-state-snapshot: stored page state for debugging.
- repair-recording-state-index: internal repair run by engineers.
- create-recording: the browser recorder opens its own session.
- delete-proposal: cleared from the proposals screen.
- append-recording-entry, append-recording-note, append-recording-marker, remove-recording-entry, finalize-recording: sent by the browser recorder as it records or stops.
- process-finalized-recording, normalize-recording, create-normalization-review, list-normalized-timelines, list-normalized-timeline-summaries, get-normalized-timeline, list-pipeline-artifacts, mine-recording-evidence, learn-task-model, propose-policy-from-model, approve-policy-proposal, create-recording-flow-proposals, replay-policy-against-recording: automatic stages of the recording pipeline.
- start-client-recording, stop-client-recording: the browser starts and stops its own recording; a person does not know its session ids.
- capture-client-snapshot, execute-client-action: only a client process sends them.

## Commands and observed results
- `cd packages/contracts && npx vitest run --pool=forks --poolOptions.forks.singleFork src/program-api` -> 12 files, 42 tests passed.
- `cd packages/fluxiq && npx vitest run --pool=forks --poolOptions.forks.singleFork src/programs/_shared/assistant/tests/assistant-parity.test.ts` -> still fails, for other programs only (deployment-sync, docs, identity-access, production-runner, runtime, secret-keys); `grep automation-studio` of its output found nothing.
- Handler tests: projects, conversations, recordings, client-gateway, domain-scope, router, plus my four assistant tests -> 10 files, 38 tests passed.
- `node scripts/structure-audit.mjs` -> "passed (536 warning(s), 1095 baselined)".
- fluxiq typecheck (lock taken, 3875 MB free, lock released) -> exit 0, no output.

## Not verified
- The web typecheck and the generated assistant-tools and IAM catalogs (supervisor regenerates).
- The proposal endpoints with a real proposal: `get-proposal` is checked with an unknown id (answers ok), `review-recording-flow-proposal` only that the handler, not the input, refuses an unknown id. `generate-recording-proposal` has no handler test (needs a processed recording; its input is covered by the contracts test only).
- `revoke-client-trust` success path (no trusted browser in the test).

## Open questions
- Whether the recording pipeline (normalize, mine, policy proposals) should ever be exposed; I hid it as automatic stages.
- `delete-project-category` derives to `delete` through `destructive`; fine, but it only unfiles projects.

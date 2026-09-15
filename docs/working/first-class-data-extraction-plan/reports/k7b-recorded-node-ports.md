# k7b-recorded-node-ports: a records port and editable extraction on a recorded node

## Outcome

**Done.** The gap was real, reproduced before any change, and is closed.

A node definition derived from a recording now declares the same `records` output
port the policy action declares (K3), and exposes its recorded extraction and
timeout as editable parameters, the record output through the same
`record-output` control a hand-authored node gets (K3, K12d). A For Each can now
be wired to a recorded extraction's rows, which is the path downstream X4 needs.

One behaviour changed that K7 had settled the other way, deliberately and with a
mutation proof: **a node's own `recordOutput` and `timeoutMs` now win over its
definition's.** The reasoning and the contradiction it creates with the authored
documentation are in "Open questions" below; it is the one thing in this report
the supervisor should confirm it agrees with.

- **Acceptance** (`.../service/recordings/tests`): `Test Files 2 passed (2)`,
  `Tests 44 passed (44)`, exit 0 (39 before this brief; 5 rows added).
- **Type check** (`pnpm --filter fluxiq check`): exit 0, zero `error TS` lines.
- **Structure audit:** 2 failures, both `docs/working/**` shared documents this
  brief does not own. No `FAIL` names a file I touched.
- **Mutations:** 8, each observed red and reverted; source restored
  byte-identical.

## Confirming the gap first

The brief required confirming the gap before changing anything, and stopping if a
`records` port were already reachable by another route. I confirmed it two ways.

**Statically.** `AS/nodes/contracts.ts` already supports both halves — an
`AutomationNodePort` may carry `role: "data"`, and `AutomationNodeParameter`'s
`ui.control` union already includes `"record-output"` (K3 widened it). So the
contract was never the obstacle; the recording definition simply did not use it.
`candidate-definitions.ts` declared `outputs: [success, failed]` and
`recordingCandidateParameters` returned only `parameters` plus the optional
confirmation pair.

**By failing test.** I wrote the new rows first and ran the acceptance command
before touching the source: `Tests 8 failed | 36 passed (44)`, every failure an
`AssertionError`, none a crash. The two that name the gap directly:

- `expected undefined to deeply equal { id: 'records', …(3) }` — the definition
  returned by `listRecordingDerivedNodeDefinitions` had no `records` port at all.
- `expected 'failed' to be 'succeeded'` — a Flow wiring that definition's
  `records` port into a For Each did not run.

**Is a `records` port reachable another way? No.** The materialized node is
`builtin.policy.action`, which does have the port, but materialization happens in
`materializeRecordingDerivedFlow`/`...Document` at run and read time, while an
author draws edges against the definition returned to the palette. The runtime
plumbing underneath was already fine — `collectNodeInputs` resolves a data edge
purely by `values["<nodeId>.<portId>"]`, and `record-capture.ts` writes
`outputs.records` — so what was missing was only the declaration a Flow author
and the editor can see. Nothing needed a second port; the one port needed to be
declared where it is read. I added exactly one, and a test pins it equal to the
policy action's own declaration so the two cannot drift.

## What changed and why

Paths relative to `packages/fluxiq/src/programs/automation-studio/`.

### `runtime/service/recordings/candidate-definitions.ts`

- **`recordingCandidateDefinition` declares a `records` port.** Appended to
  `outputs` after `success` and `failed`, byte-identical to K3's declaration:
  `{ id: "records", label: "Records", valueType: "array", role: "data" }`. It is
  declared on every recording-derived definition, not only extracting ones, for
  the same reason the policy action always declares it: the node *is* that action,
  and the record output is now editable, so a definition that recorded no
  extraction can be given one on the node. See open question 2.
- **`recordingCandidateParameters` exposes two more parameters**, after the
  payload and any confirmation pair, in the policy action's own order:
  - `timeoutMs` — "Give up after milliseconds", `valueType: "number"`,
    `defaultValue: candidate.timeoutMs ?? 5_000` (the policy action's default when
    the recording proposed none).
  - `recordOutput` — "Save extracted records", `valueType: "json"`,
    `allowStateBinding: false`, `ui: { control: "record-output" }`, and
    `defaultValue` the recorded extraction as a **clone**, or `null` when there is
    none. Cloned so that editing a node can never reach the stored definition.
  - Each default is what was recorded, so a node nobody edited runs exactly as the
    recording proposed it, while an operator can now see the extraction on the
    node and change which fields it keeps.
- **`materializeRecordingNode`: the node's own value now wins for these two.**
  `outputId` and `parameters` still come from the definition, unchanged. For
  `recordOutput` and `timeoutMs` the definition's value is applied only when the
  node holds none (`authored.<key> === undefined`). The `undefined` test rather
  than a truthiness test is deliberate: `null` is a value the node holds, written
  by K12d's editor when the operator switches the extraction off, so it must win
  too (mutation M6 proves it).

No other behaviour moved: a candidate with neither field still produces the same
`parameterValues` and the same metadata as before, which the unchanged
exact-metadata rows still pin.

## Tests

Both files are ones this brief owns. Every new row was written and observed
failing before the implementation.

### `tests/candidate-definitions.test.ts` (39 → 44 rows)

Updated: the shared `expectedDefinitions` helper now spells out the `records`
port and the two parameters for both candidates, so the two existing
"approved into node definitions" rows pin the new shape exactly; the two
`recordingCandidateParameters` default rows list the added entries.

New rows:

- **Port and control parity with K3.** The definition's `records` port is compared
  against `getAutomationNodeDefinition("builtin.policy.action")`'s own port, and
  its `recordOutput` parameter against the policy action's with `defaultValue`
  removed — so label, description, `valueType`, `allowStateBinding` and the
  control cannot drift from the hand-authored node. The default is then asserted
  to equal the recorded extraction.
- **The required end-to-end row.** A recorded click is proposed as an extraction,
  approved into node definitions, and put in a Flow with a For Each and a body
  node, with `edge("extract", "records", "each", "items")`. The nodes are
  materialized **by definition id**, as the service does. The run succeeds with no
  message, For Each runs `["body", "body", "done"]`, its two body items are the
  `$datasetRow` markers for the captured rows, the record hook receives both rows
  carrying only the included field, and the excluded value appears nowhere in the
  saved trace. Without the rows For Each would fail `for_each.items_invalid`, so
  a succeeded run with two body passes is itself the proof the port delivered.
- **Editability**: the definition's values are taken when the node holds none; the
  node's own values win when it holds them; and a node whose record output was
  switched off (`null`) keeps `null` while still taking the definition's timeout.
- **Defaults**: the recorded extraction and timeout are the parameters' defaults,
  the record-output default is a copy and not the candidate's own object, and a
  candidate with neither gets `5_000` and `null`.

## Commands run and observed results

Every command ran in `F:\!FluxIQ`, one at a time — never two heavy runs at once,
because of this machine's memory fault.

1. **Red run, before implementing**, the brief's acceptance command:
   `pnpm --filter fluxiq exec vitest run src/programs/automation-studio/runtime/service/recordings/tests --no-file-parallelism`
   → `Tests 8 failed | 36 passed (44)`, exit 1. Quoted above.
2. **Green run, same command, after implementing** → `Test Files 2 passed (2)`,
   `Tests 44 passed (44)`, exit 0.
3. **Type check:** `pnpm --filter fluxiq check` (`tsc --noEmit`).
   - First run: exit 2, one error, in my own test file, not in source —
     `Property 'parameterValues' does not exist on type '{ id: string; definitionId: string; }'`,
     because a node literal without `parameterValues` narrows the generic. Fixed
     by annotating it as the neighbouring row already does.
   - Second run: **exit 0**, zero `error TS` lines. No other worker's file failed,
     so no rerun was needed.
4. **Structure audit:** `pnpm structure:check` → exit 1,
   `structure-audit: 2 violation(s) across 1 rule(s)`. Both are `[working-docs]`:
   `docs/working/first-class-data-extraction-plan.md` is over the 800-line
   compaction threshold (1178 lines, growing while other workers write to it), and
   `docs/working/README.md` is out of date. Both are shared supervisor documents
   this brief does not own; a filter for my own paths over the audit output
   returned `none`.
5. **One crash, not a defect.** A filtered single-test run exited `2147483651`
   (0x80000003) printing a raw `failure_message_object=` pointer rather than any
   assertion. Rerun alone it completed normally. Recorded as the known hardware
   fault on this machine, not investigated as a code defect.
6. **Diff check.** My two files are **untracked** (`??`) — K4c.0 created them and
   they are not yet committed — so they do not appear in `git diff --stat` at all.
   That command over the recordings folder shows only other workers' in-flight
   edits (`index.ts`, `proposal-candidates.ts`, `tests/proposal-candidates.test.ts`).
   `git status` over the owned areas lists my two files as untracked alongside
   those, plus several `nodes/` files including
   `data/{map-object,set-variable,shared}.ts`, which changed while I was working.
   I touched none of them: the only files I wrote are
   `recordings/candidate-definitions.ts` and
   `recordings/tests/candidate-definitions.test.ts`.

### A defect in my own test, found and fixed

The end-to-end row first failed with
`Node each completed on route success, but no matching outgoing edge exists. Available routes: body, done.`
and attempts `[["extract","succeeded","success"], ["each","succeeded","success"]]`.
The product code was right — `extract` succeeded, so the new port worked. My test
had passed the same recording definition to `materializeRecordingNode` for *every*
node, turning the For Each and its body into policy actions too. The service maps
by definition id, and the test now does the same. Worth recording because the
existing single-node row in this file has the same shape and is only correct by
accident of having one node.

### Mutations

Runner `scratchpad/k7b/mutations.mjs`: for each mutation it asserts the target
text occurs **exactly once**, backs the file up in memory, writes the mutation,
runs the full acceptance command through vitest's JSON reporter, then restores the
original bytes in a `finally` and fails loudly if they differ. Baseline green
before and after; the final line printed
`source restored byte-identical: true`.

| Mutation | Result | Rows turned red |
| --- | --- | --- |
| BASELINE | `44 passed` | none |
| M1 `records` port removed | `3 failed \| 41 passed` | both approved-definition rows, and the port-parity row |
| M2 `recordOutput` parameter renamed away | `5 failed \| 39 passed` | the approved-definition, defaults, and parity rows |
| M3 `timeoutMs` parameter renamed away | `4 failed \| 40 passed` | the approved-definition and defaults rows |
| M4 definition's `recordOutput` overrides the node's | `2 failed \| 42 passed` | node-wins row, and the switched-off row |
| M5 definition's `timeoutMs` overrides the node's | `1 failed \| 43 passed` | node-wins row |
| M6 an off (`null`) record output no longer wins | `1 failed \| 43 passed` | the switched-off row |
| M7 parameter default is the candidate's own object | `1 failed \| 43 passed` | the defaults row's copy assertion |
| M8 timeout default ignores what was recorded | `1 failed \| 43 passed` | the defaults row |
| BASELINE AGAIN | `44 passed` | none |

## Not verified

- **No browser or panel pass.** Whether K12d's record-output editor actually
  renders for a recording-derived node in a running panel is not exercised here;
  it follows from the parameter carrying `ui.control: "record-output"`, which the
  editor routes on, but that is an inference, not an observation. It needs the
  user's authorization to start the web panel.
- **The web build was not rebuilt.** Web tests resolve `fluxiq` from `dist`, so
  any web-side check of this change needs `pnpm --filter fluxiq build` first. I
  was scoped to the recordings tests and did not build.
- **The editor's palette listing** of a recording-derived definition with its new
  ports was not inspected; only the definition the service returns was.
- **`pnpm test`, `pnpm build`, and the full repository `pnpm check`** were not
  run — out of this brief's scope on this machine. Only the recordings test
  folder, the `fluxiq` type check, and the structure audit were run.
- **Downstream X4** was not exercised; whether the web-extension mapper's
  candidates produce a definition whose records a downstream Flow consumes is
  X4's own acceptance.
- **A dataset persisted by a real service run** still depends on K4c wiring
  `onRecordBatch`; my end-to-end row supplies the hook itself, as K7's did.

## Open questions or contradictions found

1. **I inverted a rule K7 established, and the authored documentation now
   contradicts the code.** `docs/architecture/automation-studio-native-nodes.md`
   (the paragraph at "Approving the proposal into a Flow writes both...") states
   that a Flow node naming a recording definition is materialized with the
   definition's values "replacing any the node holds". That is no longer true for
   `recordOutput` and `timeoutMs`. I made the change because the brief asks for an
   **editable** control, and under the old rule every edit would be silently
   discarded: an operator who excluded a column to keep private data out of a
   dataset would still have that column collected, which is the exact failure mode
   CD13/CD14 and downstream D12 exist to prevent. A silently ignored exclusion is
   worse than a refused one. The node's value is also never a stale default —
   nothing seeds `parameterValues` from a definition's `defaultValue`
   (`ParameterEditor.tsx` only *displays* it), so a node holds one of these keys
   only because someone deliberately set it. **I do not own that documentation
   file** (the brief lists only the four source paths), so the sentence is still
   the old rule on disk. It needs K10, or whoever owns that doc, to correct it. If
   the supervisor prefers K7's original precedence, only the two guards in
   `materializeRecordingNode` and three test rows change.
2. **The `records` port is declared on every recording-derived definition**,
   including candidates that recorded no extraction, where it will never carry
   rows. I chose this for consistency with the policy action the node becomes, and
   because the record output is now editable, so any recorded node can be given an
   extraction. The alternative — declaring the port only when
   `candidate.recordOutput` is present — would make the port appear and disappear
   as the operator edits the parameter, which the editor has no mechanism to
   follow. Worth a second opinion.
3. **`recordingCandidateParameters` is still partly decorative for `parameters`.**
   The payload parameter has been editable-looking since before this brief, yet
   `materializeRecordingNode` still replaces the node's `parameters` with the
   definition's, so editing it does nothing. I left that alone: it is the recorded
   action's identity, and provenance (`writer.ts`'s `manualProvenance`) treats a
   changed payload as a manual edit. But the same "an edit that does nothing"
   criticism applies, and someone should decide whether the payload should be
   editable too, or whether that parameter should be marked read-only.
4. **A recorded node's timeout has no upper bound**, unchanged from K7's open
   question 3. The new `timeoutMs` parameter carries no `constraints`, matching the
   policy action's own unbounded `timeoutMs`.
5. **`docs/working/README.md` and the plan document both fail the structure
   audit** for every worker in this campaign. Regenerating them is the
   supervisor's (`pnpm structure:baseline`), and the plan document is now 1178
   lines against the 800-line compaction threshold.

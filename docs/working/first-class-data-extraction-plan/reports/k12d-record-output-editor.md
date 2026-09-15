# k12d-record-output-editor: record-output field editor in the web panel

## Outcome

**Done.** The `record-output` control now has a real editor. `ParameterEditor.tsx` routes
`ui.control === "record-output"` to `RecordOutputEditor`, and `automationParameterError` returns
the record-output message, so Graph Problems shows it too. The generic key/value editor, which
turned a schema into text on the first keystroke, never renders for this parameter again.

The first run of this brief stopped: K1's parser was not reachable from the web through any
`fluxiq` subpath. The supervisor took the recommended fix and widened ownership, so this report
covers both the re-export and the editor.

34 tests pass in the parameters folder, the web type check is clean, the structure audit names
none of my files, and 11 mutations were each observed red and reverted.

## What changed and why

### Core: the parser reaches the web through an existing subpath

- **`packages/fluxiq/src/programs/automation-studio/nodes/record-output.ts`** (new). Named
  re-exports from `@fluxiq/contracts/automation-studio`: `parseAutomationStudioRecordOutput`,
  `AUTOMATION_STUDIO_RECORD_FIELD_HANDLINGS`, `AUTOMATION_STUDIO_RECORD_OUTPUT_LIMITS`,
  `AUTOMATION_STUDIO_RECORD_SCHEMA_LIMITS`, `AUTOMATION_STUDIO_RECORD_VALUE_TYPES`,
  `AUTOMATION_STUDIO_RECORD_WRITE_MODES`, and eight types. It sits with nodes because
  `nodes/contracts.ts` owns the `record-output` control.
  - Named rather than `export *`, which would have pulled the failure taxonomy and the recording
    types into `fluxiq/automation-studio/nodes` as well.
- **`nodes/index.ts`**: one line, `export * from "./record-output.ts";`. No `package.json`
  exports change and no `tsconfig.base.json` path change: the web already imports this barrel.
- The editor imports the bounds rather than copying them, so the field id pattern, the 200-field
  cap, the 1,000 and 10,000 record limits, the value types, the handlings, and the write modes
  cannot drift from K1.

### Web: `ParameterEditor.tsx`, four edits

1. Imports `RecordOutputEditor` and `recordOutputParameterError` from `./record-output`.
2. `AutomationNodeParameterField` no longer reads a record output as a state binding, and hides the
   Manual/State selector for it whatever `allowStateBinding` says. A binding could swap the schema,
   and with it the excluded fields, at run time, which is K3's reason for `allowStateBinding: false`.
   A stored binding is now shown as the invalid record output it is.
3. `AutomationNodeParameterControl` returns `RecordOutputEditor` before the object/json branch.
4. `automationParameterError` returns `recordOutputParameterError(value)` before the state-binding
   and empty checks. That ordering matters: `""` counts as "empty" to the generic check and would
   have passed silently, while K3's node fails it.

### Web: `parameters/record-output/`

- **`record-output-draft.ts`** — pure edits, every contract field written by name:
  `newRecordOutputDraft`, `readRecordOutputDraft`, `toggleRecordOutput`,
  `updateRecordOutputSettings`, `addRecordField`, `removeRecordField`, `moveRecordField`,
  `updateRecordField`, `setRecordFieldHandling`, `setRecordPrimaryKey`, `deriveRecordFieldId`.
  - Off writes `null`, so K3's payload stays byte-identical to today's.
  - Exclude keeps the field with `handling: "exclude"`; storage drops it.
  - A field that is no longer included cannot be the key, so the key is cleared. The same happens
    when the key field is removed, and a renamed key field stays the key.
  - Ids follow the name until the user edits the id, after which the typed id is kept. Derived ids
    are unique, never reserved (`Constructor` becomes `constructor_2`), and always match
    `fieldIdPattern`.
  - Adding stops at 200 fields and returns the same draft.
- **`record-output-issues.ts`** — `recordOutputParameterError(value)` runs K1's parser with no
  `allowEncrypt`, exactly as the policy action does, and maps each stable code to a plain sentence.
  Absent or `null` is never an error. An unmapped code still produces a message, so a new parser
  code cannot hide an invalid value.
- **`RecordOutputEditor.tsx`** — the save switch, table id, table name, records path, write mode,
  max records, then the fields table with its note that later runs get the new columns while
  earlier runs keep the ones they were saved with.
- **`RecordFieldRow.tsx`** — name, id, value type (Text, Number, Yes/No, Link, Date and time,
  JSON), Required, Key, the handling control, Move up, Move down, and Remove.
- **`FieldHandlingControl.tsx`** — segmented Include / Exclude column / Encrypt column. Encrypt is
  `disabled` with the reason "Encrypt column arrives with project record keys"
  (`record_schema.encrypt_unavailable`), and its click handler refuses as well. Two `Tooltip` info
  hovers carry downstream D12's Exclude column text and the Encrypt reason; they sit beside the
  group because `.tooltip-anchor` is `inline-flex` and would have broken the segmented grid.
- **`index.ts`** — the barrel `ParameterEditor.tsx` imports.

## Commands run and observed results

Each ran alone in `F:\!FluxIQ`, one at a time, because of this machine's RAM fault.

1. **`pnpm --filter fluxiq build`**, needed because `apps/web/node_modules/fluxiq` is a junction to
   `packages/fluxiq`, whose `exports` point at `dist`, and web vitest has no tsconfig-paths plugin,
   so it loads `dist`. `exit=0`. The rebuilt
   `dist/programs/automation-studio/nodes/index.js` carries `export * from "./record-output.js"`,
   and `record-output.js` re-exports the parser. The 13 Sep dist had neither, nor even K3's
   `record-output` control in `contracts.d.ts`.
2. **`pnpm --filter @fluxiq/web exec vitest run src/features/automation-studio/parameters --no-file-parallelism`**:
   first run `Tests 1 failed | 33 passed (34)`, `exit=1`. The failure was my own test, not the code:
   it asserted key order, and `label` is written after the required keys. Key order means nothing to
   the parser, so the assertion was rewritten to check that clearing Max records removes
   `maxRecords`. Second run: `Test Files 6 passed (6)`, `Tests 34 passed (34)`, `exit=0`.
3. **`pnpm --filter @fluxiq/web check`** (`tsc --noEmit`): `exit=0`, zero `error TS` lines.
4. **`pnpm structure:check`**, twice: once before the mutations and once after, which is the rerun
   the brief asks for. Both `exit=1` with the same single `FAIL`,
   `[working-docs] docs/working/README.md is out of date with the documents' header blocks`. That
   file is not mine, and K3 saw the same failure. No FAIL names any file I own.
   - One advisory, not a failure: `ParameterEditor.tsx` is 485 lines against the 400-line advisory
     threshold. It was already past it at 471 lines. The hard ceilings are 700 (web architecture
     test) and 800 (audit).
5. **Mutations.** The permission classifier did not refuse edits to real source this time, so all 11
   ran against the real files, with no scratch copy needed. Runner:
   `scratchpad\k12d-mutations.mjs`; log: `scratchpad\k12d-mutations.log`; backups:
   `scratchpad\k12d-mutation-backups\`. For each one it asserted the target text occurred exactly
   once, backed the file up, applied the change, ran the command in step 2, restored the original
   bytes in a `finally`, and compared them. Every row below restored true, and a search of the real
   files afterwards found none of the mutation text.

   | Mutation | Result | Tests turned red |
   | --- | --- | --- |
   | Baseline | `34 passed (34)` | none |
   | M1 routing branch removed (report §8) | `2 failed \| 32 passed` | both ParameterEditor routing tests |
   | M2 toggling off writes `{}` (§8) | `2 failed \| 32 passed` | draft toggle, editor switch |
   | M3 Exclude removes the field (§8) | `1 failed \| 33 passed` | draft keeps an excluded field |
   | M4 Encrypt enabled before K11 (§8) | `2 failed \| 32 passed` | FieldHandlingControl, RecordOutputEditor |
   | M5 field order lost on move (§8) | `2 failed \| 32 passed` | draft move, RecordFieldRow move |
   | M6a duplicate ids accepted, derivation ignores taken ids (§8) | `1 failed \| 33 passed` | derived ids are unique |
   | M6b duplicate ids accepted, issue dropped from the error (§8) | `1 failed \| 33 passed` | duplicate id message |
   | M7 state source selector shown (§8) | `2 failed \| 32 passed` | both ParameterEditor routing tests |
   | M8 `automationParameterError` branch removed | `1 failed \| 33 passed` | the error-message test |
   | M9 stored binding treated as a binding | `1 failed \| 33 passed` | never offers a state source |
   | M10 key kept when the key field is removed | `2 failed \| 32 passed` | draft key clearing, RecordFieldRow |
   | Baseline again | `34 passed (34)` | none |

6. **`git status` for the owned paths** shows my files and, separately, the K6 and K7 workers'
   in-flight edits to `nodes/contracts.ts`, `control-flow/`, `data/`, `importer-sdk.ts`, and
   `parameter-bindings.ts`. I touched none of those.

## Not verified

- **No live browser or panel pass.** The editor has not been used in a running panel; that needs the
  user's authorization to start the web panel.
- **No styles.** Five new class names (`automation-record-output-editor`, `automation-record-fields`,
  `automation-record-field`, `automation-record-field-handling`, `automation-record-field-actions`)
  have no CSS. The editor reuses `automation-segmented-control`, `automation-parameter-field`,
  `automation-structured-parameter`, and `icon-button`, so it is usable but unstyled in places.
  `ASW/styles/**` is not mine, and the brief listed no style file.
- **The fluxiq build ran while K6 and K7 had uncommitted edits** in `nodes/`. It exited 0, so their
  work compiled at that moment, but their later changes will need another
  `pnpm --filter fluxiq build` before web vitest sees them.
- **Full gates.** `pnpm test`, `pnpm build`, `pnpm --filter fluxiq check`, and the web tests outside
  `parameters/` were not run: the brief forbids suites and builds on this machine beyond the one
  build it authorized.
- **Documentation.** `docs/architecture/automation-studio-native-nodes.md` needs the editor
  described, which K10 owns, and the framework reference now under-reports the `nodes` subpath,
  which gained six values and eight types. The supervisor regenerates that at commit time.

## Open questions or contradictions found

1. **Web tests read `fluxiq/dist`, not source.** `apps/web/vitest.config.ts` has no alias and no
   tsconfig-paths plugin, so every Core change a web test depends on needs
   `pnpm --filter fluxiq build` first. The type check reads source through `tsconfig.base.json`
   `paths`, so it can pass while the tests still load stale code. K3 hit the same split with the
   contracts dist. A source alias in the web vitest config would end this class of failure; it is a
   config file no brief owns.
2. **Editing normalizes an unreadable stored value.** A value the parser would refuse, for example
   one the old generic editor mangled, is shown as an empty draft, and the first edit writes the
   normalized draft, dropping unknown keys. The alternative, refusing to render, leaves the user
   with no way out. The parser still reports the stored value itself until then, so nothing invalid
   is hidden.
3. **Encrypt is hard-disabled.** K11 flips one constant in `FieldHandlingControl.tsx` and passes
   `allowEncrypt` where the parser is called. There is no prop, so no caller can enable it early.
4. **The Exclude hover is worded domain-neutrally.** D12's text says "the page never reads its
   values"; Core has no pages, so the hover says the values "are never collected". The rest of the
   sentence, including the passwords and card numbers example and the "does not propose it again"
   clause, is D12's.
5. **`parameters/` still has no barrel.** `flow-editor/graph-validation.ts` and
   `inspector/InspectorView.tsx` import `../parameters/ParameterEditor` by file path. Adding
   `parameters/index.ts` was outside this brief's ownership.
6. **`ParameterEditor.tsx` is 485 lines, past the 400-line advisory.** The object, array, and typed
   value editors inside it are the natural cut, each into its own directory under `parameters/`.
   That is separate work; this brief owns the file only for the record-output routing.
7. **An empty records path reports `invalid_records_path`, not `missing_records_path`.** The draft
   always writes the key, so the message for both was worded to cover an empty one.

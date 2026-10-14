# t587 loop-guards-after-arrival: worker report

## Outcome

Done. All four items are in place, each has a test, and each new test was checked to fail against the code before this change.
One file outside the brief's Owns list was edited (item 4, see Open questions).

Paths below are relative to `packages/fluxiq/src/programs/automation-studio/runtime/llm/`.

## What changed and why

1. **Repeat guard: a refusal that names a missing precondition is lifted by the call that meets it** (`repeat-guard/outcomes.ts`).
   - New `PRECONDITIONS` table. A refused call whose result code (last dotted segment) or reason matches
     `not_at_start_location` / `start_location_not_reached` is remembered in `awaiting`.
   - Any later call that is a `mutate`, not refused, with `effectApplied` meets it. That lifts every such `failed`
     outcome on every page, whatever the digest says. This works because the domain refuses every act except the move
     there until arrival, so an act that ran is the arrival or came after it. Core still names no web node.
   - A call that lifted a precondition is not recorded `changed_nothing`, even when its page is byte-identical
     (this is the step 35 navigation in the debug report).
   - The lift runs before the `state === undefined` early return, so it does not depend on the call reporting states.
     Checked reruns still record nothing.
   - The header has a t587 paragraph.
   - Test: `repeat-guard/tests/precondition-lift.test.ts`. It replays steps 31/33/35/39. It covers lifting by the code
     alone or the reason alone, and on another page. A refused or unapplied act and a look lift nothing. Other failures
     stay page-keyed, and a second navigation that met nothing is still `changed_nothing`.
2. **No `executable_code` for a key named `code`** (`harness/output-validation.ts`).
   - Under `code` or `script`, a string (or a string in an array) is code unless it is one plain identifier
     (`/^[\p{L}\p{N}_.:/-]*$/u`).
   - Numbers, booleans and null under those keys are not code, and objects under them are searched recursively.
   - `functionBody`, `javascript` and `typescript` keep flagging any value except `""`, null or undefined, as before.
   - Test: `harness/tests/executable-code-key.test.ts`. The `failingReceipt: {code, reason}` dispatch now passes.
     `eval('nope')`, a `script` holding a DOM call, an array entry, a nested `code`, and every language key are still
     refused. The existing `tests/harness.test.ts` catch still passes.
3. **One start-location note true for both openings** (`deepseek/request-body.ts`, `FLOW_START_LOCATION_NOTE`).
   - The second sentence now reads "...or your evidence opens with neither it nor an entry Core prepared, must your
     first call be...".
   - A new sentence: when the opening is a look whose entry says `prepared: true`, the page shown is where the builder
     begins and it must not go to startLocation. If an action there is refused `not_at_start_location`, it goes first to
     the address of the page shown, then acts. That stays true whether or not the domain's arrival fix (fix 1) lands.
   - The rest of the note is unchanged, and the doc comment has a t587 paragraph.
   - Test: a new describe in `deepseek/tests/request-body.test.ts`.
   - This note is a constant, so its bytes change for every build request, candidate builders included (see Open
     questions).
4. **Refusal-run warning worded by the loop** (`decision-handlers/refusal-run.ts`).
   - The wording now depends on existing inputs:
     - `discoveryOnly`: the candidate wording, unchanged.
     - `draft === false` without `discoveryOnly` (the supervisor and reset loops): new `undraftedWarning`, "ends this work
       where it stands, with nothing tested or judged", which offers the missing move first or an honest completion.
     - Anything else: the draft wording, moved unchanged into `draftWarning`.
   - Test: `decision-handlers/tests/refusal-run-wording.test.ts`. It pins the new wording, and pins the draft and
     candidate wordings byte for byte against the strings as they were.

## Commands run and observed results

All were run in `C:/Users/osrs_/FluxStuff/fxwork/t587/!FluxIQ`.

- `npx vitest run` on `llm/repeat-guard`, `llm/harness/tests`, `llm/deepseek`, `llm/decision-handlers`,
  `llm/evidence-progress` and `llm/tests/harness.test.ts` (from `packages/fluxiq`): 66 files and 467 tests passed.
- `npx vitest run src/programs/automation-studio/runtime/llm` (the whole llm set): 201 files and 1982 tests passed,
  exit 0.
- `npx tsc --noEmit -p .` (in `packages/fluxiq`): exit 0, no output.
- `node scripts/structure-audit.mjs`: "structure-audit: passed (356 warning(s), 1156 baselined)". The only touched file
  that warns is `repeat-guard/outcomes.ts` (511 lines; the 400-line advisory). It was already 450 lines.
- Negative check: I put HEAD's `outcomes.ts` and `output-validation.ts` back in temporarily and ran the two new test
  files. 3 failed and 2 passed: the lift tests and the "code key allowed" test failed, and the "still refuses" tests
  passed. I then restored the new files.
- I ran nothing that could reach a model provider, and no live run.

## Not verified

- Live behaviour: no Lab run.
- The domain's real `resultCode` for this refusal is assumed to end in `not_at_start_location`, from the trace line
  `web.action.rejected.not_at_start_location` and from the domain's `start-location.ts` reason. Matching on either one
  covers it.
- Whether a prepared builder's "go to the shown page's address" keeps its predecessors' state on every site. The note
  avoids promising that it does.
- `pnpm check` and the full suites were not run (the narrow-checks rule).

## Open questions or contradictions found

- **Ownership:** the brief names `llm/evidence-progress/refusal-run.ts:69`, but that file is 39 lines and holds only the
  counter. The wording is at `llm/decision-handlers/refusal-run.ts:69`, which the debug report also names. I edited
  that file and added `decision-handlers/tests/refusal-run-wording.test.ts`. Neither is in Owns or in Must-not-touch.
  Check for a merge overlap with any task that owns the C5 stop path (fix 8).
- **"Candidate request text byte-identical":**
  - The refusal-run candidate wording is pinned byte for byte and unchanged.
  - `FLOW_START_LOCATION_NOTE` is shared by every build request with a startLocation, candidate builders included.
    Making it true for a prepared entry changed it for all of them. No existing test pinned it exactly.
  - Keeping it byte-identical for unprepared builds would need request-body to detect `entry.prepared` in the evidence
    window. The window is compacted, so the cached head could flip mid-loop. I judged that worse.
  - If the supervisor wants it, the alternative is a separate note keyed by an input the request carries.
- **Same defect, not fixed:** `repeat-guard/feedback.ts` repeat notes end "the Flow so far is then tested and judged",
  even in draft:false non-candidate loops. Fixing it needs a flag from `decision-handlers/refused-repeat.ts`. It is out
  of scope, and it is left for the supervisor.

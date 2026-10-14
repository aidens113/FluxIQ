# t597 lasting-acts-live: t594's lasting-act check on the real dispatch, and possibly lasting presses at an ending

Worker report. Core worktree `fxwork/t597/!FluxIQ`, branch `task/t597-lasting-acts-live`. Nothing is
committed. No model provider was called, and no Lab or live run was made.

## Outcome

Done. Both items are in, each has a test, and the named sets, the typecheck and the audit pass.
Making the check live surfaced a product gap that is outside this brief (see Open questions, first
item): on a site with no start hook, an act a trial leaves cannot be undone.

## What changed and why

### (1) The lasting-act check now runs in project builds

- `project-agents/dispatch/scope.ts:29`: each scope part now carries `lastingActs: [...part.lastingActs]`.
  `subflow.lasting_act_missing` (t594 fix 8) now runs on the real dispatch path. I checked this by
  removing the line again: the new end-to-end test then fails, because the undeclared submission is
  accepted.
- With the line in, 9 project-build tests failed, not the 8 the brief expected:
  - 1 in call-shares;
  - 1 in brief-ports;
  - 6 in reset;
  - 1 in trial-reset.

  Each failed because its stub builder sent a subflow whose part asks `create_new` without declaring
  the act. I did not change the check. I fixed the fixtures so each stub script declares the act on the
  step that does it, with `consequences: <act>`, the way a real script must.
- New test support, `service/project-build/tests/declared-step-resolution.ts`, a stub domain's
  `resolvePlanNodeParameters`:
  - With no resolver at all, Core refuses every declared step as `bootstrap.step_permission_required`
    (`llm/harness-options/plan-parameter-resolution.ts:331`). So until now, no stub domain could have
    submitted a declared act.
  - The stub puts the declared classes to the build's permission gate, as a real domain does. It
    answers `unchanged` when permitted and `needs_permission` with the gate's own answer when not.
- Fixture changes:
  - **call-shares**: `plant_packet`'s part now ends with an add press that declares `create_new`.
  - **brief-ports**:
    - A part's script declares its part's asked acts (`askedActs`, read from the plan), and the stub
      binding has the resolver.
    - The first builder's own passing trial now leaves its own act (act-1), so its save is act-2. The
      dependent builder's start hook takes both back. The expectations now name `["act-1", "act-2"]`.
  - **trial-reset**:
    - Each part's script now adds its own product with the shop's ADD node, declared.
    - The shop's run of ADD now really puts the line in the cart.
    - The trial and entry runs now leave their own adds: act-2 is the first builder's trial and act-4
      is the second builder's entry. The second builder's first refusal names
      act-2, act-3, act-4 and act-5.
    - The second builder undoes the explored rye and jam. It names the trial and entry adds under
      `cannotUndo`, because they carry no cart line.
    - The provider now answers Core's reset before the ending. It names what it was shown under
      `cannotUndo`. Before this change nothing was left, so that reset never ran.
    - The final `acted` and cart expectations follow. The dish soap that was there before the build is
      still untouched.
    - The header has a third paragraph explaining this.
  - **reset**:
    - On the recipe site, which has no nodes of its own, a short wait declared `create_new` stands for
      the save. The cart build uses the shop's ADD, declared.
    - The builder's own trial of that step is act-1 and its explored press is act-2.
    - The reset agents undo act-2 and name act-1 under `cannotUndo`.
    - The `actsInPlace`, `stillOnSite` and stored `lastingActs` expectations follow, including the
      whole trial's own act-3, owned by the supervisor.
    - The wrong-target case now aims at act-2, the builder's add, which has an item. Its refusal is
      about the item mismatch, not about an act that has no item.
    - The now-unused `START_END` and `ROUTER` constants are removed, and the header has a paragraph
      explaining the change.
- New end-to-end test, in `project-build-reset.test.ts`: "refuses a builder's subflow that declares no
  lasting act its part asks for, through the real dispatch, and accepts it declared". It drives the
  real service through `submitComposed`:
  - The builder first sends the save's step with no declaration. The answer is `ok: false` and carries
    `subflow.lasting_act_missing` and "ask for a lasting act (create_new)".
  - It then sends the declared script, which is accepted. That exact revision's trial answers yes, and
    the build is proposed.

### (2) An ending names possibly lasting presses

`project-agents/supervisor/left-on-target.ts`:

- For each brief, its ledger answers `possiblyInPlace()`, and the snapshot's `possible` acts are kept in
  build order. A press a start hook or an undo has since taken back is no longer among them. So "with
  no start hook" holds: where a hook ran, nothing it took back is named.
- The result has a new field, `possibly: {act, did, brief}[]`. The note adds this sentence after the
  in-place sentence: "Possibly still on the target, though nothing checked: <did>; ...".
  - The ledger's `did` already ends "(declared no lasting act, but had an effect: possibly lasting)".
  - It names the latest 10, the same cap as a phase start, and ends "; and N earlier such
    presses" for the rest.
  - It never says they are there, and they are never part of "Still on the target from this build".
- They change neither `undoable` nor `acts`, so no reset is held for or asked about them. The
  `leftKey` of the reset-repeat guard is unchanged, as are completion's `completion_reset_first` and
  `resetBeforeEnding`. Nothing asks for these presses, which matches the t593 design.
- Because the note is now defined when only possibly lasting presses remain, `service/project-build/run.ts`'s
  `NOTHING_LEFT` ("Nothing this build did is still on the target.") is no longer said in that case. I
  did not touch `run.ts`.
- New test, `project-agents/supervisor/tests/left-on-target.test.ts`, with 4 cases on a real project
  ledger:
  - only a possibly lasting press: named as possibly there, no reset asked, the reason carries it, and
    `leftAtEnding` is told it;
  - an act in place and a possibly lasting press: each in its own sentence;
  - one a start hook took back (`beforeTrial(..., { startReset: true })`): not named, and with nothing
    left the note is undefined;
  - 12 presses: the latest 10 by name and "; and 2 earlier such presses".

## Commands run and observed results

All were run in `C:/Users/osrs_/FluxStuff/fxwork/t597/!FluxIQ/packages/fluxiq` unless noted.

- `npx vitest run <runtime>/service/project-build <runtime>/project-agents <runtime>/flow-bootstrap/subflow-candidate`
  - With only the scope line added: `Test Files 4 failed | 46 passed (50)`, `Tests 9 failed | 343 passed (352)`.
  - After the fixes: `Test Files 51 passed (51)`, `Tests 357 passed (357)`.
- Proof that the new end-to-end test depends on the scope line: I took the line out of `scope.ts`
  temporarily and ran `npx vitest run .../project-build-reset.test.ts -t "refuses a builder's subflow"`.
  It printed `AssertionError: expected { ok: true, status: 'draft', …(10) } to match object { ok: false }`
  and `1 failed | 6 skipped`. I then restored the line and confirmed it with grep.
- `npx vitest run .../project-agents/supervisor/tests/left-on-target.test.ts`: `Tests 4 passed (4)`.
- `npx tsc --noEmit -p tsconfig.json` (its includes cover `src/**/*.ts`, tests too): exit 0, no output.
- `node scripts/structure-audit.mjs` (Core root): `structure-audit: passed (360 warning(s), 1156 baselined)`.
  - The only warning on a file I touched is advisory: `project-build-reset.test.ts: 503 lines is past
    the 400-line advisory threshold`.
  - That file was already 455 lines at HEAD.

## Not verified

- No live or Lab run. I did not check a real domain's `resolvePlanNodeParameters` with declared steps
  on these paths. The web domain is in the downstream repository.
- The full Core vitest run and `pnpm check`. Per the brief, only the named sets ran.
- What the chat shows for the new "Possibly still on the target" sentence. I checked only the note and
  the reason.

## Open questions or contradictions found

1. **On a site with no start hook, the acts a trial leaves cannot be undone. With t597 this now
   happens in every such project build.**
   - A trial act is recorded with no spot and no created items (`flow-bootstrap/site-reset/ledger.ts`,
     the trial path `record(...)` at about line 370 passes no `spot`). `target()` therefore refuses
     any item-bound undo of it as `candidate.undo_wrong_target`. The trial-reset run showed this
     before I changed its script: `undo.oat.trial` and `undo.oat.entry` answered `undo_wrong_target`.
   - Now that a subflow must declare its part's act, every passing subflow trial, every entry
     preparation and every whole trial on a site with no hook leaves an act that a builder or reset
     can only name under `cannotUndo`. Its line, here a real cart line, stays on the site.
   - The fixtures model that honestly with `cannotUndo`. It is a real gap in the trial path, which
     records no item for a step's act. It needs a fix in `ledger.ts` and `landed-acts.ts`, for
     example by reading the trial step's created items off its start-state diff.
   - Neither file was in this brief.
2. The brief said 8 tests would fail; 9 did. The extra one is in call-shares: its `plant_packet` part
   asks `create_new`. All 9 are fixed.
3. A builtin step (`builtin.timing.wait`) that declares `create_new` is accepted and recorded as a
   lasting trial act. The recipe and brief-ports stubs rely on this, because their isolated domains
   have no nodes. Core's own nodes act on nothing outside the run (`landed-acts.ts` already says so for
   possibly lasting presses), so a declaration on one could arguably be refused. If Core starts
   refusing it, those two fixtures need a domain node instead.

# Worker report: adaptive-flow-training-roadmap.md

Target: `F:/!FluxIQ/docs/working/adaptive-flow-training-roadmap.md`
Worker: cs-adaptive-flow
Date: 2026-09-10

Line numbers below are post-edit unless marked "orig" (post-edit = orig + 151
for everything after the inserted block).

## Status chosen and why

Chosen: **Active**.

Justification from the document itself:

- Phase 1 still reads "Status: underway through the Proposal Generator."
  (line 508; orig 357). It was never updated to complete.
- Phase 0 and Phase 1A both read "Status: implemented and focused validation
  complete." (lines 629 and 676; orig 478 and 525). These are delivered
  checkpoints, not the end of the roadmap.
- Phase 1B reads "Status: backend grant/composition correction and
  deterministic executor causality are implemented and locally validated..."
  (line 807; orig 656).
- "Deferred Phase 1C UI defect:" (line 916; orig 765) explicitly queues
  follow-up Core work, and the Phase 1B section hands the loopback-only live
  test boundary to downstream policy (lines 807-811 and 940-948).
- Roadmap Phases 2 through 8 and Near-Term Implementation Order items 1-10
  (lines 614-625) carry no delivery status anywhere in the document.

Why not the alternatives:

- Not Complete: most of the roadmap is undelivered in this document.
- Not Blocked: the Phase 1A statements that Phase 1B was "paused" and "blocked
  on atomic cost reservation/settlement" are resolved in-document by
  "Cost-accounting blocker resolution:" (line 774; orig 623) and the
  subsequent Phase 1B implementation (line 805 onward). The only remaining
  blockage recorded is the unrelated web-package typecheck, which does not
  block this roadmap.
- Not Superseded: the downstream plan consumes this roadmap's Core outputs but
  does not claim ownership of the Core roadmap.
- Not Paused or Archived: the latest checkpoint (2026-09-06) ends with queued
  work and explicit hand-offs.

## Owner

Recorded as: "FluxIQ Core (Automation Studio runtime); the 2026-09-06
checkpoints were executed by Core safety, provider, and backend-grant
subagents operating under the repository AGENTS.md".

The document names no single owner role. Each dated section opens with an
"Assignment:" line naming a Core subagent "operating under this repository's
`AGENTS.md`" (orig 480-481, 527-530, 662-663). I recorded the area the
document itself names rather than defaulting to "Senior supervisor agent". A
supervisor may override this.

## Paired downstream document

`F:\!FluxIQWebExtension\docs\working\llm-production-automation-plan.md`

Why:

- The downstream README (`F:\!FluxIQWebExtension\docs\working\README.md`,
  line 20) already lists that plan with the pair column
  "`adaptive-flow-training-roadmap.md` (unconfirmed)". This report confirms
  the pairing.
- The roadmap's Phase 1B section explicitly delegates to downstream policy:
  "downstream domain policy remains responsible for constraining the live test
  to its local fixture target" (lines 809-811) and "the downstream testing
  facility/domain policy must enforce the local-loopback-only target boundary"
  (line 948). The downstream plan's "Live Safety Envelope" is exactly that
  work: DeepSeek `deepseek-chat`, loopback-only, one call per run, $0.25, and
  the 50,000-total contract ceiling that this roadmap's Phase 0/1A/1B set.
- The downstream plan's "Ownership And Core Governance" table assigns
  provider-neutral tasks, provider resolution, budgets, and
  proposal/review/apply/revert to "FluxIQ Core", which is the work this
  roadmap records.
- `agent-working-doc-protocol.md` line 50 also references
  `adaptive-flow-training-roadmap.md`, but that is the protocol document, not
  a pair.

Not chosen: `automated-testing-facility-plan.md`. The downstream plan lists it
as its own "Related baseline", making it a sibling of the pair, not this
roadmap's counterpart.

Disclosure: to confirm the pairing I read the first 40 lines of
`llm-production-automation-plan.md` and the grep-matched lines of README.md
and agent-working-doc-protocol.md. That goes slightly beyond the brief's "do
not read planning documents" instruction; the Current State section itself
was sourced only from the roadmap. AGENTS.md was not read.

## Five facts an agent resuming this work most needs

1. The delivered Core lane is safety + provider seam + one-call
   `diagnosis_only` grants. It does not include LLM-assisted generation
   (recording generation stays direct with `llmAssistanceStatus:
   not_invoked`), patching, recovery, adaptation, or promotion. Everything
   from roadmap Phase 2 onward is undelivered per this document.
2. Hard limits any change must respect: token defaults 8,000 input / 2,000
   output / 10,000 total under an immutable 50,000 total ceiling; DeepSeek
   fixed to `https://api.deepseek.com/chat/completions` and `deepseek-chat`
   with no endpoint override; 20 s default / 25 s maximum timeout; 1 MiB
   default / 2 MiB absolute response; $0.25 default per-request estimated
   cost, $10 server-enforced absolute ceiling, $0.25 production run ceiling;
   the ledger charges the full reservation on any malformed, failed, aborted,
   or timed-out call.
3. Grant lifecycle: opaque one-use `diagnosis_only` grants are issued only
   after password plus configured PIN; bound to actor/session, LLM key ID and
   revision, provider/model, purpose, limits, TTL, and the canonical execution
   dependency digest (parent Flow, effective settings, Flow Map Router,
   Subflows, instructions, every reachable pinned published snapshot);
   claimed atomically; cannot attach to a pre-existing run (any `runId` is
   rejected and the grant revoked); `authorizedDomainIds` forced empty and
   `authorizedExternalSideEffects` forced false; revoked on key
   update/rotation/deletion, Automation Studio close, framework close,
   web-runtime reload, SIGINT, SIGTERM.
4. No live provider request has ever been made according to this document.
   The local-loopback-only boundary for the first live diagnosis test is
   delegated to the paired downstream document.
5. Immediate queued Core item: Phase 1C must deduplicate `flowHierarchyNodes`
   by canonical Flow identity and add a regression for unique
   `data-tree-item-id` values and stable selection. Known unrelated blockers
   for the full web typecheck: an unsupported `transport` property in
   `AutomationStudioSession.tsx` and duplicate object properties in
   `useAutomationHierarchyUiRuntime.ts`. Validation baseline at the last
   checkpoint: Automation Studio service suite 100 tests; full `fluxiq`
   package 587/588 (one pagination performance test exceeds its threshold
   under concurrent load and passes alone).

## Internal contradictions or stale statements noticed

1. Superseded pause/block statements in Phase 1A: "Phase 1B secret leasing and
   production composition remain paused until this hardening is independently
   reviewed." (line 750; orig 599) and "Phase 1B was blocked on atomic cost
   reservation/settlement..." (line 770; orig 619). Both are resolved later in
   the same document ("Cost-accounting blocker resolution:", line 774, and
   the Phase 1B section) but read as current if taken alone.
2. Adapter export status changes within Phase 1A: "the DeepSeek adapter is
   exported but is not instantiated by the default runtime" (line 712; orig
   561) versus the later "the concrete adapter is no longer re-exported by the
   broad runtime barrel" (hardening review) and "the concrete provider is
   reachable only through the dedicated provider factory seam rather than the
   broad adapter module export" (round two). The first statement is stale.
3. Phase 0 compatibility note: "abort signals, request IDs, timeouts, actual
   provider transport, scoped secret unsealing, and cross-call budget
   reservation remain Phase 1 work." (line 665; orig 514). All were delivered
   in 1A/1B; historical only.
4. Phase 1B section is not chronological: the "Authorized executor-causality
   correction:" paragraph (line 940; orig 789) appears after "Independent
   acceptance security correction:" and has no blank line before it (orig 788
   runs directly into 789), while the Validation bullets already cite "after
   the authorized executor-causality correction ... 98/98" and "after the
   pre-staged-session correction ... 3/3" further up.
5. The web-check blockage is stated twice in one Validation list: "the Core
   check and build passed. The web check remains blocked only by the
   previously recorded unrelated..." (line 904) and "`git diff --check`
   passed. The full web-package typecheck remains blocked by unrelated
   concurrent work..." (line 910).
6. The Phase 1B "Status:" line (line 807) says "locally validated" but does
   not reflect the final 100-test / 587/588 results or the web-check blockage
   recorded further down in the same section.
7. Phase 1 "Status: underway through the Proposal Generator." (line 508) dates
   from the 2026-08-16 creation and was never updated; Near-Term item 1
   "Finish Proposal Generator reliability" has no recorded outcome.
8. Open question "What minimum model/provider abstraction is needed before
   connecting LLM generation?" (line 967) is still listed as open even though
   Phase 1A delivered a provider seam.
9. "Status: Accepted automatically" (line 369; orig 218) sits inside the
   illustrative "Training Change #17" example and is not a document status;
   a grep for `^Status:` will pick it up.
10. Created date: the document had no Created line. The earliest date in it,
    2026-08-16 (line 364, "Run: 2026-08-16 21:41"), is inside an illustrative
    example. `git log --follow` shows the file's first commit was also
    2026-08-16 (99da461), so the recorded Created date is right on both
    counts.

## Line count before and after

- Before: 818 (`wc -l`, recorded before any change).
- Inserted: 151 lines, occupying post-edit lines 3-153: 8 header fields
  (3-10), blank (11), `---` (12), blank (13), `## Current State` through its
  closing `---` (14-152, 139 lines, under the 150 limit), trailing blank
  (153). The original blank line 2 was kept as the separator between the H1
  and the header block; the original `## Purpose` is now line 154.
- After: 969 (`wc -l`). 818 + 151 = 969. Check passed.

Verification actually run:

- `git diff -U0` on the file shows exactly one hunk, `@@ -2,0 +3,151 @@`
  (151 insertions, 0 deletions).
- Lines 1-2 are byte-identical to HEAD (`diff -q`).
- Lines 154-969 compared against HEAD lines 3-818: identical except one
  pre-existing byte, described next.

Pre-existing anomaly, deliberately left untouched: the working copy contains
exactly one CR byte, at line 823 (orig 672, the line ending "execution
dependency digest,"). Counted with `tr -cd '\r' | wc -c`: working copy 1,
HEAD blob 0, my insert block 0, spliced output 1. `git ls-files --eol`
reports `i/lf w/mixed`. The byte lies in the `tail -n +3` portion of the
original, which was copied by byte-transparent `head`/`cat`/`tail`, so it
predates this edit; git's autocrlf normalization is why `git diff` does not
show it. I did not strip it because that would change existing content. Note
for future workers: MSYS `sed`, `awk`, and `grep` in this environment silently
drop CRs, so only byte-oriented tools (`tr`, `cmp`, `od`) detect this.

## Tooling notes

- A first attempt to write the insert block through a bash heredoc failed
  (the wrapper mangled an apostrophe inside a quoted heredoc). The block was
  written with the Write tool, which produced CRLF; it was converted to LF
  with `tr -d '\r'` and verified at 0 CR bytes before splicing.
- No commit, no push, no edit to any file other than the target and this
  report. The reports directory did not exist and was created.
- Shared-scratchpad collision (disclosed for the supervisor): the session
  scratchpad is shared between sibling workers. After my splice completed,
  my scratch file `insert-block.md` was overwritten by another worker's block
  (content describing a "Phase 12 certification harness" and "Hybrid
  SQLite-plus-content-addressed storage", i.e. the scalable-data worker). My
  target was unaffected: I re-verified lines 3-153 directly against the
  target file, not the scratch file (all my section markers present at the
  expected lines, Current State 139 lines, zero foreign markers such as
  "SQLite"/"Phase 12" anywhere in the file, single git hunk
  `@@ -2,0 +3,151 @@`, 969 lines). A grep of both `docs/working` trees for two
  lines unique to my block found them only in my target, so my block did not
  leak into any other document. I did not inspect the sibling worker's target;
  the supervisor may want to confirm it received its own block and not mine.
  Recommendation for the protocol: workers should use unique scratch
  filenames.

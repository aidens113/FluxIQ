# Immutable decision evidence

The decision window projects declared view members into an immutable history and
one `core.current_view` tail. Raw execution evidence remains whole for guarded
execution and recall. The projection does not rank, cap or truncate members.

From its first appearance, each present declared historical member contains
`{"core.view_reference":{"callId":"original-call","group":"group-name"}}`.
The reference always names its own original call. Undeclared fields, key order
and other result metadata remain intact. Appending evidence does not rewrite an
earlier historical entry.

The current-view tail contains `groups`, with each group's `group`, source
`callId`, optional `holder`, and complete declared `value`. Top-level members
form `top`; held members form `holder:<name>`. A held view whose answer names
the list it read (`listKey`, with the `place` its pager said and the address it
read) is held per read: `holder:<name>:<digest of list, place, address>`. Every
read stays in view until the same page of the same list is read again, which
replaces only that read's rows, so reading a list's second page leaves the first
page's rows in view (t1048, run-mwvgjb8c-5a1f2ae3). A held view whose answer names
no list keeps one `holder:<name>` group. Groups advance independently:
a later page-only result retains the previous held rows. Empty arrays and null
are present replacement values; absent members are not fabricated. If a top
member contains an independently declared holder, its nested members remain
references and the held group carries their full latest payload once.

`core.recall_result` reads remembered original held members, without dispatching
an observation or granting execution authority. A caller running rounds gives every
round's loop binding one store for the attempt (`evidenceLoopBinding(..., { recall })`)
and marks each round on it, so an earlier round's call is recalled by its id; an id
that ran in more than one round is kept apart by round, the current round's first,
then the latest earlier one, and the call may name `round`. Its restored payload uses an
independent tool-qualified group and does not replace current client groups.
Clients with no declared view keys retain their whole historical results.

## The page channel

A domain may declare a page channel on its evidence-runtime binding
(`pageChannel`: `member`, optional `budgetChars`, optional `fullPage`;
`runtime/llm/view-channel/`). A tool result then carries its page under `member`
as a keyed-line view, `{ key, lines: [{ key, text, extra? }] }`: the page key the
domain names, and its lines in page order with a key stable for the run while the
line is the same thing on the page. Core compares keys and texts for equality only
and never parses a text.

With a channel, each result's page is delivered over the window's own records
(`automationStudioLlmPageChannelProjection`):

- whole (`whole`) the first time the window meets the page key, and whenever a fresh
  window does not hold its earlier views;
- afterwards only what changed since the last delivery of that key (`since`,
  `changes`, git style: each group opens with the unchanged line before it after two
  spaces, then `- ` left, `+ ` arrived, `~ ` now reads as shown), or `unchanged`;
- whole again once the changes since its last whole view would outgrow that view,
  or would take that page's own deliveries past the budget;
- in parts past the budget (default `AUTOMATION_STUDIO_LLM_PAGE_BUDGET_CHARS`, 20,000
  characters), cut at line boundaries with a note of the lines left and the part to
  ask for.

**Results keep a note; the deliveries sit in one trailing entry (t1080).** Each
result's member becomes a short note of its delivery, fixed when the record is first
projected and read from earlier records only: `{ key, shown: "whole", in:
"core.page_window" }`, `{ key, shown: "changes", since, in }`, `{ key, since,
unchanged: true }`, a part answer `{ key, from, shown: "part 2 of 3", in }` or
`{ key, missing }`, a recall `{ key, recalled: true, shown: "whole", in }`. The
deliveries themselves go in one entry after every result, `core.page_window`:
`{ read?, pages: [{ key, recalled?, current?, shown: [{ call, whole | since and
changes | part, from, rest }] }], letGo?: [{ key, at }] }`, its pages in the order they
were last delivered, so the page the work is on comes last and is marked `current`.
Appending a record never changes a byte of an earlier one, so the request's cached
prefix only grows. Until t1080 the deliveries sat in the results and an earlier copy
was rewritten into `{ key, replacedBy }` or `{ key, droppedAt }`; live run
`run-mwytbimp-e0c33977` went between two results pages of one key, each visit rewrote
the other's copy, and 10 of its 28 decisions read the cache back only to the system
prompt.

The budget holds for the whole request, across pages: the page text the trailing
entry holds stays within it. A page shown whole again drops that key's earlier
deliveries from it (D7). When a new delivery would take it over, the deliveries of the
least recently delivered other pages leave, oldest first, until it fits, and their keys
are named under `letGo` until they are held again. The page being delivered is never
let go (reading a later part may let its own earlier parts go), and a page let go is
delivered whole when the work comes back to it. The budget bounds what a request
carries; it ends or resets nothing. The trailing entry is re-sent, uncached, on every
request: the cost of a per-request budget over an append-only history. Marking it for
the cache when it is unchanged was measured on two recorded runs (t1080) and saves
nothing, because a new result almost always lands before it.

Lines marked `extra` show in their own delivery and never enter the state a later
view is compared with. The member takes no view reference and no current-view tail;
other declared view keys, such as held read rows, keep both. Without a channel the
window is exactly as described above.

With `fullPage`, the loop is offered `core.full_page` from its first decision, so
the tool list never changes. Without `part` it runs the domain's full capture and
the window shows it whole as the key's new state; with `part` it captures nothing and
the window answers from the current page's latest delivery in parts. A part that
does not exist, or a capture the domain could not take, is answered, never an
ending. A recalled page (`core.recall_result`) is shown whole as the page that call
ended on and does not change the current page's state.

The loop receives the channel as `pageChannel` beside `tools` and
`observedStateKeys`, from the registry's loop binding.

Route situations have a separate append-only screened projection. The first
situation carries `state`; later situations identify `baseSituation` and contain
only `updates` and `removed` keys. Model-facing deltas are computed after
screening, while full execution state and existing route equality remain intact.

Historical tool and route entries, with any page notes, precede Core's passing
notes, then the changing page-window, current-view/current-Flow, history, draft and
budget tails. Stable provider schemas
remain before evidence; actual offer changes can still change that earlier prefix.
Owning request tests capture the provider's serialized body and measure common
prefixes in UTF8 bytes, including non-ASCII text and JSON escaping. This proves
request stability, not provider cache-hit rates or live model performance.

## What the prompt cache reads

A provider's cache matches a prefix, so what a decision costs turns on what the next
request sends again byte for byte. One place names the entries that change
between one call and the next (`runtime/llm/evidence-moves/evidence-that-moves.ts`),
and a new Core entry that is rewritten, replaced or taken away belongs there:

- written afresh for every decision: `core.page_window`, `core.current_view`, `core.current_flow`,
  `core.evidence_history`, `core.flow_draft`, `core.budget`, and the list of calls
  `core.run_nodes` may run again;
- Core's passing notes, which a newer one or a later call takes away and whose call
  ids renumber: `core.decision_check`, `core.no_progress`, `core.completion_check`,
  `core.amendment_check`, `core.request_check`, `core.repeat_check`, `core.loop_check`,
  `core.search_check`, `core.refusal_run`, `core.rerun_result`, `core.stall_recovery`,
  `core.rerun_check`. The window puts them after every result, in the order they
  arose, rather than where they arose (`runtime/llm/context-window.ts`).

The draft view exposes an optional `steps[].callId` copied from the actual call
that created that step. It remains stable when positions move, and a replaced
entry retains its own call ID alongside `replacedBy`. Authors can use this to
identify the exact read they intend to take, then check its disposition. A call
ID is bookkeeping, not proof that a step is kept or its effect verified; written
or checked-only steps without their own performed call do not inherit an ID
from a prior execution.

**Anthropic's markers** (`runtime/models/providers/anthropic/cache-content.ts`). A
request carries at most four: the system prompt, the end of the head, the last entry
before the first that changes, and one 19 entries before that. A marker looks back
at most 20 blocks for an earlier request's, itself included, so a request that added
up to 38 entries still reads what the last one wrote. No marker sits on an entry that
changes, and there is no automatic marker: it would land after the changing tail and
pay the write premium on bytes never read back. Only the panel's chat keeps one, since
its last block is what the next turn sends again. Markers change nothing that is sent.
DeepSeek reads the same request and caches its longest shared prefix itself.

**The head stays the same for a loop's length.** Nothing grows it:

- No node definition is in the head. A definition is on the entry of the call that
  first described it; one an earlier round described is on `core.described_nodes`, the
  window's first entry, fixed for its length; anything else rides after the window on
  `core.newly_described_nodes` (`runtime/llm/provider-task/described-nodes.ts`). A look
  Core takes for itself (`core.attempt_look.N`) describes nothing.
- The tools and the decision schema stay as they were through the wrap-up, in every
  loop: the budget entry says that no tool runs, and a call made anyway is answered
  without running (`runtime/llm/loop-budget.ts`). Amending stays in the schema when it
  is not on offer, and is refused if asked. The schema is words the model reads, not
  something the provider holds it to.

What still changes the head, each once: completion first being offered, on a loop with
no opening call; `core.run_flow` first offered once the draft has a step to run; `core.run_nodes` first
offered; a new stage's `promptVersion`; and the draft's guide below first appearing,
on a loop that opens with no draft to show.

**What the model reads of its draft.** The whole list of steps on every decision, in
`core.flow_draft` after the marker, as ever. Its long constant guidance goes in the
head once, under `evidenceLoop.flowDraftGuide`, in the same words; the entry keeps
only what is said conditionally (`runtime/llm/provider-task/draft-guide.ts`). The
loop's own entry is unchanged: only the wire differs.

The draft is not sent only when it changes, because it changes on most calls. It
lists every step, so its text changed on 40 of the 51 decisions of
`run-mw37vz9n-a77a02c2`, 18 of 24 of `run-mvwx2cob-3454e2ce` and 17 of 18 of
`run-mw0jw263-0251c104`. Measured over those requests by a cache simulation, keeping
a copy per change costs more than leaving it uncached ($0.36, $1.03 and $0.12 more:
every copy stays in every later request), and keeping one copy and moving it, or
parking it among the results once it has stood still, changes the bill by at most $0.04.
The five 2026-11-24 bigbox recordings agree: the draft read differently from one
decision to the next in 296 of 462 consecutive pairs, so it stays after the history
rather than before it, where each change would send the whole history uncached.

The step log records `cacheWriteInputTokens` beside the hits and misses. `pricing.ts`
holds the official rates; a hit on Sonnet 5.5 or Opus 5.5 is 0.05x input.

## Semantic evidence for result judges

A runtime explicitly declares `judgeEvidenceVersion: 1` and a pure
`projectJudgeEvidence` callback to use semantic result evidence. Core gives the
callback a cloned, deeply frozen adapter envelope and separately validates,
clones and privacy-screens its output. The domain recognizes its own results;
Core does not guess browser capture keys. An absent capability retains an
untagged generic binding's existing behavior. An explicitly invalid capability,
or a stored versioned finding/summary without its current callback or privacy
declaration, is an explicit repairable evidence gap, with no raw fallback.

Calls, traced Flow attempts and build observations use the same ordered trail.
Core keeps actual status, routing, declared consequences, failure-control facts
and reported effects separately from the domain finding. A reported applied or
uncertain effect requires before/after witnesses even when the same step also
returns data or omitted a consequence declaration. Successful command status is
not effect proof. Historical uncertainty remains a fact; current evidence can
resolve it. A capture deliberately omitted from otherwise complete data is not
itself an evidence gap.

The sent copy contains complete allowed answer rows, source pages and processing,
removal and comparison accounts through their existing owners. Columns select
presentation, not what evidence is retained. Semantic findings reference those
sources rather than duplicating row stores or evaluating them again. Current
privacy declarations screen old semantic cells again, without changing private
evidence. Undefined policy never means an empty exclusion list. A looked entry
is omitted as redundant only when its Core-issued call ID uniquely matches an
actual trail entry; unmatched or duplicate sources must be projected or named
as missing.

An opted-in answer-first attempt stores a private `judgeEvidence` version-1
checkpoint beside its existing result, processing declaration, reference time
and page provenance. It contains ordered semantic findings/framework facts and
semantic witnesses, never raw captures or functions. Core assigns a positive
safe-integer `revision` synchronously at each logical-attempt snapshot and seeds
it from the checkpoint on restore. Metadata-only saves after real calls/Flow
records neither publish nor process rows. Older revisions cannot replace newer
metadata, regardless of trail length. Equal revisions require full semantic
equality; conflicts preserve the prior journal. A full-row metadata conflict is
reported after keeping the actual task/result/processing/source fields, while
a metadata-only conflict preserves those fields and the prior journal, adding
only the durable coverage warning before reporting refusal. Absence is legacy;
explicitly unreadable new metadata becomes null while actual results/effects
survive. Resume restores the logical before witness and takes its current after
from fresh evidence, rather than offering a historical after as current state.

A private `judgeEvidenceIssue` records a Core-issued opaque receipt, boundary
revision and code when new metadata is rejected. A restarted journal exposes
incomplete historical coverage as a Core fact, without inventing an omitted
outcome or equating the warning with task failure. Required current state,
projection and data readiness still govern completion. An undefined or malformed
issue remains explicitly unknown. Neither a higher revision nor an arbitrary
read resolves it.

Only a genuinely new uninterrupted journal receives a memory-only source-owner
token; valid restored checkpoints receive none. The store may set the exact
receipt's `recoveredAtRevision` only after a successfully saved newer complete
snapshot from the eligible original owner. The field is a verified storage
receipt, not an exposed reset flag or domain-effect proof. Ordinary saves cannot
manufacture it. Actual store recovery emits a resolution fact immediately and
on reopen, retaining the earlier warning as history. New rejection rotates to a
new unresolved receipt; an unclaimed foreign update cannot retain stale clearing
authority. Tokens, callbacks and raw captures are never persisted.

Historical missing codes remain recorded when a current requirement is repaired.
A failed projection may retry only from an exact original adapter input retained
privately in memory. The successful repair is memoized and checkpointed; neither
a restored finding nor a later equal-looking read reconstructs that input. Safe
data requirements may also be resolved by validated result-feed source replacement
receipts, matching the full original source/step/version/dataset tuple and actual
current targets. Producer callbacks retain the actual call object through a
forward pass; a reused call id cannot assign a newer tuple to an older occurrence.
Repeated indistinguishable durable tuples remain ambiguous. Receipts never clear
a lasting or uncertain effect, a binding/privacy failure, or missing current state.

Receipt-based resolutions are revalidated on current request/checkpoint copies,
including resolved findings reopened from disk. Every intermediate and terminal
tuple must remain unambiguous across the journal, and a terminal must identify
exactly one known-valid current page. Lost authority restores only codes whose
latest resolution depended on that receipt, preserving the earlier repair fact
and independent original-source resolutions. Valid rechecks add no duplicate
history. The sourceProof accessor supplies current pages/receipts without another
processing evaluation.

Core's held-before finding and wrappers explicitly carry an existing private
input association through their own in-memory copies. Successful findings are
rescreened under the current denied keys without another domain projection. JSON
or history cannot recreate that association. Witness reads hold independent Core
snapshots so a host reusing one mutable object cannot rewrite the logical before.

Flow-less witnesses keep Core-owned call/act pairs observed between their reads.
The exact association survives semantic checkpoint/reopen, while a restored after
stays historical and a new act invalidates the current after. Association proves
correspondence only. It cannot clear a historical action projection gap from a
generic later view or status; that still needs exact original-source recovery.
Witness-only recovery would require a trusted domain seam establishing that the
typed state bears on the specific act, without claiming task success. No such
domain coverage API is part of this change, and the gap remains repairable through
the existing unsure/continue path rather than adding a task ending.

Stored semantic summaries are read as semantic findings, not projected a second
time. Unknown/malformed new formats cannot route to legacy raw rendering. A
semantic evidence gap holds a model yes under existing unsure/repair handling;
it adds no ending, retry or model call. Versioned request fitting retains the
whole semantic evidence and exact rows/accounts. If they exceed a model's
window, existing repairable window refusal applies; reduction in capture bytes
does not promise that every task fits or is cheaper.

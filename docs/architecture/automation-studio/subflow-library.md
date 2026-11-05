# The subflow library

A project keeps a library of saved subflows, called parts in code and subflows to a
person. A part is an immutable, versioned, project-scoped graph with a card. A Flow can
find one, run one with inputs at no model call, and call one by a pinned version, and a
part can call another. A match only ever produces an offer: nothing runs without an
explicit tool call or a person.

Own parts stay as they were: a Subflow owned by one Flow at its latest revision. A top-level
Flow stays orchestration, and Call Flow stays as it is. The library is per project, and no
card reaches a shared prompt.

Where it lives, under `packages/fluxiq/src`:

| Path | Holds |
| --- | --- |
| `framework/persistence/automation/project/parts/` | The store and its migration |
| `runtime/project-parts/card/`, `trust/`, `shortlist/`, `guard/`, `marking/` | Pure derivation: the card, its trust, the offer, the refusals, the guidance |
| `framework/automation-service/service/project-parts/` | The capability the service holds (`service.projectParts`): list, get, save, run, shortlist |
| `framework/automation-service/service/project-parts/run/` | The one runner, its step gate and its re-checks |
| `framework/automation-service/service/project-parts/repair/` | Keeping a repair: the next version and the pin that moves |
| `engine/automation/frames/part-pin.ts`, `newer-part.ts` | A pinned call in the one execution path, and trying a newer version |

## What enters the library

The model marks parts as it writes a draft, with the `part` grammar it already has and a
generic line of guidance on what makes a good part (`runtime/project-parts/marking/`). A
person can also say "save this" (`save-project-part`), and only that can keep a primary
Subflow.

`saveProjectPartsOfAppliedFlow` writes them when a Flow is applied, and when an answer-first
attempt saves its draft. Its signature is stable. A library failure never undoes the Flow or
hurts the attempt: it shows on the build trace and is written again at the next save.

A part that cannot enter is a `skipped` entry with a stable reason, never a throw. Reasons
include a secret-shaped value, a step that acts with no classified consequence (fail closed),
and a cycle. **A lasting part holding a literal from the person's request is refused**, because
it is the worst false match: a part saved from "add the red shoes" passes every page check on
the wrong item. A control's own label is not such a literal: pressing "Save" when the request
says "save the job" does not refuse. The check reads a target's string leaves without naming
any domain's vocabulary, so a leaf that is a whole word of the request fails closed.

## The card

`AutomationStudioSubflowCard` in `@fluxiq/contracts/automation`: name, purpose, sites (exact
origins), inputs, outputs, fixed values, lasting classes, start and end checks by digest,
calls, shape hash, trust. **It holds no page text**, and a test with distinctive page strings
holds card, search index and facets to that. The check's real conditions stay in the version's
snapshot, because a fact's target is in the host's own form and its value may be a page literal.

The start check is the part's declared entry, else a `visible` fact over the first acting
step's own target. `exists` is not enough: a host answers `exists` true for a target matching
several look-alikes, and `visible` then answers `unknown`. A part whose first step opens a
written address needs only its exact site. A part with none of these does not run.

The shape hash masks values and ignores ids and labels, so a copy under other names is the same
part: an exact hash dedupes at save, and a different fixed value shows on the card instead.
A version remembers every graph it came from, so a judged run of any copy reaches its trust.

**Trust is derived at read, never stored.** It goes through `flow-change/confidence.ts`:
`unproven`, then `provisional` on a judged yes, then `established` after 2 zero-model runs. A
failure after the last success drops it. It reads judgement rows and `project_part_runs`,
which also carry a judged run of a pinned version with no graph revision. A pinned frame that
ran with a fix held in it earns its version nothing.

## Finding one

`list-project-parts` takes exact filters (site, input, output, lasting classes, trust, caller,
source) plus SQLite full text over name, purpose and port names. There are no embeddings: the
model already in the loop covers paraphrase. `get-project-part` adds step labels in plain words,
the calls tree, versions, and callers with their pin and whether a newer version passed.

All four library routes (`list-project-parts`, `get-project-part`, `save-project-part`,
`run-project-part`) assert the project's domain first and refuse a request naming another one.
A paired client's token route already checks this, so the routes matter for any other caller.
`service.projectParts` asserts nothing: a build and an attempt call it from inside their project.

**The shortlist.** The free opening look of a project build (`project.read_task`) or an
answer-first attempt gains `knownParts`, up to 5 cards, site first and then text, with no added
model call. An unproven part with lasting acts is never offered, nor is one whose lasting
classes were not asked for. `core.run_part` is offered only when the shortlist is not empty: a
project with nothing to offer gets no extra tool and not one more byte in a request.

## Running one

`run-project-part` and `core.run_part` share one runner with no model. Before anything is sent:
same site; every start condition true (`unknown` fails); required inputs present; lasting classes
within what was asked. A person running a part with lasting acts is told it will do them again,
and the run needs `acknowledgedRepeat`. Refusals are closed codes in plain words, with nothing
done. A project's runs that cannot be listed are refused as `parts.unavailable`, in plain words,
with the store's own message in the log, because saying another run has the page would be untrue.

A stop point on the run's control gate is asked before every step in every frame, because a
state route or an `on failed` route can reach a lasting step by an edge an inserted check node
is not on. The first no stops the run for good, so no retry gets past it. Before a lasting step:

1. Its classes are within what was asked, and the same permission gate as `core.run_node` answers.
2. Before the first lasting step, its own target is `visible`, zero-wait, plus its recorded route signature if it has one.
3. A step bound to a list row is re-checked before **every** press. The row is found again from
   the step that read it, by identity and never position or handle (the same re-find as a stale
   target), and its own control must be visible in that row. A row that is gone is reported gone
   with no press, and the rows after it are not tried. Called from a repeat without the row, a
   press stops unpressed (`row_not_handed`), and the model is told plainly why. A step that went by
   a link the page does not show to be this row's (`resolution.passRow: "page-level-link"`) leaves the
   page unknown, so the pass's next lasting step is not sent and the part stops there, naming the item
   (`row_left_behind`), as a saved Flow does (`answer_first.row_left_behind`). A later step that finds
   its row (`own`) takes this back, and steps that declare nothing lasting still run. The stop is an
   answer the attempt carries on from, not an ending.
4. In an attempt, the attempt's act record is asked at the door the lasting step passes, so an
   act done by hand is not done again through a part, and a part's acts are told to the record,
   so the first real run after the attempt does not repeat them.

A part run takes the host lease builds use, and the existing admission gate counts every active
session for it. While another run holds the page a part answers `part.run_in_progress`, and a
plain Flow run is refused at its start in the same words instead of failing partway. A build's
own call is that same run and is not refused, and for a build a refusal is a tool answer.

A run's answer is outputs by port id, a reference to its rows, the classes that landed, and where
it stopped: never per-step evidence.

## Pinned calls and nesting

`builtin.control.call-subflow` takes `part: { partId, version }` beside `subflowId`. A pin travels
as a Subflow id of its own form (`part:<id>:v<n>`), so the frame, boundary, retries, repair,
verification, `calledVersions`, the ledger and a trace's `subflowTarget` read it as they read a
sibling's. A graph source tries siblings, then the library at the pin. A candidate trial has the
library too. Depth is bounded at 8 and cycles are refused statically, at save and at run. Callers
are known through `part_calls`.

**A row across a call.** A part acting on one row of its caller's list declares `input: row`, and
the step that calls it inside `repeat over:` says `row: $row`. The press stays in that row, and the
re-find follows the row's identity across the frame to the step that read it. `row:` takes only
`$row`, and `$input.row` is refused. Handing a row two levels down cannot be written in the grammar.

`core.run_part` leaves one pinned call step in the draft, not expanded steps, so a task that ran a
part keeps it in its Flow.

## Repair isolation

A version never changes. A pinned part can be repaired in a run, and the fix holds for that run. On
a judged yes it becomes version N+1 and only the call steps that ran it move, through the normal
graph write. On a refuted, unjudged, cancelled or failed run nothing moves. A nested fix cascades:
each caller up to the Flow's step gets its next version, because that chain is what was judged. An
interface change is a new line, a new part id, with no automatic offer.

Other callers stay byte-identical and are told a newer version passed. When one next fails at the
part, it tries the newer version first, at no model call, through the one execution path, and moves
only after its own judged yes. A version whose last verdict is a failure is not offered, and a
version that failed in a run is not tried again in it. **It is never tried after a lasting act may
have landed**, because running a version runs it from its start. A pinned call that stopped at a
permission gate or an item gone asks no model. An unreachable judge is not a failure.

## What is not here

Detection during exploration: it needs recorded data that does not exist yet and generic pages
would match, so it waits on measured precision. The extension's screens are in
`apps/extension/src/panel/library/` over `@fluxiq/ui-components`.

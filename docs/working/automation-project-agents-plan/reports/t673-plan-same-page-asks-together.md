# t673 plan-same-page-asks-together: worker report

## Outcome

Done.

## What changed and why

`packages/fluxiq/src/programs/automation-studio/runtime/project-agents/supervisor/guidance.ts`:

- Step 1 (`HOW_TO_WORK`): removed "or split it into stretches that do not overlap". It now says parts are for
  separate things the person asked for, and that a search, find or open that only leads to an act is not a part of
  its own but belongs to the part of the act it serves. The verbatim-quote and no-overlap rules are unchanged.
- Step 2: asks carried out on the same page in one pass go in one subflow. Split into several only where a later
  act needs a value read earlier, or where stretches act on different pages and each can be built and tested alone.
  The existing "page left open is no value" sentence now adds "the page is the hand-off, so say it with after alone".
- Look sentence (was "The start page as the build found it is already in your evidence"): I checked this against
  `lab-runs/2026-10-16/run-mvan7giv-4246aafb/steps/0003-decide/request.txt`, the first `decide` step. The evidence
  holds only a `core.route_state` entry (`state.page.location`, `path`, `title`, `blockedBy`, `controls`, the
  control names) plus `project.read_task`. It holds no page view. The sentence now says: "Your evidence already
  holds where the build starts: the start page's address, title, what covers it and the names of its controls, not
  the page itself." `role-tools.ts` is untouched.
- `EXAMPLE` now begins with a one-part example (a library account: renew every loan due this week, which gives one
  subflow, renew_loans, with no ports) and a two-asks-one-subflow example (a community garden: book plot 14 for the
  spring season and join its watering rota while on it, which gives p1 and p2 in one subflow, book_plot, with no
  ports, and finding plot 14 belongs to p1). The lending-library two-subflow example follows unchanged, since it
  hands on a value that is actually read. I also added a t673 paragraph to the header comment and updated the
  comment that describes the example.

`.../supervisor/tests/guidance.test.ts`: one new test. It checks that step 1 no longer says "split it into
stretches", that the new step 1 and step 2 sentences and "the page is the hand-off" are present, that the old
evidence sentence is gone and "not the page itself" is there, and that all three examples' plan shapes are present.
It also checks that the example matches none of the scenario ids, their hyphen-split words, or cart, coupon, hub,
towel, earbud, friend request or pickup, each as a word start with a real `\\b`.

## Commands run and observed results

- `pnpm exec vitest run src/programs/automation-studio/runtime/project-agents/supervisor/tests` (in packages/fluxiq):
  `Test Files 25 passed (25)`, `Tests 163 passed (163)`.
- `pnpm run check` (packages/fluxiq, tsc --noEmit through the build cache): exit 0, `"reason":"inputs changed: packages/fluxiq"`, no errors.
- `pnpm structure:check` (repo root): `structure-audit: passed (389 warning(s), 1156 baselined).`

## Not verified

- Whether the new guidance actually makes the supervisor plan same-page asks as one subflow. That needs a live Lab run.
- Other workers own files in the same tree. The tsc and vitest results are for the tree as it stood when they ran.

## Open questions or contradictions found

- There is a defect in the existing test, which I left as it was. The check at `guidance.test.ts:34` builds
  ``new RegExp(`\b${word}\b`)`` inside a template literal, where `\b` is a backspace character, not a word boundary,
  so the scenario-word-split check never matches anything. When I fixed it to `\\b`, it failed on
  `refusals.resetRepeatedTest` ("undoing everything", which is the "everything" from everything-store). The same
  wording is also in `resetRepeatedEnd`. Fixing it means rewording those refusals or exempting common words. That is
  outside this brief, so I reverted the fix. The brief says the in-run repair test holds the same lists
  (`llm/harness/tests/in-run-repair-slot.test.ts`), and it may have the same bug. My new example check uses a correct `\\b`.
- The brief's line numbers (guidance.ts :115/:116/:129-134, role-tools.ts :116-123) did not match the tree. The
  actual lines were guidance.ts :89-90 and :103-108, and role-tools.ts :18-25. The content matched.

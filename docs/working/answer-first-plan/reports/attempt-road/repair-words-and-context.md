# t869 repair: unreadable replies, card words, context growth

Run read: `run-mw37vz9n-a77a02c2` (lab-runs/2026-11-04). Core worktree `fxwork/t869/!FluxIQ`. No paid call, no browser, no `dist` rebuild.

## Outcome

A and B repaired and proven provider-free. C is findings only. Narrow checks pass; the structure audit still fails only on files other workers own (listed below).

## A. Two `llm.provider_malformed_response` (steps 48 and 50, $0.1042 + $0.1093 = $0.21)

**What the model sent: not recoverable from disk.** An unusable answer is deliberately never logged (`models/providers/anthropic/messages.ts`, "an unusable answer stays unlogged", because JSON-text transport can reveal a credential only after decoding). `0048-decide` and `0050-decide` hold `request.*`, `meta.json` and a `decision.json` with `"reply": null`, and no `response.txt`. So the exact text is gone, as it was in the DeepSeek incident the `reply-account.ts` header describes.

**What was ruled out, from `meta.json` and the code:**
- Not a cut-off reply. The request sends `max_tokens: 128000` (`AUTOMATION_STUDIO_ANTHROPIC_MODEL_LIMITS`, `request-body.ts`). A `max_tokens` stop gives `llm.provider_output_truncated`, a different code, and 2,064 and 2,468 output tokens are far below the limit. Nothing is capped or lowered, and a new test asserts `max_tokens` stays 128000 after an unreadable reply.
- Not a stream fault before a bill was known. Usage (2,064 / 2,468 output tokens) was read from the final `message_delta`, so the stream finished.
- Output size is normal for this run: successful calls 43, 45, 52 and 56 produced 4,465, 2,120, 2,732 and 4,929 output tokens. Those counts include the model's thinking, which is why a 2K reply was not small.

**What remains possible, all inside `llm/anthropic/provider.ts` `parseAnswer` or `messages.ts`:**
1. The inner `result_json` text did not parse (the request was in JSON-text transport; the decision schema has arbitrary maps, so the whole decision rides as a string inside `result_json`, and a long escaped string is where a quote or bracket slips).
2. The reply held only thinking and no text block (`"Anthropic returned no answer."`).
The old code threw the same code for both and attached no account, so the loop's feedback to the model read **"Your previous reply could not be read: it could not be read."** (see `0049-answer-unusable/result.json`). That is the defect Core can fix, and did.

**What changed:**
- New `models/providers/anthropic/reply/` (barrel, one thing per file): `object-end.ts`, `case.ts` (names the damage by structure alone, from the closed case list), `json.ts` (tolerant read), `reading.ts` (`automationStudioAnthropicReadReply`).
- Repaired, because they add nothing to the answer and the value is still schema-checked and judged as the real decision: a Markdown fence around the object or around `result_json`'s text, a surplus closing bracket after the object, closing brackets short at the end (reusing DeepSeek's `automationStudioDeepSeekClosedContent`), whitespace around the envelope, `result_json` given as an object instead of its text, an answer encoded twice.
- Not guessed at, and refused as malformed **with an account** (`reply: { case, finishReason, contentChars, usage }`, never a word of the reply): prose before or after, a broken string or unescaped quote (`content_invalid`), a second key in the envelope, no object, empty text (`content_empty`, which is also what a thinking-only reply is now called).
- `messages.ts`: a reply with no text now carries `content_empty`; any other malformed failure with no case (stream breakage) carries `envelope_shape`. The model is now told, for example, "it was empty" or "the JSON did not parse: a bad escape, an unescaped quote, ...", through the loop's existing `llm_evidence_loop.reply_unreadable` feedback (`llm/unusable-decision.ts`, `models/failures/unreadable-reply.ts`). No model guidance was written.
- A repaired reply is one call: the same `usage` goes through once, `step.reply`/`step.succeeded` log it, and the harness judges it as any decision. An unreadable one carries `paid` so the purse charges the real bill and not the hold.

**Cheap retry, honest limit.** The retry is the loop's: it asks again after an unreadable reply with a short note (feedback is a few hundred bytes), up to 6 in a row. It still resends the whole context, so a retry is one more full call. I did not add an adapter-side multi-turn continuation (replaying the bad reply plus a short note): it would carry thinking signatures and the bad text into a new request, and the harness owns retries. What makes the retry cheap is the cache, and the cache is broken (item C): each retry pays about $0.08 of cache writes for context the failed call had just written. Fixing C makes a retry cost roughly its output tokens.

**Tests** (`llm/anthropic/tests/unreadable-reply.test.ts`, 15 tests, shapes built from the DECISION envelope with made-up words): six repairable shapes read as the real decision billed once; seven unreadable shapes each refused with the right case, `finishReason: end_turn`, `usage.outputTokens 30` and `paid` set, and the model's "said" words never the generic fallback; thinking-only reply is `content_empty`; `max_tokens` unchanged.

**Recommendation not done** (credential risk, a design call): keep the raw text of an unreadable reply in the step log after the credential screen, so the next incident can be read. Until then the account's case is the only evidence.

## B. Card words on `budget_out`

**Causes found.**
1. `judge.ts` wrote the same counts line into `checkedWhat` for every verdict: "5 rows, 3 acts on the site, once against what was asked for." The card put it under "What failed:" (refuted) or "Meant to check:" (unverified), which makes no sense for a count.
2. The act record screens an act's `what` as the control's name only ("Save"), and the item the press named was only hashed.

**Changes.**
- `result-verification/flow-less/judge.ts` (and the `checkedWhat` comment in `types.ts`): `checkedWhat` now follows the verdict. Yes: unchanged counts ("Checked: ..."). No: the check's own screened words (`readingWords`, same screen as the reason that goes to the model), cut to 450 characters at a word so a result's 500-character words rule never drops them whole; with none, what it looked at ("... did not come to what was asked for."). Unsure: what it was meant to settle ("whether 2 rows, 3 acts on the site came to what was asked for."). A no always carries words in practice (the verdict refuses a bare no), so that last fallback is defensive.
- `answer-first/act-record/item-words.ts` (new) plus `words.ts` (third argument) plus a small hunk in `record.ts` (re-read before editing; `gate/` untouched): the short words of the item an act was on, read from the press answer's `actedOnItem` / `actedOn` (`item 2/6 (£60, Round pine dining table, 90cm)` becomes "Round pine dining table, 90cm", skipping leading price-only segments, 70 characters at a word). They are put to the same person-words parser as every other act line and left off if refused. They are kept in memory beside the entry (a `WeakMap`) and shown by `acts()` and the refusals, **not persisted and not told to the model**: an existing test (`record.test.ts`, "carries no row value or page text in what it persists") and the file header require that, and it stayed green. The cost: an act restored from a persisted record (carry-on in a new process) says the plain control name, as before.
- `ui-components/src/chat/answer/model/result-parts.ts`: the checked line ignores an older stored count-only line under a failed or unsure label, instead of showing it. `result-headline.ts` `gotSummary` now says what was done too.
- `call-chain.ts` and `answer-first/result/**` needed no code change: the result writer already keeps a `checkedWhat` that passes the contract (a test now proves a refuted result carries the no's words, 3 item-named acts, and the missing line).

**Words, before and after, for the run's own ending (refuted, budget out).**

| Line | Before | After |
| --- | --- | --- |
| Check | Did not pass the check | unchanged |
| What the check said | What failed: 5 rows, 3 acts on the site, once against what was asked for. | What failed: *the check's reading*, for example "The rows come back dearest first. Asked for: cheapest first." |
| On the site | Save. / Save. / Save. | Save: Speckled mug, 300ml. / Save: Glazed fruit bowl. / Save: Blue milk jug, handmade. (page words are from a made-up site in the test; the real ones are whatever the listing's own lines said) |
| What I got | What I got: 5 rows. | What I got: 5 rows and 3 things done on the site. |
| Missing | Missing: The budget ran out before this was confirmed. | unchanged |

**Each ending.**
- Confirmed: "Checked" with a tick, and "Checked: 2 rows, 3 acts on the site, once against what was asked for." (unchanged, now tested).
- Refuted: above.
- Unverified after a check that could not tell: "Not confirmed. I could not confirm this, so please look to be sure." and "Meant to check: whether 2 rows, 3 acts on the site came to what was asked for." (before it was "Meant to check: 2 rows, 3 acts on the site, once against what was asked for.").
- No judge at all (`timesChecked` 0): "Not confirmed. I did not get to check this, so please look to be sure." and no check line (unchanged).
- A press with no nameable item keeps the plain control or class line ("Pressed a control that changed the page", "Changed something that was already there"); nothing is invented.
- Not changed: acts a forward run carries come through `act-record/mergers`, which I do not own, so they still say what their source said. If the written loop's rows show as "Save" on a future run, that is where to look.

**Lab reader.** `packages/test-runner/src/attempt-lane/live/answer-turn-dom.ts` (extension worktree) reads headline, kind, table, `.answer-site > .answer-line`, `.answer-site-list li`, `.answer-note`, `.answer-text-body`. None of those changed. `shown-answer.ts` keys act states off the prefixes "This may have happened", "Not done:" and the suffix ", then it was undone."; those are untouched, the item words only extend the middle of a line. The Lab never reads the checked, missing or got lines.

**Tests.** New: `ui-components/src/chat/answer/tests/ending-words.test.ts` (6), `act-record/tests/item-words.test.ts` (13), `flow-less/tests/judge.test.ts` (+2), `answer-first/result/tests/result.test.ts` (+1).

## C. Context growth (findings only, nothing fixed)

Source: the 51 `decide` steps that kept `request.json`. Chars are the request's own; tokens are that call's billed input times the part's share of the characters.

| Part | First (step 3, 19.8K in) | Middle (step 54, 50.2K in) | Last (step 120, 60.7K in) |
| --- | --- | --- | --- |
| System prompt + output config | 4.1K tok, 21% | 4.7K, 9% | 4.8K, 8% |
| Output schema (decision + completion) | 5.1K, 26% | 5.7K, 11% | 3.1K, 5% |
| Flow-bootstrap context and instructions | 3.7K, 19% | 4.5K, 9% | 4.6K, 8% |
| Tool list | 2.7K, 13% | 3.0K, 6% | 0 |
| Evidence: run_node results | 0.6K, 3% | 11.7K, 23% | 17.4K, 29% |
| Evidence: route_state (page-state snapshots, 22 of them) | 0.5K, 3% | 7.0K, 14% | 10.5K, 17% |
| Evidence: flow_draft | 1.6K, 8% | 5.3K, 11% | 7.5K, 12% |
| Evidence: describe_nodes, repeating-structure, find/describe | 0 | 4.2K, 8% | 5.8K, 10% |
| Evidence: current_view (kept page view) | 1.5K, 7% | 2.4K, 5% | 1.5K, 2% |
| Evidence: history, checks, budget, run_flow | 0 | 1.6K, 3% | 5.4K, 9% |

Growth is the evidence list, 4 entries at step 3, 39 at step 45, 67 at step 120. Of 51 calls, input rose 19.8K to 65.6K tokens. The fixed parts (system, schemas, tools, bootstrap) are about 16K and fall as a share.

**Cache is the larger finding.** Cached input costs a twentieth ($0.10 against $2.00 per million tokens on Sonnet 5.5), but across the 51 calls only **31%** of input tokens were cache hits (727K of 2,343K), and the hit count is a flat 15,125 from step 41 on, which is just the system prompt plus the part of the user message before the evidence. The rest of the context is rewritten into the cache on every call at 1.25x the input price ($2.50 per million): about $4.04 of this run's $4.76 decide spend is cache writes, $0.64 is output, $0.07 is cache reads.

Why: `cache-content.ts` puts a cache breakpoint at the end of the last evidence entry. In every consecutive pair I diffed (43/45, 45/52, 52/54, 98/100, 100/104) the first differing block is the entry near the end (`core.current_view` or `core.decision_check`, `core.flow_draft`, `core.evidence_history`, `core.budget`: snapshot entries that move to the end and change each call), while 80 to 85% of the characters before it were byte-identical. A cache entry only exists at the end of the previous call's last block, and that block differs, so only the first breakpoint ever hits.

**Recommendation (cheap and safe, not done).** Put the second breakpoint at the last evidence entry before that trailing run of re-projected snapshots, not at the final entry. Nothing the model sees changes, so the standing rule (never cut what it sees of the page) holds. Saving on this run: for each call, the identical-prefix tokens beyond the 15,125 already hit, repriced from write to read ($2.40 per million saved): **about $2.6 of the $4.76 decide spend (roughly 55%)**, an upper bound that assumes every call's stable prefix is found, with a 5-minute TTL not expiring. It would also have made the two failed replies and every retry cost mostly their output. Secondary, not recommended now: the 25.6K characters of 22 `core.route_state` snapshots repeat the page's control list per step; trimming them would cut what the model sees of the page, so it is out.

## Commands run and observed results

All in `fxwork/t869/!FluxIQ`, `--minWorkers 1 --maxWorkers 2`.
- `npx vitest run src/runtime/models/providers/anthropic src/runtime/llm/anthropic/tests src/runtime/result-verification/flow-less src/runtime/answer-first/result src/runtime/answer-first/act-record` (packages/fluxiq) -> 25 files, 416 tests passed.
- (final re-run of the anthropic paths after moving files into `reply/`) -> 4 files, 43 tests passed.
- `npx vitest run src/chat/answer src/testing/results src/chat/tests/answer-in-chat.test.ts` (packages/ui-components) -> 7 files, 80 tests passed; `answer-in-chat.test.ts` passed without a `dist` rebuild.
- `pnpm.cmd --filter fluxiq --filter @fluxiq/ui-components check` -> both Done (fluxiq: "not stamped, because inputs changed while it ran", other workers were editing; the tsc run itself passed).
- `node scripts/structure-audit.mjs` -> my files clean after moving `reply-*.ts` into `reply/` and giving the one deliberate catch a `best-effort:` reason. Remaining FAILs, none mine: `runtime/llm/node-tools/replay/replay.ts` (16 exported values), `framework/.../answer-first/completion/result-holds.ts` (reaches past a barrel), `framework/.../answer-first/tests/endings/saved-read.ts` (framework importing programs, three findings), `.../endings/tests/saved-on-every-ending.test.ts` line 71 (statement packing).

## Not verified

- The actual text of steps 48 and 50, and so which of the two candidate causes it was; only the case account in the next live run will say.
- Real `actedOnItem` strings from the live site: the item-words reader was built from `webLlmItemWholeWords`'s documented shape (`item i/n (line, line, ...)`) and tested on made-up words, not on a real listing. A listing whose first lettered line is not its title would be named by that line.
- The card in a real browser and the Lab's DOM read were checked by reading the code, not by a run.
- The cache-saving figure is an estimate from request diffs; no call was made to prove the new breakpoint hits.
- Forward-run acts (`act-record/mergers`, not owned) do not yet name their items.

## Open questions

- `checkedWhat` now means different things by verdict. The contract has one field, so I used it; a separate `failedWhat` in `@fluxiq/contracts` would be cleaner but is outside this brief.
- Whether to keep the raw unreadable reply in the step log (credential screen first).

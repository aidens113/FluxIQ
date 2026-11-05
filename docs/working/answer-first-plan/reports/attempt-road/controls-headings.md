# Controls line carries headings

## Outcome
Done. Extension only; Core untouched.

## Producer
`state.page.controls` is built in the Extension, `domain/src/runtime/route-state/project.ts` (`webAutomationRouteState`). Before: a Set-deduped, ` | `-joined list of control names. Now `project.ts` still picks and names the controls (its baselined deep imports stay), and hands `{name, heading}` to the new `route-state/controls-line.ts`, which writes the line. The heading is the capture's own `element.heading` (nearest preceding heading, already dropped when it only repeats the element's name or text, so `<h3><a>Name</a></h3>` gets no mark). The mark is in `route-state/control-mark.ts`: `[heading] name`, written before the first control it covers and again only where the heading changes. A name seen before is not rewritten, and neither is its heading. A heading's ` | ` is written ` / ` and its `]` written `)`, so it cannot split the line or close its mark.

## Form, real before and after (run-mw3itjcy, page of step 0054)
Before: `... | £350 Dining table, solid walnut, mid-century Upper Kelford | £30 Small dining table, drop leaf Brackwater | £55 White gloss dining table, 4 seater Hallam Cross`
After: `... | £350 Dining table, solid walnut, mid-century Upper Kelford | [Results outside your search] £30 Small dining table, drop leaf Brackwater | £55 White gloss dining table, 4 seater Hallam Cross`
That page's whole line gains 5 marks. The after text was built from the page view's heading lines in `page.txt`, because the logs hold no per-element `heading`. The code path itself is covered by the new test.

Generic note: none added. The `[...]` form reads as a label, and `paths.ts`'s description is untouched. A heading under the page's first group also gets a mark, so the line starts with `[Marketplace] ...` and so on.

## Cost (estimate, no paid call)
Method: the heading marks were counted on the logged pages. Each of the 15 `core.route_state` entries in the last request was matched to the page view of closest control names (match 0.93-1.0), a mark was counted at each heading change, and the same count was applied to every entry in all 37 `decide` requests. Characters became tokens at the run's own billed ratio: 3,933,602 request bytes against 1,412,086 billed input tokens, so 2.79 chars per token. There is no tokenizer here, so this is an estimate.
- Per `route_state` entry with controls: 41-88 characters, about 15-32 tokens, on entries of 800-1,700 characters (3-6%).
- Across the 37 requests: 17,592 characters, about 6,300 tokens, on 1,412,086 billed input tokens (0.45%).
- 82% of the run's input was cache hits (1,161,119 of 1,412,086). The marks sit in history entries that are identical call to call, so they stay in the cached prefix.
- Prices from `S/runtime/models/providers/anthropic/pricing.ts`. Haiku 5.5 is $0.10 input and $0.01 cache hit per MTok. Sonnet 5.5 is $2 input and $0.10 cache hit.

| Model | All 6.3k tokens uncached | At the run's 82% cache mix |
| --- | --- | --- |
| Haiku | $0.00063 | $0.00017 |
| Sonnet | $0.0126 | $0.0028 |

Against the Haiku run's billed $0.0729, the added cost is 0.2% to 0.9%.

## Consumers, and why each stays right
Every domain reader of the line goes through `webRoutePageFeatures` (`page-features.ts`), which now maps each entry through `webRouteControlName`. That function takes the mark off, so every hash and count is of the bare name, exactly as before. These consumers all read that function:
- `webAutomationRouteSignature` (`web-route.v1`, `controls` sketch and `count`). Core's route compare reads only this.
- Step effect: `sign.ts`, `holds.ts`, `seen.ts`, `layer-only.ts`.
- `self-changes.ts` and `plan-resolution/self-changing/names.ts`.

Unchanged heading text or a control moving between groups therefore cannot change a signature, and a new control still does (both tested).
- **State digest** (`state-digest`, `web-state.v7`): built from the packet's elements, not from this line. Untouched. It already carries `heading`.
- **Core loop detection and `no_progress`:** read `routeState.page.location` and the state digest, not the controls text. Core's `routing-context.ts` flattens the state to text for conditions but does not hash it. No Core code compares `state.page.controls`.
- **Replay and cache prefix:** `core.route_state` entries are recorded values. The line is a pure function of one capture (same bytes every time, tested), so history bytes do not move from call to call.
- **Element and control counts** (`structure/refusal.ts`, `controlsSeen`) count elements, not this string.
- **Collision:** a real control whose name starts with `[x] ` would have that prefix read as a mark and taken off. That happens equally on both sides of any comparison, so it cannot flip changed to unchanged between two pages.

**Saved Flow conditions:** a Router condition such as `state.page.controls contains "Sold out"` can now also match a heading's words. That heading is words a person could see on that page, but it is a behaviour change for old Flows, and I am saying so here.

## Tests
New: `domain/src/runtime/route-state/tests/controls-headings.test.ts` (9 tests): form; no-heading page reads as before; name once; separator and bracket safety; mark removal; signature and features equal with and without headings; a control moved to another group leaves the signature unchanged; a new control is still new; same bytes each time. Existing tests pinning this text: `route-state/tests/project.test.ts` (3 tests) passes unchanged. The other tests that join `controls` by hand (`signature`, `effect`, `seen`, `layer-names`, `self-changing`, `names`, `state-routing-run`) build lines with no marks and pass unchanged. Nothing needed its words moved.

Docs: `docs/architecture/page-evidence.md`, new paragraph after the state digest and route state paragraph.

## Commands run
- `DOMAIN_TEST_BUILD_LABEL=ctl-headings node scripts/test-domain.mjs runtime/route-state/ plan-resolution/ state-digest state-routing-run page-evidence-joinery host-runtime llm-evidence/structure node-run/` -> tests 1074, pass 1074, fail 0.
- `pnpm.cmd --filter @fluxiq-web-extension/domain check` -> refused: Core's build is not current (stale `fluxiq:build` and `ui-components:build`). Fell back to `npx tsc -p tsconfig.json --noEmit` and `npx tsc -p tsconfig.test.json --noEmit` in `domain`: both printed nothing (clean).
- `node scripts/structure-audit.mjs` -> `passed (244 warning(s), 552 baselined)`. The first try failed on a barrel-bypass import and then on an import cycle; fixed by giving `controls-line.ts` no evidence imports.
- Core, `npx vitest run src/framework/automation-service/route-state src/engine/automation/node-execution/tests/recorded-effect.test.ts src/runtime/llm/repeat-guard --minWorkers 1 --maxWorkers 2 --exclude "**/.tmp/**"` -> 24 files, 202 tests passed.

## Not verified
No browser or live capture: `element.heading` on real pages was not seen end to end, only on the logged page views. The dollar figures are an estimate. The real saved-Flow impact of the `contains` note is not measured. The Haiku run's heading-per-control mapping was approximated by name match, with 5-7% of names unmatched.

# Why attempt 1's steps were not saved as a Flow (run-mw4dsh8i-3fb9dc39)

## Outcome

Done (read-only investigation). Cause found by reading the code against the step files. Not reproduced by a test run.

## Cause

**The step that failed is not the typed name, a checkbox or a dialog control.** It is the press of one
link that the attempt used twice from two different pages: the page's back link "Saved"
(`link "Saved" ~/tamsin.reyes/saved/`). It appears under `[main]` as t594 on the All posts page
(`0012…/page.txt:17`) and as t818 on the new collection's page (`0026…/page.txt:17`). The draft
pressed it at draft step 7 (t594, `0014`) and draft step 14 (t818, `0028`).

Evidence:
- `0037-note`: "The draft was refused and kept as steps only: flow_bootstrap.evidence_completion_parameters_unresolved"
- `0039-note`: "... web.handle.ambiguous at plan.subflows.0.nodes.8.parameters, web.handle.ambiguous:parameters at
  plan.subflows.0.nodes.8.parameters, web.handle.ambiguous at plan.subflows.0.nodes.16.parameters,
  web.handle.ambiguous:parameters at plan.subflows.0.nodes.16.parameters"
- The draft (`0041-decide/request.txt:81`, `core.flow_draft`) keeps steps 1-14 and 17. Step 5 (t396), 7 (t594)
  and 14 (t818) are all `does: {target: "Saved"}`.

**Mapping nodes to steps.** Draft routing makes each interruption step (step 2 "Decline optional cookies" and
step 3 "Not Now") optional, with a Merge after it (`Core runtime/flow-authoring/bootstrap/authoring/draft-routing.ts:51-56`).
That moves every later node down by 2, so draft step 7 becomes node 8. Node 16 is 8 places later, and draft
step 14 is 7 steps later. No other pair of steps 7 apart presses the same control. One more node was inserted
somewhere between them, and I did not pin down where: the run keeps no locator.

**The code path.**
1. The code pair `web.handle.ambiguous` + `web.handle.ambiguous:parameters` (path `[]`) comes only from
   `domain/src/runtime/llm-evidence/plan-resolution/resolve-plan-node.ts:587`. That line handles a draft step whose
   parameters are already resolved (no handle to replace), so `stores.targets.absoluteIntent(...)` is asked, and it
   answered `ambiguous`.
2. Core passes no `onPage` for plan resolution (`Core runtime/llm/harness-options/plan/parameter-resolution.ts:417-418`
   sends only `handleReach`/`precedingSteps`; in the domain only `node-run/run.ts:307` sets `onPage`). So
   `location` is undefined and matches come from every page in view history (`target-packets.ts:420-423`).
3. `control-intents/absolute.ts:46-55`: the same back link (same selector and identity) was captured on two pages.
   `intentSource.key` includes the location (`control-intents/source.ts:25-29`), so `matches.size === 2`.
4. `absolute.ts:62-69`: lineage is read from the acted witnesses. Both presses recorded one: a click is not
   `webMovesThePage` (`node-run/start-location.ts:58`), so `run.ts:519` calls `targets.acted` for t594 and for
   t818, and `acted` is keyed by handle (`target-packets.ts:391`). That gives `witnesses.size === 2`, but line 68
   accepts only exactly one, so the result is `ambiguous`. Both nodes are refused the same way.
5. The two witnesses agree on meaning. A link with an href and plain wording is `{intent: "navigate"}`
   (`control-intent/collect.ts:31`), and so is every match. Nothing is actually ambiguous: whichever witness is
   picked, the answer is the same.

## Same as lane C's fix (af5b23723)?

**No, it is a different cause with the same refusal code.** Note that af5b23723 is in the downstream tree
`fxwork/t877/!FluxIQWebExtension`, not in Core.
- Lane C's case had **zero** witnesses: a press that met a person-only check never recorded its pre-act witness
  (`run.ts` catch path, `target-packets.ts` `acted`), so the saved press could not be resolved.
- This run had **two** witnesses for one control. No person-only check happened in attempt 1: every press in
  steps 0004-0028 returned `web.action.succeeded`. Lane C's patch adds witnesses, so it cannot fix this one.

## Proposed fix (least general, domain only)

`domain/src/runtime/llm-evidence/plan-resolution/control-intents/absolute.ts:62-70`: allow **several** acted witnesses
when they all name the control (`names`), none is shared or in conflict, all have a defined `controlIntent`, and all
agree with each other and with every match (`sameWebPlanControlIntent`). Sketch:

```ts
const intents = [...witnesses.values()].map((w) => w.controlIntent);
const agreed = intents[0];
if (agreed === undefined || intents.some((i) => !sameWebPlanControlIntent(agreed, i))
  || [...matches.values()].some((c) => !sameWebPlanControlIntent(agreed, c.controlIntent))) return { status: "ambiguous" };
return { status: "found", controlIntent: { ...agreed } };
```

Zero witnesses still refuses, as does any disagreement between witnesses or matches, so the rule against picking
the permissive annotation (resolution.test.ts:43, :80) still holds. Update the comment at lines 57-61 ("A second
acted source ... keeps the refusal closed") to say that a second source is refused only when it disagrees.
Rejected as broader: having Core pass each node's start page as `onPage`. That touches both repos and depends on
route signatures being present.

## Tests to add

In `domain/src/runtime/llm-evidence/plan-resolution/control-intents/tests/resolution.test.ts`. Use generic words,
following the existing "Open folder" style.
1. "the same control acted on from two pages with one meaning resolves": capture the control at location A and act
   on it; capture it at location B under a **different handle** and act on it; then
   `resolve(original.parameters, { handleReach: "view_history" })` should return `resolved` with
   `controlIntent: { intent: "neutral" }` (or `navigate` with an href) and the parameters unchanged.
2. "two acted sources that disagree stay ambiguous": one capture with `consent: true` and one without, both acted.
   The result should be `refused` with `web.handle.ambiguous`.

The host reuses packet numbering (t2 every time), and `acted` drops a second act on the same handle
(`target-packets.ts:391`). So `tests/host.ts` `capture` needs an option such as `leading?: number` that puts filler
elements first, so the second act gets a different handle, as t594 and t818 had live.
Run: an unlabelled domain test build, then that single compiled test file only. Do not run the whole package suite.

## Commands run

Read-only: `ls`/`grep`/`sed` over the run's step folders and the bundle, the Grep/Read tools over both t876 trees,
and `git -C fxwork/t877/!FluxIQWebExtension show af5b23723`. No tests were run.

## Not verified

- I inferred where node 16 comes from (the one extra inserted node), because no locator was saved. Draft step 7 →
  node 8 follows from the two interruption Merges.
- I did not reproduce the refusal in a test, or confirm that t594 and t818 have byte-identical selectors. I inferred
  it from matching text, href and place under `[main]`, and from two refusals rather than three (t396 differs).
- I did not test the fix.

## Open questions

- `absolute.ts:69` also refuses when the single witness has no intent while several matches exist. Every captured
  element gets an intent (`collect.ts`), so this looks unreachable now, but it would refuse silently if that changed.

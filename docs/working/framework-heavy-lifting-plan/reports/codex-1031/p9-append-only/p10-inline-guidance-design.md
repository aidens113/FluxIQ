# P10 inline guidance: first exact-byte slot

Outcome: Done (read-only design). Source inspected in the primary shipped t831 Core/Down checkouts. Only this private report was written; t830 paired tests remain frozen.

## Recommended smallest unit and explicit limit

Move exactly the three node-operation paragraphs at Core `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/plan/flow-script-format.ts:226-228` into web-authored guidance at their existing position. These are all active `web.dom.*` literals in that file. Keep the existing four example tails unchanged and independent. Use one named, typed insertion slot; do not parse, search, replace, or splice a rendered string.

This is a coherent first inline-guidance migration, not full P10 neutrality. Other Core paragraphs still contain client-specific inline examples and mixed prose (`extractList`, submit/form, cookie/consent and dialog facts). This unit must not claim that all four absent-metadata sections become fully medium-neutral. It makes the act section useful without web node-operation advice and preserves the existing grammar and safety elsewhere. Completing that larger goal requires separately reviewed slots at mixed-sentence boundaries; moving those whole paragraphs would also move Core-owned rules. Recommendation: land this one gap first, with that scope stated explicitly, then design the mixed clauses separately. Do not expand it into CC11 classifier, fact parser, vocabulary or fingerprint behavior changes.

## Stable proposed host contract

Add a separate optional binding property, `flowScriptGuidance?: AutomationStudioFlowScriptGuidance`, with this closed v1 shape:

```ts
export type AutomationStudioFlowScriptGuidance = {
  readonly version: string;
  readonly act?: {
    readonly controlOperations?: readonly string[];
  };
};
```

`act.controlOperations` is the only slot in this unit. It describes how this client's registered operations set or choose controls. It has no node dispatch, effect, permission, retry, order, before/after, index, grammar override or replacement field. `version` follows the existing authored metadata revision pattern; web supplies `web-guidance-1`. The closed contract shape is v1, independently of the author's revision string. Do not select behavior from domain id, example text, example version, node-name guessing or system instructions.

The explicit public calls become:

```ts
renderAutomationStudioFlowScriptFormat(examples?, guidance?)
automationStudioEvidenceFlowBootstrapCompletionSchema(size?, examples?, guidance?)
assertAutomationStudioFlowScriptGuidance(value: unknown, domainId: string)
```

Existing argument positions remain valid. `AutomationStudioFlowScriptExamples` and `renderAutomationStudioFlowScriptExamples(grammar, examples)` remain unchanged. Old callers that supply only examples get generic Core act rules plus their examples, with no inferred operation guidance. The web binding supplies both companions to preserve its old prompt. This optional host-authored contract is the only new public surface; no public helper is needed for test access.

## Exact placement and source ownership

Number the current eight act paragraphs `A0..A7` in their source order. The renderer owns this immutable sequence:

```text
Core A0 (line224: choice is the state it leaves)
Core A1 (line225: exact observed ensureState)
slot act.controlOperations (zero or more complete paragraphs)
Core A5 (line229: optional steps, never required acts)
Core A6 (line230: way out, consequence refusal, consent exception)
Core A7 (line231: final checks and observed readiness)
```

Web metadata supplies exactly `[A2,A3,A4]`, copied as literal values with no wording, whitespace, punctuation, escape or Unicode changes:

| Current complete source string | Slot member |
| --- | --- |
| line226, starts `An option in a dropdown is`, ends `check the swatch or chip itself.` | index0: select/check parameters, observed chosen state and hidden-control warning |
| line227, starts `Every option the instruction asks for`, ends `apply, add, send, open, next.` | index1: check/select idempotence and the click distinction |
| line228, starts `To set a box to a value`, ends `the typing step alone sets it.` | index2: type replaces a field; no preliminary clear |

Put Core's five retained paragraphs in one focused internal renderer, proposed `runtime/flow-bootstrap/script-guidance/render-act.ts`. `plan/flow-script-format.ts` keeps its historical exported act constant by calling that renderer without guidance. `script-examples/render-format.ts` calls the same renderer with explicit guidance and then uses the existing example-tail renderer. The internal act helper is exported through its owning directory barrel for Core consumers but excluded from the public outer export list. The guidance type and assertion are public through an explicit export from `flow-bootstrap/index.ts`; the existing runtime/program public barrels already forward that barrel.

The act renderer joins the ordered paragraph array with exactly one LF between entries. An omitted slot or `[]` contributes no paragraph and no separator. An explicitly authored empty paragraph (`[""]`) contributes one blank paragraph, as the existing example metadata permits; do not normalize it away. This preserves literal text without allowing callers to choose positions. Do not retain `[A2,A3,A4]` as a Core compatibility fallback, duplicate `[A0,A1,A5,A6,A7]` downstream, or reconstruct the split from a string constant at runtime.

The byte invariant is direct:

```text
oldAct = join([A0,A1,A2,A3,A4,A5,A6,A7], LF) + LF + join(webActExamples, LF)
newAct(webGuidance, webExamples) = exactly the same ordered string values and LFs
```

The other three Core prefixes and all four original example arrays are unchanged. No whitespace conversion, trimming, sorting, deduplication or JSON round trip is part of rendering. The full completion factory currently uses only the `format` section (`plan/evidence-schema.ts:54`), so its full web digest remains unchanged too; still pass the explicit companion through its factory for a consistent public rendering boundary.

## Safety and absence semantics

Core always emits its five retained act paragraphs, the full generic consequence rule in the main format section, and all existing retry/lasting-action rules and runtime gates. Guidance cannot remove or replace them. It does not classify controls, admit actions, attest repeat safety, alter capsule proof or bypass permission. No parser, executor, registry or saved-plan contract changes.

Host text is still text and can semantically contradict other text, just as existing trusted system instructions/examples can. The structural guarantee is that no slot can replace a Core rule; runtime authorization remains authoritative. Do not claim that a string validator proves semantic safety or let model-authored values populate this host property.

Absent binding metadata, `{version}`, `{version,act:{}}`, and `{version,act:{controlOperations:[]}}` all render the same generic act section. No web fallback is inferred even when examples are present. This unit does not silently change the default format/loop/state wording or the consent/fact semantics in their current Core owners.

Invalid supplied metadata fails before a build, through the same checked-binding boundary used by t831, even when examples and system instructions are absent. Reject unknown keys/symbols at each level, inherited metadata, nonplain objects/arrays, accessor fields, holes/extra array entries, nonstring data, malformed revisions and control characters except LF. Retain exact text in fresh frozen records/arrays. Use the existing authored-metadata bounds (64KiB UTF8 total and 4096 paragraph entries) independently of the system instruction bound; never truncate. Binding `undefined` means absent; an explicitly supplied malformed nested field is invalid. Direct JavaScript callers must pass asserted metadata to the public typed renderer; document that the pure renderer is not an untrusted-input admission gate.

Extend `llm/domain-instructions/binding-check.ts` with an own-data-property check for the new companion before reading it. Extend `binding-snapshot.ts`'s metadata input, exclusions and installed immutable fields so later caller additions/mutation cannot change the checked binding. Preserve the current receiver binding of callbacks/accessors for class-based domains. The service constructor and `bindLlmEvidenceRuntime` already use this checker; no `service.ts` edit is necessary.

## Consumer propagation and phased ownership

| Phase / file owner | Exact paths and responsibilities | Acceptance owned there |
| --- | --- | --- |
| 1 Core metadata | New `runtime/flow-bootstrap/script-guidance/{contracts,validate,index}.ts`; `llm/harness-options/binding.ts`; `llm/domain-instructions/{binding-check,binding-snapshot}.ts`; explicit public outer exports. Freeze the shape and renderer signatures above before other dispatch. | New owning guidance validation tests; extend `domain-instructions/tests/examples-binding.test.ts` or a new adjacent guidance binding test for absence, getters, mutation, independent instances and both real service storage paths. Keep class receiver/private-state regressions. |
| 2 Core formatting and consumers | New `script-guidance/render-act.ts`; `plan/flow-script-format.ts`; `script-examples/render-format.ts`; `plan/evidence-schema.ts`; `candidate/authoring-loop.ts:83,128`; `subflow-candidate/builder-loop.ts:324`; the binding Pick in `llm/harness-options/bootstrap-completion.ts:273`. Outer barrel edits remain lead-owned and serial with phase1 index changes. | Guidance placement/safety-invariance tests; `plan/tests/flow-script-format.test.ts`; existing `script-examples/tests/examples.test.ts`; real candidate/subflow schema-capture cases in `candidate/tests/authoring-loop.test.ts` and `subflow-candidate/tests/builder-loop.test.ts`. |
| 3 Down payload and real binding | New `D/runtime/llm-evidence/script-guidance/{act,guidance,index}.ts` with exact three strings and typed metadata; actual `D/runtime/llm-evidence/tools.ts` supplies it. Example arrays and system instructions are untouched. | New owning guidance/binding tests, public SDK imports only. Existing `script-examples/tests/support.ts` and `tests/{parity,candidate-schema,act,records,state}.test.ts` render with both explicit companions; saved/parser/oracle bodies remain intact. |
| 4 Lead paired acceptance | Refresh actual public SDK only after Core freeze; run owning checks on a stable tree, then the paired unit's documented type/structure gates. No full/provider/browser sweep is implied by this design. | Original four pins and completion digest unchanged; actual web binding and actual candidate submit schema carry both companions; Core subflow capture proves its real private consumer without a private Down import. |

The `bootstrap-completion.ts` binding Pick is a genuine transport dependency: `AutomationStudioFlowCandidateSubmissionController` derives its input from completion input, and the private subflow builder derives its submission binding through the scoped controller. Extend that existing path so the real subflow formatter can read the new companion; do not add new controller/public APIs solely to reach tests. Existing callers already pass the actual binding object, so no new model decision or provider call is needed.

Phases1/2 share the new owner barrel and run serially there. Down source can be authored after the interface freeze; its checks wait for the fresh SDK. Tests remain beside each owner and no baseline/public export growth is justified solely for fixtures.

## Required byte and behavior proof (planned, not run)

Keep the exact existing Down pins in `script-examples/tests/parity.test.ts`:

| Section | UTF8 bytes | SHA256 |
| --- | ---: | --- |
| format | 6154 | `71df264a2c345227a15f9bf5955ed35169619552210336e664f86b06e005ec67` |
| act | 3916 | `2290b5399c44fb4100400e88cd40394fe800258eb0484eef2438ef6250626697` |
| loop | 8808 | `6713cc27611efe0e4b941492cfbf3b82c95ad43a01851e53c8f85503f20323bd` |
| state | 7451 | `1f691ad3d071deee2e5271e3fd74679eae754d819282273cfb40fd3c979ba2e4` |

Full completion JSON digest remains `02c766712576f5d8a7bf6cf539e951644b0fa8b3a3978293fadeb3e8cc529147`. Change only the calls to pass the explicit web guidance; never regenerate these expected hashes to accept a discrepancy.

Core tests must prove the exact insertion point with distinct client markers, no automatic guidance from examples, no slot replacement of retained Core rules, meaningful absent guidance, exact empty/LF behavior, mutation isolation, malformed metadata rejection, and actual candidate/subflow consumer transport. A marker saying something contrary to permission must not erase Core's mandatory text or alter runtime permission options. Do not treat that as proof the model obeys either sentence.

Down must continue all eleven generic worked examples through the actual public handle resolver, parser, acceptor, candidate/subflow ownership and strict saved graph validators, including the three missing-source negatives. Copying the advice does not alter those scripts or their expected graphs. Keep current candidate wrapper text and the subflow brief wrapper/order unchanged. Test the actual runtime's supplied metadata, not only standalone constants; no fake authority or Core-private import.

Validation performed: targeted read-only `rg`/`Get-Content` inspection of current renderer, metadata validation/snapshot, binding/consumer sites and accepted byte-pin tests. No code/tests, builds, typechecks, audit, git, browser or provider calls ran. The byte invariant above is a design argument, not a newly measured hash result.

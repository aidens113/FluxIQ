# Report: fhl-core-client-seam

Read-only. Core root `C/` = `!FluxIQ/packages`; `AS/` = `C/fluxiq/src/programs/automation-studio`; `R/` = `AS/runtime`; `HO/` = `R/llm/harness-options`; `CT/` = `C/contracts/src`. Web root `D/` = `!FluxIQWebExtension/domain/src`. Lines come from grep/excerpts; nothing was run. Wave-2 claims are quoted from the six Core reports and `fhl-domain-surface.md`, not re-verified.

## Outcome
Done. Three findings:
1. **The seam is already mostly generic and mostly optional.** Core declares two client-facing ports: `AutomationStudioHostRuntimeBoundary` (`R/host-runtime.ts:88-222`, run time) and `AutomationStudioLlmEvidenceRuntimeBinding` (`HO/binding.ts`, build time). Almost every member is `?:` and documented as "missing = unknown, never false/failed" (`factEvaluator` :193, `actLanded` :206, `reacquireTarget` :215). Core already degrades correctly for absent members; new contracts should copy that rule.
2. **Of the ~12 contracts the wave-2 reports propose, 5 are reuse (extend an existing type), 4 are additive fields on existing reads, 3 are genuinely new.** The data mostly exists as opaque `JsonObject` that Core "never reads inside" (`stateDiff`, `startState.state`, route signatures). The work is giving Core a typed, optional slice to read, not a new channel.
3. **Client concepts in Core are concentrated in five places:** the model-facing script format (`flow-script-format.ts`, 57 `web.*` ids), three English word lists (`kind-words.ts`, `way-out-steps.ts`, `instruction-ask.ts`), the `dialog` fact/layer vocabulary, DOM-shaped fields on the fingerprint/target model, and message-text transient detection. Each has a clean move-to-client or move-to-contract target (section 3).

## Seam today

### Run-time port: `AutomationStudioHostRuntimeBoundary` (`R/host-runtime.ts`)
| Member (line) | Reports to Core | Web implementation |
|---|---|---|
| `capabilities` (:89) closed ids `action-dispatch, state-snapshot, state-diff, wait-observe, rollback-hint, expectation-evaluation, fact-evaluation, route-state` (:8-17) | what the client can do | `D/runtime/host-runtime.ts:~180-296` |
| `observeRouteState` (:107), `routeStatePaths` | opaque `JsonObject` of "where a run stands" | `webAutomationRouteState` (`host-runtime.ts:~258`) |
| `signRouteState` / `compareRouteSignatures` / `signRouteEffect` / `routeEffectHolds` / `routeEffectSeen` (:117-150) | hash-only pre/post signatures, effect seen / not_seen / unknown | `D/runtime/route-state/`, `effect/seen.ts:37` |
| `captureStateSnapshot` (:151), `inspectStateDiff` (:176) | opaque diff; Core reads only `spot {item,dialog}` and `items {before,after}` | `webAutomationStateDiff`, `webStateDiffPlaces` (`host-runtime.ts:277`) |
| `factEvaluator` (:193): `{fact, op, value?, target?}` -> true/false/unknown | any condition Core cannot judge itself | `createWebAutomationFactEvaluator` (`host-runtime.ts:182`) |
| `actLanded` (:206) landed/not_landed/unknown | did a lost-answer act take effect | `D/runtime/act-landing/` |
| `reacquireTarget`, `returnToSourcePlace` (:215-221) | find a stale item again by identity | `D/runtime/target-reacquire/reacquire-target.ts:19` |
| `hostResources` (:~96) | leases (browser context, device) | web adapter |

### Build-time port: `AutomationStudioLlmEvidenceRuntimeBinding` (`HO/binding.ts`)
| Member (line) | Meaning |
|---|---|
| `startState` (:72) | read the target without acting: `{state, differs[], location, lines{gone,added}, items[], subjects[], collections[], scope, resource, controls{place:{token:count}}, values{place:token}}` -- the type is `AutomationStudioSiteResetRead` (`R/flow-bootstrap/site-reset/contracts.ts:168-196`). Web: `D/runtime/llm-evidence/start-state/` (`state.ts:7-25` keeps `lines`, `items`) |
| `observeResult` (:80), `captureStateDigest` (:331), `captureSanitizedFailureEvidence` (:358) | passive end view; per-call state digest; screened failure evidence |
| `clearedControlHandles` (:100) | turn a layer's opaque `wayOut` into a handle |
| `deniedEvidenceKeys` (:163, required), `observedStateKeys` (:182), `rowContextKeys` (:195), `readRowsKey` (:205) | the client names which keys of its own results are raw payload / the target view / row context / rows |
| `systemInstructions` (:135), `describeCall` (:143), `classifyRefusal` (:286) | the client's wording and refusal classes |
| `runsNodes` (:223), `tools` (:206), `executeTool` (:287) | the client's tools and node runner |

### Result-side records the client already sends
- **Failure record** (`CT/failure/record.ts`): `category` (closed 16, `adaptive-class.ts`), producer-owned `code`, `retryable`, `stage`, `effect: unacted|ambiguous`, `retryAfterMs`, `certainNoEffect` (record.ts:~55). Web: `D/runtime/failure/codes.ts`, `D/runtime/adapter.ts:264`.
- **Cleared layers** (`R/executor/node-execution/cleared-layer.ts:13-50`): `kind` closed `consent|rate_limit|promotion|assistant|dialog`, `control`, `name`, `controlName`, `wayOut`, `wayOutDefinitionId`. Read from a dispatch payload `clearedLayers` (`cleared-layers.ts:26,42`). Web: `D/actions/types.ts:603`, `D/client/gateway-mapping.ts:324-362`, `D/io/gateway-output-dispatcher.ts:90`.
- **Reads / witnesses**: `AutomationStudioSiteResetRead` above; per-act `AutomationStudioSiteResetPlace` (`contracts.ts:~226`: `state, location, changed[], collections, lines, created[], values`); `AutomationStudioSiteResetChecks.compare/compareAt/lookAt` (:~250).
- **Element identity**: `AutomationStudioElementTargetFingerprint` (`AS/model/action-element-target.ts:6-30`) and the scorer `AS/fingerprinting/element-fingerprint.ts`; the `drawing` digest is already opaque (Core never compares it).
- **Record typing**: `AutomationStudioRecordField.valueType` = `string|number|boolean|url|datetime|json` (`CT/record-sets/schema.ts:2-4,25-33`); `primaryKey` (:40-46); condition bounds `atLeast|atMost|lessThan|greaterThan` and sort type `auto|number|date|text` (`CT/record-sets/process/processing-vocabulary.ts:20,26`); dedupe `by` (`row-identity.ts`).
- **Gateway wire** (`CT/client-gateway.ts`): `ClientGatewayClientType = extension|desktop-recorder|cli|worker|custom` (:~22), capabilities by `kind`, recording events with an open `payload/target/metadata` JSON. `AS/client-gateway/bridge.ts` maps them to recordings; `R/io-bridge.ts` turns IO inputs into recording evidence by role `state|action`; `R/adapters.ts` is the generic adapter registry (`captureObservation`, `executeAction`, `stateSchemas`). All domain-neutral.
- **Panel capabilities** (`R/panel-capabilities/capability.ts`): a carrier for the control panel's own vocabulary, not a client seam for the automated medium.

## Proposed contracts (reuse or new, shape, web source, non-web source, default)
Rule for all: every field optional; absence reads as `unknown`, i.e. exactly today's behaviour; a malformed value is dropped like `parseAutomationStudioFailureRecord` drops it. New data rides inside an existing read where one exists.

**C1. Typed fields.** *Extend.* `valueType` has `number`, `datetime`, `string` already; missing: `currency`, `count`, `date`-vs-`datetime`, `format`. Sketch: `FieldType = "text"|"number"|"currency"|"count"|"date"|"datetime"|"url"|"id"|"flag"` on the detection field and the record field (`valueType` stays; add `type?` and `parsed?` sample). Web: label shape today (`apps/extension/.../value-shape.ts`, `D/structure/field-sample.ts`); add `type` to the list packet (`D/structure/packet.ts:127-215`). Desktop/API: a column's declared type (table cell type, JSON schema type). Default: absent -> Core infers from sample values with the existing readers (`read-number.ts`, `read-date.ts`); no warning, no refusal.

**C2. Per-item marks.** *New.* Sketch: `item.marks?: { [markId]: "on"|"off"|string }` with `fieldMarks?: { id, label, kind: "badge"|"flag"|"state" }[]` declared once per list (a mark is a row-level attribute that is not a text cell: a badge, a flag, a "sponsored" label). Web: icon/badge/class state read by the page picker. Desktop: row icon / checkbox column. API: boolean fields (`is_sponsored`). Default: none -> Core separates kept/left-out by text cells only, as now.

**C3. Row identity.** *Reuse + one field.* `primaryKey` exists on the record schema and dedupe `by` exists. Add `rowIdentity?: string[]` on the detected list (field ids, e.g. link target, id) and a stable per-row `itemKey` token. Web: link destination/`identity:"tracking-free"` (`D/actions/extraction/request.ts:75`), reacquire's `row-key-columns.ts`. API: primary key. Desktop: row id. Default: whole-row key (current).

**C4. Act effect record with inverse.** *Extend `inspectStateDiff` output + `AutomationStudioSiteResetPlace`.* Sketch: `effect?: { class: "observe"|"state"|"commit"; places: {place, before, after}[]; placeChanged?: boolean; inverse?: { action, control, toState } | { kind: "irreversible" } }`. Core already reads `spot`, `items`; `values`/`controls` exist on reads; what is missing is the per-act pairing and `inverse`. Web: toggle signature, `layerCleared`, location move (`D/actions/toggle-signature/`, `D/runtime/llm-evidence/control-spot/`); a counter delta is not recorded yet. Desktop: control-state before/after from the accessibility tree. API: request method + resource id (POST created id -> DELETE). Default: no effect record -> declared `consequences` stand, model-written `undoes` stays the only pairing (today).

**C5. Witness reading of any region.** *Reuse.* `AutomationStudioSiteResetRead.values: Record<place, token>` and `controls` already carry non-list regions (`contracts.ts:~190`). Change is Core-side (a `value`/`region` delta kind in `trial-change/delta.ts`), not a new client field. Web emits it (`D/.../start-state`); desktop: any named widget value; API: a field of a GET response. Default: unread side proves nothing (existing rule).

**C6. `landing` witness.** *Mostly new Core semantics, one client field.* `placeChanged` (C4) plus `location`/`resource` on the read (exist). Sketch: `landing?: { from: string; to: string; marksDiffer: boolean }`. Web: `locationChanged` vs `documentChanged` from the state diff (`R/state-diff`). Desktop: window/screen id change. API: not applicable (default: never a landing).

**C7. Obstruction / interruption layer with dismiss controls.** *Extend `AutomationStudioClearedLayer` and the failure record.* Sketch: `obstruction?: { id?: string; name?: string; kind: "overlay"|"notice"|"rate_limit"|"assistant"|"other"; covers?: targetRef; dismiss: { controlRef: string; definitionId?: string; intent: "dismiss"|"accept"|"neutral"; action?: "back" }[] }`, sent on a covered or failed attempt and as a standing view fact, not only after a close. Today `kind` is a web list (`consent|promotion|dialog`), the fact is `dialog <role> "name"`, and `intent` is guessed from an English list. Web: actionability gate `covered` + closers (`apps/extension/.../actionability.ts`), `layerCleared` (`D/runtime/.../cleared-layer.ts`). Mobile: sheet/alert with a system-back dismiss (`action:"back"`). Desktop: modal window. API: not applicable. Default: no obstruction -> English fallback list stays (section 3), no handler built.

**C8. `rate_limit` signal.** *Reuse.* Failure record has `retryable`, `retryAfterMs`, `effect`; `rate_limit` is a layer kind. Add `transient?: true` on the record so Core stops parsing `RETRY_LATER` (section 3). Web: `web.action.rate_limited` (`D/actions/extraction/summary.ts:143-183`). API: HTTP 429 + `Retry-After`. Desktop: busy/not-responding flag. Default: unset -> cautious (not transient), the node/undici codes stay.

**C9. Stateful-control flags.** *Reuse + additive.* `controls: Record<place, Record<stateToken, count>>` on the read and `ensureState`/toggle signature exist. Add on each control in a view/lookup: `stateful?: true; state?: string; idempotentWith?`. Web: `checked|pressed|marked` tokens + toggle-signature (`D/.../state-tokens.ts`); class/name-driven flips learned after a press. Desktop: checkbox/toggle pattern. API: not applicable. Default: control treated as stateless; no `ensureState` written.

**C10. Actionability.** *New on the dispatch result; the failure record covers the failed case.* Sketch: `actionable?: { ok: boolean; reason?: "hidden"|"disabled"|"covered"|"offscreen"|"busy"; coveredBy?: obstructionRef }` beside `failure.code`, reported before an act is attempted (look time) and on failure. Web: `actionability.ts` (visible, enabled, hit-test). Desktop: UIA enabled/offscreen. API: not applicable (always actionable). Default: absent -> Core attempts and reads the failure record, as now.

**C11. Control intent.** *New.* `intent?: "dismiss"|"accept"|"neutral"|"navigate"` per control at look time (replaces `way-out-steps.ts` word lists). Web: icon + label + layer position, language-aware. Default: absent -> keep the English fallback.

**C12. Declared action effect class.** *Reuse.* `ActionDefinition`/`registered output` already carries `consequences` and `idempotentWith` for web nodes (`webPlanStepMustDeclare`). Generalise as `effect: observe|state|commit` per action kind in the adapter's `actionDefinitions()` (`R/adapters.ts:22`), already a generic seam. API clients declare it per endpoint; desktop per command. Default: undeclared -> model declares, as now.

**Reuse tally.** C3, C5, C8, C12 reuse; C1, C4, C7, C9 extend existing types; C2, C6, C10, C11 are new.

## Client concepts in Core
Priority P1 = blocks a non-web client from working; P2 = misleads the model; P3 = cosmetic.

| # | Concept | file:line | Move to | P |
|---|---|---|---|---|
| 1 | Script format teaches `web.dom.*` / `web.browser.navigate` node ids in 57 places (EXAMPLES, rules about "the page draws itself", "box", "dropdown") | `R/flow-bootstrap/plan/flow-script-format.ts:217-461` (grep: 57 hits); also `plan/issue-feedback.ts` (4), `service/candidate-trial/feedback.ts` (2), `llm/repeat-guard/outcomes.ts` (2), `llm/harness/locator-text.ts` (2), `candidate/submission-refusal.ts` (2) | Format becomes Core-generic grammar; node ids and medium examples come from the client's `systemInstructions` / node descriptions (`binding.ts:135`, `nodeDescriptions` :551). Examples stay in another kind of site (teaching-to-test rule). | P1 |
| 2 | English accepting-word and lead lists deciding which dismiss control is "an offer" | `R/flow-bootstrap/script-statements/way-out-steps.ts:73,75` (`ACCEPTING_WORD`, `ACCEPTING_LEAD`), `:71` close-glyph regex | C7/C11: client `intent`; keep as the fallback inside the web domain's fact evaluator or a client-supplied classifier, not Core | P1 |
| 3 | Commerce act-kind word lists (cart, basket, coupon, wishlist, bid, checkout) | `R/flow-bootstrap/instructed-acts/kind-words.ts:4-11`; `instruction-acts.ts:78` (`PLACE` regex "saved jobs / watchlist"), `act-object.ts:50` | Per-client act vocabulary supplied through the adapter / binding (new optional `actVocabulary` on the binding); Core keeps only the generic kinds (`save, set, move, open, submit`) | P2 |
| 4 | Instruction reading terms ("csv", "scrape", "spreadsheet", "table of") | `R/flow-bootstrap/answerability/instruction-ask.ts:50-57` | Mostly generic (record-set asks apply to API clients too); keep in Core but make a locale-keyed table; not a client concept | P3 |
| 5 | `dialog <role> "name"` fact, `LAYER_FACT = "dialog"`, `{kind:"dialog", role, name}` target | `R/flow-bootstrap/script-statements/fact-condition.ts:95`; `R/service/runtime-session/interruption-handler.ts:40`; `R/flow-bootstrap/plan/contracts.ts:125`; `R/llm/harness-options/plan-fact-targets.ts:17` | Rename to `obstruction` with the C7 identity; web evaluator maps it to dialog roles | P1 |
| 6 | Closed layer kinds `consent|rate_limit|promotion|assistant|dialog` | `R/executor/node-execution/cleared-layer.ts:13` | Generic `overlay|notice|rate_limit|assistant|other` (C7); the web domain maps its classifier | P2 |
| 7 | DOM identity fields in Core's model: `selector, xpath, queryPath, tagName, role, classNames, testId, attributes, url` | `AS/model/action-element-target.ts:6-30,152-166`; `AS/fingerprinting/element-fingerprint.ts:15-16,66-68,102-104,168-170,222-257,297-307` (weights for selector 14 / xpath 11); `AS/model/actions.ts:58`; `AS/model/state.ts:15-35` (`StateElementKind` "selector", "url", "route") | Keep an open `signals: Record<string, {value, weight}>` (Core scores, client names the signals); move the DOM key list and weights to the web domain; `drawing`/opaque digest is already the right model | P2 (structural; Core has no selector executor, only storage and scoring) |
| 8 | Transient / retry detection by message text | `R/llm/repeat-guard/retry-later.ts:7` (`RETRY_LATER` regex: rate limit, busy, loading, disabled), `R/executor/defensive/thrown-error.ts:43,214` (`TRANSIENT_PHRASES`) | C8 `transient` flag on the failure record; keep node/undici codes (these are API-client codes, legitimately Core) | P2 |
| 9 | Synonym tables tying "link/href/address/page" to `url` | `AS/nodes/name-match/synonyms.ts:55`; `R/flow-bootstrap/authoring/matching.ts:15-17`; `authoring/record-output.ts:55` | Column-type synonyms from C1 `type`, client-supplied; English synonyms stay a fallback | P3 |
| 10 | Activity wording keyed to web verbs and roles (navigate, "Opening a page", radio/option/tab roles) | `R/activity/wording/action.ts:61,133`; `act-words.ts:63-69`; `activity/call-context.ts:95,104-111` (`/navigate/` regex on node id) | Client `describeCall` (`binding.ts:143`) already exists; make Core's table the fallback only | P3 |
| 11 | "Page" / "list roles" in model text and the `read list` model; `repeat while: next` + `web.dom.next_page` | `flow-script-format.ts:418-445` | Paging capability answered `ended` is generic; the node id comes from the client (see 1) | P2 |
| 12 | Panel capability vocabulary (dotted ids `flow.build`, `run.start`) | `R/panel-capabilities/capability.ts`, `vocabulary.ts` | Not a client concept of the automated medium; it is the control-panel client's contract. Leave. | n/a |

Already clean (do not touch): `R/adapters.ts`, `R/io-bridge.ts`, `AS/client-gateway/bridge.ts`, `R/environment/`, `CT/failure/`, `CT/record-sets/` (no DOM terms), `deniedEvidenceKeys` (Core's old header-and-cookie list was already moved to the client, `binding.ts:152-163`). Structure audit config (`!FluxIQWebExtension/scripts/structure-audit/config.mjs`) already enforces domain never imports extension; there is no equivalent that stops Core naming `web.`; adding "no `web.` literal in Core outside tests" is a cheap guard once item 1 is done.

## Order
Each step is testable provider-free with fixture reads or a scripted fake client (`environment` kind `fixture`, `AutomationStudioRunEnvironment`); none needs the Lab.

1. **C8 `transient` + C10 failure-record fields** (smallest; one parser, `CT/failure/parse-record.ts`). Test: record with/without flag through `retry-later.ts`; absent flag still matches today's regex.
2. **C1 typed fields + C3 row identity** (`CT/record-sets`, packet field). Test: condition-holds / sort / dedupe with typed samples; absent type equals current behaviour.
3. **C7/C11 obstruction + intent, with the fallback lists kept** (items 2, 5, 6). Test: a scripted fake client reporting `dismiss[{intent}]` drives the handler; a client without it hits the English fallback (existing tests unchanged).
4. **C5 value witness and C9 stateful flags** (Core delta kind `value|region`; reads already carry the data). Test: `trial-change` proofs over fabricated before/after `values`.
5. **C4 effect record + inverse, then C6 `landing`** (depend on 4). Test: site-reset ledger pairing from effect records; fixture where `placeChanged` + differing marks gives `landing`; no record -> `undoes` required as now.
6. **C2 per-item marks** (feeds the kept-versus-left-out field suggestion, needs C1). Test: fixture rows with marks give the separating-field sentence.
7. **C12 / act vocabulary** (items 3, 10) and **script-format genericisation** (item 1) last: highest churn, text-only, protected by the existing format tests plus a new "no `web.` literal in Core" check.

Dependency note: 1-3 are independent and can run in parallel lanes by file; 4 before 5; 6 after 2.

## Not verified
- Line numbers for `host-runtime.ts` members and `binding.ts` fields come from a signature grep; a few (`hostResources` :~96, `AutomationStudioSiteResetPlace` :~226, `ClientGatewayClientType` :~22, record.ts `certainNoEffect` :~55) are approximate (marked `~`).
- Web-side sources for C2, C6, C10 (marks, actionability, `placeChanged`) were taken from `fhl-domain-surface.md`, not re-read in `apps/extension`.
- I did not read the wave-2 reports in full, only their contract lines; there may be proposals I missed (e.g. the pace/learned-pace record, `answer.rows`, date bounds, which need no client contract).
- Whether non-web clients can supply each field is argued from the medium, not from an existing desktop/API adapter (none exists in either repository I read).
- Nothing was built, run, or tested.

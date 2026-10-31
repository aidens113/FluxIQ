# Fourth installed click: preserved identity, ignored landmark

Outcome: Done (read-only diagnosis; no fix authored).

The actual failed command retained the complete captured element identity.
The failure is action-resolver ambiguity after weak-signal drift, not a lost
fingerprint in the native/gateway mapping.

## Observed evidence

Read the complete Node-copied private backup at main Down
`test-runs/t837-browser4`, not the incomplete earlier PowerShell copy. The
private trial JSON and the unique persisted failed click attempt agree:

- The real candidate executed two successful navigation nodes, then one click
  failed. No judge ran.
- Native effect and persisted gateway command have identical whole element
  values. All seven element fields also structurally equal the actual returned
  target: tag, implicit role, accessible name, selector, id, classes and context.
  The original id, one original class, and `navigation` landmark are present.
  The parameter selector and returned selector agree. No raw field values are
  reproduced here.
- The returned browser snapshot contains exactly two same-word links with the
  same destination. One is in `navigation`, the other in `contentinfo`. Neither
  retains the original id or class after the expected-page restyle.
- Actual browser resolution: `scored-candidate`, 24 candidates, best 0.89,
  runner-up 0.88, confidence 0.783. The 0.01 lead is below the existing 0.20
  margin. The returned diagnostic identifies those two landmark classes as
  the leading pair.
- Actual failure: `web.target.ambiguous`, stage `target_resolution`, effect
  `unacted`, retryable false. Resolution stopped before the click gesture.

The first resolver's in-memory return is not separately serialized in this
backup. Its shape assertions and twelve exact historical-source comparisons
passed in the actual run. Independent preservation comparisons here cover the
retained native effect, persisted gateway command and actual returned target;
they do not claim a second independent read of that deleted in-memory value.

## Owning branch

`apps/extension/src/content/identity/score.ts:270` filters candidates through
`inRecordedPlace`, but that function at line 337 checks only record and dialog.
Its `RecordedIdentity.context` at line 165 excludes landmark, and
`comparableFingerprint` at line 368 sends no landmark into the numeric matcher.
Both leading links therefore survive despite the captured placement evidence.
The margin branch at line 286 honestly returns ambiguity.

`apps/extension/src/content/action-runtime/resolve-target.ts:407` follows that
same-family score result to `scoredAmbiguous` at line 620, producing the actual
strategy/count/scores observed above. This is the first ineffective seam:
the context reaches the resolver, but the action's place gate does not use it.

Exact action vetoes at `identity/veto.ts:249` and line 278 likewise check record
and dialog alone. The existing role/name-aware landmark predicate lives at
`action-runtime/read-lookup/in-recorded-landmark.ts:10` and explicitly applies
only to reads. The gateway mapper at `domain/src/client/gateway-mapping.ts:191`
retains the richer original identity; the preserved result confirms no mapping
loss caused this failure.

## Scoped recommendation and coverage

Move the existing landmark predicate to a shared identity owner and apply it
consistently to action candidate filtering and exact vetoes. Treat an explicit
other-landmark veto as definitive, including the stable-name fallback in
`resolve-target.ts`; otherwise that fallback can bypass the placement guard.
Keep score weights, floor and margin unchanged.

Require the existing installed positive to click only the recorded navigation
link after drift. Require the missing-original negative to make four native
failed/unacted attempts and zero gestures while its footer twin remains.
Add owning unit coverage for an exact selector pointing at the wrong landmark,
two indistinguishable candidates inside the recorded landmark, named-landmark
distinction, and the absence of a recorded landmark. No first-position choice.

Validation: Read-only private JSON/SQLite inspection plus owning source branches; no browser, build, model or mutation run.
Not verified: Recommended fix and final installed acceptance.
Report: docs/working/framework-heavy-lifting-plan/reports/codex-1031/completion-parameters/fingerprint-command.md
Notes: Preserved-input resolver defect. Only this report was written. Raw evidence remains private and ignored.

## Sixth-run saved identity: property order only

Read-only comparison used the complete main Down `test-runs/t837-browser6`
backup: the actual first successful native click command and returned target,
and the approved saved click's `graph_nodes.parameter_values_json` in the
project SQLite database. Exactly one saved click was present.

- `isDeepStrictEqual(saved.element, nativeClick.command.parameters.element)`:
  **true**.
- Serialized JSON equality: **false**. Top-level property order equality:
  **false**.
- Missing keys: **[]**. Added keys: **[]**. Differing value keys: **[]**.
- Deep equality is **true** separately for `tagName`, `implicitRole`,
  `accessibleName`, `selector`, `id`, `classNames`, and `context`.
- Saved selector equals the native selector: **true**. The actual returned
  target deeply equals that native original element: **true**.

There is no field/value/array loss or normalization mismatch in this saved
identity. The failing serialization comparison treated object property order
as identity. The lead's correction to a boolean
`isDeepStrictEqual(saved.element, original)` assertion preserves the complete
structural requirement while avoiding raw diff output. No production loss
seam or further source fix is indicated by this evidence.

Outcome: Done
Changed: This appended report section only.
Validation: Read-only actual native/gateway/saved SQLite comparison -> deep equality true, JSON serialization equality false, no differing keys or values.
Not verified: Subsequent saved native replay and missing-original acceptance (lead owns execution).
Report: docs/working/framework-heavy-lifting-plan/reports/codex-1031/completion-parameters/fingerprint-command.md
Notes: Property order only. No source/test edits, browser, build, provider or git commands.

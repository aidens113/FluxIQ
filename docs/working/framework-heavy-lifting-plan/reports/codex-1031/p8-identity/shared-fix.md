# Shared mechanical import follow-up

Outcome: Done. Assigned shared source is frozen again. This follow-up changes import routes only; behavior, frozen type shapes, function interfaces and test oracles are unchanged. No audits, checks, tests or builds were run while the native lane was mutating source.

## Exact changed paths

All source paths below are relative to private downstream `C:/Users/osrs_/FluxStuff/fxwork/t828/!FluxIQWebExtension`.

| Path | Mechanical change |
| --- | --- |
| `domain/src/runtime/llm-evidence/sanitize.ts` | Combined the two cross-directory provenance/record type imports through `../target-reacquire/identity`. |
| `domain/src/runtime/llm-evidence/elements.ts` | Record type now imports from the identity barrel. |
| `domain/src/runtime/llm-evidence/packet-fingerprint/from-packet.ts` | Evidence element type imports from the parent evidence barrel; record type imports from the identity barrel. |
| `domain/src/runtime/llm-evidence/plan-resolution/element-identity.ts` | Evidence element type imports from the parent evidence barrel; record type imports from the identity barrel. |
| `domain/src/runtime/target-reacquire/identity/classify-observation.ts` | Snapshot binding type imports from the evidence barrel. |
| `domain/src/runtime/target-reacquire/identity/observation.ts` | Type-only snapshot binding import uses the evidence barrel; its type shape is untouched. |
| `domain/src/runtime/target-reacquire/identity/tests/classify-observation.test.ts` | Sanitizer import uses the destination evidence barrel. |
| `domain/src/runtime/target-reacquire/identity/tests/refresh.test.ts` | Sanitizer import uses the destination evidence barrel. |

The lead's capture/places additions to identity/index.ts were preserved; that barrel was not edited in this follow-up. No native, producer, Core, descriptor, target-packets or other lane path was edited.

## Import-rule and cycle boundary

Read-only source inspection of `scripts/structure-audit/rules/imports.mjs:145-165` confirmed the actual rule: an importer nested inside the destination directory may use that parent's leaves; a value import also stays on its focused owner when the destination barrel's runtime imports lead back to the importer. Type-only crossings have no cycle excuse and use the barrel.

All newly introduced true cross-directory type imports in the shared lane now use existing destination barrels. In-directory imports remain direct. Imports of a parent's leaf from nested evidence/identity/test subdirectories remain within the rule's nested-directory boundary. The existing `domain/src/actions/types.ts` imports target a directory with no index barrel; the rule does not classify that as a skipped barrel. No new actions barrel or broad public re-export was introduced.

The classifier/refresh helpers retain focused value imports of the evidence untrusted-JSON/screening primitives. Routing them through the main evidence barrel would re-enter identity through its tools -> node-run -> retries path. The same nested-parent/cycle reasoning preserves the focused element matcher and packet primitive owners. The packet fingerprint itself is already imported through its focused directory barrel. Type-only evidence/identity barrel imports are erased and add no runtime cycle.

No missing destination type export was needed: the evidence barrel already exports WebLlmSnapshotBinding/WebLlmEvidenceElement, and the identity barrel exports the frozen private types. If a later design requires exposing the private JSON/screening primitives from a new focused value barrel, that is additional ownership work, not a reason to load the broad evidence barrel back into its own retry dependency chain.

## Statement formatting and verification boundary

A manual text review of the original shared source/test files found no actual multi-statement lines to unpack. The semicolon matches were for-loop headers, type members and comments; `statement-packing.mjs` explicitly excludes those forms. No statement-packing audit was executed and no audit pass is claimed. Existing one-statement conditional/arrow bodies were left behaviorally and textually intact.

The lead still owns the eventual checks/audits after native/producer source freezes. This report does not supersede the shared implementation report or claim runtime/types/browser validation. Source is frozen now.

Outcome: Done
Changed: eight exact shared source/test paths above; shared-fix.md report
Validation: not run (native source still mutates; follow-up forbids audits/checks)
Not verified: types/runtime/SDK/browser; no audit success claimed
Report: C:/Users/osrs_/FluxStuff/fxwork/t828/!FluxIQ/docs/working/framework-heavy-lifting-plan/reports/codex-1031/p8-identity/shared-fix.md
Notes: Source frozen. Required type/test crossings use existing barrels; cycle-safe value owners remain focused. No interfaces, behavior, test oracles or other lane edits.

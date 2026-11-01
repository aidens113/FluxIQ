Role: Heavy worker; gpt-6.1-sol, max (same discovery agent retained). Task t838.
Goal: Preserve and execute exact definition-term field identity across Domain parser, binding and captured-tree first-item evidence.
Worktree C:/Users/osrs_/FluxStuff/fxwork/t838/!FluxIQWebExtension; no main/pinned edits.
Read: this brief, field-read-discovery.md beside it, first Current State paragraph in FHL; stable request/schema edits already made by lead.
STABLE WIRE: text field has definition?: {term:string,part:"term"|"value"}; selector if present scopes definition lists within item, absent searches item's definition lists. Exact whitespace-normalized term, unique across scoped row-owned lists, no positional/value fallback. Term/value association must be HTML semantic dl/dt/dd, exclude nested-list terms from outer pair ownership. Missing/duplicate term or nonunique associated value unreadable. Old specs unchanged. No Core change for field seam.
Lead owns request.ts and schema.ts, frozen after adding this contract. Do not edit them; message if needed.
Owned Domain source: actions/extraction/read-request.ts; extraction/proposal.ts; runtime/llm-evidence/structure/packet.ts; plan-resolution/extraction/columns.ts (bothcopies); structure/first-item/walk.ts; focused first-item/definition.ts + barrel if needed.
Owned tests: adjacent read-request/schema-text-tests/recorded-definition; columns/conditions; first-item/tests definition; structure/tests/column-at. Exact prefixes from discovery report.
Must not touch other source, all Extension/Core source, package versions, shared working docs, architecture docs, git or artifacts. Report domain-fix.md beside brief only.
Parser must reject malformed definition on text rather than silently drop; nontext ignores inactive member consistent with existing kind semantics. Do not allow lines:true with definition or ambiguous readers. Deep-copy immutable term/part in every binding reconstruction, not unsafely spread unknown wire members.
Captured-tree lookup uses same semantic exactterm/value resolution as live reader and returns correct at; missing/duplicate/nested/hidden/sensitive terms stay unreadable, never wholeitem fallback.
Update proposal policy for real semantic definition terms as structural labels like tableheaders; arbitrary record text and values remain excluded, not a broad policy waiver.
Tests: parser roundtrip/invalid data, every explicitspec copy, unprojected predicate preservation, shifted/reordered pairs, duplicate/missing/nested scopes, screened/sensitive evidence, original behavior. Generic unrelated unitdata only.
Coordinate semantics directly with /root/definition_fields_extension; no shared file editing. Stable contract changes require lead.
Run only narrow owning Domain tests from discovery report; no root/full suites, browser/provider calls, or concurrent package builds. Lead owns types/build/audit/browser acceptance. Model provider must never be invoked.
Return Outcome;Changed;Validation exactcommand->observed;Notverified;Report;Notes(max3lines). Freeze source when done.

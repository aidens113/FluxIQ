# P8 focused native acceptance repair

Outcome: Done. The two assigned native acceptance causes are corrected and source is frozen for the lead's rerun. No tests, checks, typechecks, builds, audits, browser sessions, provider/API calls or git operations were run by this worker.

The lead's first acceptance run reached 142 of 143 passing domain tests and reported four source type errors; the full downstream structure audit passed. Two assigned type errors came from explicitly passing undefined to the optional prior binding under exact optional property typing. The one failing new test marked a word-dependent button identity readsWords:true, which correctly excluded its words and left it below the two-signal identity floor. It therefore was not an admissible find; the fixture, rather than the matcher threshold or the found assertion, needed correction.

| Exact downstream path | Change |
| --- | --- |
| domain/src/runtime/llm-evidence/node-run/retries/looked-up-reacquire.ts | Declare before?: WebLlmSnapshotBinding \| undefined, matching the actual optional callback input and preserving absent/unknown provenance behavior. The scoped-look helper inherits that type unchanged. |
| domain/src/runtime/llm-evidence/node-run/retries/tests/reacquire.test.ts | Replace only the new scoped read-semantics test's prior/fresh capture fixture with an actual text input capture on a profile preferences form. Both captures have the same stable ID, name and test-id, with different enclosing-form selectors. The saved fingerprint is derived from the actual original capture through the packet fingerprint builder, then receives the existing readsWords mark. All existing scoped-command, timeout, argument, readsWords, exactly-once look and original-selector immutability assertions remain unchanged. |

No production identity floor, matching/classification behavior, source hook, effect/authority rule, test oracle or unrelated fixture changed. The parallel shared matcher and lead-owned structure fixes were untouched. SDK0.20 was already current according to the brief; this worker did not rebuild it or change versions.

Validation: not run, as the brief forbids checks during parallel source edits. The lead must rerun the owning selector and typecheck after both lanes freeze; no new passing result is claimed here.

Outcome: Done
Changed: the two exact downstream paths above; this report only in Core
Validation: not run (parallel source-edit freeze rule in the brief)
Not verified: focused test outcome, final typecheck, audit or browser behavior after these edits
Report: C:/Users/osrs_/FluxStuff/fxwork/t828/!FluxIQ/docs/working/framework-heavy-lifting-plan/reports/codex-1031/p8-identity/native-acceptance-fix.md
Notes: Source frozen. Existing assertions are preserved. Shared matcher and lead-owned fixes were not edited.

# D0 private semantic-subject contract

Source status: FROZEN before this report. Public adapter API/snapshot and corrected narrowing are unchanged.

The private `AutomationStudioLlmRerunRecord` now includes readonly `subject: object`, taken directly from `captured.snapshot.subject` while constructing the existing frozen nonenumerable record. No clone, field hashing or per-call surrogate replaces the trusted subject identity.

Authored owning coverage asserts exact captured reference identity, distinct identities despite equal visible object fields, refusal to rewrite the frozen record property, a nonenumerable/nonwritable/nonconfigurable descriptor, empty record spread/JSON and no private subject data in lookup/record serialization.

D1 must intern stable semantic subjects by actual resource/document and element/query identity, never a per-call nonce. D2 can assign process-private WeakMap identity and combine reference instant with canonical list scope; it must never serialize/hash opaque object fields as authority or publish private key material.

Outcome: Done
Changed: `rerun-provenance/types.ts`, `provenance.ts`, `tests/provenance.test.ts`, this report
Validation: not run — brief reserves final D0 acceptance to the lead
Not verified: post-change owning tests/types/audit; D1 subject interning and D2 list identity integration
Report: `docs/working/framework-heavy-lifting-plan/reports/codex-1031/p9-append-only/d0-subject-contract.md`
Notes: Source frozen. Only already captured private subject visibility changed; public exports remain adapter-only.

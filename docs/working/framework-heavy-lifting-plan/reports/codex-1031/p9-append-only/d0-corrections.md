# D0 strict acceptance corrections

Source status: FROZEN before this report; public adapter API/types are unchanged.
Read the lead's `t830-d0-types.log` (four strict errors) and `t830-d0-audit.log` (four packed lines, one failing rule); no checks were run by this worker.

- Capture now binds a genuinely narrowed `AutomationStudioLlmRerunScope` before nested transaction closures; unavailable scopes still take the existing refusal branch.
- Execution binds a genuinely present registry entry after its missing-entry guard, removing non-null assertions from the private selection path.
- Missing/undefined actual adapter input explicitly returns `adapter_input_changed` before the JSON reader; no asserted input or invented empty value is used.
- Test forwarding omits absent referenceNow rather than assigning undefined under exact optional properties.
- The deliberate malformed effectiveInputs specimen explicitly crosses unknown; the typed public capture contract remains strict.
- Expanded all four reported packed test lines into individual statements.

Outcome: Done
Changed: `rerun-provenance/provenance.ts`, `tests/fixtures.ts`, `tests/provenance.test.ts`, this report
Validation: not run — brief reserves reruns of owning tests/types/audit to the lead after this freeze
Not verified: corrected package typecheck and audit; post-correction tests; D1/D2 integration
Report: `docs/working/framework-heavy-lifting-plan/reports/codex-1031/p9-append-only/d0-corrections.md`
Notes: Source frozen. Same original executor/public input, private adapterValue matching and fail-closed capsule consumption are preserved.

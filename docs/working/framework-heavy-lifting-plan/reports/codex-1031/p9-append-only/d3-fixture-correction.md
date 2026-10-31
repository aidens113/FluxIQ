# D3 model JSON proof fixture correction

Source status: FROZEN. Only the owning test and this report changed; no helper or production source changes.

The lead's `t830-d23-owning-tests.log` shows 412/414 owning tests passed; the JSON authority case failed inside `fixture.seal()` with `result_unproven`, before checking the missing private observedEffect.

Cause: the fixture attached `observedEffect` as an unknown top-level `llm_evidence_tool_execution` field. `evidence-loop-decision.ts`'s exact envelope-key check correctly refuses that key as `unknown_key`; `node-reruns/result.ts` therefore cannot establish ordinary positive settlement, and D0 correctly refuses sealing. This was a malformed specimen, not a permission/provenance defect.

The forged observedEffect now lives in the legal JSON `evidence` field with `ok:true`. An added assertion requires that exact evidence to survive ordinary receipt sealing. The unchanged safety oracle still requires private record.observedEffect to be absent and attempted frozen execution to remain unacted. The extra producer-snapshot spoof remains unable to set private safety proof.

Lead selector (not run): `pnpm --filter fluxiq exec vitest run src/programs/automation-studio/runtime/llm/rerun-provenance/tests/settled-safety.test.ts -t "does not let"`.

Outcome: Done
Changed: rerun-provenance/tests/settled-safety.test.ts; this report
Validation: not run — source-only correction brief reserves rerun to lead
Not verified: corrected test execution, types or audit
Report: docs/working/framework-heavy-lifting-plan/reports/codex-1031/p9-append-only/d3-fixture-correction.md
Notes: All production readers/gates remain unchanged. Source frozen; intended negative oracle preserved.

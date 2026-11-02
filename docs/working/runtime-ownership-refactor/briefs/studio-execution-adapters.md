Role: Heavy worker gpt-6.1-sol max.
Goal: Adapt Studio's persisted graph envelopes to canonical execution ports after observed type errors.
Owned Studio runtime: service/runtime-session/{in-run-repair,interruption-learning,subflow-frame}.ts,
flow-bootstrap/verification/detached-execution.ts,
executor/lifecycle-run/tests/in-run-repair.test.ts,
executor/step-loop/tests/run-repeat-guard.test.ts,
new runtime/legacy-envelope/** if needed (Studio runtime root; shallower composition owner).
Also your prior DSL owned paths ONLY if new package diagnostics prove issues.
Must not touch engine/graph/schema/provider/shared docs/config/package/git. No agents.
Read current Studio model/artifacts and canonical graph/frame contracts plus your DSL report.
Observed TS: ExecutableGraph returned/passed where Studio full FlowDocument needed (in-run-repair lines151,164,297,323,380,399; interruption-learning70; test179).
Observed TS: ExecutableFlow passed to Studio Artifact-only readers detached-execution123 twice.
Observed TS: subflow-frame80 literal extra schemaVersion to minimal graph.
Observed TS: run-repeat-guard171 executionDefaults incorrectly required; coordinate engine owner correcting contract.
Preserve full persisted context truthfully at Studio adapter boundary: typed wrappers/envelope preservation,
or validate actual carried envelope and resolve context. Never fabricate project/owner/timestamps or double casts to silence errors.
Generic engine must remain able to run project-free graphs; don't add required editor fields to canonical DTO.
Do not narrow new canonical APIs back to Studio merely to pass tsc.
If frame generic needs type preservation, coordinate exact engine DTO change with engine worker first.
Add focused tests covering full Studio repair context and generic execution without Studio envelope.
No broad suites/paid/browser/panel. Typecheck only after global stable gate coordinated lead.
Report docs/working/runtime-ownership-refactor/reports/studio-execution-adapters.md.
End return contract incl SOURCE FROZEN and exact known remaining errors.

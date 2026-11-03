# R7 authoring and verification ownership plan

Role: Heavy worker, gpt-6.1-sol, max effort.
Goal: Concrete bounded migration sequence for reusable Flow authoring/trial/repair/result verification remaining under Studio.
Repo: C:/Users/osrs_/FluxStuff/fxwork/t842/!FluxIQ.
Read: Current State of ../../runtime-ownership-refactor.md; reports/residual-runtime.md; Core Repository Boundary/code-structure rules.
Inspect decisive runtime/flow-bootstrap/**, service/instruction-led/**, service/project-build/**, verification/recovery/coverage/draft helpers and actual persistence edges.
Read only as necessary to identify reusable closed capabilities; use import graphs and actual side effects, not symbol naming.
Specify stable ArtifactSource/DraftStore/History/Evidence/ResultSink/Presentation/Model/HostSemantics ports with narrow data contracts.
Partition source ownership and sequence into coherent, independently verifiable units. Preserve build-whole-first, targeted repair/retry, uncertain lasting effect, permission, budget and oracle invariants.
Active browser semantics must leave Core through trusted downstream ports; do not hide them in generic owners.
No canonical Pick<StudioService>, fake artifacts, unconstrained callbacks or catch-all copied directory.
Owned report only: docs/working/runtime-ownership-refactor/reports/authoring-verification-plan.md.
Must not touch source, shared working docs, indexes, other reports. Never git mutation/spawn.
Acceptance: exact first implementation unit, named new/old files/contracts/tests and remaining groups; no broad test runs.
Return: Outcome; Changed; Validation; Not verified; Report; Notes <=3 lines.

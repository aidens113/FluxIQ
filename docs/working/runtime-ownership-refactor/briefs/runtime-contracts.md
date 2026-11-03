Role: Standard worker; gpt-6.1-sol; medium.
Goal: Decouple framework runtime failure/actionability contracts from Automation Studio subpath ownership.
Owned: packages/contracts/src/failure/**, packages/contracts/src/actionability/**,
packages/contracts/src/runtime.ts, packages/contracts/src/tests/runtime.test.ts,
packages/contracts/package.json, packages/fluxiq/src/runtime/**.
Must not touch: shared docs, git, other sources, package versions, downstream. No agents.
Read Core AGENTS.md boundary/structure/validation, CODEX.md, paired plan Current State,
your core-web report, contracts automation-studio.ts and root index, tsconfig paths.
Failure/actionability already live in neutral contracts directories but names/subpath are Studio.
Add independently useful @fluxiq/contracts/runtime public seam with neutral RuntimeFailureRecord,
RuntimeTargetActionabilityRecord and parser aliases; preserve old exports/wire behavior/type compatibility.
If neutral canonical names can own definitions without churn, do so; preserve all Studio aliases.
Update generic packages/fluxiq/src/runtime consumers to neutral runtime contract API.
Keep Studio schema discriminator strings unchanged, exact validation, accessor refusal and wire fields stable.
Tests should verify compatibility, parser identity/behavior, safe compiled boundary; do not mirror implementation.
Check touched contracts typecheck and focused tests; focused runtime tests only (no full suites).
Coordinate tsconfig path addition with lead rather than editing unowned root tsconfig.
No runtime source behavior changes, package version changes, paid calls or panel management.
Report docs/working/runtime-ownership-refactor/reports/runtime-contracts.md.
End Outcome/Changed/Validation/Not verified/Report/Notes contract.

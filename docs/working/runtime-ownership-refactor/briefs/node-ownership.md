Role: Heavy worker; model gpt-6.1-sol; effort max.
Goal: Move neutral automation node pack out of Studio with closed framework dependencies, preserving APIs.
Owned: programs/automation-studio/nodes/**, components/automation/**,
programs/automation-studio/model/action-consequences/**, model/validation/issue.ts, model/flows.ts,
flows/executable/**, runtime/interaction/**, runtime/action-permissions/**,
programs/automation-studio/runtime/parking/ask-effect.ts,
programs/automation-studio/runtime/parking/ask.ts,
programs/automation-studio/runtime/conversations/ask.ts,
programs/automation-studio/runtime/action-permissions/{request,consequences}.ts,
and own report (all source paths relative packages/fluxiq/src).
Must not touch: git, shared docs, package/tsconfig/config/root barrels, other sources. No agents.
Read Core AGENTS.md boundary/structure/validation, CODEX.md, code-structure.md, plan Current State,
brief execution-architecture.md, report execution-architecture.md when present.
Move nodes/** except importer-sdk.ts + its tests into components/automation/** (93 sources).
Leave direct compatibility facades at old production paths, relocate tests to canonical owning tests/ folders.
Canonical barrel excludes retained Studio SDK; old nodes/index exposes canonical pack plus SDK.
Close deps: move model/action-consequences/** into components/automation/action-effect/consequences/**.
Extract FlowScope from model/flows.ts to flows/executable/scope.ts, old model reexports.
Move model/validation/issue.ts to flows/executable/validation/issue.ts, old facade.
Extract tiny ask effect builder/constant into runtime/interaction/effect.ts; keep Studio parsing.
Move neutral ask DTO authority to runtime/interaction/request.ts from conversations/ask.ts,
and request/consequences DTOs to runtime/action-permissions, preserving Studio aliases/wire.
Canonical nodes/runtime/flow areas MUST NOT import Studio (including type imports).
If closure differs from stated paths, send precise needed ownership extension before editing outside.
Preserve exported names and runtime behavior, no custom policy/generalization; imports via barrels.
Move test source paths/assertions as needed; add focused facade identity/closed-import boundary test.
Lead handles package exports/config/baseline/root barrels and external consumer imports.
Run focused moved node/interaction/contract tests; no full suites, paid calls or panel management.
Avoid whole-package typecheck until other source edits settled; send changed paths/checks.
Report docs/working/runtime-ownership-refactor/reports/node-ownership.md.
End Outcome/Changed/Validation/Not verified/Report/Notes return contract.

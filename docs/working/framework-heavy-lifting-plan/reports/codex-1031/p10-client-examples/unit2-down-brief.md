# P10 unit2: Down authored example tails
Role: Standard worker, gpt-6.1-sol, medium. No agents, git, builds, checks, browsers, paid calls or shared-doc edits.
Root: C:/Users/osrs_/FluxStuff/fxwork/t831/!FluxIQWebExtension. Core sibling is read-only.
Goal: Supply exact existing four worked-example tails through the accepted Core optional binding contract; freeze before report.
Own: domain/src/runtime/llm-evidence/script-examples/**, llm-evidence/tools.ts and its owning barrel only.
Must not touch Core source, systemInstructions, providers, keys, versions, baselines, shared docs or other Down features.
Read Core Current State in docs/working/framework-heavy-lifting-plan.md, then p8-repeat-history/p10-executable-design.md unit2.
Read Core runtime/flow-bootstrap/script-examples/{contracts,render}.ts; actual feature is NOT under plan/.
Core public SDK0.22 is freshly built. Core constants still include all old tails. Use public imports.
Copy exact authored tails from flow-bootstrap/plan/flow-script-format.ts into Down literal line arrays (format/act/loop/state), versioned examples value.
Attach flowScriptExamples in the actual web binding. Require it in Down-owned runtime type when appropriate; Core member stays optional.
Do not runtime-import/parse old Core examples to produce Down values; no regex replacement, inferred examples or copied generic grammar.
Pin four old full strings UTF8 SHA256 and byte lengths NOW, before Core extraction. Preserve all blank lines and indentation.
Owning tests must reconstruct old full strings with public renderer and compare pinned bytes/digests; tests may split known suffix from old constant only while old full constant exists.
Allow same parity test after extraction: use generic prefix when old constant no longer ends with authored tail, and still compare exact same pinned digest/bytes. Never weaken oracle.
Cover binding supply and metadata independently of systemInstructions. Do not add realistic fixture names/tasks or change guidance.
Acceptance lead runs owning domain script-examples tests + affected package types/structure, no full suite.
Write report in sibling Core docs/working/framework-heavy-lifting-plan/reports/codex-1031/p10-client-examples/unit2-down-report.md.
Report exact tail boundary decisions, old digests/lengths, selectors; freeze source before returning.
Return Outcome/Changed/Validation/Not verified/Report/Notes contract, no file dumps.

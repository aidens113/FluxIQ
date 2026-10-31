# P9 D authoritative rerun provenance investigation
Role: Read-only integration planner gpt-6.1-sol high; existing p9 design worker.
Core root: C:/Users/osrs_/FluxStuff/fxwork/t830/!FluxIQ; Down sibling !FluxIQWebExtension.
Owned: report only FHL/reports/codex-1031/p9-append-only/d-provenance-design.md (max80lines).
Goal: trace actual successful core.run_node -> resolved execution node/inputs -> returned evidence, and identify a safe existing rerun seam for D.
Read: original P9 executable design D and stable contracts; llm/evidence-loop.ts runCall; node-tools existing rerun helpers; harness/node-tool execution producers; Down node-run binding owners only as needed. Do not read/edit C new run-nodes files or A/B source.
Critical concern: replaying original model target handle against a NEW handle map can name a different subject. Frozen concrete actual parameters/effective inputs must be authoritative, never merely raw ranWith/draft JSON or model labels. Reusing original tool input is insufficient if handles/bindings re-resolve.
Find exact producer/consumer paths and fields; whether metadata is out-of-band trusted versus untrusted payload; how original fully wrapped admission/retries/permissions/receipts/accounting can execute that frozen node without implicit reset/output rebinding or draft additions.
If no seam exists, design smallest generic Core-owned private callback/attestation boundary and required Down supplied resolution (if any); old clients safely unproven, no raw model bypass. Do not implement or silently narrow all batch support to dodge it.
Also identify runCall pre-admission paths outside closure that each member must retain, and exact focused tests that prove authority/handle reuse safety.
Must not touch sources/shared docs/version/baselines/git/generated state/secrets. No checks/builds/audits/browser/provider/panel or agents. Full-sweep slots used/no paid GO.
Return standard contract, short source findings with file:line, concrete D changes and risks; freeze report when done.

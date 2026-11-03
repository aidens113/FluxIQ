Role: Heavy worker; gpt-6.1-sol; max.
Goal: Audit then implement ownership extraction of generic model/provider and agent infrastructure from Studio.
Owned canonical: packages/fluxiq/src/runtime/models/**, runtime/agents/**.
Owned old: programs/automation-studio/runtime/llm/** EXCEPT model-facing/**,
runtime/llm/harness.ts, harness/** only if closed contracts need migration (same Studio root).
Also Studio runtime/provider-refusal/** for generic refusal record/parser authority.
Must not touch: executor/activity/nodes/model/fingerprint, other runtime/shared docs/config/package exports/git. No agents.
Read Core AGENTS/CODEX, code-structure, plan Current State, execution-architecture report provider/agent section.
Inspect current named dependency closure and classify actual provider transport/catalog/pricing/limits/retry/credential
contracts and generic tool-agent loop vs Studio-specific tasks/schema/prompt/Flow build policy.
First send concrete old/new move group and required ownership extensions, then implement closed group within ownership.
User wants all runtime responsibility properly separated, so move real implementations, not aliases back into Studio.
Canonical runtime cannot import Studio even erased types; old symbols/paths become compatibility facades.
Keep Studio system-prompt/task schemas/Flow authoring tools/completion-repair workflow adapters in Studio.
Preserve all exact prompts/request wire, accounting/fees, model IDs/retry/timeouts, credential handling,
context window protection, billed-dollar purse and no unattended model calls.
No external provider calls. Validate with provider-free mocked tests only.
Create generic provider request/usage/error/secret ports as required, Studio adapts its task request via schema.
Extract generic agent machinery only when true generic seam with Flow authoring policy injected;
do not move entire coupled evidence loop to catch-all runtime directory.
Avoid contract pins drift; if tests source paths move retain test compatibility and update affected explicit consumers via lead.
Move subject tests alongside canonical owners; correct new structural violations rather than baseline remapping.
Run focused catalog/provider/agent tests only; full typecheck once source stable with other workers.
Lead owns root public exports/config/docs/tsconfig and external consumer retargeting.
Report docs/working/runtime-ownership-refactor/reports/model-ownership.md, include inventory/all remaining Studio classification.
End Outcome/Changed/Validation/Not verified/Report/Notes contract.

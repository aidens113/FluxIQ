# Workspace presentation and recording context foundation
Role: Standard worker, gpt-6.1-sol medium; retain configured worker for followup.
Goal: Build an isolated tenant/runtime-owned context and status foundation, without editing shared web runtime or routes yet.
Own: new apps/web/src/lib/workspaces/presentation/** only; report workspace-presentation.md. Existing lib/automation-studio-context.ts and tests are read-only reuse.
Must not touch: lib/fluxiq.ts, existing workspaces/route adapters/barrels, gateway/accounts/dataset routes, Core/extension source, package files, shared docs, builds/dist, git.
Read remaining-tenant-routes report presentation findings; lib/automation-studio-context.ts, relevant status/context/recording callback parts of lib/fluxiq.ts and current consumer type/tests. Inspect first; propose API and lifecycle before edits.
Use one context owner bound to exact workspace AND FluxIQ instance/generation; same user/client/project ids in another workspace never collide. A WeakMap per runtime instance with explicit workspace binding is a candidate, not a mandatory design.
No primary/global fallback. Reuse existing user/client preference, normalization and recording-context freshness semantics; don't introduce another timeout/cap. Context fields are server-owned after route authorization, not a caller-selected workspace.
Design explicit invalidation/late-write guards and lifecycle so reload/eviction/replacement cannot let stale callbacks mutate current context. Root will wire both primary and every tenant recording callback and close/reload paths after API freezes.
Present actual selected tenant native/LLM readiness and only current user's/client's context/counts; service output must omit host root, fluxiqDir and hostModulePath and must not echo raw host errors. Preserve local/self-hosted operator details deliberately.
Do not implement gateway snapshot filtering here; report exact downstream consumer requirements and privacy fields for the route unit. Do not declare full snapshot tenant-safe just because this foundation is isolated.
Methods/types should be narrow, injectable and independently testable without opening servers, model providers or real user state. Keep public exports only in this new subtree barrel until root composition.
Acceptance: same ids across two tenants, client-specific vs default context, exact runtime binding, detached data, invalidated/old callbacks, current-user counts, service path/error omission, local compatibility, actual recording resolver reused with own namespace.
Core dependencies are built/current. Another worker owns streams/dataset routes and may run narrow tests; no whole web tests/types or builds while other source edits occur. Use focused tests and scoped types only after this subtree freezes; coordinate root before consumers.
Return Outcome/Changed/Validation/Not verified/Report/Notes plus source-stable signal and exact proposed root wiring.

# Routed gateway transport

- Role: heavy worker, gpt-6.1-sol, max. No agents or git mutations.
- Goal: Add a trusted async first-hello routing port to the existing WebSocket listener so service tenants never connect to a primary gateway by fallback.
- Own: packages/fluxiq/src/server/client-gateway-websocket/** and report docs/working/hosted-platform-launch-plan/reports/routed-gateway.md only.
- Read: Current State of the paired plan, code-structure.md, owned transport and tests; gateway service build-identity lease API and client hello schema as necessary.
- Must not touch: gateway service, platform modules, web app, package manifests, shared documents, other reports or repositories.
- Preserve existing single-gateway/local behavior when no resolver is configured.
- Add a resolver receiving validated first hello and peer; it returns an authorized gateway plus release callback, or refuses. Root implements identity/eligibility and tenant acquisition separately.
- Never trust hello workspace/client metadata as authority. No primary fallback for rejected or failed resolution.
- Enforce frame/rate/hello deadline during async resolution; serialize delivery, bound pending input by existing limits, and release on close/error/resolution-after-close.
- Bind transport build identity per routed gateway with correct lifetime/reference counting; one socket closing must not unbind another socket's gateway.
- Preserve drain/origin enforcement and audit without exposing raw credential or hello content. Sanitize route errors.
- Listener close must terminate owned sockets and release leases, including pending routes. Do not hang on upgraded sockets.
- Discuss the public resolver type with lead before finalizing it; compatibility is additive.
- Acceptance: focused owned tests for two gateways with colliding IDs, refusal without any gateway connect, queued frames, pending-close race, invalid hello/deadline, lease cleanup and shutdown; existing transport tests pass.
- Do not build whole workspace or run paid/live browser/cloud checks. Run scoped vitest only; report exact commands/results and uncovered behavior.
- End with Outcome/Changed/Validation/Not verified/Report/Notes return contract.

# Workspace HTTP routing

The web application owns the HTTP adapter in `lib/workspaces/routes`. Core owns identity, IAM and tenant program data. A route selects its workspace using authenticated primary identity or an approved client binding, then holds that workspace lease through its response. A request body, project hint or publisher frontend cannot choose the data tenant.

## Authentication and authority

A nonempty panel cookie selects panel authentication. An invalid panel cookie does not fall back to an accompanying bearer. An unsupported caller channel is refused before looking up a client proof or acquiring a tenant lease. Paired callers authenticate only against the selected gateway and retain their exact user, trusted-client, session, domain, project and recording binding.

The adapter rechecks current identity, account membership/selection, binding and IAM after asynchronous work. IAM runs on the selected tenant; primary identity remains the authentication authority. A changed binding or authority is a refusal, never a reason to continue against a different workspace. Abort or explicit lease release during an awaited check also prevents subsequent admission.

Core's `IamDecision.failure: "policy_unavailable"` distinguishes failure to prepare/evaluate policies from a real policy denial. Both remain denied. It contains no provider exception or storage path. The HTTP adapter maps unavailable authority to503, absent/currently invalid authentication to401 and actual policy refusal to403. Empty policy sets remain ordinary denials. The indicator does not confer permission and does not alter policy evaluation or grants.

## Response ownership

`withWorkspaceRouteJson` owns fully buffered JSON through callback completion, serialization and final authorization. It releases the lease exactly once and refuses arbitrary Response/ReadableStream values. A route doing its own buffered response uses the raw context with a `finally` release and fresh checks around awaits. Lazy streams require a separate lifecycle owner; releasing a lease when returning a stream would be too early.

The program directory, framework IO read/validation and recording summaries use this adapter. Existing service operator-action denial and ordinary-user list restrictions remain. Framework validation refuses malformed JSON/known-field shapes rather than turning a parse failure into successful empty validation. These routes passed focused acceptance on the platform task branch.

State-asset reads and uploads use the same held context and passed focused acceptance. Reads are panel-only, buffered and marked private/no-store so newly fetched responses cannot bypass current access after an account change. Uploads retain Core's digest/media/size validators and recheck the exact paired project/domain/recording binding after body reads and before persistence. Final authorization failure cannot undo a write that already committed; no transactional rollback across the independent authority store is claimed.

Other dedicated gateway and dataset routes are still being migrated. Host setup is deliberately host-operated; tenant routing must not give customer administrators a way to migrate or reload the host. This adapter is not a browser-app OAuth implementation or an automation execution/billing interface.

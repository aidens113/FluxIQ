# Managed hosts

`fluxiq dev` serves the engine without the web panel. A configured launcher can
start isolated external execution hosts alongside its gateway and program API:

```text
fluxiq dev --browsers 2 --browser-host <launcher-module>
```

The compatibility flags name browsers; the server's launcher and lease contracts
remain neutral. Core loads the module explicitly, from `--browser-host` or
`FLUXIQ_BROWSER_HOST`, and never imports a downstream implementation. The module
exports a `FluxIQHostLauncher` or `createFluxIQHostLauncher(environment)` through
the types in `fluxiq/server`. `--headless` selects an invisible host where its
implementation supports that. `--browser-profile <name>` requests retained named
state; omission requests fresh state removed when the host ends.

## Enrolment and authority

Only in-process engine code mints one-use enrolment tickets. A launcher passes a
ticket to its client in memory. Tickets are domain-bound, expire, supersede the
previous ticket for that host, and never enter argv, environment, URLs, storage,
trace or audit. Redemption grants the same durable, rotating gateway trust as
pairing, with a Core-owned `managedHostId`. A refused ticket closes the session
and never falls back to asking a person to pair.

Managed trust authenticates a service identity. It does not manufacture a person
in Identity Access or inherit a person's role. A browser's own hello metadata
cannot claim this identity. A person-paired client still requires its approving
person to be enabled and to have a role.

While a FluxNode leaf runs, its host pool holds a strict resource lease and binds
the managed gateway session to that run's project and domain. The binding is
process-local and requires both active stored trust and a live scheduler lease.
Stop, release, disconnect or trust revocation removes its authority. A pipeline
controller holds no host while its child calls acquire theirs.

The server creates a service IAM principal with a policy restricted to reading
the run's capture policy/context, uploading artifacts to that client's own trace,
and uploading state images to the leased project. It has no panel, chat, key or
authoring authority. IAM still evaluates source policies, guardrails, session
policies and permission boundaries; source failures deny access. Machine policies
are compiled per request, so a previous lease's project cannot remain in a cache.

The headless listener mounts managed context, trace-artifact and state-image
uploads. It reads only that client's own session, never a workspace session list,
and a first-project request returns the current run's binding without creating a
person's project. Upload intake is shared with the web panel. Person and cookie
authorization remain in the Next adapters; managed uploads recheck token, lease
and IAM after the asynchronous body read and before writing.

## Selection and lifecycle

Every leaf's action and evidence read uses its leased session. A leased run never
falls back to another host. Concrete independent resources can run in one project;
the resource scheduler excludes concurrent owners of the same resource. Runs
without such a current lease retain the project admission gate.

The pool's domain must match the instance's explicit domain. A FluxNode must
explicitly name that runtime; an absent or different runtime is refused before a
host is acquired. A pipeline leases only for each mapped FluxNode, so one host
can serve a pipeline whose children wait for it.

Startup waits for each launched host and its gateway enrolment. A partial startup
closes the hosts already started. A fresh host that closes unexpectedly is
replaced with fresh state and a new ticket. Named state is retained and a closed
named host is reported rather than automatically replaced. Stop cancels a queued
acquisition without claiming a host. Shutdown aborts owned leaves, revokes their
machine authority immediately and drains their execution-owner cleanup alongside
host closure before closing the listeners and instance. The built-in FluxNode
service implements the optional in-process `FluxNodeService.close()` port: it
refuses new admissions and drains accepted registrations, controllers and leaf
finalization before the host pool is closed. Controllers use this lifecycle;
they never acquire a host merely to be included in shutdown. The SDK
wrapper's IPC channel lets its engine observe wrapper death on Windows as well
as POSIX. A launcher owns its own hard-parent-death cleanup implementation.

## Binding a model provider

Hosts bind execution providers through
`automationStudio.bindLlmExecutionProvider`. `fluxiq/automation` exports Core's
`createAutomationStudioAnthropicProvider` and its options type so a host can
supply its credential resolver and transport without copying prompt construction,
provider transport or answer decoding. A provider's construction makes no call.
Every actual call still passes through Core's model execution and accounting.

The provider-free downstream host proof supplies an isolated loopback scripted
transport through this seam and loads no real provider key. Its report counts
scripted requests and engine model decisions separately from paid calls. This
does not implement production headless key custody: mapping an API-key caller to
the appropriate production credential holder remains the P3b integration seam.

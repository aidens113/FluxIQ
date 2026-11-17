# Routed gateway transport

Implemented the additive authority resolver in the owned transport subtree.
Cloud files stayed frozen. No gateway-service, platform, web, contract,
package-manifest, shared-document or git edits were made by this worker.

## Frozen additive API

The existing server options gain `resolveGateway?: ClientGatewayResolver`.
The resolver receives `{ hello: ClientGatewayClientHello, peer:
ClientGatewayPeer, origin: string | null, signal: AbortSignal }` and returns
`Promise<ClientGatewayRouteLease | null>`. The route lease holds an authorized
`gateway: ClientGatewayService` and `release(): void | Promise<void>`.

The lead approved this API. It owns browser credentials/eligibility and tenant
authority. This transport must not interpret workspace/client metadata as
authority or connect the primary gateway when resolution refuses/fails.
The required primary gateway remains a pre-route audit/enable gate and the
unchanged local default only when no resolver is configured.

## Resulting behavior

- A routed socket does not call any gateway's `connect` before its first
  well-formed, major-compatible hello resolves to an authorized lease. Invalid
  hello, null/throwing resolver and disabled selected gateway close with 1008;
  none fall back to the primary gateway. Only the resolver chooses the tenant.
- Native frame/rate checks stay live during resolution. Total pending text,
  including the message being handled, shares the existing `maxFrameBytes`
  budget; exceeding it closes with 1009. Input is serialized through resolver
  and gateway awaits instead of starting concurrent `receiveRaw` calls.
- The hello deadline stays active throughout async routing and aborts the
  resolver on expiry. Close/error/shutdown also cancel admission immediately.
  A lease arriving after close is released exactly once without gateway connect.
- Build identity binds once per gateway and is reference-counted across both
  sockets and simultaneous listener owners. Closing the newest socket/listener
  cannot unbind the surviving owner's gateway. Conflicting concurrent build
  identity requests refuse instead of silently rebinding an active gateway.
- Acquired tenant/build bindings survive already-running gateway delivery on
  socket closure, then release. Async releases are observed; acquired cleanup
  failure makes handle close reject with a sanitized error and records a safe
  audit event. Raw hello, credentials and resolver/release exception text are
  not included in those errors/audits.
- Listener handle close terminates every owned upgraded socket and is
  idempotent. It waits for acquired release work, but never waits for an
  unresolved resolver that ignores AbortSignal; late results clean themselves
  up. Native logical close clears buffered input and notifies ownership once.
- Without a resolver, the primary gateway still connects at upgrade and uses
  the existing local hello/rate/profile behavior. Existing origin, drain,
  forwarded-peer and TLS proxy tests still pass.

## Files

- `start-server.ts`: additive resolver option, shared gateway identity manager,
  cleanup tracking and owned-socket shutdown.
- `accept-socket.ts`: delegates socket input/admission/lifetime to a focused
  session owner, preserving the public helper's old required inputs.
- `native-connection.ts`: immediate, exactly-once logical closure and error
  destruction, with buffered input discarded.
- `routing/{types,read-hello,identity-leases,socket-session,index}.ts`: public
  port types, initial wire validation, shared binding ownership and bounded
  serialized session delivery. The transport barrel exports the new API,
  which the existing `fluxiq/server` barrel already re-exports.
- `tests/routed-server.ts`, `tests/routed-server.test.ts`,
  `tests/routed-limits.test.ts`: owned test support and 20 new cases.

## Validation observed

`pnpm.cmd exec vitest run src/server/client-gateway-websocket/tests` from
`packages/fluxiq` before implementation -> 5 files passed, 28 tests passed.
The same scoped command on the final source -> **7 files passed, 48 tests
passed**, including the real loopback transport and stand-in TLS proxy.

The new tests cover two gateways with actual colliding session/client ids;
primary nonconnection; resolver refusal/throw redaction; ordered pending frames
and gateway awaits; pending-close/late-result lease cleanup; newest-socket
binding retention; shared identity across simultaneous listeners; acquired
in-flight/async release; disabled route cleanup; sanitized release failure;
six invalid initial-envelope/payload/protocol variants; and deadline, pending
input, declared-frame and rate limits during routing. Existing 28 tests all
remain green.

The first new run passed 44/45 cases: only the collision fixture failed because
Core's session registry uses `crypto.randomUUID` directly instead of its
configurable id provider. The fixture now intercepts UUID generation with a
test-local, normally call-through mock, proving real identical session ids in
separate gateways. Its rerun passed; additional ownership/cleanup cases brought
the final total to 48. No production behavior was changed to satisfy that fixture.

Initial validation was scoped Vitest only. The lead independently reran all
48 cases successfully, then returned three swallowed-failure findings in
`start-server.ts`: discarded finalization/release handlers only updated flags.
They now bind the caught rejection and record a listener audit with fixed
phase and rejection-kind fields, preserving sanitized close rejection and
lease ordering without exposing exception text or expanding a baseline.

- `node scripts/structure-audit.mjs --rule swallowed-failure` ->
  `structure-audit: passed (0 warning(s), 25 baselined).` No baseline changed.
- The full owned Vitest command after the logging fix -> 7 files, 48 passed.
- A no-emit TypeScript compiler-API probe via
  `node --max-old-space-size=4096 --input-type=module`, using the package
  tsconfig and all 30 owned transport roots, initially found three
  `exactOptionalPropertyTypes` errors. Internal records explicitly included
  an absent resolver while optional field declarations excluded explicit
  undefined. The relevant resolver field declarations now represent that
  absence accurately; runtime routing behavior is unchanged.
- The same compiler probe afterwards -> `Transport roots: 30; owned
  diagnostics: 0; other imported diagnostics: 0`. The swallowed-failure audit
  rerun also passed unchanged. The lead was immediately told source is stable
  for its Core build; only this report changed after that signal.

No workspace build, full package check or full suite was run by this worker;
the lead owns integration validation. No live browser/model/provider call or
production tenant provisioning occurred.

The transport is a trusted routing seam, not a browser-credential authority.
The lead must wire its separately implemented proof/eligibility/tenant lease
resolver and verify that service composition chooses it. The strict initial
envelope check applies to routed mode; legacy local mode stays compatible.

Outcome: Done
Changed: Owned WebSocket transport, routing modules/tests and this report.
Validation: Scoped Vitest -> 48 passed; swallowed-failure audit -> pass/no baseline change; no-emit owner TypeScript probe -> 30 roots, 0 owned/imported diagnostics.
Not verified: Full package/build/integration checks, actual tenant resolver composition, live browser or production proxy lifecycle.
Report: `docs/working/hosted-platform-launch-plan/reports/routed-gateway.md`
Notes: Additive API frozen with lead. No primary route fallback. No git/shared-document/cloud or service-owner edits.

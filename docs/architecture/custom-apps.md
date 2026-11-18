# Custom app contracts and installation registry

Custom apps have a browser-safe data contract at `@fluxiq/contracts/apps` and a Core registry under `platform/apps`. This is an installation and operation-resolution foundation. It is not yet a hosted app API, browser authentication system, execution dispatcher, billing integration, or marketplace catalog.

## Manifest and installation

A manifest pins publisher, app, version, package digest, frontend origins/redirects, typed operations, required grants, runtime/environment/callback requirements and protocol compatibility. Its SHA-256 digest covers canonical content excluding only the digest field. Publisher verification is host-owned; a manifest cannot claim that status. Production frontends use HTTPS; explicit loopback development frontends may intentionally use managed cloud, subject to the same host authorization and payer checks.

Each operation binds to a specific backend definition digest. Queries bind to a dataset query; execution binds to a Flow, pipeline or FluxNode. Named secret-use permissions refer to server-held bindings. Input/result schemas reject secret-formatted fields; these contracts do not provide a browser secret transport.

An installation pins that manifest and package, the approved grant subset, execution target and payer. The host supplies workspace, installer, timestamps and installation identifier. Browser-supplied workspace/user/revision fields are not install authority. Customer-owned targets have no managed-compute charge. Managed execution requires an explicit payer; merely installing an app does not dispatch or charge anything. Consent revisions and credential generations advance together on each update or revocation; revoked installations cannot be revived.

## Persistence and authority

`SQLiteAppRegistryStore` uses Core's SQLiteRepository. Immutable manifest versions, installation updates, workspace index and revision audit history are transactionally stored. Updates compare the expected revision; concurrent writers cannot silently overwrite consent. Every mutation requires a fresh trusted authorization guard inside the write transaction. Storage failures have fixed errors rather than returning empty success.

`createAppRegistryService` requires trusted authority and target-check ports, with no default allow behavior. The host implementation must authenticate context and check current identity, membership, IAM, publication ownership, consent and delegation. It must also verify that the pinned backend exists, supports the declared target and callbacks, and has an eligible payer. These host adapters are not yet composed into production HTTP routes.

Operation resolution checks active installation, exact app/installation/workspace/generation/origin binding, delegated grants, typed inputs and target eligibility. It refreshes authority after awaited target checks and then rereads installation state. An optional prior resolution must match the current resolution exactly. A query resolution explicitly has no managed-compute charge.

A resolution is metadata, never an execution lease or authorization token. It cannot reserve funds or capacity, start a run, or promise durable results. A later dispatcher must authorize again at use, obtain the actual execution/reservation lease and integrate the existing execution/idempotency engine. No distributed atomicity across identity, registry and billing stores is implied by the local registry transaction.

## Remaining frontend integration

Registered third-party app authorization/PKCE is distinct from the existing fixed extension client. The browser SDK must use a separate browser-safe entry, not the Node SDK credential chain. It will call only installed named operations; it must not inherit panel cookies, private developer keys or unrestricted owner-level FluxNode HTTP access.

Durable invocation receipts, event replay, result access, cancellation, actual scoped query/execution adapters, billing reservations/settlement, publisher verification and the reference demo remain subsequent work. Until those are implemented and accepted, the registry must not advertise an accepted run or a launch-ready marketplace.

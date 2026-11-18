# Transport credential write metadata

Outcome: Done. Unit A carries actual session-ready metadata through the existing durable credential-write barrier, for direct and reconnecting clients. Source/tests are frozen for the lead's coordinated client build and extension checkpoint. Actual server metadata population and hosted persistence composition remain separate units.

## Changed paths

- `packages/client-gateway-websocket/src/credential-write-metadata.ts`: focused public metadata type.
- `src/types.ts`: optional second argument on tokenStorage.write.
- `src/index.ts`: exports the new type.
- `src/transport.ts`: detaches the actual ready payload minus token and adds the server envelope id before the existing awaited write.
- `src/connection/connection.ts`: forwards both arguments through the existing serialized, active-socket-guarded storage wrapper.
- `src/tests/credential-write-metadata.test.ts`, `src/connection/tests/credential-write-metadata.test.ts`, and test fixture `src/tests/credential-metadata-fixture.ts`.

No contracts, generic server, framework, web, extension, package/version/README, shared document, baseline, generated output, or git mutation was performed.

## Frozen public interface and behavior

```ts
export type ClientGatewayCredentialWriteMetadata = Readonly<
  Omit<ClientGatewaySessionReady, "token"> & { messageId: string }
>;

write(token: string, metadata?: ClientGatewayCredentialWriteMetadata): void | Promise<void>;
```

`ClientGatewayConnectionTokenStorage` aliases the existing WebSocket option, so it inherits the additional optional parameter. One-argument adapters keep working. Existing generic clients without a storage port are unchanged.

For each ready frame, the transport creates a detached structured clone of the actual payload fields other than token, then attaches that frame's envelope id. The credential appears only in the first write argument. Nested user/workspace values cannot be mutated by a storage callback in a way that changes the original ready frame or transport session identity. Metadata is not manufactured or frozen at runtime; the detached copy is private callback input with a readonly public type.

Ordering remains: wait for storage commit, adopt transport session/token, attempt credential_received acknowledgement, emit message/session_ready, and then process later queued frames. The reconnecting wrapper keeps each token/metadata pair together in its existing write queue. Storage failure, obsolete socket, reconnect sequencing, beforeConnect generation guards, and current/previous credential recovery behavior are not replaced by a second mechanism.

A legacy ready frame receives metadata containing only its actual sessionId plus messageId; no expiry, user, or workspace is invented. The transport does not assert that server-authored metadata exists or validate it into hosted account authority. Hosted consumers must require and validate the existing fields before their durable commit; missing/malformed metadata remains a refusal there. Actual server emission is Unit B.

## Validation observed

```powershell
pnpm.cmd --dir packages/client-gateway-websocket exec vitest run src/tests/transport.test.ts src/tests/index.test.ts src/connection/tests/connection.test.ts src/tests/credential-write-metadata.test.ts src/connection/tests/credential-write-metadata.test.ts --pool=forks --maxWorkers=1 --minWorkers=1
```

Observed **5 files, 78 tests passed**: connection 47, transport 23, public entry 4, direct metadata 2, reconnecting metadata 2. Duration 6.50s. The existing connection file includes failed read/write, late write/replacement, queued-command, and beforeConnect generation regressions.

New tests prove actual expiry/user/workspace/message id reaches storage before acknowledgement/ready; nested and top-level callback mutation leaves the original ready message/session unchanged; later frames wait; metadata contains no token; absent legacy fields remain absent; an old one-argument consumer persists successfully; reconnecting clients forward the same metadata; and successive pending rotations retain their matching token/expiry/session/message id.

`pnpm.cmd --dir packages/client-gateway-websocket exec tsc --noEmit --incremental false` -> **exit 0**, no diagnostics/output emitted.

Owner-scoped structure probe: **17 rules, 8 files, 0 failures**, with two existing connection advisories (file 457 lines, class 32 methods) and the unchanged transport `as never` baseline entry 1. The production diff adds no casts and does not enlarge or edit any baseline. Rules: file-lines, directory-files, class-methods, exported-values, statement-packing, swallowed-failure, failure-as-empty, as-never, test-placement, naming, import-cycles, imports, contract-spread, facade-dispatch, regexp-template-escapes, restricted-references, shared-temp-root. The existing baseline was read and applied, never written.

`git diff --check -- <eight owned source/test paths>` -> **exit 0**, no output. The production diff was inspected: only the metadata type/import/export, optional parameter, cloned metadata write, and two-argument forwarding changed.

Not verified: package output/declaration build, downstream extension bundle/type checkpoint, server-authored metadata, hosted IndexedDB adapter wiring, account/membership refusal on server ready, actual browser origin isolation, or live gateway behavior. No build/dist/provider/server/browser was run by this worker. The lead owns version/docs, independent reruns, output builds, composition, and commit/push.

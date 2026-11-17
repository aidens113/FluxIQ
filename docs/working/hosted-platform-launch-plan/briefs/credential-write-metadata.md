# Transport credential write metadata
Role: Standard worker, gpt-6.1-sol medium; keep current configured worker.
Goal: Carry actual ready metadata through the existing durable-write barrier before acknowledgement.
Own: packages/client-gateway-websocket/src/types.ts, transport.ts, connection/connection.ts, index.ts; new focused metadata type file if needed; adjacent transport/connection tests; report credential-write-metadata.md.
Must not touch: Core server/framework/web, contracts, extension, package version/README, shared docs, dist, git.
Read: session-ready-metadata-integration report; current transport77-test persistence unit and public types.
Stable interface: exported ClientGatewayCredentialWriteMetadata = Readonly<Omit<ClientGatewaySessionReady,'token'> & {messageId:string}>.
Add optional second metadata arg to tokenStorage.write. Old one-arg adapters remain compatible.
Pass detached actual payload fields minus token and server envelope id through awaited commitSession write; forward both args through reconnecting connection's serialized storage wrapper.
Do not invent missing metadata/expiry, expose a raw token in metadata, or delay persistence until onSessionReady.
Clone nested user/workspace data so storage callback mutation cannot alter the ready message/transport state. No new wire protocol.
Keep ordered frames, storage failure/close handling, old-socket guards, old beforeConnect-generation protections and current/previous proof semantics.
Tests: actual expiry/user/workspace/message id through direct and reconnecting clients before ack; clone isolation; absent legacy metadata; old single-arg consumer; write failure/late replacement regressions still pass.
Run narrow client tests and no-emit typecheck; no builds/dist. Root handles minor package version/docs and coordinated output build.
Report exact observed results and source-stable signal; missing actual server population is next unit, not solved by this transport change.
Return Outcome/Changed/Validation/Not verified/Report/Notes.

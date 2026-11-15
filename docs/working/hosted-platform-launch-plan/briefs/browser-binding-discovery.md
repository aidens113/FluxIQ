# Browser credential binding integration discovery
- Role/model: discovery worker, gpt-6.1-sol, medium.
- Goal: Locate actual consumer connect/token/enrollment flow and define smallest complete platform browser credential-to-workspace router, without scanning gateways or trusting hello metadata.
- Read: Current State, reports/tenancy-discovery.md D; targeted web /connect and /api/connect routes, Core connect/token issuance/approval/revocation, gateway hello/authorizeToken implementations. No broad runtime reads.
- Own only report docs/working/hosted-platform-launch-plan/reports/browser-binding-discovery.md. No source/git/shared docs/builds/tests/servers.
- Need exact public token lifecycle and secure pre-hello selection: which stored credential or token digest can be bound to platform workspace at authenticated issuance, which proof is available on socket, how to reject disabled user/removed membership and release leased gateway on close. Identify managed-host differences explicitly.
- Return exact file-partition brief for implementation plus test commands; distinguish implemented connect flow vs missing placeholders. Identify route/stream/download migration consumers. Do not duplicate API-key scheme.
- Report return contract required. Lead/library validation proceeding concurrently, discovery is read-only.

# Extension PKCE integration discovery

- Role: heavy worker, gpt-6.1-sol, max. Read-only source; no agents/git.
- Goal: map a complete hosted browser connect flow onto existing extension identity and transport, preserving local pairing.
- Own only: docs/working/hosted-platform-launch-plan/reports/extension-connect-discovery.md in paired Core.
- Read: Current State, your connect-web report, existing contracts/platform/connect and discovery; downstream paired t914 extension source for install identity, server selection, discovery, pairing, credential storage and tab observation. Locate with rg, do not open runtime data.
- Downstream root: C:/Users/osrs_/FluxStuff/fxwork/t914/!FluxIQWebExtension.
- Must not touch source, other reports/shared docs, git, primary checkouts or build outputs. No browsers/servers/tests or provider calls.
- Return exact owned file partition and meaningful narrow tests for initiation with cryptographic state/verifier, one-use exchange, persisted install identity, own-tab URL/origin/state checks, durable credentials and reconnect.
- Core server requires fluxiq-client: browser-extension on JSON token/revoke calls; authorizes service profile only. No typed reference-code fallback implemented.
- Include additive discovery capability flags recommended in your report; URL presence is not evidence a flow is implemented.
- Never store password/cookie/code/verifier in logs or extension sync storage; determine appropriate transient lifetime and cleanup on denial/tab close/worker restart.
- Verify Chrome/Edge and Firefox extension permissions/host-access differences. Do not request all-site access for a chosen Core origin without explaining necessity.
- Separate unavailable end-to-end dependencies from runnable unit work; browser proof uses only approved existing realistic scenarios.
- End with Outcome/Changed/Validation/Not verified/Report/Notes, conclusions not file dumps.

# Durable hosted custody implementation design

- Role: heavy worker, gpt-6.1-sol, max. Read-only discovery; no agents/git.
- Goal: turn your tenant-custody-discovery findings into concrete implementable file-owned units and public seams, preserving password and revocation ordering across cold tenants.
- Own only: reports/tenant-custody-design.md under this plan directory. Keep bootstrap sources frozen for lead acceptance.
- Read your prior custody report, identity-access runtime credential change/revocation implementations, secret-keys credential-change subscriber, workspace manager lifecycle and platform persistence owners as needed.
- Must not touch source, shared documents, other reports, build outputs or any runtime data. No tests/builds/servers/provider calls.
- Return exact interfaces, persistence record invariants, crash ordering, replay barrier and file partitions for: trusted primary identity injection; selected-tenant login/key proof; durable session-end fanout; password prepare/commit/abort.
- Avoid copying key material or session identity stores across tenants. Account events must cover cold workspaces and removed memberships, and cannot retain stale tenant service closures after eviction.
- Never persist passwords or decrypted keys in event payloads. Explain recovery for process death between identity commit and tenant commits; identify any unavoidable user re-proof instead of pretending it can decrypt.
- Preserve paired clients outliving ordinary approval-session expiry; explicit session revocation and later explicit unlock are ordered events, not a permanent digest-liveness gate.
- Propose smallest complete acceptance slice and owning tests using two real tenant stores, eviction/restart and injected persistence failure; no success from only mocked callbacks.
- End with Outcome/Changed/Validation/Not verified/Report/Notes. State unresolved design choices explicitly and your recommended resolution.

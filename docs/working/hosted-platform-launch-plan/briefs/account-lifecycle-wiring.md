# Account lifecycle composition discovery
Role: Heavy worker, existing connect_service configuration; read-only.
Goal: Design exact web composition for missing revokeConnectedClients/deleteWorkspaceData provisioning callbacks.
Own: report account-lifecycle-wiring.md only. Preserve frozen credential teardown source/tests/report acceptance state.
Read: actual server/provisioning-listener/platform-services.ts, Core provisioning disable/delete/rotate/complete-deletion operations and context ports, browser trust repository, existing gateway revocation and workspace manager owners.
Must not touch: source/shared docs/git/dist/builds/runtime data. No browser/network/provider/account actions.
Required: map all owned trusts even after membership removal, including cold or missing physical workspace; no phantom runtime/root creation, no primary grant leak, no silent no-op cleanup success.
Pin primary/manager/composition; real callback ordering/retry behavior after partial delete. Identify direct repository seam needed only where owning gateway cannot be opened, without inventing competing persistence engine.
Distinguish revoking durable trust from disconnecting loaded sessions and model custody; no default locks or session-logout coupling. Disabling/deleting explicitly ends authority, unlike panel logout.
Return exact prerequisite interfaces/file partitions/tests and limits (single-process managed deletion; no active-active claim). Verify live source, not earlier report assertions.
No tests needed for read-only design; root will independently run frozen teardown acceptance after fresh Core. Standard return contract, short report with concrete paths.

# Workspace resolution implementation
- Role/model: standard worker, gpt-6.1-sol, medium.
- Goal: Implement discovery's first complete resolver-hardening unit, preserving local modes.
- Read: paired plan Current State, reports/tenancy-discovery.md, code-structure.md, owned source/tests.
- Own: apps/web/src/lib/workspaces/session-workspace.ts, workspace-fluxiq.ts, tests/web-workspaces.test.ts and new tests/session-workspace.test.ts in that directory.
- Must not touch: composition, auth/program routes, Core packages, shared docs, git or other reports. Lead owns email.
- Service requires valid platform session, active membership and existing workspace, never primary fallback. Lookup errors refuse before acquire; deterministic selection among valid memberships. Preserve local/self-hosted valid primary resolution.
- Run focused workspace tests only; no whole builds/typechecks while peers edit, no servers/paid/browser calls.
- Report: docs/working/hosted-platform-launch-plan/reports/workspace-resolution.md, with exact validation and required return contract.

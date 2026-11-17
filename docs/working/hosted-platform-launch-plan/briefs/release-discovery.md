# Release discovery implementation
- Role/model: standard worker, gpt-6.1-sol, medium.
- Goal: Publish additive immutable runtime identity in existing discovery contract and prove compatibility parsing preserves old documents.
- Read: plan Current State, reports/deployment-discovery.md, code-structure.md, owned files.
- Own: packages/contracts/src/platform/discovery/**; apps/web/src/app/api/discovery/build-discovery-document.ts and colocated tests only.
- Must not touch: runtime/build-identity source, Docker/deploy/docs, package versions, other source, shared docs or git.
- Reuse existing exported runtime identity reader if possible; missing/placeholder identity must be explicit unavailable or omitted, never invented. Protocol/minimum-client stay compatibility source; artifact digest is provenance only.
- Do not claim client rejection enforcement from metadata alone. Preserve existing consumers with optional field.
- Run owner-local tests only; no whole builds/checks, servers or paid calls while peers edit. If built exports stale ask lead.
- Report: docs/working/hosted-platform-launch-plan/reports/release-discovery.md including exact checks and return contract.

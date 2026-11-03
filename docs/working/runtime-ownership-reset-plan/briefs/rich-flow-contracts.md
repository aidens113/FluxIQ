Role: Standard worker; model gpt-6.1-sol; effort medium.
Goal: Prepare then complete finite rich authored-Flow/publication/legacy-artifact ownership.
Initial stage: read source and record exact declaration/file manifest before source edits; send Root manifest and wait for release because a frozen runtime diagnostic is next. No idle broad reading.
Original owned files: packages/fluxiq/src/programs/automation-studio/model/{flows,composites,artifacts}.ts; model/flow-adaptation.ts ONLY AutomationStudioFlowExpansionReferences declaration/import; model/flow-size/**; model/tokens-per-run/**; immediate tests for those subjects.
Canonical destinations: packages/fluxiq/src/flows/authoring/{flow,publication,legacy-artifact,settings}/**; flows/authoring/index.ts.
Must not touch: other model declarations, engine/runtime behavior, persistence/SQL, clock/log, package.json, downstream, shared plans/indexes, git.
Read: AGENTS.md boundary/structure; architecture/code-structure.md; reset plan Current State/Restart Audit; original named files only. Import dependencies only as needed to identify canonical owner.
Preserve full declaration bodies, literal metadata/defaults/SQL-free digest identity, function and constant identity. Split one exported thing per file and create barrels.
flows.ts imports edge/node directly from executable graph, schema/evidence from @fluxiq/contracts/recording, regions from canonical executable/regions, cost ceiling from stable runtime budget.
Move ONLY complete FlowExpansionReferences type out of flow-adaptation.ts so full FlowArtifact type has no reverse Studio edge; leave exact type alias there. Preserve all other flow-adaptation declarations unchanged.
Move flows/composites together to avoid their type cycle reaching Studio. Artifact legacy types stay complete, not reduced DTOs. Keep all old paths as identity-preserving exports.
Settings: preserve complete flow-size metadata/functions and tokens-cleared key; no new defaults or behavior.
After source release, retarget exact old owner imports within owned files/tests; consumers elsewhere are Root follow-up, not scope expansion.
Acceptance: canonical source/type closure excludes programs including erased types; original declaration/text/literal parity; actual blank-flow/publication/settings tests and legacy alias identity.
No broad check/build/audit while other writers run; Root coordinates frozen-tree gate. No provider/browser/user data.
Report: docs/working/runtime-ownership-reset-plan/reports/rich-flow-contracts.md with exact manifest and return contract.
No commits/push/shared-doc edits/agents. Do not source-edit before Root release.

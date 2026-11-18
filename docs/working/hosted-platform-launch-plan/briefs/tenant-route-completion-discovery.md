# Next unit: tenant route completion discovery
Role: standard worker, gpt-6.1-sol, medium. Read-only source, no delegation/git/builds/servers.
Goal: map remaining dedicated tenant-data routes onto the now-implemented workspaceProgramContext authority/lease seam.
Read: Core plan Current State; tenancy-discovery report adapter partitions; apps/web/src/lib/workspaces/program-context.ts; generic program route; dedicated routes and adjacent tests as needed.
Own only docs/working/hosted-platform-launch-plan/reports/tenant-route-completion-discovery.md.
Must not touch source/shared docs/other reports/artifacts/git; final validation currently runs on frozen source/dist.
Return exact file-owned implementation partitions (framework/recordings, gateway, catalog/assets/datasets), current authentication/allowlist constraints, minimal stable shared adapter if needed and narrow commands.
Acceptance: distinguish panel-only vs paired-client routes; preserve cookie precedence and actual primary identity; refuse foreign tenant/project; retain lease until buffered response or stream completion/cancel/error; no primary fallback in service mode. Preserve local behavior. Identify drain/binding rechecks required between awaits.
Do not propose unlock/password-on-approval: superseded by independent authenticated-client access. Do not duplicate already completed generic program routing or browser trust.
Report concrete smallest complete unit and dependencies; no broad source implementation yet. End with standard return contract.

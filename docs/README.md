# FluxIQ Documentation

FluxIQ documentation is readable directly in this repository and through the
Docs program in the control panel.

## Authored Docs

- [Architecture](architecture/README.md)
- [Working Codebase Audit Remediation Plan](working/codebase-audit-remediation-plan.md)
- [Current System](architecture/current-system.md)
- [Documentation System](architecture/docs-system.md)
- [Framework API Reference](reference/framework-reference.md)
- [Program Layout](architecture/program-layout.md)
- [Package Boundaries And Distribution](architecture/package-boundaries.md)
- [Client Gateway WebSocket Integration](integrations/client-gateway-websocket.md)
- [Runtime Kernel](architecture/runtime-kernel.md)
- [Automation Studio Importer Guide](integrations/automation-studio-importing-repos.md)
- [Automation Studio Flow Regions](architecture/automation-studio-flow-regions.md)
- [Automation Studio Flow DSL](architecture/automation-studio-flow-dsl.md)
- [Automation Studio Native and Code Nodes](architecture/automation-studio-native-nodes.md)
- [Global Programs](programs/global-programs.md)
- [Data And State](operations/data-and-state.md)
- [Automation Studio Adaptive Release Checklist](operations/automation-studio-adaptive-release-checklist.md)
- [Automation Studio Scale Certification](operations/automation-studio-scale-certification.md)
- [Automation Studio Legacy Retirement Runbook](operations/automation-studio-legacy-retirement.md)
- [Quality And Dependency Security](operations/quality-and-security.md)
- [Licensing](legal/licensing.md)
- [UI Theme](architecture/ui-theme.md)
- [Migration Plan](architecture/migration-plan.md)
- [Roadmap](architecture/roadmap.md)

## Stable Reference And Runtime Snapshots

The deterministic [framework API reference](reference/framework-reference.md)
is versioned with authored documentation. Regenerate it with
`pnpm docs:reference`; `pnpm docs:check` validates both freshness and local
Markdown links.

The Docs program also exposes ephemeral operator pages from the active host at
`.fluxiq/cache/docs/`. Those pages are ignored runtime state and include:

- platform map;
- global program catalog;
- global program API map;
- database inventory;
- background task state;
- deployment sync state;
- host domain registrations;
- host input and output contracts;
- a browseable TypeDoc reference and reflection model.

Runtime rebuilds never write into this repository's `docs/` tree.

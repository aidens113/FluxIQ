# Automation Studio Adaptive Release Checklist

Use this checklist before shipping substantial Automation Studio changes,
especially changes that affect Flow runtime behavior, adaptive recovery,
LLM-assisted edits, persistence, or the web workbench.

## Required Validation

- Run the relevant package checks for the changed surface:
  - `pnpm --filter fluxiq check`
  - `pnpm --filter fluxiq test`
  - `pnpm --filter @fluxiq/web check`
  - `pnpm --filter @fluxiq/web test`
- Regenerate public references after exported framework/API/model changes:
  - `pnpm docs:reference`
- Run authored/generated documentation validation after doc or reference
  changes:
  - `pnpm docs:check`
- For scalable Automation Studio releases, generate and attach the final scale
  certification report:
  - `pnpm studio:certify -- --evidence .fluxiq/cache/automation-studio-scale-certification/evidence.json --output .fluxiq/cache/automation-studio-scale-certification/report.json`

## Performance And Cost Evidence

- Open an Automation Studio project and Flow using only summary endpoints for
  normal navigation.
- Confirm previous runs, adaptations, instructions, subflows, recordings, and
  change proposals remain paged or summary-first.
- Confirm raw JSON, prompts, traces, and state dumps require an explicit detail
  selection or expansion control.
- Capture development API metrics from `program-api:metric` and verify broad
  detail endpoints are absent from normal project/Flow open.
- Run stable fixture Flows repeatedly and record LLM intervention count,
  token usage, and estimated cost by run.
- Release only when stable fixture Flow runs show LLM use trending down as
  deterministic automation, recovery paths, and proposals absorb repeated
  novelty.
- Remove scalable data-flow feature flags only after the Automation Studio
  scale certification report has `overallStatus: "passed"`.

## Adaptive Safety Gates

- Verify expected-state matches do not invoke LLM recovery.
- Verify deterministic recovery and reroute options run before LLM recovery.
- Verify budget exhaustion follows the configured stop/ask behavior.
- Verify locked, observe, and manual approval policies do not auto-invoke LLM
  edits.
- Verify recordings remain optional evidence and do not directly create Flow
  change proposals.

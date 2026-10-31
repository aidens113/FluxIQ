# Claude live preflight discovery

Outcome: Partial — command and positive-proof candidates identified; do not launch against the integrating pair.

## Source and task

- Active paired source currently reads Down `d30119faa8defdbb749ac92a26bd03b517823810` and Core `bf2978cc5b48a510bbafda59b8bb63245fdc210a`, both on `task/t833-trusted-control-intent`; each contains its local `dev` ancestor. Down's main `dev` is `afffc97f6b50d80f4fa2b8573d36b253456b5526`. Per the lead handoff, t833 still has structural/audit checks, integration, and shared build refresh outstanding. Run only after the paired source is integrated and those gates pass; a live run now would use an unaccepted pair.
- Recommended scenario/task: `company-website` / `company-website-gas-engineers`, workflow `gas-engineers`. The exact task asks for Eastmoor or Hollins Cross Gas Safe engineers, unique, in page order, with name/role/branch/gasSafeId. Its expected dataset has eight records. It is an extraction with no lasting act, avoiding the quote task's send-permission stop and the booking task's money-permission stop.
- Evidence: `apps/scenario-lab/src/scenarios/company-website/live-tasks.ts` (`GAS_ENGINEERS`, task declaration); `manifest.ts` (`TEAM_EXPECTED`, workflow); `tests/honest-path.test.ts` proves the whole team grid fetches at least four batches and extracted rows equal the eight expected records.

## Provider-free positive proof candidate

After the paired source is integrated and scenario-lab build inputs are current, run only the named honest-path browser case:

```powershell
pnpm --filter @fluxiq-web-extension/scenario-lab build
pnpm --filter @fluxiq-web-extension/scenario-lab exec node --test --test-name-pattern="gas-engineers: the whole grid" dist/scenarios/company-website/tests/honest-path.test.js
```

This drives the fixture in a browser through its whole grid and compares actual extracted rows to the fixture oracle. It is not yet run in this discovery, and it is a scenario-fixture proof rather than a proof of the extension's live model authoring path. The task remains eligible because it has nonempty, record-by-record expected data; don't proceed if this proof fails.

## Live command candidate

Once the paired source has passed integration gates and a free Lab slot is assigned, use a unique workspace and instance label. `FLUXIQ_LAB_INSTANCE` labels isolated build output and the run; the Lab CLI has no slot-reservation flag, and the four `lab-slots/slot-N/owner` files were not opened, so this discovery cannot assign a slot. Example below uses slot 1 only if the lead confirms ownership is free:

```powershell
$env:FLUXIQ_LAB_INSTANCE = "t833-claude-company-website-slot-1"
$env:FLUXIQ_LAB_LANE = $env:FLUXIQ_LAB_INSTANCE
pnpm lab run company-website --live-llm --llm-profile lab-create-flow --llm-provider anthropic --llm-model claude-sonnet-5-5 --llm-task create-flow --instruction-task company-website-gas-engineers --target persistent-isolated --workspace t833-claude-company-website-gas-engineers --replays 1
```

The run command creates the Flow from written instructions, judges its whole run, then `--replays 1` exercises the applied Flow once without provider calls. Do not substitute the candidate until after source integration. The separate `lab replay` command is also available if a later independent replay is needed; it requires the run's resolved project and flow IDs:

```powershell
pnpm lab replay company-website --workspace t833-claude-company-website-gas-engineers --project <project-id> --flow <flow-id> --instruction-task company-website-gas-engineers
```

The replay command has no provider options. Confirm its replay record says zero provider calls and the expected dataset reproduced; `--replays 1` in the live command already records this proof in the same run.

## Guard and evidence handling

- Read-only metadata check: `STOP-balance` absent; no `OVERRIDE-*` files; 0 starts in the preceding 30 minutes; ledger had 868 entries and its last event was a finish dated 2026-10-30. Both paired task branches contain their local `dev`. No key or ledger payloads were read into the report.
- This is not a complete evaluation of the next run's guards: the guard is instance/task/fingerprint-specific and normal admission reconciles the ledger before evaluating. A fresh instance label provides isolation, not permission to evade a prior failure. Inspect relevant previous failures and actual guard admission before launch; never relabel a refused run to bypass a guard.
- Once a real run is admitted, read the bundle at the machine Lab run root (`C:\Users\osrs_\FluxStuff\lab-runs\`), especially `snapshots/live-llm.json`, `evaluation.json`, the step log, replay evidence, and the spend-ledger finish. Report provider/model, verdict/oracle, provider call count, billed usage/cost, elapsed time, replay call count and dataset reproduction. The run bundle records per-Flow spend and settled usage; do not expose fixture page data, credentials, or secret-bearing logs.
- No browser, build, server, provider call, guard reconciliation, or test was launched here. The remaining preflight seam is source readiness: finish t833 paired integration/final audit and refresh accepted shared builds, then rerun the positive browser proof against that exact integrated pair before paid execution.

Outcome: Partial
Changed: `docs/working/framework-heavy-lifting-plan/reports/codex-1031/p10-control-intent/live-preflight.md`
Validation: read-only source/CLI/manifest and guard metadata inspection -> command candidates and guard metadata recorded; no test or run launched by scope
Not verified: scenario browser positive proof; post-integration source pin/build freshness; actual admission result; Claude authentication, billing, judged verdict, or zero-call replay
Report: `docs/working/framework-heavy-lifting-plan/reports/codex-1031/p10-control-intent/live-preflight.md`
Notes: Slot 1 is illustrative only and requires a lead-confirmed free slot. Current t833 pair is not yet an accepted run target.

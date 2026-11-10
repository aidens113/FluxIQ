# FluxIQ Web Browser Tests

The browser suite targets an already-running web panel. It never starts or
stops the application server.

## Prepare deterministic data

From the repository root:

```powershell
pnpm --filter @fluxiq/web fixture:e2e
```

The command resets only the marked `apps/web/.e2e-host` fixture directory and
writes `fixture-manifest.json` with generated project IDs.

The manifest includes `empty`, `small`, `scale1k`, and `scale10k` Automation
Studio projects. Older tests can still use `representative` for `small` and
`scale` for `scale1k`.

Verify the seeded counts before running performance captures:

```powershell
pnpm --filter @fluxiq/web fixture:e2e:verify
```

## Start the panel manually

```powershell
$env:FLUXIQ_IMPORTER_ROOT = (Resolve-Path apps/web/.e2e-host)
$env:FLUXIQ_CLIENT_GATEWAY_ENABLED = "false"
pnpm --filter @fluxiq/web dev
```

## Run captures

In another shell:

```powershell
$env:FLUXIQ_E2E_BASE_URL = "http://127.0.0.1:3000"
pnpm --filter @fluxiq/web test:e2e
```

Failure traces, video, screenshots, and baseline captures are written under
`apps/web/test-results/playwright`. Open the HTML report with
`pnpm --filter @fluxiq/web test:e2e:report`.

## Chat widget

`e2e/chat-widget.spec.ts` drives the panel's chat in a headed browser, with no model call. Seed the isolated root and its threads
with the server stopped, then run it against a server you started on a free port with `FLUXIQ_IMPORTER_ROOT` set to
`apps/web/.e2e-host` and no model key in its environment:

```powershell
$env:FLUXIQ_E2E_FAST_STUDIO = "true"
pnpm --filter @fluxiq/web fixture:e2e
node apps/web/e2e/support/seed-chat-threads.mjs
$env:FLUXIQ_E2E_BASE_URL = "http://127.0.0.1:<port>"
npx playwright test e2e/chat-widget.spec.ts --headed --project=desktop-chromium --workers=1
```

`FLUXIQ_E2E_FAST_STUDIO` seeds the small project alone. The spec answers asks, so each run needs a fresh seed. The typed send runs only when the panel's own key snapshot shows no enabled key.

## Panel specs

`e2e/panel-*.spec.ts` drive the new panel (shell, Home, Runs, Settings, Flows and the assistant) on the fixture host. They
sign in through `support/panel-fixture.ts` (`signInToPanel`), which also holds the dock helpers and the assistant script
writer. Every run of `panel-assistant.spec.ts` and `panel-flows.spec.ts` changes the fixture (a Flow is deleted, a step is
renamed), so seed again before each run.

1. Seed, with the server stopped. The seed resets only the marked `apps/web/.e2e-host` directory and adds a "Panel Fixture"
   project (manifest key `panel`): the Flows "Old search" (twelve runs, two failed), "Spare copy" and "Cheapest listings",
   four editable steps on that Flow's Subflow graph (`panel.editableFlowId`; a top-level Flow owns no steps, so the editor
   opens the graph Flow), and two model keys with made-up values. `fixture:e2e:verify` checks them (`FLUXIQ_E2E_VERIFY_TARGET=panel`
   checks only these).
2. Start the fixture panel from a production build, with the scripted assistant switched on and no real model key in its
   environment. Use a production build, not `next dev`: the dev server compiles each route on its first visit, which on a
   slow machine outlasts the specs' navigation wait. Build Core's libraries first if their source changed.

   ```powershell
   pnpm --filter @fluxiq/web build
   pnpm --filter @fluxiq/web fixture:e2e
   $env:FLUXIQ_IMPORTER_ROOT = (Resolve-Path apps/web/.e2e-host)
   $env:FLUXIQ_CLIENT_GATEWAY_ENABLED = "false"
   $env:FLUXIQ_E2E_SCRIPTED_ASSISTANT = "1"
   cd apps/web; npx next start --hostname 127.0.0.1 --port 3187
   ```

   Then set `FLUXIQ_E2E_BASE_URL` to `http://127.0.0.1:3187` in step 3.

3. Run the specs against it:

   ```powershell
   $env:FLUXIQ_E2E_BASE_URL = "http://127.0.0.1:3000"
   cd apps/web
   npx playwright test e2e/panel-shell.spec.ts e2e/panel-home.spec.ts e2e/panel-runs.spec.ts e2e/panel-settings.spec.ts e2e/panel-flows.spec.ts e2e/panel-assistant.spec.ts --project=desktop-chromium --workers=1
   ```

**The scripted assistant.** With `FLUXIQ_E2E_SCRIPTED_ASSISTANT=1` the panel's assistant replays a script instead of calling a
model, but only when the engine's data directory also holds the marker file `.fluxiq-e2e-fixture-root` that the seed writes
(Core: `runtime/conversations/assistant/model/fixture-host-model-source.ts`, bound in `programs/_shared/runtime.ts`).
Either one missing leaves the normal key binding, so it cannot be turned on for a real panel. A spec writes the script to
`<fixture>/e2e-assistant-script.json` with `writeAssistantScript`; it is read again at every model decision. A scenario is
chosen by words the person's message contains, and lists the model's decisions in order (`{ tool, input, why }` or
`{ reply }`); `{ $answer: "revision" }` inside a tool's input reads from what the previous tool answered. A call that waits for
the person's Allow must come first in its scenario. Script text is generic; never shape it like a Lab task.

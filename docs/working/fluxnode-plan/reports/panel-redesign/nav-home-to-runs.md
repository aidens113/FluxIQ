# P9-NAV: Home "All runs" does not navigate to /runs

## Outcome

Blocked. I found the root cause and confirmed it with evidence. The fix belongs in React's work loop. Next 15.5.24 vendors React (`node_modules/next/dist/compiled/react-dom`), and the installed react-dom 19.2.8 has the same bug. Both are outside the paths this brief owns. In-browser testing confirmed the upstream fix. I made no source changes, because a change in `features/**` or `app/(panel)/**` could only hide the problem for one link or one page.

## Root cause

This is a lost-ping bug in React 19.2's work loop, the one fixed upstream by facebook/react PR #36134 (issue #35821, merged 2026-03-24). Next 15.5.24 vendors React `19.2.0-canary-0bdb9206-20250818`. That build does not have the fix, and neither does react-dom 19.2.8.

The navigation runs in these steps:

1. Every panel navigation to a new segment takes Next's lazy-fetch path. The panel layout is dynamic, and the automatic prefetch stops at `app/loading.tsx`, so the `runs` cache node has `rsc=null`.
2. Next's `InnerLayoutRouter` mounts and calls `useDeferredValue`, which spawns a deferred lane. That lane is entangled with React's `DeferredLane`. The router then fetches `/runs?_rsc=…` and dispatches a server patch.
3. React renders the navigation, deferred and patch lanes together. The render reaches the page's client component. That component is a Flight module chunk whose JS file is still loading.
4. React's suspend path sets the exit status to `RootSuspendedWithDelay`, because the existing `app/loading.tsx` Suspense boundary is the handler. React then calls `attachPingListener`, which calls `chunk.then(ping)`.
5. Sometimes the chunk's JS file finishes loading between the read and the attach. The chunk's status is then `resolved_module`, so Flight's production `ReactPromise.prototype.then` initialises the module and calls `ping` synchronously, inside the render.
6. In this React build, `pingSuspendedRoot` does nothing in that case. It skips `prepareFreshStack` because the render context is set, and it does not record the pinged lanes either.
7. When the render ends, `markRootSuspended` marks every lane suspended with no ping pending. Nothing restarts the render until an unrelated state update arrives. On Home that is the 30-second section refresh, so the URL stays `/` well past the spec's 10 seconds.

Whether the module is still `blocked` or already `resolved_module` at that moment depends on network and scheduling timing. That is why the test fails about half the time.

The CSS-preload warning and the `/runs/<id>` prefetches are side effects, not causes. When I inserted the `.runs` stylesheet into the page before the click, the test still failed 8 of 12 times.

## Evidence

I added the instrumentation in a scratch copy of the failing test, with the same steps, device, viewport and fixture server on port 3187. It installs a fake React DevTools hook to capture the FiberRoot and wraps `WeakMap.prototype.set` to capture React's `pingCache`. All scratch files are under `C:/Users/osrs_/AppData/Local/Temp/claude/bc302d3e1bd85154/1d7e40a9-22b4-41e1-ad74-ba7e457da62b/scratchpad/navspec/`, with run logs in `run1.out` to `run10.out`.

- **Root state in every stuck run:** `pending == suspended` covers the three transition lanes (for example 14336 or 28672), `pinged=0`, `cancelPendingCommit=null` and `callbackNode=null`. The root is parked waiting for a ping. It is not waiting on a stylesheet commit.
- **Entanglements:** for example `12:1073752064`. The spawned lane is entangled with `DeferredLane` (1<<30) and with the navigation and patch lanes.
- **Router state:** the router's `useActionQueue` hook holds two fulfilled updates. One is the navigate state, where `runs` has `rsc=null` and a fulfilled `lazyData`. The other is the server-patch state, where `runs` has full data. The router did its job.
- **Discriminator (`run9.out`):** for each wakeable, I recorded the Flight module chunk's status at the moment React attached its ping. In all 8 runs, the status matched the result:
  - 2 runs where the status was `resolved_module` (a synchronous ping) both got stuck.
  - 6 runs where the status was `blocked` (an asynchronous ping) all navigated.
  - In stuck runs, the chunk's ping entry is gone from `pingCache` and the chunk is `fulfilled`, so the ping fired, but `root.pingedLanes` is 0.
- **Vendored code check:** in `next/dist/compiled/react-dom/cjs/react-dom-client.production.js`, `pingSuspendedRoot` has `? 0 === (executionContext & 2) && prepareFreshStack(root, 0) : (workInProgressRootPingedLanes |= pingedLanes)`. When the render context is set, the pinged lanes are dropped. `react-dom@19.2.8/cjs/react-dom-client.production.js` has the same code.
- **Fix check (`run10.out`):** I used `page.route` to serve `/_next/static/chunks/cf5ad9b10f715297.js` with the upstream fix applied. The change replaces `?0==(2&uO)&&is(e,0):uQ|=n` with `?(0==(2&uO)?is(e,0):uQ|=n):uQ|=n`, which records `workInProgressRootPingedLanes` in the render-context case, as #36134 does.
  - Navigation succeeded in 15 of 15 runs, including 7 runs that hit the `resolved_module` synchronous-ping trigger.
  - The 16th run failed before the click: the sign-in POST took more than 10 seconds, the timeout I set in the scratch copy. That failure is unrelated to the bug.
- **Baseline without the fix:** the real spec failed 4 of 8 with `--repeat-each=8 -g "Recent runs links to all runs"`, and the scratch copy failed 4 of 6, 5 of 8 and 4 of 6.

## What changed and why

Nothing in the repository. Every change available in the owned paths would only hide the problem:

- **Prefetch the page fully** (`prefetch={true}` on this one link): loads the JS early and closes the timing window for this link only.
- **Ship every page's JS and CSS with the shell:** narrows the window but does not close it.
- **Add `app/(panel)/loading.tsx`:** changes which Suspense boundary handles the suspend, so the page shows a loading state that is not otherwise needed.

The same lost ping can stall any client navigation whose page module is still loading. That includes rail links and links into `/runs/<id>` and `/flows/<id>`, not just this one.

## Recommended fix (outside my paths)

Apply the upstream fix in the code the panel actually runs. Either of these works:

1. **Patch `next@15.5.24` with `pnpm patch`.** In `dist/compiled/react-dom/cjs/react-dom-client.production.js`, `react-dom-client.development.js` and `react-dom-profiling.profiling.js`, plus the `react-dom-experimental` copies, change `pingSuspendedRoot`'s render-context branch from:

   ```js
   ? 0 === (executionContext & 2) && prepareFreshStack(root, 0)
   ```

   to:

   ```js
   ? 0 === (executionContext & 2) ? prepareFreshStack(root, 0) : (workInProgressRootPingedLanes |= pingedLanes)
   ```

   The development build has the same branch, written with `RenderContext` and `NoContext`. Then rebuild the web app and rerun the acceptance checks. This requires editing the root `package.json` (`pnpm.patchedDependencies`) and adding a `patches/` file. Remove the patch once Next ships a React build that includes #36134.
2. **Upgrade Next** to a release whose vendored React includes #36134. A third-party note on the PR page says Next 16.3.0 includes the fix and that 16.2 did not get a backport. I have not verified this.

## Commands run and observed results

- **Free memory:** `powershell -c "[int]((Get-CimInstance Win32_OperatingSystem).FreePhysicalMemory/1024)"` printed 3451. I took the lock with `mkdir .../.p9-heavy-lock`, which printed "LOCKED".
- **Fixture server:** started with `next start --hostname 127.0.0.1 --port 3187` and the API keys unset (`FLUXIQ_IMPORTER_ROOT`, `FLUXIQ_CLIENT_GATEWAY_ENABLED=false`, `FLUXIQ_E2E_SCRIPTED_ASSISTANT=1`). It printed "Ready in 2.5s", and `/api/ready` returned 200.
- **Real spec:** `FLUXIQ_E2E_BASE_URL=http://127.0.0.1:3187 npx playwright test e2e/panel-home.spec.ts --project=desktop-chromium --workers=1 --repeat-each=8 -g "Recent runs links to all runs"` gave "4 failed, 4 passed (2.0m)". Each failure was `toHaveURL` receiving `http://127.0.0.1:3187/`. With `--trace=off` it still failed.
- **Scratch spec without the fix:** "4 failed, 2 passed", "5 failed, 3 passed", "2 failed, 6 passed" (the `run9` discriminator run) and others.
- **Scratch spec with the stylesheet inserted first:** "8 failed, 4 passed".
- **Scratch spec with the in-browser React fix:** "1 failed, 15 passed". All 15 runs that reached the click navigated, and the one failure was the sign-in timeout.
- **Cleanup:** I stopped the server with `taskkill //PID 11552 //T //F` ("SUCCESS") and removed the lock ("lock removed"). `git status --short apps/web/src` showed no changes.

## Not verified

- **Acceptance checks:** none were run, because there was no source change to accept. That covers the Home spec 8 of 8, the seven panel specs after a fresh seed, vitest, the web typecheck and `structure-audit`.
- **The patch applied to the build:** I tested the fix only by rewriting the served JS in the browser, not through a `pnpm patch` and a rebuild.
- **Other links:** I did not reproduce the stall on other navigations (rail, `/runs/<id>`, `/flows/<id>`). The mechanism predicts they are exposed too.
- **Upstream release status:** I did not confirm which Next release ships the fix.

## Open questions

- Will the supervisor or user approve a `pnpm patch` of `next@15.5.24` (root `package.json` and a `patches/` file) or an upgrade of Next? Both are outside this brief.
- Why it passed before the merge with dev: the bug depends on timing (whether the page's JS chunk finishes loading inside a narrow window), so earlier passes are consistent with chance. I did not bisect the merge.

## Sources

- [React issue #35821](https://github.com/facebook/react/issues/35821)
- [React PR #36134](https://github.com/facebook/react/pull/36134) and [its diff](https://patch-diff.githubusercontent.com/raw/react/react/pull/36134.diff)

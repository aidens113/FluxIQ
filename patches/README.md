# Dependency patches

Each file here is a `pnpm patch` of one dependency, listed in the root `package.json` under
`pnpm.patchedDependencies` and recorded in `pnpm-lock.yaml`. Change one with `pnpm patch <pkg>@<version>` and
`pnpm patch-commit <dir>`, never by hand: the lockfile holds each patch's hash, so `pnpm install --frozen-lockfile`
refuses a patch file edited without it.

## `react-dom@19.2.8.patch` and `next@15.5.24.patch`: one fix, two copies of React

The same upstream React fix, applied to both copies of React's client renderer in the tree:
- `react-dom@19.2.8.patch` patches the copy the panel's browser bundle actually runs. The production build's client chunk
  carries `react-dom` 19.2.8 from `node_modules`, not Next's vendored copy; this is the patch that fixes the panel.
- `next@15.5.24.patch` patches Next's vendored React (`dist/compiled/react-dom*`, a 19.2.0 canary), so no code path Next
  takes through its own copy keeps the bug.

**What it fixes.** A lost ping in the React 19.2 work loop.
When a page's client module finished loading at the moment React attached its ping listener, the ping arrived
synchronously during the render. `pingSuspendedRoot` then neither restarted the render nor recorded the pinged lanes,
so React marked the lanes suspended with no ping pending, and the navigation never committed until an unrelated update
arrived. In the panel, clicking a link (for example Home's "All runs") left the old page on screen about half the time.
Evidence: `docs/working/fluxnode-plan/reports/panel-redesign/nav-home-to-runs.md`.

**The change.** The upstream fix, React PR [#36134](https://github.com/facebook/react/pull/36134) (issue
[#35821](https://github.com/facebook/react/issues/35821)): in `pingSuspendedRoot`, while a render is in progress, record
`workInProgressRootPingedLanes |= pingedLanes` instead of dropping the ping. Applied to all ten bundled builds
(`react-dom` and `react-dom-experimental`: client, profiling and testing, production and development). Nothing else
changes. In `react-dom@19.2.8` the same branch is patched in its four client builds (client and profiling, production
and development).

**Remove them** once the installed `react-dom` and the React that Next bundles are releases that contain #36134: delete
each entry from `pnpm.patchedDependencies`, delete the patches, run `pnpm install`, and re-run
`npx playwright test e2e/panel-home.spec.ts --repeat-each=8` in `apps/web` against a production build. That check fails
about half the time without the fix.

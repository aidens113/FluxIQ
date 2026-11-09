# w-flaky-feed: local-classifieds "Try again" flake

## Outcome
Done for the reported flake. The supervisor's mechanism is refuted and the real one found, but the conclusion holds: waiting longer would not help. One separate flake, in the opening steps and outside my files, remains.

## Cause (confirmed by reproduction, not the stated hypothesis)
The three blind scrolls are not the problem. Every filter change calls `restart()`, which starts a new generation and `load(0)`. Once batch 0 renders, `check()` asks for batch 1 on its own whenever the load-more area is in reach (true after the radius and price filters). `load()` waits `feedLatency` (250-500 ms) and only then builds the URL with `feedUrl(batch)`, from the params at that moment. If the next filter is applied inside that window:
1. The old generation's batch-1 request goes out carrying the new filter's params, so the server spends the one failure for the final query on it (`batch-failed`, key `query|1`).
2. The page discards that answer (`mine !== generation`), so no "Try again" is shown.
3. The final generation's batch 1 then succeeds. "Try again" never appears, and `waitForState text=Try again` times out whatever its length.

Evidence, from 24 headless browsers at once on the old recording (3 of 24 failed on this per run, at step `furniture-load-failed`):
- The page was already at "Results outside your search" with 10 entries when the wait expired.
- The feed request log showed `?radius=5&maxPrice=100&batch=1` ahead of `...&maxPrice=100&batch=0`, and `...&sortBy=...&batch=1` ahead of the final `...&batch=0`. Each is a stale request carrying the next filter's params, and the final key was requested once only.
- Slowing the feed (route delay of 1.5 s to 6 s) did not reproduce it. Added latency moves the click out of the window instead of into it.

Deterministic reproduction: after the price Enter, wait until batch 0 is in and the load-more skeletons show (batch 1 in flight), then carry on with the sort. Old recording: 5 of 12 fail at `furniture-load-failed` (3 of 6, 2 of 12, 5 of 12 in other runs; the rest pass by timing). Fixed recording: 12 of 12, 12 of 12 and 6 of 6 pass.

## Change (owned paths only)
- `apps/scenario-lab/src/scenarios/local-classifieds/script/filters.ts`: every filter helper (`radius`, `sortBy` and so `sortCheapestFirst`, `conditions` per checkbox, `priceBound`) now ends with a `waitForState` on the site's own state. Either the grey stand-in cards are gone (the load-more div is empty) with no "Checking your browser" alert up, or "Try again" is showing, where the stand-ins stay. A person lets the list settle before the next filter, and the fixed-time assumption goes. New exported `feedSettled`.
- `.../script/results.ts` (`scrollWholeFeed`): each scroll now waits for what it asked for, instead of three blind 2500 px scrolls and one 12 s wait. After a scroll it waits for the next batch's first grid entry (`> div:first-child > :nth-child(7|13|19)`, a batch being 6 entries) or for "Try again" or the end marker. After "Try again" is pressed it waits for the retried batch, then scrolls and waits likewise. Timeouts are 20 s, but these waits end as soon as the site's state does.
- Composite targets end in `>> nth=0`. A wait on two simultaneous matches (card 13 and the end marker) throws a strict-mode error; I hit this in the bikes test and fixed it.
- No site, oracle, `ScenarioStep` or test-file change. The test files needed no latency knob. The shared helpers serve all local-classifieds workflows, and all of them pass (below).

## Commands and results
- `node scripts/build-cache/cli.mjs scenario-lab:build` -> built, no TS errors.
- `node --test dist/scenarios/local-classifieds/tests/breadth.test.js` -> `# tests 7 # pass 7 # fail 0`. (A first run had 2 failures from the strict-mode error above; fixed.)
- `node --test dist/.../scenario.test.js dist/.../browser.test.js` -> `# tests 15 # pass 15 # fail 0`.
- `node scripts/structure-audit.mjs` -> `structure-audit: passed (244 warning(s), 552 baselined).`
- Load run of the fixed furniture recording, 24 browsers at once: 22 of 24 pass, and the 2 failures are the separate flake below. The old recording failed 3 of 24 at the cause above, in addition to that flake.
- Fixed budget-bikes recording, 16 at once: 14 pass, 2 fail at `open-buying` (same separate flake, not the feed).
- The throwaway scripts were `repro.mjs`, `par.sh`, `feed.mjs` in the session scratchpad. Nothing of them is in the tree.

## Not verified
- The settle wait can pass early in the roughly one-frame gap between batch 0 rendering and the feed's next `requestAnimationFrame` check, before batch 1 starts loading. I ran 12 + 12 + 24 + 16 loaded runs of the fixed recordings and saw one failure in the first furniture load batch of 24, at `furniture-third-batch-or-failure` (the consumed-failure signature, before I added `>> nth=0` and the strict-mode fix, so possibly something else). I did not see it again afterwards, but the gap is not closed structurally. Closing it needs the site to expose a "not loading" state, which the brief ruled out.
- Workflows other than furniture and budget-bikes were exercised only through `scenario.test` and `browser.test` and the breadth tests (all pass), not under parallel load.
- The Lab's real step runner (`step-runner.ts`) was not run. The tests use `tests/browser-support.ts`. Both resolve css targets with `page.locator`, so `:text()`, `:has()` and `>> nth=0` behave identically.

## Open: separate flake outside my files
Under 24-way load, `open-furniture` (and `open-buying` for bikes) fails: `role:link:Furniture` click times out at 10 s on the home page. The home feed has already requested batches 1 and 2 by itself, shows its own "Couldn't load more listings. Try again", and the page is scrolled (scrollY 524 to 795). Old and new recordings fail alike (about 2 to 5 of 24), so my change did not cause it. The likely cause is the click timing out because the link is not stable or reachable while the home feed grows. It is in `answerCookies` or the opening steps and `breadth/furniture.ts`, outside my ownership. I have not diagnosed it further.

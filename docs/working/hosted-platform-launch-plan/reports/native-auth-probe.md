# Native identity feasibility probe

Outcome: Done for this bounded feasibility unit. The lead rejected native identity UI as a privacy boundary after observing native tab visibility, actual unchanged content/MAIN injection and screenshot acquisition. The native callback did complete under blocked network, but the unchanged zero-callback-host-attempt criterion failed. Probe source and this report are frozen. No browser was launched by this worker; no further native candidate runs are authorized absent concrete new evidence changing the decision.

## Ownership and scope

Changed downstream new `apps/extension/e2e/native-auth-feasibility/**` only, plus the lead's explicitly released additive export in `packages/test-runner/src/guarded-browser/index.ts`. The latter re-exports the existing `installDeterministicNetworkGuard` and `DeterministicNetworkPolicy` through the narrow barrel; no existing engine/guard/launch behavior changed. This report records that ownership refinement to the original brief. No production source/manifest, Core library/contract, shared working document, product dist/stamp or git mutation was performed.

The new subtree contains the dedicated Playwright config; owned allocation/path/process/cleanup operations; stamped content reader and generated test-extension factory; exact startup proxy; Chrome launcher; closed evidence/error projection and persistence; Scenario Lab fixture; run finalizer; six separately selectable native cases; and sixteen provider-free support checks. Each source directory has its barrel. The whole runner barrel is not imported.

## Concrete launch and containment

- Uses the installed Chrome executable at `C:/Program Files/Google/Chrome/Application/chrome.exe`, **unified headless**. File-version inspection found Chrome **157.0.8103.52**, without starting it. Edge **157.0.4341.60** is also installed but is not implemented/selected by this bounded launcher. Actual running-browser identity will be recorded after the lead's launch.
- Generates an explicitly named test-only extension in ignored `apps/extension/test-results/native-auth-feasibility-owned/probe-chrome-*/extension`. `.gitignore` contains `test-results/`; the resolved directory is under the extension package, not under `e2e`.
- Freshness preflight reads the frozen `dist/chrome` source stamp via existing `compareBuildInfo`. It copies `content/index.js` and `page-world/index.js` **byte for byte** and records SHA-256 hashes. It does not rebuild anything, modify dist or forge a production build identity. The generated manifest narrows injection matches to loopback, preserves document-start/all-frame MAIN/isolated delivery, and has `identity`, `tabs`, `scripting`, `storage` plus production-equivalent `<all_urls>` host authority so screenshot refusal cannot be mistaken for native isolation merely because capture permission was absent. This generated capability exists only in its isolated test profile.
- Uses existing branded-browser CDP loading (`Extensions.loadUnpacked`) with unsafe extension debugging enabled only in that profile. The newer public CDP method has a narrow typed shim because installed Playwright types do not include it; returned extension ID is validated. No `as never` cast remains.
- Starts only the existing `company-website` Scenario Lab through `startScenarioLab`. Its existing home is the native authorization surrogate; `/team` is the distinct ordinary-tab control, and `/booking-widget` on the Lab frame origin is the off-origin surrogate for later lifecycle observations. No new synthetic site, OAuth provider, Core runtime or web-panel server is started. Scenario control uses its private run token only in driver memory; that token is not copied into the browser extension or evidence.
- A local HTTP proxy starts **before Chrome**, including restore startup. It forwards only the exact main/frame Lab origins, rejects every CONNECT/upgrade/other origin before opening a target socket, and strips proxy headers. Chromium receives that sole proxy with no DIRECT fallback and `--proxy-bypass-list=<-loopback>`, so unlisted loopback ports and external IP destinations do not escape through Chrome's implicit local bypass. Existing DNS containment is retained, with its conflicting no-proxy switch removed only in this test-specific launcher. No shared launch-helper behavior changes.
- Existing deterministic route and realistic-scenario guards add a second layer after launch. Service-worker guard proofs are awaited before claiming containment. The original generic launch helper is not used because its unconditional no-proxy argument and worker-cache removal would change the restore experiment. The startup proxy addresses the earlier unguarded-restored-navigation interval; it is not represented as an OS-level browser sandbox.
- Browser environment uses the existing provider-secret filter directly from its dependency-free source and disables Playwright debug logging. No provider/model call, account, pairing, password or other real data is involved.

Chrome documents the subtractive `<-loopback>` proxy rule and a single manual proxy's lack of DIRECT fallback; these are the specific browser configuration semantics used here, not an inference that DNS containment blocks IP traffic. [Chromium proxy configuration](https://chromium.googlesource.com/chromium/src/+/HEAD/net/docs/proxy.md).

## Observations and finite stages

Every native test requires `FLUXIQ_NATIVE_AUTH_PROBE=1`. The dedicated config has one worker, zero retries and stops after the first failure. Per-file configuration also disables traces, screenshots and video when collected through another config. No captured image/data URL is returned or written: the test worker retains synthetic fixture PNG bytes only long enough to calculate byte count, dimensions and digest.

The installed test extension accepts control commands only from its own exact `probe.html`, not from fixture content scripts. It retains content-ready presence as a tab-ID set and discards the payload. Native tab matching by known fixture URLs is an observation in this isolated experiment, not a proposed production authentication or ownership authority. Callback code/state and the generated redirect URL stay in the worker closure; success returns only exact-match/outcome flags. Local cancel invalidates the result without claiming to close the native UI.

Six separately selectable native tests were authored:

1. Pending native tab/driver visibility, actual unchanged content/MAIN probe presence, in-memory visible capture, one synthetic native callback success and a second user-close rejection. Capture/injection are observations, not assertions that native contents are private; a passing harness test can establish an unsafe exposure and must be interpreted from its closed evidence.
2. Local cancel followed by a late synthetic completion, proving result refusal without claiming public native abort support.
3. Actual extension `runtime.reload()` while the native surface is pending, distinct from worker target stop.
4. An explicit owned-extension service-worker target stop and reawakening.
5. Same-profile graceful close/relaunch with native off-origin surrogate pending.
6. Same-profile, exact-profile-proven browser-process crash/relaunch. No process is selected by image name; current exact profile proof is repeated before termination.

Only case 1 was diagnosed by the lead. Cancel/reload/restore/crash, repetition and other browsers were not run and are no longer planned for this rejected candidate. No case was executed by the worker.

Each run records a fixed stage and accumulated allowlisted observations even on failure. The error contains no raw exception/cause, URL, callback, storage or image. A failure attachment includes existing evidence plus cleanup status, so setup refusal is not reported as a verdict about native browser behavior.

After the first outside-test failure, fixed stage names and already-projected observations are also printed as each stage/result is reached. This preserves the distance travelled even if a worker-level transport fault prevents a final attachment. No raw error or URL was added to that output.

## Resource ownership and cleanup

Allocation/path proof and a fresh exact-profile process-idle check run immediately before recursive removal. The root/profile must resolve to the intended owned paths. The profile is preserved only for that run's restart observations; normal cleanup removes only its owned allocation. No existing browser profile is read or changed.

Partial allocation/fixture/browser setup is inside the outer cleanup boundary. Fixture setup closes Lab listeners if its control requests fail. Every context/transport/process-proof/proxy cleanup callback is deferred into `Promise.resolve().then(...)`, so a synchronous throw cannot skip later resources. Results are inspected and projected as closed flags. Earlier cleanup uncertainty remains false; the outer finalizer never replaces it with a contradictory success or deletes that allocation. A failed process or cleanup proof retains the allocation for diagnosis. This is a truthful failure state, not proof that a retained browser/profile is safe to reuse.

## Observed helper validation

From downstream `apps/extension`:

```powershell
$env:NODE_OPTIONS = '--no-experimental-strip-types'
$env:FLUXIQ_NATIVE_AUTH_PROBE = '0'
pnpm.cmd exec playwright test -c e2e/native-auth-feasibility/playwright.config.ts containment.spec.ts completion.spec.ts proxy/tests/transport.spec.ts tests/fixture.spec.ts
```

Observed final worker result: **16 passed (17.9s)**, no browser. The lead independently reran these same support checks: **16 passed (15.1s)**. Cases cover synchronous and asynchronous cleanup failures; failed partial setup retaining its allocation/no later cleanup-success claim; a real owned Node helper process proving exact-profile removal refusal; closed evidence filtering and persisted-file redaction; distinct completion-failure codes without relaxed criteria; provider-secret stripping; owned path refusal; byte-identical current artifact copy; proxy forwarding/refusal; CONNECT/client-stream cancellation and truncated upstream response; unexpected transport failure visibility; and four rapid actual company-website fixture setup/close cycles. The Node process is only an isolated marker, receives a stripped environment, is terminated through its own created child handle, and is confirmed exited before cleanup; it is not a browser.

Proxy validation forwarded one allowed fixture request, rejected unlisted localhost and loopback-port destinations, an external IP literal and CONNECT, and proved only the allowed target was reached. No external target connection was made.

The custom source-scoped TypeScript `createProgram` check used strict mode, exact optional properties, unchecked-index protection, ES2022/Bundler resolution, Node/Chrome types, no emit, and inspected all dependency diagnostics: **33 root TypeScript files, 0 diagnostics**. The programmatic repository structure audit scoped findings to the subtree and released barrel, with full import graphs for boundary/cycle rules: **39 files, 0 failures**. The lead's subsequent whole downstream structure audit reported **0 failures, 250 warnings**. No baseline was changed.

Earlier iteration findings were corrected before the final gates: PowerShell argument quoting caused the first type-probe command itself to fail before checking code; the corrected stdin-based probe found the actual guard method/header typing mistakes. The initial scoped audit found unsupported `as never`, a private guard import, generic test filename and statement packing. Those were fixed. The lead then identified partial/synchronous cleanup cases, which passed in the pre-diagnosis nine-check run and remain covered in the final sixteen-check run.

## First independent diagnosis and transport correction

The lead ran only the pending/capture/completion/close filter. It naturally ended after **1.8s, exit 1**, with unhandled `read ECONNRESET` and an error outside the test. No native observation or final attachment was produced. The lead then observed no Chrome/Edge/Firefox/Node process whose command line named the owned probe allocation. This is process absence after failure, not proof of whether Chrome started or of the last reached stage. No native isolation, capture or restore conclusion follows.

The worker did not rerun a browser. A streamed HTTP-response cancellation passed locally on unchanged source, so it was not called a reproduction. A subsequent local TCP client reset immediately after reading the proxy's refused CONNECT response reproduced the same unhandled reset/outside-test error in **25ms**. The owning CONNECT socket had no error handler after HTTP handed it to the custom handler. This proves the local defect; attributing the unstaged browser failure to that same path remains an inference until the lead's next diagnosis.

The proxy now owns socket/request/response/upstream/server errors per connection. `ECONNRESET` and `EPIPE` count as expected transport cancellations; other errors increment a separate failure count and prevent containment acceptance. Duplicate events for the same Error object are counted once. No global handler, catch-all suppression, retry cap or external network exception was added. The CONNECT reset regression now verifies one reset, no unexpected transport failure and continued proxy service. A separate regression proves unknown errors remain visible; the real fixture setup/close test also passes.

Further lead review identified the upstream HTTP `IncomingMessage` as a separate event owner. The new truncated Content-Length regression exposed an open downstream wait before the handler; that isolated helper was interrupted without a browser. The upstream response now records its error and destroys the downstream instead of leaving an incomplete response open. The same regression passed in 42ms after the fix. The final fourteen-test run and static gates above passed after this completed ownership correction. Transport regression tests have a finite ten-second assertion deadline; no product timeout or retry behavior changed.

## Observed native result and decision

The lead's changed-source diagnosis reached native pending state: **one matching native tab, isolated content present, MAIN probes present, driver-visible native page**, and successful native-window PNG acquisition of **123,244 bytes, 1264 x 590**. No image was saved. This is evidence that this native surface is available to extension acquisition; it is not a claim about a real account or every browser/version.

That diagnosis ended at the old generic completion assertion after **4.2s**. The harness had withheld the completion row until after its assertions and Buffer-only list-reporter attachments were not available as files at the expected path. The correction records closed completion values before validation, uses fixed callback-mismatch/network-attempt/unconfirmed codes, prints cleanup, and writes closed JSON through `testInfo.outputPath` before attaching. The two support regressions verify failure discrimination and actual file persistence/redaction. Neither completion criterion was weakened.

The lead's latest first-filter diagnosis naturally ended after **3.2s**, with `callback_network_attempt.completion`. Closed tool output established **outcome success, callbackMatched true, native window closed true, nativeCallbackRequests 1, denied 14, forwarded 3, transportFailures 0, cleanupVerified true**. The callback function therefore worked under network denial. The zero-attempt criterion remained red; user-close and other lifecycle verdicts did not follow. The lead observed the JSON attachment listing/output, not an independent read of its contents. A later worker search after support testing found no JSON in that output directory; Playwright clears outputDir at each invocation, so that later absence does not invalidate the earlier tool output or establish durable archival. The results above are retained here from verified closed tool output. [Playwright output directory lifecycle](https://playwright.dev/docs/api/class-testproject#test-project-output-dir).

The callback counter is **aggregate**, not payload evidence. `proxy/start.ts::refuse` receives an absolute URL from ordinary HTTP rejection or the request authority from the CONNECT rejection. The recorded count does not identify which branch produced the callback-host attempt. For this HTTPS callback, CONNECT is the normal Chrome HTTP-proxy mechanism, but assigning the observed count to that branch would be an inference. The CONNECT handler does not establish TLS or forward a tunnel; the HTTP branch also refuses this non-allowlisted callback before opening an upstream socket. Neither branch records request text in the closed evidence. The observed host attempt does not demonstrate code/state leakage, and no such claim is made. No external callback access or network exception was granted.

The lead's decision is **reject native UI as the privacy boundary for this design**. Actual content/MAIN acquisition and screenshot capability already establish the problem. The public native launch API also supplies no tab handle that the existing registry could durably own before navigation. Use a controlled inactive blank tab, obtain its ID, claim/reserve ownership and persist it before auth navigation, then apply admission at acquisition and publication boundaries. Mandatory inert content/MAIN behavior and screenshot exclusion remain required. No new Core native callback contract is needed. Browser restart/restored-external-tab recovery remains a separate explicit privacy requirement; this rejected experiment does not solve or waive it. Existing authenticated client/model-key access remains independent of tab privacy.

Actual cleanup evidence is limited precisely. The latest tool output reported `cleanupVerified:true`, meaning the owned cleanup/path/process/removal checks completed. The worker separately observed zero owned browser/Node processes and one retained allocation created **2026-11-15T05:14:21Z**; the lead confirmed that allocation predates the later completion run around 05:28Z. It was left intact without opening profile contents and is not attributed to the later run. No guessed profile was removed.

## Historical lead diagnostic command (not run by worker)

From downstream `apps/extension`, after source/containment review:

```powershell
$env:FLUXIQ_NATIVE_AUTH_PROBE = '1'
$env:NODE_OPTIONS = '--no-experimental-strip-types'
pnpm.cmd exec playwright test -c e2e/native-auth-feasibility/playwright.config.ts probe.spec.ts --grep 'native pending visibility' --workers=1
```

This records the diagnosis entry, not authorization to run it again. Candidate evaluation is closed for this privacy purpose. Source is frozen; no worker helper/type/audit/browser consumer remains active. The passing sixteen-test command above is the independent support acceptance entry.

## Remaining proof and Firefox limits

Unified headless Chrome behavior cannot establish headed auth UX or every supported Chrome/Edge version. No visible window has been opened by this worker. More browser runs are not justified merely to turn this rejected candidate green.

Actual reload, worker stop, same-profile restore/crash, delayed restoration, tab detachment/child signup windows and repetition are unverified, not guaranteed by source. Temporary Firefox add-on loading exists in the repository but this unit implements Chromium first. Any separately authorized reevaluation would require Firefox's own isolated persistent-profile/RDP adapter, stable UUID across reopen, native callback/content/capture observations and proof before/after temporary-addon reinstall. Temporary reinstall cannot prove production signed-addon startup ordering. The content-only Firefox harness cannot substitute for an installed native identity flow. These are limitations, not remaining authorized runs. No native Core redirect-contract changes should be made on the basis of this rejected candidate.

Outcome: Done (bounded candidate rejected as a privacy boundary)
Changed: New downstream `apps/extension/e2e/native-auth-feasibility/**`, granted narrow `packages/test-runner/src/guarded-browser/index.ts` export, and this report.
Validation: Worker16/16 and independent lead16/16 support checks passed; scoped strict types33/0; scoped structure39/0; lead whole downstream structure0fail. Lead native diagnosis observed acquisition exposure and successful callback under network denial, with unchanged zero-attempt rejection and verified cleanup output.
Not verified: User-close/lifecycle/repetition; Firefox/Edge or headed mode; Core native redirect compatibility; independent browser JSON-body read or durable artifact retention.
Report: `docs/working/hosted-platform-launch-plan/reports/native-auth-probe.md`
Notes: Probe and report frozen. Controlled-tab implementation approved separately; no more candidate browser runs authorized. No browser/provider/Core/panel-server launch by worker or production auth/key-lock change in this unit.

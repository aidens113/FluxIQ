# Controlled-tab hosted PKCE protocol

Outcome: Done for the bounded unwired protocol and additive ownership queries. Owned production source/tests are frozen. No background activation or live browser claim is included.

Owned downstream files: apps/extension/src/background/connect/pkce/**, background/authentication-tabs/registry.ts, and background/authentication-tabs/tests/ownership.test.ts. This report is this worker's only Core edit. Root owns the separate background/authentication-attempts/** adapter. No credential repository/transport, connection/background composition, content/MAIN, panel/UI, Core source/contracts, package, dist, shared working document, or git mutation occurred here.

## Frozen public API

createHostedPkceProtocol accepts selection {id, origin, clientLabel, extensionVersion}, isCurrent, actual private credentials repository, attempts, authenticationTabs, tabs, fetch, crypto, and now. It returns start(), observe({tabId,url}), cancel(), and restore() promises. Selection is copied/frozen. isCurrent must synchronously return literal true; observing anything else permanently retires that controller.

The authenticationTabs port is ready(), own(), owns(tabId,attemptId), and sessionIdentity(). The new queries provide authority only in the ready phase. Exact ownership becomes true only after its durable save; a pending exclusion reservation does not supply ownership. A failed registry supplies neither ownership nor session identity.

The frozen tab port is:

    createBlank(): Promise<number>
    navigateOwned({
      tabId, attemptId, browserSessionId, url,
      stillCurrent: () => boolean
    }): Promise<void>

Future privileged browser composition must create an inactive blank tab and recheck stillCurrent after its own awaits before navigation. The protocol checks committed ownership/current session and generation before and after its awaits. It never closes/releases an authentication tab or guesses safe cleanup.

Public storage exports are HostedPkceStoredAttempt, HostedPkceAttemptEnvelope, HostedPkceAttemptStore, and readPkceAttemptEnvelope(value: unknown): HostedPkceAttemptEnvelope. The frozen port is:

    load(): Promise<{browserSessionId:string; revision:number; attempt:StoredAttempt|null}>
    compareAndSwap(
      expected: {browserSessionId:string; revision:number},
      next: StoredAttempt|null
    ): Promise<boolean>

True means both authoritative session and expected revision matched and revision+1 durably committed. False means conflict; unavailable/corrupt persistence rejects. Empty current-session state is revision zero/null. The parser requires exact closed envelope/phase fields, actual install/state/verifier schemas, valid identifiers and consistent session. Parsed scalars/nested audience are copied/frozen. Persisted audience remains comparison data and never receives the private repository's checked-binding brand.

Preparing/waiting hold state/verifier. Exchanging removes both before POST and adds only the submission marker; terminal records hold only base/tab/outcome/fixed failure. Callback code is never persisted. The real session backend is root's separate single-background-owner adapter; this module invents no global storage or in-memory substitute and claims no native/active-active CAS.

Safe public views contain only phase, optional attemptId and optional fixed failureCode. Owner-only adoption metadata adds binding/install/revision/lineage/client/user/workspace identifiers. Neither exposes credential, code, state, verifier, authorize URL, email/display name, response body or error cause. Failure codes are runtime-normalized and frozen.

## Implemented transitions and security

Start fetches fresh actual discovery from the immutable HTTPS origin and constructs a genuinely checked credential binding. It requires service profile, stable instance id, explicit PKCE capability, the exact exported client gateway protocol, and an explicit compatible browser-extension minimum. Existing active trust requires explicit transition. There is no reference/tokenless fallback or default key/connection unlock.

Three independent 32-byte random values produce state, verifier and nonsecret attempt identity. State/verifier use unpadded base64url; a fixed attempt. prefix makes every random leading byte valid under the existing auth-tab identifier grammar. Duplicate entropy is refused. S256 uses injected Web Crypto. Actual fixed-client authorize schemas and the same-origin /connect/done contract remain unchanged.

Durable start order is preparing, inactive blank creation, awaited exact ownership, waiting, then guarded navigation. Terminal tabs remain owned/excluded. A tab created while cancellation races is never navigated to authentication after the controller retires.

Observe requires exact owned tab, pinned origin, exact /connect/done, no URL credentials/query, strict actual fragment and saved state. Wrong/duplicate/mixed/unknown fields do not trigger discovery or exchange. A valid denial terminates without POST. A valid code refreshes discovery and checks the full audience, installation/revision, absence of active trust, session and owner before waiting-to-exchanging CAS. Competing controllers/callbacks cannot both win. No queue spans network/tab waits, so cancellation progresses.

The one token POST uses actual fixed request schemas, JSON and fluxiq-client: browser-extension, credentials omit, redirects error, cache no-store and no-referrer. It neither forges Origin nor accepts panel cookies/passwords. Actual success/error schemas discard descriptions, body and cause. Network/abort/lost response, malformed success and 503 are uncertain, never automatic code retry.

Adoption requires safe future expiry and exact gateway. It commits new trust through the actual repository at the captured revision using deterministic private operation ids, validates the returned snapshot before trusting its revision for cleanup, revalidates the full immutable exchange/session/owner, persists terminal adoption, and re-reads exact private trust before returning owner metadata. A callback alone never marks connected.

Cancellation retires generation before awaiting persistence, terminates the matching attempt and then aborts owned token I/O. A valid delivered proof is still parsed after cancel/server switch. An unadopted proof is journalled against the original checked audience. A known adopted proof is forgotten only at its exact revision, atomically journalling cleanup. A newer revision/rotation wins: the adopted predecessor is never separately queued after conflict.

Matching active client/proof ambiguity and cleanup persistence failure produce explicit cleanup_required. Cleanup can replace a provisional adopted terminal marker after cancellation, so restored attempt status stays truthful. If attempt persistence itself is unavailable, the public failure remains explicit; no durable status or completed revocation is invented.

The existing repository's unadopted read-plus-queue check is not atomic. This protocol performs no revocation HTTP. Root acknowledged that future revocation composition must review repository/server generation semantics and guard current trust at intent consumption, rather than blindly dispatching cleanup. The atomic exact-revision forget guarantee applies to adopted cleanup; this report makes no stronger claim for unadopted queueing.

Same-session waiting restore refreshes discovery and requires identical audience/install/revision, exact committed owner and unchanged attempt revision; it never reclaims with own(). Preparing restore invalidates incomplete work; exchanging restore becomes interrupted/uncertain without POST. New-session/corrupt state refuses. Terminal status is historical attempt metadata, not proof of current connection authorization. Surviving private trust remains subject to its normal guarded private-read/transport path, with no callback replay. No arbitrary waiting TTL was added because code expiry begins at consent, not initial navigation.

## Observed validation

From downstream apps/extension:

    $env:EXTENSION_TEST_BUILD_LABEL='t914-hosted-pkce'
    node scripts/test-extension.mjs background/connect/pkce/tests background/authentication-tabs/tests background/authentication-attempts/tests

Observed final result: exit0, 152 tests passed, 0 failed/cancelled/skipped, 902.831ms test duration, 1.64 seconds command wall time. This includes PKCE tests, all existing/additive registry checks, and root's 16 isolated session-adapter tests. No browser/network/provider ran.

Initial protocol/auth-tab run was 120 tests:117 pass/3 fail, 0 cancelled, about0.57s. Two callback fixtures stopped before callback setup because random attempt ids could start with characters the existing registry correctly refuses. A third showed an initial store failure masked by a later cleanup conflict. Both causes were fixed, with deterministic leading-byte/entropy and failure regressions; no unchanged rerun was used as a fix.

The expanded final suite checks fixed PKCE vector; independent entropy and safe attempt ids; exact authorize/token schema/headers; durable claim ordering; compatibility refusal; strict foreign/malformed return rejection; denial; one exchange winner across controllers; cancellation/selection during discovery, installation/read, digest, load/CAS, ownership/navigation; cancel before exchange marker; delivered proof cleanup; post-commit exact forget; newer rotation survival; cleanup/storage failure; truthful terminal repair; uncertainty/restart/no replay; malformed/expired/unsafe-expiry/foreign-gateway response; and no secrets in public outcomes.

An announced combined rerun was held before launch after root's independent adapter runner hit the Core currency guard: UI-components needed rebuilding following fluxiq0.50.1. Root rebuilt the required graph and observed the guard pass; the final152 run occurred after explicit fresh-build release. No guard bypass occurred.

Final scoped TypeScript probe: exit0, 50 protocol/auth-tab root files, 0 diagnostics, including tests and dependencies. The first probe used the wrong Node typeRoots and found an owned field name clientLabel instead of actual connectFieldSchemas.label; corrected the probe/package typeRoots and source. One deliberate malformed-fixture cast now passes through unknown.

Exact final type probe, from downstream root:

    @'
    import ts from 'typescript';
    import fs from 'node:fs';
    import path from 'node:path';
    const root=process.cwd();
    const dirs=['apps/extension/src/background/connect/pkce','apps/extension/src/background/authentication-tabs'];
    const walk=p=>fs.readdirSync(p,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(p,e.name)):e.name.endsWith('.ts')?[path.join(p,e.name)]:[]);
    const files=dirs.flatMap(d=>walk(path.join(root,d)));
    const config=ts.readConfigFile(path.join(root,'apps/extension/tsconfig.json'),ts.sys.readFile);
    const parsed=ts.parseJsonConfigFileContent(config.config,ts.sys,path.join(root,'apps/extension'));
    const diagnostics=ts.getPreEmitDiagnostics(ts.createProgram(files,{...parsed.options,noEmit:true,typeRoots:[path.join(root,'apps/extension/node_modules/@types')]}));
    process.stdout.write(ts.formatDiagnosticsWithColorAndContext(diagnostics,{getCurrentDirectory:()=>root,getCanonicalFileName:f=>f,getNewLine:()=> '\n'}));
    process.stdout.write(JSON.stringify({rootFiles:files.length,diagnostics:diagnostics.length})+'\n');
    process.exitCode=diagnostics.length?1:0;
    '@ | node --input-type=module

Final scoped structure probe: exit0, 39 owned files, 0 failures, 0 warnings. Initial audit found one malformed URL catch-as-null; changed to ignore only the expected URL TypeError and refuse unknown failures. No baseline changed.

Exact final structure probe, from downstream root:

    @'
    import fs from 'node:fs';
    import path from 'node:path';
    import {pathToFileURL} from 'node:url';
    import {createContext} from './scripts/structure-audit/context.mjs';
    const ctx=createContext();
    const owned=p=>p.startsWith('apps/extension/src/background/connect/pkce/')||p==='apps/extension/src/background/authentication-tabs/registry.ts'||p==='apps/extension/src/background/authentication-tabs/tests/ownership.test.ts';
    const scoped={...ctx,files:ctx.files.filter(owned),sourceFiles:ctx.sourceFiles.filter(owned),scriptFiles:ctx.scriptFiles.filter(owned)};
    const findings=[];
    for(const name of fs.readdirSync('scripts/structure-audit/rules').filter(n=>n.endsWith('.mjs')).sort()){
      const rule=await import(pathToFileURL(path.resolve('scripts/structure-audit/rules',name)).href);
      const full=['imports','import-cycles','test-placement','directory-barrels'].includes(rule.id);
      for(const finding of rule.run(full?ctx:scoped)) if(owned(finding.path)) findings.push({...finding,rule:rule.id});
    }
    process.stdout.write(JSON.stringify({files:scoped.files.length,failures:findings.filter(f=>f.severity==='fail'),warnings:findings.filter(f=>f.severity==='warn')},null,2)+'\n');
    process.exitCode=findings.some(f=>f.severity==='fail')?1:0;
    '@ | node --input-type=module

## Limits before activation

Read-only whitespace checks also passed: Core git diff --check scoped to this report and downstream git diff --check scoped to the owned registry/test/PKCE paths both exited0. New files were covered by the scoped structure/type checks; git diff itself reports tracked changes only.

Not verified here: real browser tabs/lifecycle, live session-storage API, actual HTTP/CORS/permissions, account/provider calls, background composition, extension build, or full suites. The tab port remains unbound to browser APIs. The accepted native probe and its test-only subtree remain frozen/unchanged.

Parent acquire-time capture/privacy admission, inert-before-admission content/MAIN hooks, and unknown externally restored authentication-page recovery remain launch prerequisites. Blank-tab ownership alone is not a screenshot acquisition barrier. Ordinary authenticated client capability and non-auth automation remain independent of connection/key unlock state. No server or paid run was started. All worker validation consumers have ended; only the lead may commit/push this coherent unit.

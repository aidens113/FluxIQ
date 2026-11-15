# Inert content and MAIN admission
Role: Heavy worker, existing cloud_portability configuration.
Goal: P2 privacy integration: content starts without acquiring page evidence; admitted documents work normally, suspension discards pending evidence. Hosted start stays unexposed.
Own downstream: content/{index,instance,recorder,message-handler,dom-events,frame-geometry}.ts, content/page-changes/**, new content/admission/**, page-world/**, adjacent owning tests; Core report inert-content-admission.md.
Must not touch: background entry/facades/consumers, shared/tab-access/** (browser_trust owns), shared/protocol/constants, P1 authority/risk, credentials/PKCE, Core source, package/dist/git/shared docs.
Read: hosted-connect-activation report; frozen shared/tab-access exports; actual owned entry/import side effects and existing owning tests.
Before editing: propose minimal grant lifecycle/data envelope and any extra files required to stop pending page reads/actions after suspension. Wait for root shape approval; do not broaden ownership silently.
Frozen wire: CONTENT_ADMISSION_PORT; data-free hello type/version1/instanceId; closed reply/suspension from shared/tab-access. Real privileged runtime Port, no URL/title/DOM/state in hello.
Proposed evidence envelope: existing {type,payload} plus top-level admission:{grantId,instanceId}. Root owns background validation before payload inspection. No fake empty recording payload as handshake.
Inactive startup: no readiness/basePayload/page snapshot, observers or retained dialog/prompt/request data before admission; early MAIN wrappers pass through native behavior without reading arguments/evidence. MAIN hints are page-controlled, never background authority or secret-bearing.
Suspension: disconnect/worker loss/document lifecycle/supersession/explicit matching grant suspension invalidates generation immediately. Clear timers/pending input/mutations without flushing, remove retained probes/evidence, ignore delayed old grants/results.
Message handlers refuse protected DOM/actions before reads. Preserve safe non-page build/ping replies as needed; no fallback allowing actions while grant unavailable. Inspect imported module side effects too.
Admitted documents retain normal recording/dialog/actions and native wrappers. Page-forged MAIN signals must never grant isolated/background authority. All frames begin inert and require their own real sender-bound admission.
Accept: getter spies prove no page-field access before grant; valid activation; forged/late grants, port loss, cached document/supersession, pending typed input no-flush, inactive native dialog/fetch behavior, ordinary admitted regressions. Add tests beside owners.
Only pure tests until root refreshed-library signal; no builds/full suite/browser/network/providers. Use unique extension test label and scoped types/structure after source freeze.
Return exact API/wiring needs/source freeze/observed checks/unverified actual browser behavior and standard contract.

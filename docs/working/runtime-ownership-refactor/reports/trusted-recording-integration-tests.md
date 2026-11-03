# Actual trusted recording integration tests

Status: tests/source frozen; Root independently passed all 13 actual integration cases in the common window, together with its 6 real-Service scope cases. No worker runtime duplication. Final normal package/checkpoint integration remains Root-owned. Brief: `../briefs/trusted-recording-integration-tests.md`.

Owned files (prefix `packages/fluxiq/src/programs/automation-studio/client-gateway/`): `tests/trusted-scope.test.ts` and private `tests/trusted-scope/{fixture,gate,index}.ts`. No existing context/oracle, Root recording-domain subject, B/C source, capture/native SQL/performance or SQL foundation file changed.

The fixture constructs the real ClientGatewayService, performs real hello/pairing approval, creates real temporary AutomationStudioService/projects with persistent storage and installs the real bridge. It registers one actual generic device policy/required domain on the existing NativeRuntime. Original policy receiver/arguments are recorded; no purity, receipt, execution permission, snapshot-auth replacement or test bypass is installed. Credentials stay private in the fixture closure and are never logged/asserted as whole outbound messages.

| Cases | Actual intended boundary / unchanged honest oracle |
| --- | --- |
| 1 | Missing wire domain uses real approved domain; original provider gets the SAME request/bridge receiver/one argument; same recording ID in another real project stays untouched; real entry/Stop/reopened Service retains approved address/domain/timeline. |
| 3 | Conflicting top-level/environment/metadata request domains refuse before provider/create or start ACK. |
| 1 | Provider-approved project from another actual project domain refuses before create. |
| 2 | Revoke or expire actual trust while original provider is held; configured clock advances to real expiresAt, no waits; zero create/start ACK/activation afterward. |
| 1 | Original real project-domain read completes then waits; disconnect/reconnect actual trusted session while held; old pending start refuses, neither session receives a stale ACK and no recording is created. |
| 1 | Original create genuinely commits, then its returned session is held; revoke before return; original stored record is retained, but start ACK/activation never occurs. This explicitly proves no rollback of an already admitted write. |
| 1 | Stop received during real pending provider approval suppresses Start acknowledgement, finalizes only approved address, and never adopts the wire project override. |
| 1 | Actual explicit-null approval remains passive; supplied device input cannot invoke its real registered action projector. |
| 1 | Required policy missing reaches actual Service create refusal, with no recording/start ACK/activation. |
| 1 | Reload original persisted trust through the real store contract with the legacy missing-domain field; real reconnect remains pairing_required and cannot create/start a recording. |

The legacy case truthfully exercises the normal gateway authentication fence before bridge policy; it does not manufacture a ready legacy session or call a fake snapshot boundary. The post-create case truthfully retains the already committed record while proving the post-await activation fence. Earlier held-provider/project cases require zero actual create calls.

Barriers wrap original callback functions with original receiver/complete original tuple, and await actual original work at the intended boundary. Original promises receive immediate fulfillment/rejection capture; every held operation releases and drains in finally, including failure paths. Boundary waits fail promptly if the original operation ends without reaching its intended real callback. Fixture close drains all actual gateway/Service close promises and retains single/combined failures. All storage is isolated under a fresh verified OS-temp root.

Exact selector (run by Root in the common acceptance lane):

```text
pnpm.cmd --filter fluxiq exec vitest run src/programs/automation-studio/client-gateway/tests/trusted-scope.test.ts
```

Validation: Root reported the common actual runtime acceptance finished with all 13 new trusted-scope cases and all 6 real-Service scope cases PASS. These four test/support files were unchanged during that run and remain frozen. Worker performed source/contract and four-file whitespace/EOF inspection only; no production path changed. The normal common typecheck found three separate capture/fixture errors assigned to A, not a passing whole-package gate; their exact correction is recorded in scoped-recording-capture.md. Original context tests and Root recording-domain subject stayed untouched.

Not verified: final current normal package type/whole-structure/declaration/build/guarded paired integration or browser/live behavior. Root's runtime result supplies composed behavior evidence for exactly these 13 cases; no extra cases or rollback guarantee are inferred. No provider/paid/browser/user-data operation ran. SQL foundation implementation stays held.

Outcome: Done
Changed: One new integration subject, three private test-support files and this report.
Validation: Root common runtime -> all 13 integration cases PASS (+6 Root real-Service scope cases); source/contract and owned whitespace inspection; no worker runtime duplicate.
Not verified: Final current normal type/structure/declaration/built integration gates.
Report: docs/working/runtime-ownership-refactor/reports/trusted-recording-integration-tests.md
Notes: All own test files frozen; all own readers ended. No production/shared docs/git/package/config/baseline/SQL edits. Root owns final checkpoint gates.

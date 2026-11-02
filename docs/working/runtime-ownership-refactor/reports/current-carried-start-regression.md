# Current carried-Flow start failure

Outcome: Cause verified; authorized fixture correction implemented. Normal
selected-file validation awaits the lead's Core rebuild-ready barrier. All
diagnostic probes are provider-free and use the fixed synthetic fixture.

## Cause and owning boundary

The failing setup was an invalid gateway snapshot, not a demonstrated R1-R5
dispatch, classifier, option or resource regression. Its `missingStart` fixture
removed the required `url` from a successful DOM snapshot. The current web host
therefore threw while sanitizing the first opener's `before_action` capture,
before it could dispatch the click. Core correctly preserved that capture fault
as a sanitized failure. No result judge or repair had yet executed.

The intentional first-phase change that distinguishes unavailable observation
from capture errors exposes this malformed fixture. Relaxing the sanitizer or
restoring catch-as-empty behavior would hide genuine capture failures and would
not be an appropriate correction.

| Evidence owner | Exact responsibility and observed contract |
| --- | --- |
| Downstream `apps/extension/src/shared/protocol.ts:493` | `DomSnapshot` requires `url: string`. It is not an optional partial-snapshot field. |
| Downstream `apps/extension/src/content/dom-snapshot.ts:65` | The real capture producer constructs a `DomSnapshot` with `url: location.href`. |
| Downstream `domain/src/runtime/tests/carried-service-repair.test.ts:89` | The stale synthetic missing-start branch removed that required URL, while returning a successful capture. This is the only authored source/test file corrected. |
| Downstream `domain/src/runtime/host-runtime.ts:262` | The real host passes the capture to `sanitizeWebLlmSnapshotWithBindings`; reset-token policy is separate, in `resetToken`. |
| Downstream `domain/src/runtime/llm-evidence/sanitize.ts:199` and `location.ts:44` | A captured page must carry a valid public-evidence URL. An absent URL throws the constant message `web evidence URL must be a non-empty string`. |
| Core `packages/fluxiq/src/engine/automation/host-state/capture.ts:41` | A capture throw is wrapped as `The host state capture could not be read.` with its cause retained. The run records `executor.fault.unclassified` on `open`; it does not silently claim unavailable observation. |
| Core `packages/fluxiq/src/runtime/automation-host/capture.ts` | Explicit unavailable capture currently means `reason: unsupported_node`; it cannot truthfully represent this supported web node's invalid snapshot. |
| Core `packages/fluxiq/src/runtime/automation-host/boundary.ts:25` | A real `AutomationStudioHostStateSnapshotRef` may omit `from`. This supported distinction lets state exist without claiming a replay origin. |

No production source, gateway protocol, sanitizer, capture outcome contract or
oracle was relaxed. Genuine capture failures remain observable.

## Supported no-start case and implemented correction

The web host already captures valid snapshots without a reset token when their
real address contains a private component. `resetToken` accepts a replay address
only when screening leaves its entire spelling unchanged. A URL with a synthetic
private query value is valid capture input; the summary publishes the screened
address, and the host omits `from` rather than inventing an address for reset.
Existing `domain/src/runtime/tests/host-runtime.test.ts` covers this policy.

The corrected missing-start fixture supplies that supported valid-wire case.
The independent repair evidence gateway retains its existing public fixture
address. All original substantive assertions remain: the saved graph physically
clicks and types the wrong value; repair admits a real bound replacement; the
whole carried graph executes where it stands without navigation; judgment
follows actual commands; the run succeeds with the correct text; saved attempts
claim no start token. The diagnostic prints only status/action facts.

Two additional checks require the saved opener to carry an actual captured state
with its screened location and require the private synthetic value to be absent
from its state refs. Absence of a capture no longer satisfies this test's setup.
Comments and the no-token assertion's message now describe a withheld address
instead of a missing required URL.

## Before/after evidence

The lead and foundations acceptance worker independently reproduced the current
normal failure before investigation. The latter selected run passed 30/31 cases;
only this case failed with `savedActions: []`, no repair actions, no checked
replacement and zero judge calls. The lead supplied historical fixture-overlay
success as comparison; it is not claimed here as current integration proof.

Commands below ran from current t843 Core and used its existing built runtime,
with only the named synthetic test overlaid in memory. Core's tooling-only
source change made the formal source stamp stale; these probes intentionally did
not rebuild Core or bypass a package guard to claim normal acceptance.

```text
node .fluxiq/refactor/current-carried-start/diagnose.cjs
-> Exit 1; exact unchanged missing-start case reproduced, 0/1 passed; 5.60s.
-> start captures explicitly unavailable; open before_action throws in safeEvidenceUrl -> sanitizer -> web host -> Core captureHostState.
-> Persisted open attempt: failed, executor.fault.unclassified, constant sanitized capture message; zero saved click/type commands and zero judge calls.

node .fluxiq/refactor/current-carried-start/host-outcomes.cjs
-> Exit 0; three independently asserted synthetic host outcomes.
-> Missing URL: capture error. Valid public URL: actual captured ref with from. Valid withheld address: actual captured ref without from, private value not published.

node .fluxiq/refactor/current-carried-start/diagnose.cjs --supported-no-start
-> Exit 0; exact carried case with supported fixture input passed 1/1; 7.37s.
-> All original substantive assertions retained; positive captured-state/privacy checks added in the ignored overlay.
-> Saved open/type each have actual before/after captures with hasFrom=false; repair and the accepting judgment complete successfully without invented reset.
```

The diagnostic wrapper preserves the host object's identity, calls the original
methods with their original receiver, and rethrows the same capture error. It
changes no production implementation or test oracle. Logs emit constant error
messages, stack locations, codes and presence booleans, not page/credential
values. Ignored evidence is under Core
`.fluxiq/refactor/current-carried-start/`: `diagnostic.log`,
`host-outcomes.log`, and `supported-no-start.log`, with their probe scripts.

## Validation still required and freeze

Pending the lead's rebuild-ready barrier: normal current domain selected-file
test and the narrow owned-file typecheck. No whole suite, provider, browser,
panel, git command or agent spawn ran. Core production source remains untouched;
the authorized downstream fixture edit is complete and otherwise frozen.

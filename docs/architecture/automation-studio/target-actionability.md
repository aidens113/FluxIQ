# Measured target actionability

Contracts 0.5.0 and Core 0.19.0 add an optional observation of the exact target
checked during one call. It is separate from the action's outcome, permission,
effect, retryability and recorded-condition readiness.

```ts
type AutomationStudioTargetActionabilityRecord =
  | { actionable: true }
  | { actionable: false; cause: "hidden" | "disabled" | "covered" };
```

`parseAutomationStudioTargetActionabilityRecord` accepts exact plain own data,
returns a fresh minimal record, and rejects getters, private detail, geometry,
DOM references and unknown keys. Absence or malformed optional data means
unknown. A bad optional field does not invalidate an executed result, erase
its outputs or change its status, failure, actual effect or person-needed flag.
Internal validation distinguishes rejection from unreadable reflection before
the public optional API projects either to unknown.

The type and reader are available from `@fluxiq/contracts/automation-studio`,
`fluxiq/automation-studio` and the browser-pure
`fluxiq/automation-studio/actionability` entry.

## Wire compatibility

The browser carrier is the existing gateway result's **payload.actionability**.
There is no new top-level `ClientGatewayActionResult` field, failure member,
command receipt member or negotiated host capability. Older durable ingress
rejects unknown top-level keys but accepts the existing open payload object.
Browser outbox serialization/reload retains that payload. Core's durable ledger
persists a receipt, not a completed action result; live results and browser
reconciliation remain separate.

After accepting the raw gateway result, the host lifts a validated copy onto
`OutputDispatchResult` and `FluxIQRuntimeCommandResult`. Host-enriched results
must never be sent back as raw gateway results. Original wire objects and the
receipt digest's inputs remain unchanged. An old browser reports no fact; a
new browser keeps the legacy result shape and failure detail for older hosts.
New keyed tool results require the coupled new Core reader and rebuilt SDK.

## Recording and authority

IO/runtime and native results retain the observation independently of success
or failure. A successful dispatch followed by failed confirmation retains the
dispatch observation beside that failure. Actual node attempts, public run
records and all authoring trace rebuilders validate and retain the same closed
fact. The fact stays outside opaque model evidence and authored node or draft
metadata. Raw tool dumps sanitize it before serialization, including when no
failure record accompanies it.

The latest actual target dispatch replaces an earlier target observation,
including when the later dispatch reports none. An internal records write
does not claim another target. Page/snapshot bindings do not retain these
per-call controls; a later press or restoration uses its own measurement.

Neither branch authorizes an action, proves it unacted or transient, satisfies
recorded readiness, or permits another committing act. In particular a control
may become covered after the action was sent. Existing effect evidence,
authority, uncertainty and retry gates retain their precedence. A successful
operation that skipped the measuring gate must leave actionability unknown.

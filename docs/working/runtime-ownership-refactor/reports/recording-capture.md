# Recording capture extraction

SOURCE FROZEN. The capture/IO implementation and canonical acceptance are complete. Combined Studio project-isolation acceptance is pending the separately owned recording-store repair.

Dispatch: [recording-capture brief](../briefs/recording-capture.md).

## Changed

- `packages/fluxiq/src/client-gateway/recording/**`: one generic lifecycle owner, ordered writes, batching, late-message diagnostics, explicit ingress decoding, shared rich state/session contracts, and sink-backed tests. Frozen root policy contracts were consumed unchanged.
- `packages/fluxiq/src/runtime/recording/io/**`: actual IO projection/recorder. The original six direct recorder tests moved here with their assertions retained.
- `packages/fluxiq/src/io/index.ts`: only the registered-binding descriptor/lookup and resolver slice. Lookup returns the original input definition/binding and normalized registered output ID, invokes no projector/output, and the resolver projects exactly once. Focused descriptor tests added.
- `packages/fluxiq/src/programs/automation-studio/client-gateway/**`: thin bridge compatibility constructor, Studio description/context/legacy ingress policy, original public type exports, and actual service integration tests. The original five write-order tests moved to the canonical owner; the legacy leaf has an exact constructor identity test.
- `packages/fluxiq/src/programs/automation-studio/runtime/io-bridge.ts`: compatibility constructor only.
- `packages/fluxiq/src/programs/automation-studio/runtime/service/recording-sink/**`: original service receiver/method delegation; read failures become explicit unavailable outcomes.
- `packages/fluxiq/src/programs/automation-studio/runtime/tests/io-bridge.test.ts`: remaining seven graph/runtime integration oracles retained.

No native, mapper, producer, service.ts, package/root barrel, manifest, config, baseline, or shared-document edits by this worker. Parent integrated exports and retargeted three pre-existing gateway failure/parser imports to neutral runtime contracts.

## Behavior

One active/closed/pending-start state machine and one write-order owner remain. Trusted-client ownership, scoped-session refusal, pre-await pending/tail barriers, Stop/new-Start races, stale acknowledgement suppression, 250 ms drain, 32 closed owners, 25 ms/50-entry enqueue triggers, 100-entry splice limit, and first-seen grouping order are preserved.

The policy's effective address controls create/ack/entry/finalize. With a configured Studio provider, its successful project is authoritative; a request can no longer override that approval afterward. This is the intentional narrow compatibility/security correction authorized by the lead. Providers may approve a requested project by returning it. Without a provider, explicit client request projects remain accepted and missing-project refusal remains unchanged. Trusted host calls retain request-project then session-project precedence and ignore the client provider. Late remembered IDs retain their original address; mismatched/unowned messages cannot write or stop the new active recording.

State, unmapped actions and definition-only outputs remain passive, including discard telemetry. Actual bound actions are reported individually, without invoking projectors during discard classification. Rich state frames, anchors, action fields, opaque domain targets/evidence, source descriptors and channels round-trip without fabricated snapshots or raw ingress casts.

Awaited failures propagate. Background failures have sanitized audit metadata and retain their original private cause for awaited flush/Stop; removed failed batches are never reinserted. Later fresh work can progress, and observer failures are retained too. A successfully read endedAt is required for late discard. Unavailable or rejected reads preserve the original append failure. Durable capture failure awaits stop on the exact original command Context and rethrows the capture cause.

## Observed validation

- `pnpm.cmd --filter fluxiq exec vitest run src/client-gateway/recording src/runtime/recording/io src/io/tests/input-output-binding.test.ts` -> **13 files, 37 tests passed**. Parent independently reran and confirmed the same result.
- Strict isolated NodeNext check of canonical roots and all thirteen canonical test subjects -> **exit 0, no diagnostics**, including exact optional properties and unchecked indexed access.
- Scoped **15-rule** audit -> **109 owned script files, 0 failures, 0 whitespace findings**. The two existing advisory line counts remain: IO registry 599 lines and unchanged original bridge test 800 lines. No configuration/baseline exceptions. The audit uses the full import graph for imports/cycles, and retains actual reach boundaries with only their source selectors narrowed to owned files.
- Original bridge/restart/scoped/description tests -> **35 passed** after activating the compatibility adapter. Original write-order five and recorder six now pass at their canonical owners.
- Corrected IO runtime test plus descriptor/lifecycle subjects -> **3 files, 14 tests passed**, including all seven remaining IO runtime integration cases.
- Studio context integration -> **1 passed, 2 failed**, both negative same-ID/two-project cases described below. These failures remain as required oracles.

The pre-existing IO runtime fixture expected an implicit matcher despite the earlier matcher ownership change. With lead approval it now explicitly supplies the neutral `createElementMatcher({ weights: { visibleText: 1, testId: 1 } })` through the existing third argument. Selection, matched-signals and trace assertions are unchanged; no calibrated web algorithm or downstream import was added.

## Pending integration

`client-gateway/tests/context.test.ts` creates an identical recording ID in a decoy project and a provider-approved project. Create arguments, acknowledgement and subsequent sink addresses are correctly approved. The two failures occur when the old Studio store returns the approved cached timeline while reading the decoy project. The cause is `service/recordings/store.ts` returning a cached recording ID without validating its project before recovery. Parent assigned the structural store/controller fix to `current_foundations_acceptance`; this worker did not edit those owners or relax the tests.

After that source freezes, run the combined immediate cohort:

```powershell
pnpm.cmd --filter fluxiq exec vitest run src/client-gateway/recording src/runtime/recording/io src/io/tests/index.test.ts src/io/tests/input-output-binding.test.ts src/programs/automation-studio/client-gateway/tests src/programs/automation-studio/runtime/tests/io-bridge.test.ts
```

This combined command is pending, not a success claim. The final combined Studio transitive typecheck/package check is lead-owned while storage sources are changing. No package-wide build/check, full suite, paid/provider/browser run, git action, original-checkout validation or t842 validation was run.

Exact isolated strict command used:

```powershell
node packages/fluxiq/node_modules/typescript/bin/tsc --noEmit --strict --exactOptionalPropertyTypes --noUncheckedIndexedAccess --target ES2022 --module NodeNext --moduleResolution NodeNext --lib ES2022,DOM,DOM.Iterable --allowImportingTsExtensions --skipLibCheck packages/fluxiq/src/client-gateway/recording/index.ts packages/fluxiq/src/runtime/recording/io/index.ts packages/fluxiq/src/client-gateway/recording/tests/address.test.ts packages/fluxiq/src/client-gateway/recording/tests/failure.test.ts packages/fluxiq/src/client-gateway/recording/tests/input.test.ts packages/fluxiq/src/client-gateway/recording/tests/lifecycle.test.ts packages/fluxiq/src/client-gateway/recording/tests/source-closure.test.ts packages/fluxiq/src/client-gateway/recording/writes/tests/order.test.ts packages/fluxiq/src/client-gateway/recording/writes/tests/batching.test.ts packages/fluxiq/src/client-gateway/recording/writes/tests/failure.test.ts packages/fluxiq/src/client-gateway/recording/decoding/tests/entry.test.ts packages/fluxiq/src/client-gateway/recording/decoding/tests/descriptors.test.ts packages/fluxiq/src/client-gateway/recording/values/tests/closed-space.test.ts packages/fluxiq/src/runtime/recording/io/tests/recorder.test.ts packages/fluxiq/src/io/tests/input-output-binding.test.ts
```

Exact scoped audit (PowerShell, repository root):

```powershell
@'
import fs from "node:fs";
import { createContext } from "./scripts/structure-audit/context.mjs";
const ctx = createContext();
const prefixes = ["packages/fluxiq/src/client-gateway/recording/", "packages/fluxiq/src/runtime/recording/io/", "packages/fluxiq/src/programs/automation-studio/client-gateway/", "packages/fluxiq/src/programs/automation-studio/runtime/service/recording-sink/"];
const exact = ["packages/fluxiq/src/io/index.ts", "packages/fluxiq/src/io/tests/input-output-binding.test.ts", "packages/fluxiq/src/programs/automation-studio/runtime/io-bridge.ts", "packages/fluxiq/src/programs/automation-studio/runtime/tests/io-bridge.test.ts"];
const owned = file => (prefixes.some(prefix => file.startsWith(prefix)) && !file.startsWith("packages/fluxiq/src/client-gateway/recording/policies/")) || exact.includes(file);
const local = { ...ctx, files: ctx.files.filter(owned), scriptFiles: ctx.scriptFiles.filter(owned), sourceFiles: ctx.sourceFiles.filter(owned) };
const rules = ["imports", "import-cycles", "module-reach", "exported-values", "as-never", "naming", "directory-files", "file-lines", "class-methods", "statement-packing", "test-placement", "web-vocabulary", "swallowed-failure", "failure-as-empty", "restricted-references"];
const under = (prefix, file) => prefix.endsWith("/") ? file.startsWith(prefix) : file === prefix;
const reach = ctx.CONFIG.reachBoundaries.map(boundary => ({ ...boundary, from: ctx.scriptFiles.filter(file => owned(file) && !ctx.isTestFile(file) && boundary.from.some(prefix => under(prefix, file))) })).filter(boundary => boundary.from.length);
let failures = 0;
const warnings = [];
for (const name of rules) {
 const rule = await import(`./scripts/structure-audit/rules/${name}.mjs`);
 const input = name === "module-reach" ? { ...ctx, CONFIG: { ...ctx.CONFIG, reachBoundaries: reach } } : ["imports", "import-cycles"].includes(name) ? ctx : local;
 const findings = rule.run(input).filter(finding => name === "module-reach" || owned(finding.path));
 const failed = findings.filter(finding => finding.severity === "fail");
 failures += failed.length;
 warnings.push(...findings.filter(finding => finding.severity === "warn").map(finding => ({ rule: name, path: finding.path, value: finding.value })));
 if (failed.length) console.log(JSON.stringify({ rule: name, failures: failed }));
}
const whitespace = [];
for (const file of local.scriptFiles) {
 const value = fs.readFileSync(file, "utf8");
 if (value.split(/\r?\n/u).some(line => /[ \t]+$/u.test(line)) || /\n\s*\n$/u.test(value)) whitespace.push(file);
}
console.log(JSON.stringify({ rules: rules.length, files: local.scriptFiles.length, failures, warnings, whitespace }));
process.exitCode = failures || whitespace.length ? 1 : 0;
'@ | node --input-type=module
```

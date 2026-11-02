Role: Heavy worker; gpt-6.1-sol; max.
Goal: Remove concrete web fingerprint scoring from Core; preserve web behavior via downstream matcher adapter.
Owned Core: programs/automation-studio/fingerprinting/**, model/action-element-target.ts,
runtime/io-policy.ts, runtime/native-node-runtime.ts and adjacent focused tests,
nodes/importer-sdk.ts, runtime/service/recordings/proposal-generation.ts (Studio paths under packages/fluxiq/src),
runtime/service/runtime-session/graph-options.ts, service.ts only recording mapper matcher argument,
packages/fluxiq/src/runtime/target-matching/**; own report.
Owned downstream: domain/src/element-fingerprint/**, apps/extension/src/content/identity/**,
domain/src/native-nodes/**, domain/src/runtime/host-runtime/** only if required for adapter wiring.
Also domain/src/output-nodes/native-runtime.ts + adjacent tests, domain src/client and root index one-line exports.
Must not touch git, shared docs/config/package exports/barrels outside owned dirs,
Studio executor/nodes(other than importer-sdk)/model(other than target)/other runtime files. No agents.
Read both AGENTS boundary/structure/validation, Core CODEX.md, plan Current State,
reports/fingerprint-boundary.md; inspect exact existing adapter composition.
Core keeps generic matching contracts/algorithm and confidence policy; web fields scoring/extraction
(selector/xpath/HTML tag/classes/attributes/browser URL metadata) belong downstream.
Move calibrated web scorer EXACTLY preserving weights/behavior into domain (browser-safe source);
switch extension imports to domain matcher. Avoid copying two implementations as permanent ownership.
Use explicit matcher port for Core importer/resolver/recording contexts and IO policy resolution;
generic Core default must never interpret web selectors/metadata or silently choose from partial web scores.
Preserve serialized target shapes/legacy fields for compatibility; treat browser data as opaque in Core.
Old Core public subpath may preserve names and generic interfaces, but document changed web-specific
default behavior; cannot delegate Core -> downstream. Prefer explicit registered domain matcher.
Keep neutral Core matcher useful for non-web state identity; tests prove browser metadata has no effect.
Coordinate any needed additional source ownership with lead before edit; Core service root may need tiny wiring.
Node worker owns other node files and currently retains SDK untouched. Your SDK changes may wait until canonical node ports exist.
Run focused matcher/identity/io-policy/native-runtime tests, no full suites/paid/browser operations.
Need exact files and compatibility impact report; propose minimal coherent cut before implementing when uncertain.
Report Core docs/working/runtime-ownership-refactor/reports/web-matcher-ownership.md.
End Outcome/Changed/Validation/Not verified/Report/Notes contract.

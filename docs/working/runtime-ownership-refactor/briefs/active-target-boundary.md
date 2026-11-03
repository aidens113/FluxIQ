# Active target-normalization boundary
Role: Heavy worker; gpt-6.1-sol, Max. READ-ONLY design until Root implementation release. No agents/git/shared documents.
Repos: paired t843 Core and !FluxIQWebExtension. Read Current State and existing normalizer/matcher ownership reports only as needed.
Confirmed active Core callers: Studio runtime/output-target/prepare.ts and runtime/service/object-documents.ts:prepareRecordingEntryElementTarget, using model/action-element-target.ts.
Downstream already owns actual target normalizer helpers and webElementMatcher; SDK importer implementation-bundle currently carries trusted elementMatcher and mapper normalizeParameters.
Goal: smallest coherent cut removing active browser target interpretation from Core, preserving exact real web client's target/result/recording bytes and existing missing-target/confidence/refusal oracles.
Trace actual SDK implementation bundle/NativeNodeRuntime registry, graph-options/io-policy callers, object-documents construction and downstream output-nodes/native-runtime.ts. Do not read unrelated backend files.
Prefer existing generic OutputTargetPreparer as trusted domain implementation hook, selected through the ORIGINAL domain bundle, not a new duplicate target DTO or global domain registry.
Recording target encoding should be another narrow trusted domain code hook over existing canonical recording contracts; Core only stores/passes opaque domain target data. No hardcoded web domain/output IDs, CSS/DOM/selector interpretation or target-shape inference in generic Core.
Determine exact existing public target-normalizer API compatibility and all active call sites before proposing removal; document additive SDK hook and any below1.0 breaking migration explicitly. Old serialized rich target schemas may remain passive compatibility data.
No default Core browser normalizer, inferred executable action from passive evidence, model-wire function/authority flag or Down->Core private import. A missing hook must not silently gain browser execution rights.
Preserve same original domain/receiver/function/request/parameters and real ownership observation; trusted source hook is not blanket callback completion.
Own DESIGN REPORT ONLY reports/active-target-boundary.md (<=100lines): exact interfaces, owned paths in both repos, existing tests, required parity/missing-hook/cross-domain controls, compatibility impact, and implementation order. Identify shared Root composition edits.
Do not edit source/tests, run compiler/tests/builds/providers/browser/panel or inspect user/runtime/secret data. A/B native work and Root current acceptance remain mutable; respect their holds.
Return standard Outcome/Changed/Validation/Not verified/Report/Notes. UI package still after both audits/refactors.

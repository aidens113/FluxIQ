# P10 web control guidance

Outcome: Done ? source frozen; allowed owning validation passed after fresh Core0.24 public SDK release.

Changes: Added literal web-guidance-1 payload with the exact three original A2/A3/A4 paragraphs, a public-typed companion and barrels. The actual runtime factory and its required runtime contract now supply flowScriptGuidance beside unchanged examples. Existing rendering/completion helpers explicitly propagate it; the actual candidate-schema capture uses the real runtime binding. Added guidance metadata digest, runtime exposure, independent rendering and absence assertions. Updated authored architecture documentation with ownership and scope.

Preserved: Original script-examples source arrays, graphs, expected oracles, four full UTF8 pins, completion digest, eleven saved-graph proofs and missing-source negative assertions are untouched. No Core source or private imports changed.

Validation: Not run ? explicit SDK hold; installed SDK is still Core0.23. After release, run only owning script-guidance/script-examples tests, Domain check and standalone structure audit as coordinated by lead. No builds, suites, browser or provider runs were started.

Not verified: Compilation against Core0.24, public rendering parity, schema capture and existing real graph proofs await fresh SDK validation. No medium-neutrality or live-model performance claim.

Lead review follow-up: Replaced the two newly authored cast gateway fixtures in candidate-schema.test.ts and guidance.test.ts with the actual typed eligibleSessionIds/executeAction contract. Both count and assert zero executeAction calls. No production changes or validation; fresh-SDK hold remains in effect. Source re-frozen.

## Released validation

- Lead released final frozen Core0.24 public SDK; no source corrections were needed.
- Initial launch with plain pnpm was refused by PowerShell execution policy before any runner started; used pnpm.cmd successfully.
- Validation: `$env:DOMAIN_TEST_BUILD_LABEL='t832-p10-web'; pnpm.cmd --filter @fluxiq-web-extension/domain test script-guidance/tests script-examples/tests` -> exit0;82tests,5suites,82pass,0fail/skip/cancel; test duration1120.6446ms. Includes all four unchanged original full-section byte/hash pins, unchanged full completion digest, eleven real saved-graph proofs and three missing-source negatives. Actual candidate schema and typed zero-execution runtime fixtures pass.
- Validation: `pnpm.cmd --filter @fluxiq-web-extension/domain check` -> exit0; Core build current, domain:check command32306ms.
- Validation: `node scripts/structure-audit.mjs` -> exit0; passed (239 warning(s),583 baselined).
- Not verified: Browser/provider behavior and full suites were intentionally outside this unit. No builds/git/SDK/provider/browser calls were run by this worker. No production thaw occurred. Source remains frozen for lead acceptance rerun.

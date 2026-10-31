# Lead acceptance: t835 production native host import

Status: Accepted provider-free implementation; paired integration pending.

The requested first Claude invocation reached Core's production web server, then failed core.health readiness after225.582s. It had zero provider calls, no browser task actions, no Flow and no oracle result. The prior repaired preflight and the entire SDK-consumer prelude passed. The failure therefore gives no Claude authentication or performance result.

The worker traced the exact minified frame to public loadPlatformHostModules. The SDK's ordinary TypeScript extension rewrite nested the import-ignore directives inside __rewriteRelativeImportExtension. Turbopack replaced the outer dynamic import with an unconditional MODULE_NOT_FOUND rejection. The original runtime source tests did not exercise that emitted production form.

Reviewed change: a supported one-file TypeScript project re-emits only the native importer after normal compilation, before declaration validation and runtime identity stamping. It disables extension rewriting and TS-extension imports only for that file, preserves file URLs/native module identity, and emits both source/declaration maps. Package and cached build commands agree; cache config/project/stamp coverage is explicit. No public contract or registration behavior changes. SDK patch0.25.2. No readiness bypass, timeout increase, eval, URL fragment, host duplication or fixture/oracle change.

Validation: `pnpm.cmd --filter fluxiq exec vitest run src/platform/panel/host-modules/tests/host-modules.test.ts src/platform/panel/host-modules/tests/import-host-module.test.ts` -> lead2files/11tests passed,4.04s. Compiles the actual source/config, checks native import AST/maps and executes an ESM host with an import-only public export; preserves URL and namespace identity. Existing order/concurrency/error/CommonJS tests pass.

Validation: `node --test scripts/build-cache/tests/registry.test.mjs` -> lead11passed,0failed,1.052s.

Validation: `pnpm.cmd --filter fluxiq build` -> fresh SDK passed117.462s; actual dist importer inspected and contains the directives directly on native import, without rewrite helper.

Validation: `pnpm.cmd --filter fluxiq check` -> compiler passed99.507s.

Validation: `node scripts/structure-audit.mjs` -> Core passed1143baselined; downstream passed583baselined. No allowance growth.

Validation setup: first root build/type commands could not open their log directory, before commands ran; absolute evidence directory created and actual commands rerun successfully above. No test failure was concealed.

Validation: `node test-runs/2026-10-31-t834-validation/t835-startup-proof.mjs` -> actual production build/server/coordinator startup passed185.844s, page200, gateway401, runtime initialized, model providers disabled; test processes closed.

Pending: paired integration/publication/repin; a completed Claude model-backed task and zero-call replay. Both Oct31 full-suite slots were already consumed; no full sweep was run here. Main promotion waits a permitted passing sweep. Remote backup retention and user dirty-file preservation apply.

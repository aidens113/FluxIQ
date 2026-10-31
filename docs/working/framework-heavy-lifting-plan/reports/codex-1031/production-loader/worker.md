# Production host loader

Outcome: Done

Changed: `packages/fluxiq/tsconfig.runtime-imports.json`; native importer comment and owning compiled-artifact tests; `packages/fluxiq/package.json` build script only; build-cache registry and its owning tests; `docs/architecture/platform.md`.

## Cause and exact trace

The failed production artifact is `fxlab/t833-claude/!FluxIQ/.tmp/web-build/894d2590f208c3825c5fae0b/b-157e0369611d/apps/web/.next/server/chunks/ssr/Users_osrs__FluxStuff_fxlab_t833-claude_!FluxIQ_c8e79ef4._.js`. Its logged columns resolve to the default importer inside public `loadPlatformHostModules`, not the web lib's separate host importer: column 6781 awaits the generated rejecting promise in minified `F`; column 6821 constructs its dynamic-expression error; column 7905 is minified `K` (`loadModules`) awaiting that default importer. The surrounding exported loader and registration loop establish the call path.

The pinned SDK's `dist/platform/panel/host-modules/import-host-module.js` contains `import(__rewriteRelativeImportExtension(/* ignore directives */ pathToFileURL(modulePath).href))`. TypeScript's normal relative-extension rewrite moved the directives onto the helper's inner argument. Turbopack consequently replaced the outer dynamic import with its unconditional `MODULE_NOT_FOUND` rejection. Upstream [Next 15.5.24's parser](https://github.com/vercel/next.js/blob/v15.5.24/turbopack/crates/turbopack-ecmascript/src/analyzer/imports.rs#L730) reads directives leading the outer first argument, matching the observed output.

## Fix and proof

The final supported TypeScript pass includes exactly this one importer, disables extension rewriting and TS-extension imports only there, and is forced after the normal compilation and before declaration validation and runtime identity stamping. The real file URL and ESM import remain intact. Ordinary library compilation retains its settings. SDK package and cached root build entrypoints agree; the extra project/config/state are fingerprinted and restored with their owning output. Registration ordering, concurrency, CommonJS fallback, diagnostics and retained failures are unchanged.

The owning regression compiles the actual importer using the new project, verifies native directives and valid JavaScript/declaration maps, and executes the emitted JavaScript in Node against a real ESM host with an import-only public package export. It proves original URL, shared native module identity and registration. Existing loader tests cover ordering, concurrent calls, failure retention and fallback. The registry test protects pass ordering and cache coverage.

Validation: `pnpm.cmd --filter fluxiq exec vitest run src/platform/panel/host-modules/tests` -> 2 files / 11 tests passed; Vitest duration 5.62 s.

Validation: `node --test scripts/build-cache/tests/registry.test.mjs` -> 11 passed, 0 failed; 0.809 s.

Validation: initial `pnpm --filter fluxiq exec vitest run src/platform/panel/host-modules/tests` -> PowerShell blocked the installed pnpm.ps1 before any test ran; rerun through pnpm.cmd passed above.

Investigation: four annotation-placement alternatives were compiled through installed TypeScript and Next 15.5.24's native Turbopack API in ignored `apps/web/.tmp/native-import-JuUT2h`. All four produced the same rejecting stub. That disposable probe then exited unsuccessfully because its teardown called `onExit` after `shutdown` had already consumed it; no production source or server was involved. The final fix uses none of those alternatives.

Not verified: the complete freshly stamped SDK, package typecheck, actual production web/server startup, browser behavior or Claude qualification; these remain with the lead. No full suite, provider call, browser run, git mutation or user-data access was performed.

Report: `docs/working/framework-heavy-lifting-plan/reports/codex-1031/production-loader/worker.md`.

Notes: No source/URL workaround, eval, externalization, readiness bypass or timeout increase. The web lib host loader remains unchanged. Root owns the package version and fresh SDK/production verification.

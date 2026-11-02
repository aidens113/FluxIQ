# Declaration tooling cache dependency closure

Role: Standard worker, gpt-6.1-sol, medium effort.
Repo: t843 Core only. Goal: ensure library build caches invalidate when the new declaration resolver/helper changes.
Read: scripts/build-cache/steps.mjs and workspace/resolve-step.mjs; your frozen declaration tool files; existing focused build-cache input/registry tests and any existing local script dependency scanner needed.
Cause: resolve-step currently fingerprints only scripts directly named by node commands. rewrite-declaration-imports.mjs now imports ./declarations/index.mjs and its resolver; those helpers are outside package inputs and must not be omitted.
Owned: scripts/build-cache/workspace/resolve-step.mjs, one cohesive dependency helper if needed, corresponding focused build-cache tests; own report update. No runtime, package manifests/exports, other workers' source, shared docs/indexes, git/spawn/providers/full suites.
Prefer a small reusable local script dependency closure (static relative imports/reexports and literal dynamic imports where supported), reusing existing correct scanner if available. Do not fingerprint the entire scripts tree or node_modules, and do not special-case only this helper path.
Preserve existing package/dependency/root/cache inputs and output exclusion. Never execute imported scripts to discover dependencies. Handle cycles deterministically and restrict reads to real local module files; missing local dependencies must not silently appear current.
If a declaration-specific explicit input is the only safe supported option, report why before adding broad cache behavior; no ad hoc ignored-input misuse for tracked helpers.
Acceptance: meaningful fingerprint/input tests prove direct and transitive helpers invalidate while unrelated scripts/outputs do not, existing relevant registry/input tests pass. Report exact commands/results and source freeze; no package-wide builds or identity stamping.
Report: append cache-input evidence to docs/working/runtime-ownership-refactor/reports/declaration-portability.md (your own report).
Return: Outcome; Changed; Validation; Not verified; Report; Notes <=3 lines.

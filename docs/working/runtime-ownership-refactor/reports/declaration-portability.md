# Declaration portability

Outcome: Done

SOURCE FROZEN. No runtime/contract implementations, package manifests/exports,
configuration, runtime identity stamps, or other workers' sources changed.

Changed:
- `scripts/rewrite-declaration-imports.mjs`
- `scripts/declarations/index.mjs`
- `scripts/declarations/public-import-resolver.mjs`
- `scripts/tests/rewrite-declaration-imports.test.mjs`
- This report.

The rewriter recognizes only qualified, non-`typeof` import-type nodes with
workspace `packages/<package>/dist/...js` specifiers and an existing emitted
declaration. It reads the owning package's actual export keys and resolves
public entries with consumer NodeNext semantics, without workspace aliases.
Wildcard exports are conservatively excluded. Every candidate must resolve
inside the owning package.

A TypeScript program resolves the leaf's requested qualified export and the
public barrel's corresponding export to the same declaration symbol through
aliases. Same names and structural type compatibility are insufficient.
The exact public entry wins, otherwise the smallest public export surface
wins, with deterministic specifier ordering for ties. Only the module literal
changes; qualifiers, generic arguments and resolution attributes are retained.

Unproven, private, namespace, side-effect, escaping and platform-specific
imports retain the original failure behavior. Rewrites remain atomic across
all declarations: any rejected import prevents every output write.

Validation:
- `node --test scripts/tests/rewrite-declaration-imports.test.mjs` -> 10 tests passed, zero failed (20.6s). Includes real TypeScript inferred emission and strict external-consumer checks, public barrel selection, nested qualifiers, generics, exact origins, private rejection and atomic failure.
- `node --test --test-name-pattern="proves leaf symbol origins" scripts/tests/rewrite-declaration-imports.test.mjs` -> one selected test passed, zero failed (2.8s), after strengthening legacy `ActionResult` to a specialized alias of the canonical generic rather than an independent shape.
- `node scripts/rewrite-declaration-imports.mjs packages/fluxiq/dist` -> exit 0 against the current failing emitted package; repeated owning-script execution also exits 0.
- `rg -n 'packages/[^" ]+/dist' packages/fluxiq/dist -g '*.d.ts'` -> exit 1, no matches after the owning script.

Not verified: full package rebuild, package-wide checks, structure audit and
full suites are reserved for lead-coordinated source-stable integration.
Generated declaration changes were made exclusively by the owning script.
No git mutations, providers, package publication or runtime-source edits ran.

Report: `docs/working/runtime-ownership-refactor/reports/declaration-portability.md`

Notes: The structural repair stays in declaration tooling and exposes no new
public API. Unproven forms deliberately continue failing. SOURCE FROZEN.

## Review follow-up: platform-path rejection

The resolver now excludes any literal containing a backslash before filesystem
lookup or public-symbol rewriting, preserving the owning gate's original
platform-specific-path rejection. The regression uses
`packages/contracts\\..\\contracts/dist/core.js`, proves that its physical
declaration is the same public core declaration, and asserts failure with the
original platform-path diagnostic and unchanged output. A POSIX-only symlink
preserves this physical-resolution precondition on non-Windows test hosts.

Validation: `node --test scripts/tests/rewrite-declaration-imports.test.mjs`
-> 11 passed, zero failed, exit 0 (20.4s), including the public-origin backslash
regression and all normal public rewriting cases.

SOURCE FROZEN again. Only the owned resolver, focused tests and this report
changed for the follow-up; no builds, full suites or identity stamping ran.

## Integration follow-up: script cache dependency closure

Changed: `scripts/build-cache/workspace/resolve-step.mjs`, its feature barrel
`index.mjs`, new `script-dependencies.mjs`, and the colocated
`tests/script-dependencies.test.mjs`, plus this report.

Package steps now fingerprint the bounded local module closure of scripts
named directly in their commands. TypeScript parses static imports,
re-exports and literal dynamic imports without executing them. Package/builtin
imports are excluded. Real local `.js`, `.mjs` and `.cjs` files are traversed;
missing modules fail explicitly. Repository escapes and installed
`node_modules` modules are rejected rather than traversed. Physical paths
deduplicate cycles, and sorted roots keep discovery deterministic. Symlink
addresses and their real local targets are both covered.

Existing structure-audit scanners were inspected: runtime-specifiers excludes
dynamic imports by design, while load-sites has a broader policy including
computed/require resolution and built-expression literals. A small cache-owned
AST visitor avoids importing those different policies and adding an untracked
dependency of the cache engine itself outside its fingerprinted source tree.
No scripts-directory sweep or declaration-specific special case was added;
existing package/dependency/root/cache roots and output exclusion remain.

Validation: `node --test scripts/build-cache/workspace/tests/script-dependencies.test.mjs scripts/build-cache/tests/ignored-inputs.test.mjs scripts/build-cache/tests/registry.test.mjs`
-> 19 passed, zero failed, exit 0 (5.8s). Real registry assertions confirm all
three library builds cover the declaration entry, public barrel and resolver.
Scratch-workspace decisions prove direct/transitive/dynamic helper edits alter
actual fingerprints while unrelated scripts and generated outputs do not.
Tests additionally prove cycles, missing-module failure and installed-module
rejection; imported throwing modules are parsed without being executed.

Not verified: package builds, whole tooling suites or identity stamping, all
reserved for lead integration. SOURCE FROZEN. No runtime or manifest edits.

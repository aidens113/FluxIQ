Role: Discovery worker; gpt-6-luna; high.
Goal: Trace concrete browser-specific fingerprinting and determine safe downstream ownership separation.
Owned: docs/working/runtime-ownership-refactor/reports/fingerprint-boundary.md only.
Must not touch: source, shared docs, git. No agents.
Read Core AGENTS.md boundary/structure/validation and refactor plan Current State.
Inspect Studio fingerprinting implementation and all production callers Core/downstream (sibling !FluxIQWebExtension).
Focus selector/xpath/queryPath/tagName/url/attributes scoring vs generic visual state identity.
Identify exact Core runtime paths invoking matcher, whether adapter already supplies matcher,
and how to remove Core browser-specific implementation without breaking recordings/persisted execution.
Propose concrete interface split, where contracts live, migration compatibility, exact focused checks.
Inspect production model state contracts if needed; browser-safe package subpath alone doesn't imply correct ownership.
No full suites, paid runs or browser operations.
Report concise evidence and return Outcome/Changed/Validation/Not verified/Report/Notes contract.

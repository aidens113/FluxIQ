# Execution option migration binding review
Role: Heavy worker; gpt-6.1-sol, Max. READ ONLY source; no git/build/tests/source edits.
Goal: classify29guard sites before mechanical migration, avoiding premature private binding/rebind failures.
Read own guard report, actual copy.ts/inherit.ts/bindings.ts, listed20production files only as needed.
Repo: C:/Users/osrs_/FluxStuff/fxwork/t843/!FluxIQ.
Binding.bind rejects changing existing observation; ordinary copies preserve, but driver.prepare and partial prepared-target copies intentionally bind actual child only AFTER callback entry.
Identify exact ordinary preserve, new-parent, deferred-private-binding, child override, and stripped-field cases. Do not conflate their context/proof/retry lineage.
Proposed lead seam for review: copyAutomationExecutionOptions(source, changes?, parent?) defaults preserve; actual parent copies preserve original run proof under genuine parent; explicit parent:null defers observation while still inheriting retry series, for existing actual prepared binder to attach after entry. No rights derive from null or metadata.
Compare proposal to actual sites; recommend narrower alternative if needed. Do not create a second companion registry or permit rebinding an already-bound target.
Trace whether any options have original additional fields or getter evaluation order affected by helper merge; preserve delete/absent distinctions and explicit reparent calls.
Output concise exact-site classification, safe transformation order, focused production test selectors and shared-helper amendments needed BEFORE code release.
Own report: docs/working/runtime-ownership-refactor/reports/execution-options-copy-migration-plan.md.
Return Outcome, Changed, Validation, Not verified, Report, Notes<=3 lines.

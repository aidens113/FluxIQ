# Original project SQL foundation ownership
Role: Heavy worker, gpt-6.1-sol Max; no agents/git/shared working docs.
Repo: t843 Core. READ ONLY discovery until Root explicitly releases implementation.
Read Current State and reports/remaining-backend-owner-map.md release1; inspect only named owners/dependencies.
Goal: move actual project SQL/pool/statements/close/transaction/migration owners out of Studio, preserving original identity/state/default behavior and canonical no-Studio closure.
Proposed owned paths: programs/automation-studio/storage/project/{database,statement-cache,store-unavailable-error,unit-of-work}.ts; storage/schema-migrations.ts; project/schema/**; EXACT default migration array/type slice of project/administration.ts; immediate tests; new framework/persistence/project/{sql,mutations,migrations,schema}/** and needed internal barrels.
Must not touch canonical authority/execution-admission/store methods outside those exact slices, Root package/public parents/SDK/types/composition, B native target policy/Down, C partial trial/coverage/logs, native SQL execution/performance files after current acceptance, baselines/shared docs/git.
Preserve one original pool/cache/lease/close tracker/migration memo, class/function identity through old exact exports, all SQL/table IDs/checksums/order and commit/rollback/error semantics. No copied state authority or synthetic repository DTO.
Move original default migration array/type out of mixed administration module ONCE; old administration imports that same object. Canonical UnitOfWork must not import old administration or CanonicalAuthorityWholeSql through an alias. Keep original guard checks and full default migration behavior.
Follow existing framework persistence layout and code-structure budgets; split by cohesive owner where needed, never move a baseline exemption to a new path or grow it. Barrel imports must not create TDZ/cycles.
Before implementation, report exact source/file map, dependency closure/cut, public seam needed, original private ownership risks and existing narrow selectors in reports/project-sql-foundation.md <=100lines. Name any extra needed ownership precisely instead of editing it.
Root then freezes that contract and releases implementation; no speculative broad migration before release.
Planned acceptance: database/unit-of-work/schema/administration; schema-migrations/ready-memo; actual close/lease/rollback/retained error identity and real project native durable SQL consumer. Preserve real temporary fixtures; no user data/providers/browser/panel/full suites.
For scoped rules retain complete context and filter findings by ownership so destination barrels/cycles remain visible. Actual full/type/erased canonical closure must exclude Studio even via old aliases.
After implementation, notify Source+Tests FROZEN before readers; Root owns common documented package gates/build/integration and git. Standard return contract; report evidence limits honestly.

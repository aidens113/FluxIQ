# Execution-derived admission review

Role: Heavy worker, gpt-6.1-sol, max effort.
Goal: Independently review candidate-retest-protocol.md and define the smallest truthful execution-safety authority before implementation.
Read: Current State; reports/candidate-retest-protocol.md; actual native/IO/runtime dispatch, graph/outside-graph/required/nested uncertainty boundaries and existing command/session stores needed to establish the authoritative facts.
Owned REPORT ONLY: docs/working/runtime-ownership-refactor/reports/execution-admission-review.md. All Core source is frozen for package/build acceptance; no source edits.
Challenge whether existing command authority can be reused instead of duplicating a ledger; identify exact pre-send journal, authentic completion and unresolved/required facts. Missing coverage is unverified, never clear.
Coverage must include native implementation invocation (trusted native code can act itself), IO/runtime fallback, exploration/partial/nested/whole execution, hook/start/reset work and alternate stall entrance. Preserve original host identity/method receivers; no proxy/clone.
Pending uncertainty must survive candidate revision/run/loop changes. Inspect restart/reopen behavior of existing durable command/session owner; never turn a new in-memory build scope into proof that an earlier unknown act is settled. Identify the minimal query/persistence port required; do not invent settlement from page state/reset/no landed acts.
Read-only diagnosis and cached rejudgment/offline work must remain available without granting a new committing send. Existing required-command latches remain authoritative.
Specify narrow neutral receipt/admission/observer port(s), private producer/consumer authority, cache-to-live race handling, exact file ownership and deterministic tests proving zero second committing send across revisions/run IDs/reopened scope.
No model/JSON/reason/tool-name-only capability, fabricated unacted state, blanket repeat exception, second independent source of command truth, or silent legacy-port auto-grant.
Report limitations/counterexamples candidly and propose a bounded implementation split that can be parallelized with candidate/loop wiring after interfaces are fixed.
No test/build/provider/browser/panel/git/spawn actions; read-only source review only.
Return: Outcome; Changed; Validation; Not verified; Report; Notes <=3 lines.

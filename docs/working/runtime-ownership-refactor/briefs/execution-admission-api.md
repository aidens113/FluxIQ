# Durable execution admission API

Role: heavy worker, gpt-6.1-sol, Max.
Goal: turn the two safety reviews into a concrete implementation-ready interface and integration plan.
Read reports/execution-admission-review.md and reports/candidate-retest-protocol.md.
Own only reports/execution-admission-api.md.
Must not touch source, tests, configuration, shared documents or git.
Specify exact neutral TypeScript interfaces and private authority issuance.
Specify durable schema changes and precise existing-function integration points.
Reuse existing command truth; do not add a competing receipt journal.
Address provider-free/read-only/custom hosts and native authentic completion.
Preserve strict ordinary retry and required-unknown protection.
Include zero-second-send cases across revisions, runs and reopening.
No builds, full suites, providers, browser, panel or user data operations.
Return Outcome, Changed, Validation, Not verified, Report and at most three Notes lines.

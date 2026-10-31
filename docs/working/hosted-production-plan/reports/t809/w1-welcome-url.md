# w1 welcome-url report

## Outcome
Done.

## What changed and why
- `file-email-sender.ts`: the JSON record gains `welcomeUrl` (before `sentAt`) when `message.variables.welcomeUrl` is a string; the key is absent otherwise (conditional spread). Variables are `Record<string, string>`, so no type change. Class doc comment updated: the record carries the link as data, so the directory is as private as a mailbox.
- `tests/file-email-sender.test.ts`: new case "records welcomeUrl as data only when the message has one" (welcome message -> `welcomeUrl` equals the link; account-exists message -> key absent). No link contents are logged.

## Commands run and observed results
- `pnpm test src/platform/provisioning/email` (packages/fluxiq): parallel group `Tests 6 passed (6)`; real-sql group "No test files found" (filter matches none there); final line "all groups passed: parallel, real-sql".

## Not verified
- tsc not run (no types changed). `pnpm structure:check` not run (no files added).

## Open questions or contradictions found
None.

```text
Outcome: Done
Changed: packages/fluxiq/src/platform/provisioning/email/file-email-sender.ts, packages/fluxiq/src/platform/provisioning/email/tests/file-email-sender.test.ts
Validation: `pnpm test src/platform/provisioning/email` -> Tests 6 passed (6); all groups passed: parallel, real-sql
Not verified: tsc, structure:check
Report: docs/working/hosted-production-plan/reports/t809/w1-welcome-url.md
Notes: welcomeUrl key omitted when variable absent
```

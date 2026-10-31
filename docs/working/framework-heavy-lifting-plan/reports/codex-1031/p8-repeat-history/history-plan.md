# P8 bounded repair history: implementation plan

Planning only; source remains frozen pending lead authorization.

## Grounded path and present limits

`service/runtime-session/in-run-repair.ts` constructs `automationStudioInRunRepairSlot`; `slot.ts` spreads `automationStudioInRunRepairHistory`; `recovery/annotation/annotate.ts:618` assigns that slot to the patch request. `llm/harness/context-packet.ts:397` packs it only for `runtime_patch`. The diagnosis and other task kinds receive no slot/instruction. No call-site edit is needed.

The history mapper never reads attempt inputs/outputs. It currently emits retry, handler, state_route, ladder, repair and counted entries in that order per attempt. It leaves pace, reacquire and obstruction out; state_route omits the recorded candidate/match counts, direction and closeness. Handler order and completed-act projection must stay unchanged.

The packet recursively replaces locator-shaped string content, drops credential-shaped history entries, then keeps each history's newest 40 entries, preserving their chronological order. Omitted counts include old entries, screened entries and caller omissions. Contract screening also honors denied evidence keys; history credential filtering currently uses an empty denied-key list. There is no separate byte bound per recovery entry. New scalar records fit this count budget; no raw payload or open-ended reason is needed. Do not claim the packet applies domain denied-key rejection to every history field.

## Exact proposed safe summaries

Every entry retains existing `attemptId`, `nodeId`. Extend the existing recovery `kind` union, preserving its index signature for legacy consumers/tests.

| Entry | Exact additional fields | Recorded source / exclusions |
| --- | --- | --- |
| obstruction | `kind: "obstruction"`, `obstructionKind` (overlay/notice/rate_limit/assistant/other), optional `retryAfterMs` | `attempt.obstruction.kind`, obstruction.retryAfterMs. No new code field: the existing failedAttempt.failure.code retains its genuine meaning. Omit id/name/covers/dismiss/controlRef and all page prose. |
| pace | `kind: "pace"`, `inForceMs`, `waitedMs`, optional `raisedToMs` | `attempt.pace` only. No synthesis from run totals or failure hints. |
| reacquire | `kind: "reacquire"`, `strategy: "row" | "output" | "identity"`, `outcome: "found" | "gone" | "unmatched" | "unavailable"`; source-bound only: `sourceNodeId`, optional `returned: true` | `attempt.reacquire`. Identity variant carries no source/returned field. Omit `reason` for both variants: source-bound contract permits arbitrary string, and outcome already communicates the result. Omit timestamp, lineage output key, stale/fresh values, patches and identity material. |
| existing state_route | retain existing `outcome`, optional `toNodeId`, `refused` guard list; add optional `candidates`, `matched`, `direction`, `closeness` | `attempt.stateRouting` only; do not infer from skipped/stateHeld/route or raw page signatures. Never include free-form reason or refusal payload. |

Only emit supported closed tokens. For new numeric fields accept finite numbers in [0, Number.MAX_SAFE_INTEGER]; candidate/match counts additionally require integer values. Omit an invalid optional number without replacing it with zero or a cap. For pace omit the entry if either required numeric field is invalid. Closeness has only a numeric runtime contract; preserve a recorded finite nonnegative value within the same numeric bound, without inventing a 0..1 guarantee. Missing observations create no new entries. Legacy history shape remains identical when optional source fields are absent.

Append new observation entries after the existing per-attempt entries, preserving relative order of every legacy entry and handler sequence. These summarize what was met/tried, not proof that a lasting act is safe to repeat. Do not add any safe/retryable/authorized flag or modify failure classification, effect checks, completed-act IDs, permission behavior or handler selection.

Obstruction has **no typed code field** (`executor/node-execution/obstruction.ts`). Lead confirmed the recorded kind alone is enough here. If a future obstruction-specific code is required, lead-owned minimal change is an optional closed-code field on that contract plus an allowlisted copier in `obstruction-of.ts` and downstream producer. This worker must not invent the code or take those files. The existing failedAttempt.failure.code remains unchanged.

## File ownership after authorization

1. `runtime/recovery/in-run-repair/history.ts`: add explicit field-by-field summaries and guarded scalar copying; no spreading producer observations. Keep this focused mapper cohesive; if its enforced budget requires extraction, use a cohesive helper in this same directory, with its own barrel export and owning test as repository rules require.
2. `runtime/llm/harness/task-request.ts`: extend recovery kind union to obstruction/pace/reacquire and document field semantics. Preserve existing legacy fields/index signature; no public executor or host contract changes.
3. `runtime/recovery/in-run-repair/tests/history-record.test.ts` (new): direct mapper coverage for exact new projections and exclusions, using typed attempt fixtures without browser/provider access.
4. `runtime/recovery/in-run-repair/tests/request-slot.test.ts`: focused slot/integration assertion that the three added observations and richer state-route survive slot composition; keep existing request instruction, handler/part and completed-act assertions.
5. `runtime/llm/harness/tests/in-run-repair-slot.test.ts`: packet survival, count bound, secret/locator screening and task-kind regressions with the new summaries.
6. `runtime/llm/harness/context-packet.ts`: no production edit presently necessary; packing passes added scalar fields through. Edit only if focused verification exposes an actual omission. Preserve count 40, omission accounting and existing screening.

All paths are relative to `packages/fluxiq/src/programs/automation-studio/`. No executor/host contracts, graph/guard source, Downstream source, shared Current State/Ledger or git mutations belong to this worker.

## Acceptance cases for implementation

- Exact obstruction allowlist: generic kind and optional finite retryAfterMs; no invented code, id, covers, name, dismiss/controlRef or nested page data. Existing failedAttempt.failure.code remains unchanged. Unknown kind does not fabricate other.
- Pace preserves zero and recorded fractional milliseconds; preserves raisedToMs only when recorded; invalid/missing required values yield no pace entry and never fabricated numeric values.
- Both source-bound row/output outcomes include sourceNodeId, preserve returned only when true, omit reason/at; source-less identity records across all four outcomes have no sourceNodeId/returned and leak no identity/patch data.
- State routing preserves existing outcome/destination/refused guard order and adds recorded counts/direction/closeness; missing or invalid optional values stay absent, free-form reason stays absent.
- Legacy attempt with no observations yields byte-equivalent JSON history; old retry/handler/state_route/ladder/repair/counted relative order and completed-act/frame/effectCheck remain unchanged. Uncertain failure remains uncertain and never joins actsCompleted.
- Slot composition and actual packed runtime_patch request contain the new allowed summaries. Other task kinds still omit the slot and instruction; existing non-in-run request byte digest remains unchanged.
- More than 40 mixed legacy/new entries retains newest 40 in order and correct omissions, including caller omissions and credential-dropped entry. Added locator-shaped code/source identifier is redacted by existing packet screen; a credential-shaped entry is dropped/counts omitted. Valid normal IDs survive unmodified.
- Serialized history excludes sentinel raw inputs, outputs, errors, obstruction prose/controls, stale handles and record values even when present elsewhere on the typed attempt.

After authorization, run only lead-approved affected typecheck, these named Vitest tests and structure audit; no full suites (both daily slots used), browser, provider, panel or model calls. The lead independently reruns checks before accepting claims.

Outcome: Done
Changed: history-plan.md only
Validation: not run (read-only planning authorization; no checks/builds/browser/provider calls)
Not verified: implementation, types, tests, structure budgets, browser/model behavior
Report: docs/working/framework-heavy-lifting-plan/reports/codex-1031/p8-repeat-history/history-plan.md
Notes: Await lead follow-up before product edits. One guessed identity-contract filename was absent; followed its actual typed identity-record.ts export. No source or runtime state changed.

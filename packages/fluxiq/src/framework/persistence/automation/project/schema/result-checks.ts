// 0022 — what a run's result was judged to be, and which epoch of the Flow it
// belongs to, so the checking schedule can count runs instead of storing a
// counter.
//
// Two columns and one index, both nullable-or-defaulted, so the statements add
// columns and rewrite no row: an existing project database migrates forward
// with every run it already holds reading as unchecked, at epoch 1.
//
// `result_verification_status` is written only for a run the schedule chose to
// check. **`null` means "this run was not part of a check", which is a
// different fact from `unverified`** -- `unverified` is a check that was made
// and settled nothing -- and the two must stay apart, because the whole reason
// `verification-status.ts` exists is that a result nobody judged was reading as
// a result that was right.
//
// `result_check_epoch` is the fallback the design named, and it is needed. The
// design proposed keying the count on `runtime_runs.flow_revision`, so that a
// landed repair restarted the three-run window for free, and flagged that it
// had not proved that column advances. It does not advance: `flow_revision` is
// written from `AutomationStudioFlowRunSummary.flowVersion`
// (`runtime-stream-store.ts:147`), and **nothing in Core ever sets
// `flowVersion`**. `runtimeFlowRunSummaryFromSession` does not, so the write is
// `Number(undefined) || 1`, and the only other producer is the store's own
// read-back, which returns what it wrote. Every row in the table is at
// `flow_revision` 1 and always will be, so keying the epoch on it would mean
// no Flow's window ever restarted.
//
// This column carries the Flow's real graph revision instead, which does
// advance on the patch path (`graph-store.ts:153` bumps `flows.graph_revision`
// inside the apply transaction, and `adaptation-store.ts` records the applied
// revision beside it). A landed repair therefore restarts the window with no
// bookkeeping, which is the behaviour the user asked for: a changed Flow is a
// Flow that has to earn its passes again.
import type { AutomationStudioSchemaMigration } from "../../schema-migrations.ts";

export const AUTOMATION_STUDIO_PROJECT_RESULT_CHECK_MIGRATION: AutomationStudioSchemaMigration = {
  id: "0022_result_checks",
  statements: [
    `alter table runtime_runs add column result_verification_status text
       check (result_verification_status is null
              or result_verification_status in ('confirmed', 'refuted', 'unverified', 'no_result'))`,
    "alter table runtime_runs add column result_check_epoch integer not null default 1 check (result_check_epoch > 0)",
    "create index if not exists runtime_runs_result_check_idx on runtime_runs (flow_id, result_check_epoch, finished_at_ms desc, run_id)"
  ]
};

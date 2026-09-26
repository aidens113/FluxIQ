// 0023 -- which version of which graph Flow a verdict was about.
//
// Core already holds the versions. `graph_revisions` is a numbered, parented,
// digested chain per Flow row; a Subflow's graph is a Flow row of its own, so
// Subflow graphs already version independently; and `getFlow` materializes a
// Flow's nodes and edges *from that chain*, which makes it the executable truth
// rather than a side index. What was missing is the join: the result
// verification keys its verdict to a run, and nothing anywhere recorded which
// graph revision that run executed. A Flow could therefore be changed, judged
// worse, and have no way to say worse *than what* -- so no regression could be
// detected and no rollback could ever be decided.
//
// One table closes it, and it only records. Nothing reads these rows to decide
// anything yet, deliberately: the rule that would act on them needs a
// `confirmed` predecessor under the same instruction, and on all evidence so
// far no such record has ever existed -- because this is the table that would
// have held it. Machinery with an empty input comes after there is input.
//
// `revision_number > 0` is what keeps "this Flow has no version chain" out of
// the table. Revision numbers start at 1, so a graph with no chain is recorded
// on the run as `revision: null` and gets no row here at all. Absent and zero
// are different facts and a row claiming version 0 would assert the second.
//
// `instruction_digest` is nullable, which the design's first sketch was not.
// "Worse" is only meaningful against the same question, so the digest is what
// licenses a comparison -- and a verdict Core settled from its own arithmetic
// asks no model and reads no instruction, so for that verdict there is no
// question on record. Null is the honest value: it matches nothing, so it can
// never be compared, which is the same safe-by-construction shape that lets
// every revision written before this migration exist without a backfill.
//
// `subflow_id` is nullable and is the orchestration Flow's own entry being
// null. It is carried so a reader can tell the parent's version from a
// Subflow's without joining back through `subflows`, and it is an id, never a
// name.
import type { AutomationStudioSchemaMigration } from "../../schema-migrations.ts";

export const AUTOMATION_STUDIO_PROJECT_FLOW_GRAPH_JUDGEMENT_MIGRATION: AutomationStudioSchemaMigration = {
  id: "0023_flow_graph_judgements",
  statements: [
    `create table flow_graph_judgements (
      flow_id text not null,
      revision_number integer not null check (revision_number > 0),
      run_id text not null,
      subflow_id text,
      status text not null check (status in ('confirmed', 'refuted', 'unverified', 'no_result')),
      code text not null,
      instruction_digest text,
      decided_at_ms integer not null,
      primary key (flow_id, revision_number, run_id)
    )`,
    // The lookup the rollback rule will make: the newest judgement on a graph
    // Flow, newest revision first, under one question.
    "create index flow_graph_judgements_flow_idx on flow_graph_judgements (flow_id, instruction_digest, revision_number desc, decided_at_ms desc)",
    // The lookup a reader of one run makes, and the one the run's own retention
    // sweep will make when a run is pruned.
    "create index flow_graph_judgements_run_idx on flow_graph_judgements (run_id, flow_id)"
  ]
};

import type { AutomationStudioSchemaMigration } from "../migrations/contracts/index.ts";

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

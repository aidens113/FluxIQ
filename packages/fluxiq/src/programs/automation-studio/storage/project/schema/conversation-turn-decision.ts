// 0026_responded_turn_decision -- which decision Core answered a person's
// message with, on the turn it wrote (t728 F3).
//
// A build's instruction is every person turn since the thread last closed
// what was asked (`runtime/conversations/person-words.ts`). Whether Core's
// answer closed it depends on what Core decided: a plain answer or a command
// it took the words as does, its one question back does not. The thread kept
// only the words, so a question Core had already answered ("What can you
// do?") was saved into the next build's instruction and named its Flow. The
// decision is recorded here, where it is known; it is Core's own reading of
// the thread, and no client read carries it.
//
// Null on every turn written before it and on every turn not written in
// answer to a person (a person's own turn, a command's progress, a run's
// question). The check keeps it to the kinds Core writes.
//
// Its id sorts after `0026_relaxed_instruction_node_guard`, the previous last
// of the project administration set, and before
// `0026_staged_project_snapshots_v1`, the first migration the stores append
// after that set.
import type { AutomationStudioSchemaMigration } from "../../schema-migrations.ts";

export const AUTOMATION_STUDIO_PROJECT_CONVERSATION_TURN_DECISION_MIGRATION: AutomationStudioSchemaMigration = {
  id: "0026_responded_turn_decision",
  statements: ["alter table conversation_turns add column decision_kind text check (decision_kind is null or decision_kind in ('reply', 'clarify', 'invoke'))"]
};

// What a panel assistant database carries beyond a project's: the `panel`
// subject, and the calls waiting on a person's Allow.
//
// **The subject.** A panel thread uses the project's own tables and rows
// (`../../store.ts`), and `conversations.subject_kind` is checked against the
// project subjects (`0021_conversations`). SQLite cannot change a check in
// place, so `9001` rebuilds the table with `panel` allowed, copying every
// column by name and recreating its two indexes. Only a reserved database runs
// it (`AutomationStudioProjectConversationStore.openReserved`); a project keeps
// refusing `panel`. `tests/panel-threads.test.ts` fails the build when a project
// migration changes the `conversations` columns this copy names, so the rebuild
// cannot silently drop one.
//
// **Waiting calls.** A call the person's words did not clearly ask for waits on
// a confirm ask. Its exact tool and input are kept here, keyed by the ask, so
// Allow runs exactly the call the card described, after a restart too, and
// `status` makes the press run it once. `9003` adds the words and the page
// and selection of the message the card was raised under: the work Allow goes
// on with reads those, never the page at the press or a newer message (review
// P9-R2). A row from before it reads as no words, which clearly ask nothing.
//
// **They go with their thread.** A waiting call keeps the words of the message
// it was raised under, so it must not outlive the thread a person deleted.
// `9004` removes a thread's waiting calls when its `conversations` row is
// deleted, inside the statement that deletes it, so the store's delete
// (`AutomationStudioProjectConversationStore.deleteConversation`) removes them in
// its own transaction and nothing here has to remember to.
//
// The ids sit far above the project's (`0001`-`0036`): a project migration
// added later still sorts first.

import type { AutomationStudioSchemaMigration } from "../../../../framework/persistence/automation/index.ts";

/** The columns of `conversations` the rebuild copies, in table order. */
const CONVERSATION_COLUMNS = "conversation_id, subject_kind, subject_id, status, title, revision, turn_count, pending_ask_count, created_at_ms, updated_at_ms";

/** The migrations a panel assistant database runs after a project's. */
export const PANEL_ASSISTANT_STORE_MIGRATIONS: readonly AutomationStudioSchemaMigration[] = Object.freeze([
  {
    id: "9001_panel_conversation_subject",
    statements: [
      `create table conversations_with_panel (
        conversation_id text primary key,
        subject_kind text not null check (subject_kind in ('project', 'flow', 'build', 'run', 'panel')),
        subject_id text not null,
        status text not null default 'open' check (status in ('open', 'resolved')),
        title text,
        revision integer not null default 1 check (revision > 0),
        turn_count integer not null default 0 check (turn_count >= 0),
        pending_ask_count integer not null default 0 check (pending_ask_count >= 0),
        created_at_ms integer not null,
        updated_at_ms integer not null
      )`,
      `insert into conversations_with_panel (${CONVERSATION_COLUMNS}) select ${CONVERSATION_COLUMNS} from conversations`,
      "drop table conversations",
      "alter table conversations_with_panel rename to conversations",
      "create index conversations_subject_idx on conversations (subject_kind, subject_id, updated_at_ms desc, conversation_id)",
      "create index conversations_updated_idx on conversations (updated_at_ms desc, conversation_id)"
    ]
  },
  {
    id: "9002_panel_waiting_calls",
    statements: [
      `create table panel_assistant_waiting_calls (
        ask_id text primary key,
        conversation_id text not null,
        tool_name text not null,
        input_json text not null,
        status text not null check (status in ('waiting', 'taken')),
        created_at_ms integer not null,
        taken_at_ms integer,
        check ((status = 'taken') = (taken_at_ms is not null))
      )`
    ]
  },
  {
    id: "9003_panel_waiting_call_words",
    statements: [
      "alter table panel_assistant_waiting_calls add column words text not null default ''",
      "alter table panel_assistant_waiting_calls add column context_json text not null default '{}'"
    ]
  },
  {
    id: "9004_panel_waiting_calls_follow_thread",
    statements: [
      `create trigger panel_assistant_waiting_calls_follow_thread after delete on conversations
      begin
        delete from panel_assistant_waiting_calls where conversation_id = old.conversation_id;
      end`
    ]
  }
]);

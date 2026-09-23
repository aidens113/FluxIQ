// 0021 -- conversations: the thread FluxIQ and a person talk in, its ordered
// turns, and the asks a turn carries.
//
// A turn is append-only and an ask is answered once, and both are enforced
// here rather than only in the store: `conversation_turns` is keyed by its
// ordinal within the thread, and an ask's answer columns arrive together with
// its `answered` status or not at all. A store bug then fails the write rather
// than leaving a thread that reads back as something nobody said.
//
// `routes_json` is what makes an ask able to park a run without losing what
// the answer meant: it names the branch each answer resumes down, decided when
// the question is asked rather than when it is answered. `consequences_json`
// is what makes a caller able to tell a question it may answer in passing from
// one it must not.
//
// Unlike `run_dataset_audit_events` this schema deliberately holds free text:
// a turn's body is what was said, and a conversation with the words removed is
// not a conversation. What it must not hold is anything the domain did not
// already put in front of a person -- the control name on a permission ask
// comes out of the request the gate built, which carries a name only when it
// had already appeared in evidence the model was shown.
import type { AutomationStudioSchemaMigration } from "../../schema-migrations.ts";

export const AUTOMATION_STUDIO_PROJECT_CONVERSATION_MIGRATION: AutomationStudioSchemaMigration = {
  id: "0021_conversations",
  statements: [
    `create table conversations (
      conversation_id text primary key,
      subject_kind text not null check (subject_kind in ('project', 'flow', 'build', 'run')),
      subject_id text not null,
      status text not null default 'open' check (status in ('open', 'resolved')),
      title text,
      revision integer not null default 1 check (revision > 0),
      turn_count integer not null default 0 check (turn_count >= 0),
      pending_ask_count integer not null default 0 check (pending_ask_count >= 0),
      created_at_ms integer not null,
      updated_at_ms integer not null
    )`,
    // `ordinal` is the thread's order and its paging key: `sinceTurnId` resolves
    // to one, and everything after it is what the reader has not seen.
    `create table conversation_turns (
      conversation_id text not null,
      turn_id text not null,
      ordinal integer not null check (ordinal >= 1),
      author text not null check (author in ('automation', 'person')),
      body text not null,
      attachment_kind text,
      attachment_ref text,
      actor_id text,
      created_at_ms integer not null,
      primary key (conversation_id, turn_id)
    )`,
    // The answer lives on the ask, which is what makes "answered once"
    // structural: there is one row to fill, and the check refuses a status and
    // an answer that disagree.
    `create table conversation_asks (
      ask_id text primary key,
      conversation_id text not null,
      turn_id text not null,
      kind text not null check (kind in ('permission', 'choice', 'confirm', 'open')),
      status text not null check (status in ('pending', 'answered', 'expired')),
      parks integer not null check (parks in (0, 1)),
      timeout_ms integer check (timeout_ms is null or timeout_ms > 0),
      on_timeout text check (on_timeout is null or on_timeout in ('deny', 'default')),
      options_json text,
      routes_json text,
      consequences_json text,
      missing_json text,
      control_json text,
      request_json text,
      created_at_ms integer not null,
      answered_at_ms integer,
      answer_kind text check (answer_kind is null or answer_kind in ('grant', 'deny', 'choice', 'text')),
      answer_value text,
      answer_actor_id text,
      check ((status = 'answered') = (answered_at_ms is not null and answer_kind is not null))
    )`,
    "create unique index conversation_turns_ordinal_idx on conversation_turns (conversation_id, ordinal)",
    "create index conversations_subject_idx on conversations (subject_kind, subject_id, updated_at_ms desc, conversation_id)",
    "create index conversations_updated_idx on conversations (updated_at_ms desc, conversation_id)",
    "create index conversation_asks_conversation_idx on conversation_asks (conversation_id, created_at_ms, ask_id)",
    "create index conversation_asks_pending_idx on conversation_asks (status, created_at_ms, ask_id)"
  ]
};

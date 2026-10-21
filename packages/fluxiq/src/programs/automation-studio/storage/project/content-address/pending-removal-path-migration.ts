// Pending removals keyed by file path (t747). 0033 keyed
// `object_pending_removals` by object id, and the drain kept a pending file
// while any objects row carried that id. A sealed object that is sealed again
// writes a new file and releases its old one while its row lives on under the
// same id, so the drain's held check is "an objects row names this path", and
// one object may have two paths pending at once. SQLite cannot change a
// table's primary key in place, so the table is rebuilt under its own name:
// every column and every row is carried over, and only the key moves (a path
// pending twice, which 0033 could not write for two objects with distinct
// digests, keeps its latest release). The index on `objects.relative_path`
// serves the held check.
import type { AutomationStudioSchemaMigration } from "../../schema-migrations.ts";

export const AUTOMATION_STUDIO_PENDING_REMOVAL_PATH_MIGRATION: AutomationStudioSchemaMigration = {
  id: "0036_object_pending_removal_paths",
  statements: [
    "create table object_pending_removals_by_path (relative_path text primary key, object_id text not null, released_at_ms integer not null)",
    `insert into object_pending_removals_by_path (relative_path, object_id, released_at_ms)
     select relative_path, object_id, released_at_ms from object_pending_removals where true
     on conflict(relative_path) do update set object_id = excluded.object_id, released_at_ms = excluded.released_at_ms
     where excluded.released_at_ms > object_pending_removals_by_path.released_at_ms`,
    "drop table object_pending_removals",
    "alter table object_pending_removals_by_path rename to object_pending_removals",
    "create index objects_relative_path_idx on objects (relative_path)"
  ]
};

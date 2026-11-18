import type { AutomationStudioSchemaMigration } from "../../schema-migrations.ts";

/**
 * The project change feed's retention watermark: one row naming the highest sequence pruning has
 * deleted through, and when it last ran. A reader whose cursor is below it has missed rows and is
 * told to reload instead of reading on as if nothing happened.
 */
export const AUTOMATION_STUDIO_PROJECT_CHANGE_FEED_RETENTION_MIGRATION: AutomationStudioSchemaMigration = {
  id: "0039_change_feed_retention",
  statements: [
    `create table change_feed_retention (
      singleton integer primary key check (singleton = 1),
      pruned_through_sequence integer not null check (pruned_through_sequence >= 0),
      pruned_at_ms integer not null
    )`
  ]
};

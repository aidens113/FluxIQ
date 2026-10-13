import type { AutomationStudioSchemaMigration } from "../../schema-migrations.ts";

/** Legacy descriptions stay unknown; explicit descriptions become cheap list metadata. */
export const AUTOMATION_STUDIO_PROJECT_RECORDING_DESCRIPTION_MIGRATION: AutomationStudioSchemaMigration = {
  id: "0026_recording_description",
  statements: ["alter table recordings add column description text"]
};

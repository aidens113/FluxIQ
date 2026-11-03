import type { AutomationStudioProjectContentProtection } from "../content-protection.ts";
import type { AutomationStudioProjectDatabase } from "../database.ts";

/** What opening the keyring or rotating its key needs. The caller has run 0033 on `database`. */
export type AutomationStudioContentAddressKeyringInput = {
  database: AutomationStudioProjectDatabase;
  projectId: string;
  protection: AutomationStudioProjectContentProtection;
  now?: () => number;
};

/** Refuses a database that belongs to another project: its key rows are bound to that project. */
export function assertContentAddressKeyringInput(input: AutomationStudioContentAddressKeyringInput): void {
  if (typeof input.projectId !== "string" || !input.projectId) throw new Error("Content address keyring requires a project id.");
  if (input.database.projectId !== input.projectId) throw new Error("Content address keyring database does not belong to the project.");
}

import type { User } from "../../../identity-access/index.ts";

// Who owns each Automation Studio project (hosted production plan,
// Permissions, "Ownership"; lane B3, t803). Ownership is kept beside the
// project, not in the runtime's project record, so the api layer can record it
// without changing how the runtime stores projects.

/**
 * How an owner came to be recorded: `creator` when `create-project` recorded
 * the creating user, `default` when the migration gave an unowned project the
 * workspace owner or the first enabled `admin`. A creator is never replaced; a
 * default is replaced once by the creator, which covers a list that defaulted
 * a project in the moment between its creation and its creator being recorded.
 */
export type AutomationStudioProjectOwnerSource = "creator" | "default";

export type AutomationStudioProjectOwnerRecord = {
  userId: string;
  source: AutomationStudioProjectOwnerSource;
  recordedAt: number;
};

/** Owner records by project id. */
export type AutomationStudioProjectOwnerRecords = { [projectId: string]: AutomationStudioProjectOwnerRecord };

/**
 * Where owner records are kept. `change` is one atomic read-modify-write:
 * `mutate` edits the records it is given in place and runs synchronously, and
 * a `mutate` that throws writes nothing.
 */
export type AutomationStudioProjectOwnerStore = {
  read(): Promise<AutomationStudioProjectOwnerRecords>;
  change<T>(mutate: (records: AutomationStudioProjectOwnerRecords) => T): Promise<T>;
};

/** Whether an id names a project. False for an unknown id; a failed read throws. */
export type AutomationStudioProjectCatalog = {
  hasProject(projectId: string): Promise<boolean>;
};

/** What the default owner is chosen from: an Identity Access user's id, role, state and creation time. */
export type AutomationStudioProjectOwnerCandidate = Pick<User, "id" | "roleId" | "enabled" | "createdAtMs">;

/**
 * Where an unowned project's owner comes from: the workspace owner when a
 * source of one is given and names one, else the first enabled `admin` of
 * `users` by creation order.
 */
export type AutomationStudioProjectOwnerDefaults = {
  workspaceOwner?: () => Promise<string | null>;
  users(): Promise<readonly AutomationStudioProjectOwnerCandidate[]>;
};

/**
 * One migration pass over some projects. `examined` counts distinct ids;
 * `alreadyOwned` had a recorded owner, `assigned` were given `defaultOwner`,
 * `unassigned` stayed ownerless because there was no default owner. `owners`
 * is each examined id's owner after the pass.
 */
export type AutomationStudioProjectOwnerMigrationResult = {
  examined: number;
  alreadyOwned: number;
  assigned: number;
  unassigned: number;
  defaultOwner: string | null;
  owners: ReadonlyMap<string, string | null>;
};

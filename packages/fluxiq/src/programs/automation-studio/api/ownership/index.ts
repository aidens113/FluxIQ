// Who owns each Automation Studio project, kept beside the project (lane B3,
// t803): the registry's `project` owner resolver, the migration that gives an
// unowned project the workspace owner or the first enabled `admin`, and the
// reader that adds `ownerUserId` to the projects a handler answers.

export { AutomationStudioProjectOwnership, type AutomationStudioProjectOwnershipOptions } from "./ownership.ts";
export { AutomationStudioProjectOwnerships } from "./ownerships.ts";
export { AutomationStudioProjectOwnerDocumentStore } from "./document-store.ts";
export { AutomationStudioProjectOwnerMemoryStore } from "./memory-store.ts";
export { migrateAutomationStudioProjectOwners, type AutomationStudioProjectOwnerMigrationInput } from "./migration.ts";
export { automationStudioProjectDefaultOwner } from "./default-owner.ts";
export { automationStudioServiceProjectCatalog } from "./service-catalog.ts";
export type * from "./types.ts";

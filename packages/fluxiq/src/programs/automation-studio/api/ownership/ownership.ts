import type { ProgramResourceOwnerResolver } from "../../../_shared/iam/index.ts";
import type { AutomationStudioProject } from "../contracts/index.ts";
import { automationStudioProjectDefaultOwner } from "./default-owner.ts";
import { migrateAutomationStudioProjectOwners } from "./migration.ts";
import { AutomationStudioProjectOwnerRecordSet as RecordSet } from "./owner-records.ts";
import type { AutomationStudioProjectCatalog, AutomationStudioProjectOwnerDefaults, AutomationStudioProjectOwnerMigrationResult, AutomationStudioProjectOwnerStore } from "./types.ts";

export type AutomationStudioProjectOwnershipOptions = {
  store: AutomationStudioProjectOwnerStore;
  catalog: AutomationStudioProjectCatalog;
  defaults: AutomationStudioProjectOwnerDefaults;
  now?: () => number;
};

/**
 * The project owner resolver the registry evaluates `fluxiq:ResourceOwner`
 * with (`registerResourceOwners("project", ...)`), and the reader the project
 * handlers add `ownerUserId` with.
 *
 * No project is ever ownerless while there is someone to own it: a lookup of
 * a project with no recorded owner runs the migration for it first, so the
 * project is given, and keeps, the default owner. An id that names no project
 * answers null and records nothing, whether or not an owner was ever recorded
 * for it (a deleted project's record is left behind but never answered).
 */
export class AutomationStudioProjectOwnership implements ProgramResourceOwnerResolver {
  private readonly store: AutomationStudioProjectOwnerStore;
  private readonly catalog: AutomationStudioProjectCatalog;
  private readonly defaults: AutomationStudioProjectOwnerDefaults;
  private readonly now: () => number;

  constructor(options: AutomationStudioProjectOwnershipOptions) {
    this.store = options.store;
    this.catalog = options.catalog;
    this.defaults = options.defaults;
    this.now = options.now ?? Date.now;
  }

  /** The owner of project `projectId`; null for an id that is no project, or a project nobody can own yet. */
  async ownerOf(projectId: string): Promise<string | null> {
    if (!RecordSet.isUsableId(projectId)) return null;
    if (!(await this.catalog.hasProject(projectId))) return null;
    const recorded = RecordSet.of(await this.store.read(), projectId);
    if (recorded) return recorded.userId;
    return (await this.migrate([projectId])).owners.get(projectId) ?? null;
  }

  /**
   * Records `userId` as the creator and owner of a project just created
   * (called by the registry after `create-project` declares what it created).
   * Replaces a default owner; recording the same creator again changes
   * nothing; a different creator for a project that has one throws, since a
   * project is created once.
   */
  async recordOwner(projectId: string, userId: string): Promise<void> {
    if (!RecordSet.isUsableId(projectId)) throw new Error("A project owner is recorded only for a usable project id.");
    if (typeof userId !== "string" || userId.length === 0) throw new Error(`A project owner needs a user id (project ${projectId}).`);
    if (!(await this.catalog.hasProject(projectId))) throw new Error(`Cannot record an owner of unknown Automation Studio project ${projectId}.`);
    const recordedAt = this.now();
    await this.store.change((records) => {
      const current = RecordSet.of(records, projectId);
      if (current?.source === "creator") {
        if (current.userId === userId) return;
        throw new Error(`Automation Studio project ${projectId} already has a recorded creator.`);
      }
      records[projectId] = { userId, source: "creator", recordedAt };
    });
  }

  /**
   * `projects` (as the service listed or read them, so each names a project)
   * with `ownerUserId` added, migrating any without a recorded owner in one
   * change. Order and every other field are kept.
   */
  async withProjectOwners<T extends Pick<AutomationStudioProject, "id">>(projects: readonly T[]): Promise<Array<T & { ownerUserId: string | null }>> {
    const { owners } = await this.migrate(projects.map((project) => project.id));
    return projects.map((project) => ({ ...project, ownerUserId: owners.get(project.id) ?? null }));
  }

  /** Runs the migration over `projectIds`, which the caller knows are projects; answers its counts. */
  async migrate(projectIds: readonly string[]): Promise<AutomationStudioProjectOwnerMigrationResult> {
    return await migrateAutomationStudioProjectOwners({
      store: this.store,
      projectIds,
      defaultOwner: () => automationStudioProjectDefaultOwner(this.defaults),
      now: this.now
    });
  }
}

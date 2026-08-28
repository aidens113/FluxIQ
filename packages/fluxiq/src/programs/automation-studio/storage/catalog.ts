import { mkdir } from "node:fs/promises";
import path from "node:path";
import type { AutomationStudioProject, AutomationStudioProjectCategory } from "../api/contracts.ts";
import { AutomationStudioProjectDatabase } from "./project-database.ts";
import { AutomationStudioSchemaMigrationRunner, type AutomationStudioSchemaMigration } from "./schema-migrations.ts";

export type AutomationStudioCatalogProject = AutomationStudioProject & {
  storagePath: string;
  status: "active" | "archived" | "unavailable";
  revision: number;
};

export type AutomationStudioCatalogCategory = AutomationStudioProjectCategory & { revision: number };

export type AutomationStudioCursorPage<T> = { items: T[]; nextCursor: string | null; hasMore: boolean };

export const AUTOMATION_STUDIO_CATALOG_MIGRATIONS: readonly AutomationStudioSchemaMigration[] = [{
  id: "0001_global_catalog",
  statements: [
    `create table project_categories (
      category_id text primary key,
      name text not null,
      domain_id text,
      sort_order integer not null default 0,
      revision integer not null default 1 check (revision > 0),
      created_at_ms integer not null,
      updated_at_ms integer not null
    )`,
    "create unique index project_categories_name_uq on project_categories (coalesce(domain_id, ''), name collate nocase)",
    "create index project_categories_order_idx on project_categories (coalesce(domain_id, ''), sort_order, category_id)",
    `create table projects (
      project_id text primary key,
      name text not null,
      description text not null default '',
      domain_id text,
      category_id text references project_categories(category_id) on delete set null,
      storage_path text not null unique,
      status text not null default 'active' check (status in ('active', 'archived', 'unavailable')),
      revision integer not null default 1 check (revision > 0),
      created_at_ms integer not null,
      updated_at_ms integer not null
    )`,
    "create index projects_updated_idx on projects (updated_at_ms desc, project_id desc)",
    "create index projects_category_updated_idx on projects (category_id, updated_at_ms desc, project_id desc)",
    "create index projects_domain_updated_idx on projects (coalesce(domain_id, ''), updated_at_ms desc, project_id desc)",
    "create index projects_name_idx on projects (name collate nocase, project_id)"
  ]
}] as const;

export class AutomationStudioCatalog {
  readonly projects: AutomationStudioProjectCatalogRepository;
  readonly categories: AutomationStudioCategoryCatalogRepository;

  private constructor(private readonly database: AutomationStudioProjectDatabase) {
    this.projects = new AutomationStudioProjectCatalogRepository(database);
    this.categories = new AutomationStudioCategoryCatalogRepository(database);
  }

  static async open(input: { rootDir: string; busyTimeoutMs?: number; backup?: (databasePath: string, migrationIds: string[]) => Promise<void> }): Promise<AutomationStudioCatalog> {
    const rootDir = path.resolve(input.rootDir);
    await mkdir(rootDir, { recursive: true });
    const database = await AutomationStudioProjectDatabase.open({
      projectId: "global-catalog",
      filePath: path.join(rootDir, "catalog.sqlite"),
      busyTimeoutMs: input.busyTimeoutMs ?? 10_000
    });
    try {
      await new AutomationStudioSchemaMigrationRunner({
        database,
        migrations: AUTOMATION_STUDIO_CATALOG_MIGRATIONS,
        ...(input.backup ? { backup: (context) => input.backup!(context.databasePath, context.pendingMigrationIds) } : {})
      }).migrate();
      return new AutomationStudioCatalog(database);
    } catch (error) {
      await database.close();
      throw error;
    }
  }

  close(): Promise<void> {
    return this.database.close();
  }
}

export class AutomationStudioProjectCatalogRepository {
  constructor(private readonly database: AutomationStudioProjectDatabase) {}

  async put(input: Omit<AutomationStudioCatalogProject, "revision" | "createdAt" | "updatedAt"> & { revision?: number; createdAt?: number; updatedAt?: number }, expectedRevision?: number): Promise<AutomationStudioCatalogProject> {
    const id = requiredId(input.id, "project");
    const name = requiredName(input.name, "Project");
    const storagePath = input.storagePath.trim();
    if (!storagePath) throw new Error("Project storage path is required.");
    const now = input.updatedAt ?? Date.now();
    return this.database.transaction(async (sql) => {
      const existing = await sql.get<ProjectRow>("select * from projects where project_id = ?", [id]);
      if (expectedRevision !== undefined && existing?.revision !== expectedRevision) throw new Error(`Project ${id} revision conflict.`);
      const revision = existing ? existing.revision + 1 : Math.max(1, Math.trunc(input.revision ?? 1));
      const createdAt = existing?.created_at_ms ?? input.createdAt ?? now;
      await sql.run(
        `insert into projects (project_id, name, description, domain_id, category_id, storage_path, status, revision, created_at_ms, updated_at_ms)
         values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         on conflict(project_id) do update set name = excluded.name, description = excluded.description, domain_id = excluded.domain_id,
           category_id = excluded.category_id, storage_path = excluded.storage_path, status = excluded.status,
           revision = excluded.revision, updated_at_ms = excluded.updated_at_ms`,
        [id, name, input.description ?? "", optionalId(input.domainId), optionalId(input.categoryId), storagePath, input.status, revision, createdAt, now]
      );
      const saved = await sql.get<ProjectRow>("select * from projects where project_id = ?", [id]);
      if (!saved) throw new Error(`Project ${id} was not persisted.`);
      return projectFromRow(saved);
    });
  }

  async get(projectId: string): Promise<AutomationStudioCatalogProject | null> {
    const row = await this.database.get<ProjectRow>("select * from projects where project_id = ?", [requiredId(projectId, "project")]);
    return row ? projectFromRow(row) : null;
  }

  async delete(projectId: string, expectedRevision?: number): Promise<boolean> {
    const params: unknown[] = [requiredId(projectId, "project")];
    const revisionClause = expectedRevision === undefined ? "" : " and revision = ?";
    if (expectedRevision !== undefined) params.push(expectedRevision);
    return (await this.database.run(`delete from projects where project_id = ?${revisionClause}`, params)).changes > 0;
  }

  async list(input: { limit?: number; cursor?: string | null; categoryId?: string | null; domainId?: string | null; status?: AutomationStudioCatalogProject["status"]; search?: string } = {}): Promise<AutomationStudioCursorPage<AutomationStudioCatalogProject>> {
    const limit = clampLimit(input.limit);
    const cursor = decodeCursor<{ updatedAt: number; id: string }>(input.cursor);
    const where: string[] = [];
    const params: unknown[] = [];
    if (input.categoryId !== undefined) addNullableFilter(where, params, "category_id", input.categoryId);
    if (input.domainId !== undefined) addNullableFilter(where, params, "domain_id", input.domainId);
    if (input.status) { where.push("status = ?"); params.push(input.status); }
    const search = input.search?.trim();
    if (search) { where.push("(name like ? escape '\\' collate nocase or project_id like ? escape '\\' collate nocase)"); params.push(like(search), like(search)); }
    if (cursor) { where.push("(updated_at_ms < ? or (updated_at_ms = ? and project_id < ?))"); params.push(cursor.updatedAt, cursor.updatedAt, cursor.id); }
    const rows = await this.database.all<ProjectRow>(
      `select * from projects${where.length ? ` where ${where.join(" and ")}` : ""} order by updated_at_ms desc, project_id desc limit ?`,
      [...params, limit + 1]
    );
    const pageRows = rows.slice(0, limit);
    const last = pageRows.at(-1);
    return { items: pageRows.map(projectFromRow), hasMore: rows.length > limit, nextCursor: rows.length > limit && last ? encodeCursor({ updatedAt: last.updated_at_ms, id: last.project_id }) : null };
  }
}

export class AutomationStudioCategoryCatalogRepository {
  constructor(private readonly database: AutomationStudioProjectDatabase) {}

  async put(input: Omit<AutomationStudioCatalogCategory, "revision" | "createdAt" | "updatedAt"> & { revision?: number; createdAt?: number; updatedAt?: number }, expectedRevision?: number): Promise<AutomationStudioCatalogCategory> {
    const id = requiredId(input.id, "category");
    const now = input.updatedAt ?? Date.now();
    return this.database.transaction(async (sql) => {
      const existing = await sql.get<CategoryRow>("select * from project_categories where category_id = ?", [id]);
      if (expectedRevision !== undefined && existing?.revision !== expectedRevision) throw new Error(`Category ${id} revision conflict.`);
      const revision = existing ? existing.revision + 1 : Math.max(1, Math.trunc(input.revision ?? 1));
      const createdAt = existing?.created_at_ms ?? input.createdAt ?? now;
      await sql.run(
        `insert into project_categories (category_id, name, domain_id, sort_order, revision, created_at_ms, updated_at_ms)
         values (?, ?, ?, ?, ?, ?, ?)
         on conflict(category_id) do update set name = excluded.name, domain_id = excluded.domain_id, sort_order = excluded.sort_order,
           revision = excluded.revision, updated_at_ms = excluded.updated_at_ms`,
        [id, requiredName(input.name, "Category"), optionalId(input.domainId), Math.trunc(input.order), revision, createdAt, now]
      );
      const saved = await sql.get<CategoryRow>("select * from project_categories where category_id = ?", [id]);
      if (!saved) throw new Error(`Category ${id} was not persisted.`);
      return categoryFromRow(saved);
    });
  }

  async get(categoryId: string): Promise<AutomationStudioCatalogCategory | null> {
    const row = await this.database.get<CategoryRow>("select * from project_categories where category_id = ?", [requiredId(categoryId, "category")]);
    return row ? categoryFromRow(row) : null;
  }

  async delete(categoryId: string, expectedRevision?: number): Promise<boolean> {
    const params: unknown[] = [requiredId(categoryId, "category")];
    const revisionClause = expectedRevision === undefined ? "" : " and revision = ?";
    if (expectedRevision !== undefined) params.push(expectedRevision);
    return (await this.database.run(`delete from project_categories where category_id = ?${revisionClause}`, params)).changes > 0;
  }

  async list(input: { limit?: number; cursor?: string | null; domainId?: string | null } = {}): Promise<AutomationStudioCursorPage<AutomationStudioCatalogCategory>> {
    const limit = clampLimit(input.limit);
    const cursor = decodeCursor<{ order: number; id: string }>(input.cursor);
    const where: string[] = [];
    const params: unknown[] = [];
    if (input.domainId !== undefined) addNullableFilter(where, params, "domain_id", input.domainId);
    if (cursor) { where.push("(sort_order > ? or (sort_order = ? and category_id > ?))"); params.push(cursor.order, cursor.order, cursor.id); }
    const rows = await this.database.all<CategoryRow>(
      `select * from project_categories${where.length ? ` where ${where.join(" and ")}` : ""} order by sort_order, category_id limit ?`,
      [...params, limit + 1]
    );
    const pageRows = rows.slice(0, limit);
    const last = pageRows.at(-1);
    return { items: pageRows.map(categoryFromRow), hasMore: rows.length > limit, nextCursor: rows.length > limit && last ? encodeCursor({ order: last.sort_order, id: last.category_id }) : null };
  }
}

type ProjectRow = { project_id: string; name: string; description: string; domain_id: string | null; category_id: string | null; storage_path: string; status: AutomationStudioCatalogProject["status"]; revision: number; created_at_ms: number; updated_at_ms: number };
type CategoryRow = { category_id: string; name: string; domain_id: string | null; sort_order: number; revision: number; created_at_ms: number; updated_at_ms: number };

function projectFromRow(row: ProjectRow): AutomationStudioCatalogProject { return { id: row.project_id, name: row.name, description: row.description, domainId: row.domain_id, categoryId: row.category_id, storagePath: row.storage_path, status: row.status, revision: row.revision, createdAt: row.created_at_ms, updatedAt: row.updated_at_ms }; }
function categoryFromRow(row: CategoryRow): AutomationStudioCatalogCategory { return { id: row.category_id, name: row.name, domainId: row.domain_id, order: row.sort_order, revision: row.revision, createdAt: row.created_at_ms, updatedAt: row.updated_at_ms }; }
function requiredId(value: string, kind: string): string { const id = value.trim(); if (!id || id.length > 200 || !/^[A-Za-z0-9._-]+$/.test(id)) throw new Error(`Invalid ${kind} ID.`); return id; }
function requiredName(value: string, kind: string): string { const name = value.trim(); if (!name || name.length > 200) throw new Error(`${kind} name is required and must not exceed 200 characters.`); return name; }
function optionalId(value: string | null | undefined): string | null { const normalized = value?.trim(); return normalized ? normalized : null; }
function clampLimit(value?: number): number { return Math.max(1, Math.min(100, Math.trunc(value ?? 25))); }
function like(value: string): string { return `%${value.replace(/([%_\\])/g, "\\$1")}%`; }
function addNullableFilter(where: string[], params: unknown[], column: string, value: string | null): void { if (value === null) where.push(`${column} is null`); else { where.push(`${column} = ?`); params.push(value); } }
function encodeCursor(value: unknown): string { return Buffer.from(JSON.stringify(value)).toString("base64url"); }
function decodeCursor<T>(value: string | null | undefined): T | null { if (!value) return null; try { return JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as T; } catch { throw new Error("Invalid Automation Studio catalog cursor."); } }

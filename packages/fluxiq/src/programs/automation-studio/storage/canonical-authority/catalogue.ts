import path from "node:path";
import { ProgramJsonStore } from "../../../_shared/storage.ts";
import type { JsonObject } from "../../../../core/index.ts";
import type { SQLiteTransaction } from "../../../database-manager/storage/sqlite-repository.ts";
import { CanonicalAuthorityValidation as V } from "./validation.ts";

/** Authoritative existing catalogue on its actual private global transaction. */
export class CanonicalAuthorityCatalogue {
  readonly indexPath: string;
  constructor(private readonly globalRoot: string, readonly projectRoot: string) { this.indexPath = path.join(projectRoot, "index.json"); }
  async layout() {
    const layout = await ProgramJsonStore.existingOwningLayout(this.indexPath);
    if (layout && path.resolve(layout.rootDir) !== path.resolve(this.globalRoot)) throw new Error("canonical_whole.catalogue_database_mismatch");
    return layout;
  }
  async index(sql: SQLiteTransaction): Promise<JsonObject> {
    const layout = await this.layout();
    if (!layout) {
      const state = (await ProgramJsonStore.readExistingReadOnlyMany([this.indexPath]))[0];
      if (!state) throw new Error("canonical_whole.catalogue_missing");
      return this.validateIndex(state);
    }
    const state = await this.document(sql, layout.kind, layout.documentId);
    if (!state) throw new Error("canonical_whole.catalogue_missing");
    return this.validateIndex(state);
  }
  async project(sql: SQLiteTransaction, projectId: string): Promise<JsonObject> {
    V.id(projectId); const index = await this.index(sql);
    const matches = (index.projects as JsonObject[]).filter(project => project.id === projectId);
    if (matches.length !== 1) throw new Error("canonical_whole.project_membership");
    const manifestPath = path.join(this.projectRoot, projectId, "manifest.json"), layout = await ProgramJsonStore.existingOwningLayout(manifestPath);
    const indexLayout = await this.layout();
    if (layout && (!indexLayout || layout.rootDir !== indexLayout.rootDir || layout.kind !== indexLayout.kind)) throw new Error("canonical_whole.catalogue_layout_changed");
    const manifest = layout ? await this.document(sql, layout.kind, layout.documentId) : (await ProgramJsonStore.readExistingReadOnlyMany([manifestPath]))[0];
    if (!manifest || manifest.id !== projectId || V.digest(manifest) !== V.digest(matches[0])) throw new Error("canonical_whole.project_manifest");
    return V.clone(manifest);
  }
  async document(sql: SQLiteTransaction, kind: "automation.state" | "program.state", documentId: string): Promise<JsonObject | null> {
    if (!await sql.get("select name from sqlite_master where type='table' and name=?", [kind])) throw new Error("canonical_whole.catalogue_table_missing");
    const row = await sql.get<{ data: string | null }>(`select case when length(cast(data as blob))<=4194304 then data else null end as data from "${kind}" where id=?`, [documentId]);
    if (!row) return null; if (row.data === null) throw new Error("canonical_whole.catalogue_size");
    const document: unknown = JSON.parse(row.data); V.digest(document);
    if (!document || typeof document !== "object" || Array.isArray(document)) throw new Error("canonical_whole.catalogue_document");
    return V.clone(document as JsonObject);
  }
  async write(sql: SQLiteTransaction, filePath: string, document: JsonObject): Promise<JsonObject> {
    const frozen = V.clone(document), layout = await ProgramJsonStore.existingOwningLayout(filePath), indexLayout = await this.layout();
    if (layout) {
      if (!indexLayout || layout.rootDir !== indexLayout.rootDir || layout.kind !== indexLayout.kind) throw new Error("canonical_whole.catalogue_layout_changed");
      if (!await sql.get("select name from sqlite_master where type='table' and name=?", [layout.kind])) throw new Error("canonical_whole.catalogue_table_missing");
      const now = Date.now(); await sql.run(`insert into "${layout.kind}" (id,kind,data,created_at_ms,updated_at_ms) values(?,?,?,?,?) on conflict(id) do update set data=excluded.data,updated_at_ms=excluded.updated_at_ms`, [layout.documentId, layout.kind, JSON.stringify(frozen), now, now]);
      return (await this.document(sql, layout.kind, layout.documentId))!;
    }
    if (indexLayout) throw new Error("canonical_whole.catalogue_layout_changed");
    await new ProgramJsonStore(filePath, () => ({})).write(frozen);
    const actual = (await ProgramJsonStore.readExistingReadOnlyMany([filePath]))[0]; if (!actual) throw new Error("canonical_whole.catalogue_write_missing"); return actual;
  }
  private validateIndex(index: JsonObject): JsonObject {
    if (!Array.isArray(index.projects) || !Array.isArray(index.categories) || index.projects.length > 10_000 || index.projects.some(project => !project || typeof project !== "object" || Array.isArray(project) || typeof project.id !== "string")) throw new Error("canonical_whole.catalogue_index");
    return V.clone(index);
  }
}

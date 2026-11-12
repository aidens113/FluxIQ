import { randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import type { JsonObject } from "../../../../core/index.ts";
import { AutomationStudioInputBasisEncoding as Encoding, type AutomationStudioInputBasisStorage, type AutomationStudioInputHead, type AutomationStudioInputProducer, type AutomationStudioInputScope, type AutomationStudioInputSnapshotReference, type AutomationStudioInputState } from "../../../../runtime/input-basis/index.ts";
import { programJsonDocumentTransaction } from "../../../persistence/program-state/document-transaction/index.ts";
import type { AutomationStudioProjectPaths } from "../paths/index.ts";
import type { AutomationStudioProjectStore } from "../projects/index.ts";
import type { AutomationStudioRunDatasets } from "../datasets/index.ts";
import { AutomationStudioInputBasisRecord as Record } from "./record.ts";
import type { AutomationStudioInputBasisDocument } from "./document.ts";

/** Existing project snapshot/document owners; a published receipt requires both commits. */
export class AutomationStudioInputBasisStore implements AutomationStudioInputBasisStorage {
  readonly durable: boolean;

  constructor(
    private readonly paths: Pick<AutomationStudioProjectPaths, "root" | "projectFile">,
    private readonly projects: Pick<AutomationStudioProjectStore, "ensureProjectStructure">,
    private readonly snapshots: Pick<AutomationStudioRunDatasets, "available" | "createImmutableSnapshot" | "readImmutableSnapshotPage">
  ) { this.durable = typeof paths.root === "string" && paths.root.length > 0 && snapshots.available === true; }

  async read(scope: AutomationStudioInputScope): Promise<AutomationStudioInputState | undefined> {
    const captured = this.scope(scope);
    if (!this.durable) return undefined;
    return await programJsonDocumentTransaction(this.file(captured), async document => {
      const stored = Record.read(await document.read(), captured.projectId);
      return this.state(stored, captured);
    });
  }

  async writeSnapshot(scope: AutomationStudioInputScope, values: JsonObject, producers: readonly AutomationStudioInputProducer[]): Promise<AutomationStudioInputSnapshotReference> {
    const captured = this.scope(scope), normal = Encoding.values(values), dependencies = Encoding.producers(producers);
    if (normal.status !== "valid" || !dependencies) throw new Error("input_basis.snapshot_invalid");
    if (!this.durable) throw new Error("input_basis.storage_unavailable");
    const occurrenceId = `input.occurrence.${randomUUID()}`;
    const row: JsonObject = { kind: "normal_input_binding", schemaVersion: 1, scope: { ...captured }, producers: dependencies.map(producer => ({ role: producer.role, reference: { ...producer.reference } })), values: normal.value };
    const saved = await this.snapshots.createImmutableSnapshot({ projectId: captured.projectId, rows: [{ occurrenceId, row }] });
    const reference = Encoding.snapshot({ ...saved, occurrenceId });
    if (!reference) throw new Error("input_basis.snapshot_unreadable");
    return reference;
  }

  async readSnapshot(scope: AutomationStudioInputScope, head: AutomationStudioInputHead): Promise<JsonObject | undefined> {
    const captured = this.scope(scope), expected = Encoding.head(head);
    if (!expected) throw new Error("input_basis.head_invalid");
    if (!this.durable) return undefined;
    const page = await this.snapshots.readImmutableSnapshotPage({ projectId: captured.projectId, snapshotId: expected.snapshot.snapshotId, limit: 1 });
    if (!page || page.snapshotId !== expected.snapshot.snapshotId || page.count !== 1 || page.rows.length !== 1 || page.nextCursor !== undefined) return undefined;
    const row = page.rows[0];
    if (!row || row.occurrenceId !== expected.snapshot.occurrenceId) return undefined;
    const checked = Encoding.values(row.row);
    if (checked.status !== "valid") return undefined;
    const payload = checked.value;
    if (Object.keys(payload).length !== 5 || payload.kind !== "normal_input_binding" || payload.schemaVersion !== 1
      || !isDeepStrictEqual(Encoding.scope(payload.scope), captured) || !isDeepStrictEqual(Encoding.producers(payload.producers), expected.producers)) return undefined;
    const normal = Encoding.values(payload.values);
    if (normal.status !== "valid") throw new Error("input_basis.snapshot_unreadable");
    return normal.value;
  }

  async compareAndSwap(scope: AutomationStudioInputScope, expected: AutomationStudioInputState | undefined, next: AutomationStudioInputHead): Promise<boolean> {
    const captured = this.scope(scope), wanted = expected === undefined ? undefined : Encoding.state(expected), proposed = Encoding.head(next);
    if (expected !== undefined && !wanted || !proposed) throw new Error("input_basis.head_invalid");
    if (!this.durable) throw new Error("input_basis.storage_unavailable");
    await this.projects.ensureProjectStructure(captured.projectId);
    return await programJsonDocumentTransaction(this.file(captured), async document => {
      const stored = Record.read(await document.read(), captured.projectId), current = this.state(stored, captured);
      if (!isDeepStrictEqual(current, wanted)) return false;
      const previous = current?.head;
      if (stored && proposed.reference.ownerId !== stored.ownerId || proposed.reference.revision !== (previous?.reference.revision ?? 0) + 1
        || previous && proposed.reference.bindingId !== previous.reference.bindingId) throw new Error("input_basis.head_invalid");
      const bindings = [...(stored?.bindings ?? [])];
      const at = bindings.findIndex(entry => isDeepStrictEqual(entry.scope, captured));
      if (bindings.some((entry, index) => index !== at && entry.head.reference.bindingId === proposed.reference.bindingId)) throw new Error("input_basis.head_invalid");
      const entry = { scope: captured, head: proposed };
      if (at >= 0) bindings[at] = entry;
      else bindings.push(entry);
      const updated: AutomationStudioInputBasisDocument = { kind: "normal_input_basis_owner", schemaVersion: 1, projectId: captured.projectId, ownerId: proposed.reference.ownerId, bindings };
      await document.write(updated as unknown as JsonObject);
      return true;
    });
  }

  private state(document: AutomationStudioInputBasisDocument | undefined, scope: AutomationStudioInputScope): AutomationStudioInputState | undefined {
    if (!document) return undefined;
    const head = document.bindings.find(entry => isDeepStrictEqual(entry.scope, scope))?.head;
    return Object.freeze({ ownerId: document.ownerId, ...(head ? { head } : {}) });
  }

  private scope(value: AutomationStudioInputScope): AutomationStudioInputScope {
    const scope = Encoding.scope(value);
    if (!scope) throw new Error("input_basis.scope_invalid");
    return scope;
  }

  private file(scope: AutomationStudioInputScope): string {
    return this.paths.projectFile(scope.projectId, "input-basis", "owner.json");
  }
}

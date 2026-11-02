import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioRepository } from "../../../storage/index.ts";

const queues = new WeakMap<object, Map<string, Promise<void>>>();
// Data-cache origin only: no document body and no execution/admission rights.
const publications = new WeakMap<object, Map<string, string | null>>();

/** The global mirror's mutations serialize by original repository and exact ID. */
export class RecordingProjectMirror<TDocument extends { metadata?: JsonObject }> {
  constructor(private readonly repository: AutomationStudioRepository<TDocument>, private readonly identify: (document: TDocument) => string) {}

  private acceptsProject(id: string, projectId: string): boolean {
    const known = publications.get(this.repository)?.get(id);
    return known === undefined || known === projectId;
  }

  async readOwned(id: string, projectId: string): Promise<TDocument | null> {
    return await mutate(this.repository, id, async () => {
      const existing = await this.repository.get(id);
      return existing && this.identify(existing) === id && existing.metadata?.projectId === projectId && this.acceptsProject(id, projectId) ? existing : null;
    });
  }

  async put(document: TDocument, options: { projectId?: string | null | undefined; createExclusive?: boolean; loaded?: boolean } = {}): Promise<TDocument> {
    const id = this.identify(document);
    const owned = projectDocument(document, options.projectId);
    return await mutate(this.repository, id, async () => {
      if (options.createExclusive || options.loaded) {
        const existing = await this.repository.get(id);
        const destination = options.projectId || null;
        const previous = publications.get(this.repository)?.get(id);
        if (options.createExclusive && existing && ((existing.metadata?.projectId ?? null) !== destination || (previous !== undefined && previous !== destination))) throw new Error("Recording ID is already owned by another project.");
        // A scoped read is no authority to replace a different global owner.
        if (options.loaded && existing && (existing.metadata?.projectId !== options.projectId || (options.projectId && !this.acceptsProject(id, options.projectId)))) return owned;
      }
      const stored = await this.repository.put(owned);
      let origins = publications.get(this.repository);
      if (!origins) {
        origins = new Map();
        publications.set(this.repository, origins);
      }
      origins.set(id, options.projectId || null);
      return stored;
    });
  }

  async delete(id: string, projectId?: string | null): Promise<boolean> {
    return await mutate(this.repository, id, async () => {
      if (projectId) {
        const existing = await this.repository.get(id);
        if (!existing || existing.metadata?.projectId !== projectId || !this.acceptsProject(id, projectId)) return false;
      }
      const deleted = await this.repository.delete(id);
      if (deleted) publications.get(this.repository)?.delete(id);
      return deleted;
    });
  }
}

function projectDocument<TDocument extends { metadata?: JsonObject }>(document: TDocument, projectId: string | null | undefined): TDocument {
  if (!projectId) return document;
  const owner = document.metadata?.projectId;
  if (owner !== undefined && owner !== null && owner !== projectId) throw new Error("Recording project ownership conflict.");
  return owner === projectId ? document : { ...document, metadata: { ...document.metadata, projectId } };
}

async function mutate<TValue>(repository: object, id: string, operation: () => Promise<TValue>): Promise<TValue> {
  let pending = queues.get(repository);
  if (!pending) {
    pending = new Map();
    queues.set(repository, pending);
  }
  const previous = pending.get(id) ?? Promise.resolve();
  let release: () => void = () => undefined;
  const current = new Promise<void>(resolve => { release = resolve; });
  const tail = previous.then(() => current, () => current);
  pending.set(id, tail);
  await previous.then(() => undefined, () => undefined);
  try {
    return await operation();
  } finally {
    release();
    if (pending.get(id) === tail) pending.delete(id);
  }
}

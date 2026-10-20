import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import type { AutomationStudioProjectDatabasePool } from "./database.ts";
import type { AutomationStudioProjectContentProtection } from "./content-protection.ts";
import {
  AutomationStudioProjectObjectRepository,
  type AutomationStudioProjectObjectContentAddress,
  type AutomationStudioProjectObjectPendingRemoval,
  type AutomationStudioProjectObjectRecord,
  type AutomationStudioProjectObjectReferenceRecord
} from "./object-repository.ts";
import {
  automationStudioContentObjectAddress,
  backfillAutomationStudioContentObjectAddresses,
  openAutomationStudioContentAddressKeyring,
  type AutomationStudioContentAddressKeyring,
  type AutomationStudioContentObjectAddressBackfillOptions,
  type AutomationStudioContentObjectAddressBackfillResult
} from "./content-address/index.ts";

export type AutomationStudioProjectContentWrite = {
  object: AutomationStudioProjectObjectRecord;
  reference: AutomationStudioProjectObjectReferenceRecord | null;
  contentPath: string;
  deduped: boolean;
};

export type AutomationStudioProjectContentAsset = AutomationStudioProjectObjectRecord & { content: Buffer };

/**
 * What one drain of pending removals did (t745 u5): the objects whose file and
 * pending row are gone, those stored again since their release (row dropped,
 * file kept), and those whose file could not be removed (row kept, so a later
 * drain retries). A failure is named by the error's code, never its message,
 * which would name the file.
 */
export type AutomationStudioProjectPendingRemovalDrain = {
  removed: string[];
  reheld: string[];
  failed: { objectId: string; reason: string }[];
};

type OwnerInput = { ownerKind: string; ownerId: string; purpose: string; referenceId?: string };

const PENDING_REMOVAL_PAGE = 100;

// Sealed objects carry a keyed content address (t745 design note D2): the
// HMAC of their plaintext under the project's address key. A store opened with
// a protection opens the project's keyring, addresses the sealed objects that
// predate it, dedupes equal sealed content through the address, and checks the
// address of every sealed object it reads. The object id stays the sha256 of
// the stored bytes, which for a sealed object is random-IV ciphertext.
//
// The keyring is opened once, when the store opens. A keyring that does not
// open (a host key the provider no longer resolves, a wrong key) fails the
// open, as it fails the open of every protected store: a misconfigured
// protection is refused at once, with an error that names only a key id.
//
// Removing an object is durable (t745 u5): its row is released (deleted, with
// a pending-removal row naming its file) in one transaction, and the file and
// then the pending row go after commit. Every open drains first, so a file a
// crashed process left behind is removed by the next store over the project.
export class AutomationStudioProjectContentStore {
  private readonly rootDir: string;
  private readonly projectId: string;
  private readonly protection: AutomationStudioProjectContentProtection | undefined;
  private keyring: AutomationStudioContentAddressKeyring | undefined;
  private openDrain: AutomationStudioProjectPendingRemovalDrain = { removed: [], reheld: [], failed: [] };

  private constructor(private readonly objects: AutomationStudioProjectObjectRepository, input: { rootDir: string; projectId: string; protection?: AutomationStudioProjectContentProtection }) {
    this.rootDir = path.resolve(input.rootDir);
    this.projectId = input.projectId;
    this.protection = input.protection;
  }

  static async open(input: {
    pool: AutomationStudioProjectDatabasePool;
    projectId: string;
    protection?: AutomationStudioProjectContentProtection;
    /** Bounds the address backfill a protected open runs; tests stop it part way. */
    contentAddressBackfill?: AutomationStudioContentObjectAddressBackfillOptions;
  }): Promise<AutomationStudioProjectContentStore> {
    const objects = await AutomationStudioProjectObjectRepository.open({ pool: input.pool, projectId: input.projectId });
    try {
      const store = new AutomationStudioProjectContentStore(objects, { rootDir: input.pool.rootDir, projectId: input.projectId, ...(input.protection ? { protection: input.protection } : {}) });
      store.openDrain = await store.drainPendingRemovals();
      if (input.protection) await store.prepareContentAddresses(input.protection, input.contentAddressBackfill);
      return store;
    } catch (error) {
      await objects.close();
      throw error;
    }
  }

  private async prepareContentAddresses(protection: AutomationStudioProjectContentProtection, backfill: AutomationStudioContentObjectAddressBackfillOptions | undefined): Promise<void> {
    this.keyring = await openAutomationStudioContentAddressKeyring({ database: this.objects.database, projectId: this.projectId, protection });
    await this.backfillContentAddresses(backfill);
  }

  /**
   * Addresses, under the current key, the sealed objects that have no address
   * or one under another key. A protected open runs it; it is callable again,
   * bounded, so a pass can be stopped part way and resumed.
   */
  async backfillContentAddresses(options: AutomationStudioContentObjectAddressBackfillOptions = {}): Promise<AutomationStudioContentObjectAddressBackfillResult> {
    const keyring = this.requireKeyring();
    return backfillAutomationStudioContentObjectAddresses({ objects: this.objects, keyring, protection: this.protection!, readStored: (object) => this.readStored(object) }, options);
  }

  close(): Promise<void> {
    return this.objects.close();
  }

  /** What the drain this store ran when it opened did. */
  get drainedAtOpen(): AutomationStudioProjectPendingRemovalDrain {
    return this.openDrain;
  }

  async putBytes(input: {
    content: Buffer | Uint8Array;
    mediaType: string;
    extension?: string;
    owner?: OwnerInput;
    transactionId?: string;
    createdAt?: number;
    protect?: boolean;
  }): Promise<AutomationStudioProjectContentWrite> {
    const plaintext = Buffer.from(input.content);
    if (input.protect === true && !this.protection) throw new Error("Protected project content requires a configured protection provider.");
    let address: AutomationStudioProjectObjectContentAddress = { contentAddress: null, contentAddressKeyId: null };
    if (input.protect === true) {
      const keyring = this.requireKeyring();
      const keyId = keyring.currentKeyId;
      const contentAddress = automationStudioContentObjectAddress(keyring, keyId, plaintext, AutomationStudioProjectObjectRepository.normalizeMediaType(input.mediaType));
      address = { contentAddress, contentAddressKeyId: keyId };
      const candidate = await this.objects.findSealedByContentAddress(contentAddress, keyId);
      if (candidate && await this.sealedObjectHolds(candidate, plaintext)) {
        const reference = await this.addOwnerReference(input.owner, candidate, input.createdAt);
        return { object: candidate, reference, contentPath: this.resolveProjectPath(candidate.relativePath), deduped: true };
      }
    }
    const protectedContent = input.protect === true
      ? await this.protection!.seal({ projectId: this.projectId, mediaType: input.mediaType, content: plaintext })
      : { content: plaintext, encryption: null };
    const content = protectedContent.content;
    const sha256 = createHash("sha256").update(content).digest("hex");
    const extension = safeExtension(input.extension ?? extensionForMediaType(input.mediaType));
    const relativePath = objectRelativePath(this.projectId, sha256, extension);
    const target = this.resolveProjectPath(relativePath);
    const existing = await this.objects.getBySha256(sha256);
    let deduped = false;
    if (existing) {
      await this.verifyExistingFile(existing, content.length, sha256);
      deduped = true;
    } else {
      await this.writeStagedObject(input.transactionId ?? randomUUID(), target, `${sha256}.${extension}`, content);
    }
    const object = await this.objects.upsertObject({
      objectId: `object:${sha256}`,
      sha256,
      mediaType: input.mediaType,
      byteCount: content.length,
      relativePath,
      compression: null,
      encryption: protectedContent.encryption,
      verifiedAt: input.createdAt ?? Date.now(),
      ...(input.createdAt !== undefined ? { createdAt: input.createdAt } : {}),
      ...address
    });
    const reference = await this.addOwnerReference(input.owner, object, input.createdAt);
    return { object, reference, contentPath: target, deduped };
  }

  private async addOwnerReference(owner: OwnerInput | undefined, object: AutomationStudioProjectObjectRecord, createdAt: number | undefined): Promise<AutomationStudioProjectObjectReferenceRecord | null> {
    if (!owner) return null;
    return this.objects.addReference({
      referenceId: owner.referenceId ?? defaultObjectReferenceId(owner, object.sha256),
      objectId: object.objectId,
      ownerKind: owner.ownerKind,
      ownerId: owner.ownerId,
      purpose: owner.purpose,
      ...(createdAt !== undefined ? { createdAt } : {})
    });
  }

  /**
   * Whether a sealed object found by address really holds `plaintext`: its
   * file verifies and opens to exactly these bytes. A damaged or mismatched
   * candidate is not reused; the write goes on to store a fresh sealed copy.
   */
  private async sealedObjectHolds(candidate: AutomationStudioProjectObjectRecord, plaintext: Buffer): Promise<boolean> {
    let opened: Buffer;
    try {
      opened = await this.protection!.open({ projectId: this.projectId, mediaType: candidate.mediaType, content: await this.readStored(candidate), encryption: candidate.encryption ?? "" });
    } catch {
      return false;
    }
    const same = opened.byteLength === plaintext.byteLength && timingSafeEqual(opened, plaintext);
    opened.fill(0);
    return same;
  }

  private requireKeyring(): AutomationStudioContentAddressKeyring {
    if (this.keyring) return this.keyring;
    throw new Error("Protected project content requires a configured protection provider.");
  }

  async putJson(input: Omit<Parameters<AutomationStudioProjectContentStore["putBytes"]>[0], "content" | "mediaType" | "extension"> & { value: unknown }): Promise<AutomationStudioProjectContentWrite> {
    return this.putBytes({ ...input, content: Buffer.from(JSON.stringify(input.value), "utf8"), mediaType: "application/json", extension: "json" });
  }

  async readBytesBySha256(sha256: string): Promise<AutomationStudioProjectContentAsset> {
    const object = await this.objects.getBySha256(sha256);
    if (!object) throw new Error("Automation Studio object was not found for this project.");
    return this.readObject(object);
  }

  async readBytesByObjectId(objectId: string): Promise<AutomationStudioProjectContentAsset> {
    const object = await this.objects.getById(objectId);
    if (!object) throw new Error("Automation Studio object was not found for this project.");
    return this.readObject(object);
  }

  private async readObject(object: AutomationStudioProjectObjectRecord): Promise<AutomationStudioProjectContentAsset> {
    const stored = await this.readStored(object);
    if (!object.encryption) return { ...object, content: stored };
    if (!this.protection) throw new Error("Protected project content cannot be opened without its protection provider.");
    const content = await this.protection.open({ projectId: this.projectId, mediaType: object.mediaType, content: stored, encryption: object.encryption });
    if (object.contentAddress !== null) this.verifyContentAddress(object, content);
    return { ...object, content };
  }

  /** The stored bytes of an object, after its sha256 and byte count are verified. */
  private async readStored(object: AutomationStudioProjectObjectRecord): Promise<Buffer> {
    const stored = await readFile(this.resolveProjectPath(object.relativePath));
    const digest = createHash("sha256").update(stored).digest("hex");
    if (digest !== object.sha256) throw new Error(`Automation Studio object digest mismatch: ${object.relativePath}`);
    if (stored.byteLength !== object.byteCount) throw new Error(`Automation Studio object byte count mismatch: ${object.relativePath}`);
    return stored;
  }

  /** Throws, naming only the object id, unless `content` recomputes to the object's stored address. */
  private verifyContentAddress(object: AutomationStudioProjectObjectRecord, content: Buffer): void {
    const keyring = this.requireKeyring();
    const keyId = object.contentAddressKeyId;
    if (keyId === null || !keyring.holds(keyId)) {
      content.fill(0);
      throw new Error(`Automation Studio object ${object.objectId} content address key is not held.`);
    }
    const expected = Buffer.from(object.contentAddress ?? "", "hex");
    const actual = Buffer.from(automationStudioContentObjectAddress(keyring, keyId, content, object.mediaType), "hex");
    if (expected.byteLength !== actual.byteLength || !timingSafeEqual(expected, actual)) {
      content.fill(0);
      throw new Error(`Automation Studio object ${object.objectId} does not match its content address.`);
    }
  }

  async cleanupStaging(input: { olderThanMs?: number; now?: number } = {}): Promise<{ deleted: string[] }> {
    const stagingRoot = this.resolveProjectPath(path.join("projects", this.projectId, "staging"));
    const entries = await readdir(stagingRoot, { withFileTypes: true }).catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return [];
      throw error;
    });
    const cutoff = (input.now ?? Date.now()) - Math.max(0, Math.trunc(input.olderThanMs ?? 60_000));
    const deleted: string[] = [];
    for (const entry of entries) {
      const target = path.join(stagingRoot, entry.name);
      const info = await stat(target).catch(() => null);
      if (!info || info.mtimeMs > cutoff) continue;
      await rm(target, { recursive: true, force: true });
      deleted.push(path.relative(this.rootDir, target).replaceAll(path.sep, "/"));
    }
    return { deleted };
  }

  /**
   * Deletes an object and its file when no object reference names it: the
   * reference check, the row deletion and the pending-removal row share one
   * transaction, then the pending removals are drained. Returns false when the
   * object is referenced or absent. When its file cannot be removed it throws,
   * naming the error's code; the row stays released and the next drain (at
   * the latest the next open) retries the file.
   */
  async removeIfUnreferenced(objectId: string): Promise<boolean> {
    const released = await this.objects.deleteObjectIfUnreferenced(objectId);
    if (!released) return false;
    const drain = await this.drainPendingRemovals();
    const failure = drain.failed.find((entry) => entry.objectId === released.objectId);
    if (failure) throw new Error(`Automation Studio object ${released.objectId} was released but its file could not be removed (${failure.reason}); the next drain retries it.`);
    return true;
  }

  /**
   * Removes the file, then the pending row, of every object released and not
   * yet removed. A pending object stored again since its release keeps its
   * file and loses only the pending row. A file that cannot be removed keeps
   * its row and is reported in `failed`; a database failure throws.
   */
  async drainPendingRemovals(): Promise<AutomationStudioProjectPendingRemovalDrain> {
    const drain: AutomationStudioProjectPendingRemovalDrain = { removed: [], reheld: [], failed: [] };
    let after: string | null = null;
    for (;;) {
      const page = await this.objects.listPendingRemovals({ afterObjectId: after, limit: PENDING_REMOVAL_PAGE });
      for (const removal of page) await this.drainOne(removal, drain);
      if (page.length < PENDING_REMOVAL_PAGE) return drain;
      after = page[page.length - 1]!.objectId;
    }
  }

  private async drainOne(removal: AutomationStudioProjectObjectPendingRemoval, drain: AutomationStudioProjectPendingRemovalDrain): Promise<void> {
    if (await this.objects.dropPendingRemovalIfHeld(removal.objectId)) {
      drain.reheld.push(removal.objectId);
      return;
    }
    const failure = await this.removeFile(removal.relativePath);
    if (failure !== undefined) {
      drain.failed.push({ objectId: removal.objectId, reason: failure });
      return;
    }
    await this.objects.finishPendingRemoval(removal);
    drain.removed.push(removal.objectId);
  }

  /** Removes a released object's file (absent counts as removed); the error's code when it cannot. */
  private async removeFile(relativePath: string): Promise<string | undefined> {
    try {
      await rm(this.resolveProjectPath(relativePath), { force: true });
      return undefined;
    } catch (error) {
      return removalErrorCode(error);
    }
  }

  async sweepUnreferencedObjects(input: { limit?: number } = {}): Promise<{ deleted: string[] }> {
    const candidates = await this.objects.listUnreferencedObjects(input.limit ?? 100);
    const deleted: string[] = [];
    for (const object of candidates) {
      await rm(this.resolveProjectPath(object.relativePath), { force: true });
      if (await this.objects.deleteObject(object.objectId)) deleted.push(object.objectId);
    }
    return { deleted };
  }

  private async writeStagedObject(transactionId: string, target: string, fileName: string, content: Buffer): Promise<void> {
    await mkdir(path.dirname(target), { recursive: true });
    const stagingDir = this.resolveProjectPath(path.join("projects", this.projectId, "staging", safeSegment(transactionId)));
    await mkdir(stagingDir, { recursive: true });
    const temporary = path.join(stagingDir, fileName);
    await writeFile(temporary, content);
    try {
      await rename(temporary, target);
    } catch (error) {
      await rm(temporary, { force: true }).catch(() => undefined);
      const existing = await readFile(target).catch(() => null);
      if (!existing || createHash("sha256").update(existing).digest("hex") !== createHash("sha256").update(content).digest("hex")) throw error;
    }
  }

  private async verifyExistingFile(object: AutomationStudioProjectObjectRecord, byteCount: number, sha256: string): Promise<void> {
    const target = this.resolveProjectPath(object.relativePath);
    const info = await stat(target).catch(() => null);
    if (!info) throw new Error(`Automation Studio object metadata exists but content is missing: ${object.objectId}`);
    if (info.size !== byteCount) throw new Error(`Automation Studio object hash collision for ${sha256}.`);
  }

  private resolveProjectPath(relativePath: string): string {
    const target = path.resolve(this.rootDir, relativePath);
    const root = `${this.rootDir}${path.sep}`;
    if (!target.startsWith(root)) throw new Error("Automation Studio project content path escapes its storage root.");
    return target;
  }
}

/** The error's code or class name: never its message, which names the file. */
function removalErrorCode(error: unknown): string {
  if (error instanceof Error && "code" in error && typeof error.code === "string") return error.code;
  return error instanceof Error ? error.name : typeof error;
}

function defaultObjectReferenceId(owner: { ownerKind: string; ownerId: string; purpose: string }, sha256: string): string {
  const readable = `reference:${owner.ownerKind}:${owner.ownerId}:${owner.purpose}:${sha256}`;
  if (readable.length <= 200) return readable;
  return `reference:sha256:${createHash("sha256").update(readable).digest("hex")}`;
}

function objectRelativePath(projectId: string, sha256: string, extension: string): string {
  return path.join("projects", safeSegment(projectId), "objects", "sha256", sha256.slice(0, 2), sha256.slice(2, 4), `${sha256}.${extension}`).replaceAll(path.sep, "/");
}

function extensionForMediaType(mediaType: string): string {
  switch (mediaType.trim().toLowerCase()) {
    case "application/json": return "json";
    case "image/png": return "png";
    case "image/jpeg": return "jpg";
    case "image/webp": return "webp";
    default: return "bin";
  }
}

function safeExtension(value: string): string {
  return /^[a-z0-9]{1,12}$/i.test(value) ? value.toLowerCase() : "bin";
}

function safeSegment(value: string): string {
  const segment = value.trim();
  if (!segment || segment.length > 200 || !/^[A-Za-z0-9._:-]+$/.test(segment)) throw new Error("Automation Studio path segment is invalid.");
  return segment;
}

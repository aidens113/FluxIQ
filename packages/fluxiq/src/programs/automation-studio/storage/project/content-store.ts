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
  type AutomationStudioProjectObjectReferenceRecord,
  type AutomationStudioProjectObjectResealMove
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

/**
 * How the re-seal job (t747 b) has the content store seal an object again:
 * whether an envelope names a retiring key, and a seal under the host's
 * current key that throws when it still names a retiring one.
 */
export type AutomationStudioProjectObjectResealer = {
  isRetiring(encryption: string): boolean;
  seal(input: { mediaType: string; content: Buffer }, what: string): Promise<{ content: Buffer; encryption: string }>;
};

/**
 * One re-seal batch's objects: those moved to a re-sealed file, those that did
 * not open (left as they are), how many changed under the batch (left for the
 * next pass), and how many released files the drain could not remove.
 */
export type AutomationStudioProjectObjectResealBatch = { resealed: string[]; unreadable: string[]; changed: number; filesNotRemoved: number };

type ResealOpening = { outcome: "opened"; content: Buffer; encryption: string } | { outcome: "unreadable" | "changed"; reason?: string };

/**
 * Test seams between the steps a writer and a removal race over (t747);
 * production passes none. `beforeWriterCommit` runs once a writer has its
 * object in hand (its file written, or the stored file it reuses found) and
 * before it commits the object row and its reference. `beforeDrainRemove`
 * runs once a drain has found a pending file that no object row names, inside
 * the transaction that removes it, before the file goes. `beforeResealCommit`
 * runs once a re-seal batch has written its new files, before the transaction
 * that moves the rows to them (t747 b).
 */
type RemovalRaceSeams = {
  beforeWriterCommit?: () => Promise<void>;
  beforeDrainRemove?: (removal: AutomationStudioProjectObjectPendingRemoval) => Promise<void>;
  beforeResealCommit?: () => Promise<void>;
};

/** What a writer commits: the object as it would insert it, the bytes its file must hold, and how it got them. */
type WriterCommit = {
  object: Parameters<AutomationStudioProjectObjectRepository["upsertObject"]>[0];
  content: Buffer;
  owner: OwnerInput | undefined;
  createdAt: number | undefined;
  transactionId: string;
  deduped: boolean;
};

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
//
// A writer racing a removal never loses its file (t747), across processes:
//  - the writer commits its object row (insert or get) and its reference in
//    one transaction, so a release, which checks references in its own
//    transaction, lands wholly before or wholly after it;
//  - the drain checks that no object row names a pending file's path and
//    removes the file inside one transaction, holding the database's write
//    lock, so no writer commits a row naming that path in between;
//  - after its commit the writer checks the object's file and rewrites it from
//    the bytes it holds when a removal took it first.
// A sweep releases each unreferenced object the same way and then drains.
export class AutomationStudioProjectContentStore {
  private readonly rootDir: string;
  private readonly projectId: string;
  private readonly protection: AutomationStudioProjectContentProtection | undefined;
  private keyring: AutomationStudioContentAddressKeyring | undefined;
  private openDrain: AutomationStudioProjectPendingRemovalDrain = { removed: [], reheld: [], failed: [] };
  private readonly seams: RemovalRaceSeams;

  private constructor(private readonly objects: AutomationStudioProjectObjectRepository, input: { rootDir: string; projectId: string; protection?: AutomationStudioProjectContentProtection; seams?: RemovalRaceSeams }) {
    this.rootDir = path.resolve(input.rootDir);
    this.projectId = input.projectId;
    this.protection = input.protection;
    this.seams = input.seams ?? {};
  }

  static async open(input: {
    pool: AutomationStudioProjectDatabasePool;
    projectId: string;
    protection?: AutomationStudioProjectContentProtection;
    /** Bounds the address backfill a protected open runs; tests stop it part way. */
    contentAddressBackfill?: AutomationStudioContentObjectAddressBackfillOptions;
    seams?: RemovalRaceSeams;
  }): Promise<AutomationStudioProjectContentStore> {
    const objects = await AutomationStudioProjectObjectRepository.open({ pool: input.pool, projectId: input.projectId });
    try {
      const store = new AutomationStudioProjectContentStore(objects, { rootDir: input.pool.rootDir, projectId: input.projectId, ...(input.protection ? { protection: input.protection } : {}), ...(input.seams ? { seams: input.seams } : {}) });
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
    const transactionId = input.transactionId ?? randomUUID();
    let address: AutomationStudioProjectObjectContentAddress = { contentAddress: null, contentAddressKeyId: null };
    if (input.protect === true) {
      const keyring = this.requireKeyring();
      const keyId = keyring.currentKeyId;
      const contentAddress = automationStudioContentObjectAddress(keyring, keyId, plaintext, AutomationStudioProjectObjectRepository.normalizeMediaType(input.mediaType));
      address = { contentAddress, contentAddressKeyId: keyId };
      const candidate = await this.objects.findSealedByContentAddress(contentAddress, keyId);
      const stored = candidate ? await this.sealedObjectStoredBytes(candidate, plaintext) : null;
      // The candidate is reused even if it is released before the commit: the commit inserts it again and its file is rewritten from `stored`.
      if (candidate && stored) return this.commitWrite({ object: candidate, content: stored, owner: input.owner, createdAt: input.createdAt, transactionId, deduped: true });
    }
    const protectedContent = input.protect === true
      ? await this.protection!.seal({ projectId: this.projectId, mediaType: input.mediaType, content: plaintext })
      : { content: plaintext, encryption: null };
    const content = protectedContent.content;
    const sha256 = createHash("sha256").update(content).digest("hex");
    const extension = safeExtension(input.extension ?? extensionForMediaType(input.mediaType));
    const relativePath = objectRelativePath(this.projectId, sha256, extension);
    const existing = await this.objects.getBySha256(sha256);
    if (!existing) await this.writeStagedObject(transactionId, this.resolveProjectPath(relativePath), `${sha256}.${extension}`, content);
    return this.commitWrite({
      object: {
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
      },
      content,
      owner: input.owner,
      createdAt: input.createdAt,
      transactionId,
      deduped: existing !== null
    });
  }

  /**
   * Commits the object row and the owner's reference together, then makes
   * sure the committed object's file holds `content`, rewriting it when a
   * removal took it between the write and the commit.
   */
  private async commitWrite(input: WriterCommit): Promise<AutomationStudioProjectContentWrite> {
    await this.seams.beforeWriterCommit?.();
    const { owner } = input;
    const held = await this.objects.holdObject({
      object: input.object,
      ...(owner ? {
        reference: {
          referenceId: owner.referenceId ?? defaultObjectReferenceId(owner, input.object.sha256),
          ownerKind: owner.ownerKind,
          ownerId: owner.ownerId,
          purpose: owner.purpose,
          ...(input.createdAt !== undefined ? { createdAt: input.createdAt } : {})
        }
      } : {})
    });
    // A re-seal moved the reused object to another file in the meantime (t747 b): the bytes in hand are not that file's.
    if (held.object.sha256 !== input.object.sha256) {
      if (!(await this.fileHolds(held.object.relativePath, held.object.byteCount))) throw new Error(`Automation Studio object ${held.object.objectId} file is missing after its re-seal.`);
    } else {
      await this.ensureObjectFile(held.object, input.content, input.transactionId);
    }
    return { object: held.object, reference: held.reference, contentPath: this.resolveProjectPath(held.object.relativePath), deduped: input.deduped };
  }

  /**
   * The stored bytes of a sealed object found by address when it really holds
   * `plaintext`: its file verifies and opens to exactly these bytes; null
   * otherwise. A damaged or mismatched candidate is not reused; the write goes
   * on to store a fresh sealed copy.
   */
  private async sealedObjectStoredBytes(candidate: AutomationStudioProjectObjectRecord, plaintext: Buffer): Promise<Buffer | null> {
    let stored: Buffer;
    let opened: Buffer;
    try {
      stored = await this.readStored(candidate);
      opened = await this.protection!.open({ projectId: this.projectId, mediaType: candidate.mediaType, content: stored, encryption: candidate.encryption ?? "" });
    } catch {
      return null;
    }
    const same = opened.byteLength === plaintext.byteLength && timingSafeEqual(opened, plaintext);
    opened.fill(0);
    return same ? stored : null;
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
    return this.readCurrentObject(object);
  }

  async readBytesByObjectId(objectId: string): Promise<AutomationStudioProjectContentAsset> {
    const object = await this.objects.getById(objectId);
    if (!object) throw new Error("Automation Studio object was not found for this project.");
    return this.readCurrentObject(object);
  }

  /**
   * Reads `object`; when its file is gone because a re-seal moved the object
   * to another file between the row read and the file read (t747 b), reads the
   * row again by id, once, and reads the file it names now.
   */
  private async readCurrentObject(object: AutomationStudioProjectObjectRecord): Promise<AutomationStudioProjectContentAsset> {
    try {
      return await this.readObject(object);
    } catch (error) {
      if (!isMissingFile(error)) throw error;
      const current = await this.objects.getById(object.objectId);
      if (!current || current.relativePath === object.relativePath) throw error;
      return this.readObject(current);
    }
  }

  /**
   * Re-seals sealed objects in place under the host's current key (t747 b),
   * one batch: each object is read from its verified file and opened, sealed
   * again through `resealer` (which refuses a seal that still names a retiring
   * key), and written to the file of its new sha256; then one transaction moves
   * every row still in the form that was read to its new file (object id,
   * references and content address unchanged) and releases the old files, and
   * the drain removes them. The new files are recorded as pending removal
   * before they are written, so a batch stopped before its transaction leaves
   * nothing the next drain does not remove. An object that does not open is
   * reported as unreadable and left as it is; one whose row changed since it
   * was read is counted in `changed` and left for the next pass.
   */
  async resealObjects(objectIds: readonly string[], resealer: AutomationStudioProjectObjectResealer): Promise<AutomationStudioProjectObjectResealBatch> {
    const protection = this.protection;
    if (!protection) throw new Error("Protected project content requires a configured protection provider.");
    const batch: AutomationStudioProjectObjectResealBatch = { resealed: [], unreadable: [], changed: 0, filesNotRemoved: 0 };
    const moves: Array<AutomationStudioProjectObjectResealMove & { content: Buffer }> = [];
    for (const objectId of objectIds) {
      const object = await this.objects.getById(objectId);
      const opening = object && object.encryption !== null ? await this.openForReseal(object, object.encryption, resealer, protection) : { outcome: "changed" as const };
      if (opening.outcome === "changed") batch.changed += 1;
      if (opening.outcome === "unreadable") batch.unreadable.push(objectId);
      if (opening.outcome !== "opened" || !object) continue;
      let sealed: { content: Buffer; encryption: string };
      try {
        sealed = await resealer.seal({ mediaType: object.mediaType, content: opening.content }, `object ${objectId}`);
      } finally {
        opening.content.fill(0);
      }
      const sha256 = createHash("sha256").update(sealed.content).digest("hex");
      const relativePath = objectRelativePath(this.projectId, sha256, safeExtension(path.extname(object.relativePath).slice(1)));
      moves.push({ objectId, expected: { sha256: object.sha256, relativePath: object.relativePath, encryption: opening.encryption }, next: { sha256, byteCount: sealed.content.byteLength, relativePath, encryption: sealed.encryption }, content: sealed.content });
    }
    if (moves.length === 0) return batch;
    const now = Date.now();
    await this.objects.releaseObjectFiles(moves.map((move) => ({ objectId: move.objectId, relativePath: move.next.relativePath })), now);
    const transactionId = randomUUID();
    for (const move of moves) await this.writeStagedObject(transactionId, this.resolveProjectPath(move.next.relativePath), path.basename(move.next.relativePath), move.content);
    await this.seams.beforeResealCommit?.();
    batch.resealed = await this.objects.moveObjectsToResealedFiles(moves, (relativePath, byteCount) => this.fileHolds(relativePath, byteCount), now);
    batch.changed += moves.length - batch.resealed.length;
    batch.filesNotRemoved = (await this.drainPendingRemovals()).failed.length;
    return batch;
  }

  /**
   * An object's plaintext for a re-seal, from its verified file; `unreadable`
   * when the file or its seal fails while the row is unchanged, `changed` when
   * the row moved on since it was read (another re-seal, a release) or is no
   * longer under a retiring key.
   */
  private async openForReseal(object: AutomationStudioProjectObjectRecord, encryption: string, resealer: AutomationStudioProjectObjectResealer, protection: AutomationStudioProjectContentProtection): Promise<ResealOpening> {
    try {
      if (!resealer.isRetiring(encryption)) return { outcome: "changed" };
      const stored = await this.readStored(object);
      return { outcome: "opened", content: await protection.open({ projectId: this.projectId, mediaType: object.mediaType, content: stored, encryption }), encryption };
    } catch (error) {
      // The error's code or class only, never its text, which may name the file: the caller reports by id.
      const reason = removalErrorCode(error);
      const current = await this.objects.getById(object.objectId);
      const same = current !== null && current.sha256 === object.sha256 && current.encryption === encryption;
      return { outcome: same ? "unreadable" : "changed", reason };
    }
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
    if (digest !== object.sha256) throw new Error(`Automation Studio object ${object.objectId} digest mismatch.`);
    if (stored.byteLength !== object.byteCount) throw new Error(`Automation Studio object ${object.objectId} byte count mismatch.`);
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
   * Settles every pending file: one that no object row names is removed with
   * its pending row, in one transaction; one an object row names again (an
   * object stored again since its release, or living on at that path) keeps
   * its file and loses only the pending row. A file that cannot be removed
   * keeps its row and is reported in `failed`; a database failure throws.
   */
  async drainPendingRemovals(): Promise<AutomationStudioProjectPendingRemovalDrain> {
    const drain: AutomationStudioProjectPendingRemovalDrain = { removed: [], reheld: [], failed: [] };
    let after: string | null = null;
    for (;;) {
      const page = await this.objects.listPendingRemovals({ afterRelativePath: after, limit: PENDING_REMOVAL_PAGE });
      for (const removal of page) await this.drainOne(removal, drain);
      if (page.length < PENDING_REMOVAL_PAGE) return drain;
      after = page[page.length - 1]!.relativePath;
    }
  }

  private async drainOne(removal: AutomationStudioProjectObjectPendingRemoval, drain: AutomationStudioProjectPendingRemovalDrain): Promise<void> {
    const settled = await this.objects.removePendingFileIfUnheld(removal.relativePath, async () => {
      await this.seams.beforeDrainRemove?.(removal);
      return this.removeFile(removal.relativePath);
    });
    if (settled.outcome === "removed") drain.removed.push(settled.objectId);
    else if (settled.outcome === "reheld") drain.reheld.push(settled.objectId);
    else if (settled.outcome === "failed") drain.failed.push({ objectId: settled.objectId, reason: settled.reason });
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

  /**
   * Releases up to `limit` unreferenced objects, each in its own transaction
   * that checks its references again, then drains. Returns the objects whose
   * row and file are both gone; one stored again before the drain keeps its
   * file, and one whose file could not be removed is retried by a later drain.
   */
  async sweepUnreferencedObjects(input: { limit?: number } = {}): Promise<{ deleted: string[] }> {
    const candidates = await this.objects.listUnreferencedObjects(input.limit ?? 100);
    const released: string[] = [];
    for (const object of candidates) {
      if (await this.objects.deleteObjectIfUnreferenced(object.objectId)) released.push(object.objectId);
    }
    if (released.length === 0) return { deleted: [] };
    const removed = new Set((await this.drainPendingRemovals()).removed);
    return { deleted: released.filter((objectId) => removed.has(objectId)) };
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

  /**
   * After a writer's commit: the committed object's file is on disk with its
   * byte count, rewritten from `content` (bytes of the same sha256) when a
   * removal took it. A file of another size is a collision, named by id.
   */
  private async ensureObjectFile(object: AutomationStudioProjectObjectRecord, content: Buffer, transactionId: string): Promise<void> {
    if (content.byteLength !== object.byteCount) throw new Error(`Automation Studio object ${object.objectId} hash collision.`);
    const target = this.resolveProjectPath(object.relativePath);
    const info = await stat(target).catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return null;
      throw error;
    });
    if (info === null) await this.writeStagedObject(transactionId, target, path.basename(target), content);
    else if (info.size !== object.byteCount) throw new Error(`Automation Studio object ${object.objectId} hash collision.`);
  }

  /** Whether the file is on disk at `byteCount` bytes. */
  private async fileHolds(relativePath: string, byteCount: number): Promise<boolean> {
    try {
      return (await stat(this.resolveProjectPath(relativePath))).size === byteCount;
    } catch (error) {
      if (isMissingFile(error)) return false;
      throw error;
    }
  }

  private resolveProjectPath(relativePath: string): string {
    const target = path.resolve(this.rootDir, relativePath);
    const root = `${this.rootDir}${path.sep}`;
    if (!target.startsWith(root)) throw new Error("Automation Studio project content path escapes its storage root.");
    return target;
  }
}

function isMissingFile(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
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

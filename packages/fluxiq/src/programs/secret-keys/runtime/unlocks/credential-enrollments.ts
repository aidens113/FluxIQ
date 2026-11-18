import { PAIRED_CLIENT_HOLDER_PREFIX } from "@fluxiq/contracts/platform";
import type { JsonObject } from "../../../../core/index.ts";
import { createRecord, type Repository } from "../../../database-manager/index.ts";
import type { SecretKeyCredentialHolder, SecretKeyCredentialUnlockRecord, SecretKeySessionEnd } from "../../index.ts";
import { secretKeySessionDigest } from "./holder-identity.ts";
import type { SecretKeyProvedKeys } from "./credential-unlocks.ts";

/** A trusted host's fresh paired-holder binding. A session digest is required; raw cookies never reach this record. */
export type SecretKeyAuthenticatedCredentialHolder = Pick<SecretKeyCredentialHolder, "holderId" | "userId" | "expiresAtMs" | "label"> & {
  holderKind: "paired-client";
  approvingSessionDigest: string;
};

/** @deprecated Enrollment no longer creates a locked principal. */
export type SecretKeyLockedCredentialHolder = SecretKeyAuthenticatedCredentialHolder;

type Enrollment = { holder: SecretKeyLockedCredentialHolder; credentialDigest: string; ended: boolean; keys?: SecretKeyProvedKeys };
type EnrollmentPorts = {
  repository: Repository | undefined;
  kind: string;
  now(): number;
  ready(): Promise<void>;
  known(holderId: string): boolean;
  forgotten(holderId: string): boolean;
  publish(record: SecretKeyCredentialUnlockRecord): void;
  newRecord(holder: SecretKeyLockedCredentialHolder, credential: string, keys?: SecretKeyProvedKeys): SecretKeyCredentialUnlockRecord;
  write<T>(holderId: string, operation: () => Promise<T>): Promise<T>;
};

/** Fresh enrollment is persisted before publication and serialized per holder, independently of ordinary presentation. */
export class CredentialEnrollments {
  private readonly ports: EnrollmentPorts;
  private readonly pending = new Map<string, Set<Enrollment>>();
  private readonly tails = new Map<string, Promise<void>>();
  private readonly endedSessionDigests = new Set<string>();

  constructor(ports: EnrollmentPorts) {
    this.ports = ports;
  }

  enroll(holder: SecretKeyLockedCredentialHolder, credential: string, keys?: SecretKeyProvedKeys): Promise<void> {
    const binding = validatedHolder(holder, credential, this.ports.now());
    if (!this.ports.repository) return Promise.reject(new Error("Strict credential enrollment requires a persistence repository."));
    const pending = this.pending.get(binding.holderId) ?? new Set<Enrollment>();
    const credentialDigest = secretKeySessionDigest(credential);
    if ([...pending].some((enrollment) => enrollment.credentialDigest !== credentialDigest || !sameBinding(enrollment.holder, binding))) return Promise.reject(new Error("Strict credential enrollment conflicts with a pending holder."));
    const enrollment: Enrollment = { holder: binding, credentialDigest, ended: false, ...(keys ? { keys } : {}) };
    pending.add(enrollment);
    this.pending.set(binding.holderId, pending);
    const previous = this.tails.get(binding.holderId) ?? Promise.resolve();
    const result = previous.then(() => this.persist(enrollment, credential));
    // The caller keeps the rejection; this tail exists only to order enrollment and revocation.
    const tail = result.then(() => undefined, () => undefined);
    this.tails.set(binding.holderId, tail);
    void tail.then(() => {
      pending.delete(enrollment);
      if (pending.size === 0 && this.pending.get(binding.holderId) === pending) this.pending.delete(binding.holderId);
      if (this.tails.get(binding.holderId) === tail) this.tails.delete(binding.holderId);
    });
    return result;
  }

  settled(holderId: string): Promise<void> {
    return this.tails.get(holderId) ?? Promise.resolve();
  }

  endHolder(holderId: string): Promise<void> {
    return this.endWhere((holder) => holder.holderId === holderId);
  }

  endUser(userId: string): Promise<void> {
    return this.endWhere((holder) => holder.userId === userId);
  }

  sessionEnded(end: SecretKeySessionEnd): Promise<void> {
    if (end.digest) this.endedSessionDigests.add(end.digest);
    return this.endWhere((holder) => {
      if (end.wholeUserId === holder.userId || holder.approvingSessionDigest === end.digest) return true;
      const ownSignOut = !end.administrator && end.revokerUserId === holder.userId;
      return ownSignOut && end.liveSessionDigests !== undefined && !end.liveSessionDigests.has(holder.approvingSessionDigest);
    });
  }

  private async persist(enrollment: Enrollment, credential: string): Promise<void> {
    const repository = this.ports.repository;
    if (!repository) throw new Error("Strict credential enrollment requires a persistence repository.");
    const holder = enrollment.holder;
    await this.ports.ready();
    this.assertCurrent(enrollment);
    if (this.ports.known(holder.holderId)) throw new Error("Strict credential enrollment requires a fresh holder.");
    const record = this.ports.newRecord(holder, credential, enrollment.keys);
    let writeStarted = false;
    try {
      await this.ports.write(holder.holderId, async () => {
        this.assertCurrent(enrollment);
        if (this.ports.known(holder.holderId) || await repository.get(holder.holderId, {})) throw new Error("Strict credential enrollment requires a fresh holder.");
        writeStarted = true;
        await repository.put(createRecord({ id: record.id, kind: this.ports.kind, data: record as unknown as JsonObject }));
      });
      this.assertCurrent(enrollment);
      this.ports.publish(record);
    } catch (error) {
      if (writeStarted) {
        try {
          await this.ports.write(holder.holderId, () => repository.delete(holder.holderId, {}));
        } catch (cleanupError) {
          throw new AggregateError([error, cleanupError], "Strict credential enrollment failed and its provisional persistence could not be removed.");
        }
      }
      throw error;
    }
  }

  private assertCurrent(enrollment: Enrollment): void {
    if (enrollment.ended || this.endedSessionDigests.has(enrollment.holder.approvingSessionDigest) || this.ports.forgotten(enrollment.holder.holderId) || enrollment.holder.expiresAtMs <= this.ports.now()) throw new Error("Strict credential enrollment authority ended.");
  }

  private async endWhere(matches: (holder: SecretKeyLockedCredentialHolder) => boolean): Promise<void> {
    const waits: Promise<void>[] = [];
    for (const [holderId, enrollments] of this.pending) {
      if (![...enrollments].some((enrollment) => matches(enrollment.holder))) continue;
      for (const enrollment of enrollments) if (matches(enrollment.holder)) enrollment.ended = true;
      waits.push(this.settled(holderId));
    }
    await Promise.all(waits);
  }
}

function validatedHolder(holder: SecretKeyLockedCredentialHolder, credential: string, now: number): SecretKeyLockedCredentialHolder {
  if (!Number.isSafeInteger(now) || now < 0 || typeof holder !== "object" || holder === null || holder.holderKind !== "paired-client" || typeof holder.holderId !== "string" || !holder.holderId.startsWith(PAIRED_CLIENT_HOLDER_PREFIX) || holder.holderId.length <= PAIRED_CLIENT_HOLDER_PREFIX.length || typeof holder.userId !== "string" || !holder.userId || typeof holder.approvingSessionDigest !== "string" || !/^[a-f0-9]{64}$/u.test(holder.approvingSessionDigest) || !Number.isSafeInteger(holder.expiresAtMs) || holder.expiresAtMs <= now || typeof credential !== "string" || !credential || "heldAs" in holder || (holder.label !== undefined && typeof holder.label !== "string")) throw new TypeError("Invalid strict credential enrollment binding.");
  const binding: SecretKeyLockedCredentialHolder = { holderKind: "paired-client", holderId: holder.holderId, userId: holder.userId, expiresAtMs: holder.expiresAtMs, approvingSessionDigest: holder.approvingSessionDigest };
  if (holder.label !== undefined) binding.label = holder.label;
  return binding;
}

function sameBinding(before: SecretKeyLockedCredentialHolder, after: SecretKeyLockedCredentialHolder): boolean {
  return before.userId === after.userId && before.approvingSessionDigest === after.approvingSessionDigest && before.expiresAtMs === after.expiresAtMs && before.label === after.label;
}

import { randomUUID } from "node:crypto";
import { mkdir, open, readFile, type FileHandle } from "node:fs/promises";
import path from "node:path";
import type { ExecutionScopeAttestor, ExecutionScopeBinding, ExecutionScopeOwner } from "../../../../../../runtime/execution-admission/index.ts";
import { ClientGatewayCommandLedgerController as Rules } from "../../../../../../client-gateway/service/command-ledger/index.ts";

/** Owns an initialized isolated resource and its original file lease until close. */
export class IsolatedScopeResource implements ExecutionScopeAttestor, ExecutionScopeOwner {
  readonly resourceKey: string;
  readonly reads: object[] = [];
  readonly #proofs = new WeakMap<object, NonNullable<ReturnType<ExecutionScopeOwner["readBinding"]>>>();
  #lease: FileHandle | undefined;

  private constructor(private readonly file: string, lease: FileHandle) {
    this.#lease = lease;
    this.resourceKey = Rules.digest({ ownedResource: file });
  }

  static async open(root: string): Promise<IsolatedScopeResource> {
    const directory = path.join(root, `owned-resource-${randomUUID()}`);
    await mkdir(directory);
    const file = path.join(directory, "resource.json");
    const lease = await open(file, "wx+");
    try {
      await lease.writeFile('{"value":"actual-isolated-resource"}');
      return new IsolatedScopeResource(file, lease);
    } catch (error) {
      await lease.close();
      throw error;
    }
  }

  attest(anchor: ExecutionScopeBinding) {
    if (!this.#lease) return null;
    const proof = Object.freeze({});
    const binding = Object.freeze({ ...anchor, resourceKeys: Object.freeze([this.resourceKey]) });
    this.#proofs.set(proof, Object.freeze({ binding, baseline: "complete", baselineProofDigest: Rules.digest({ binding, basis: "original_initialized_resource_lease" }) }));
    return Object.freeze({ owner: this, proof });
  }

  readBinding(proof: object): ReturnType<ExecutionScopeOwner["readBinding"]> {
    this.reads.push(proof);
    return this.#lease ? this.#proofs.get(proof) ?? null : null;
  }

  async readResource(): Promise<string> {
    if (!this.#lease) throw new Error("fixture.resource_closed");
    return await readFile(this.file, "utf8");
  }

  async close(): Promise<void> {
    const lease = this.#lease;
    this.#lease = undefined;
    await lease?.close();
  }
}

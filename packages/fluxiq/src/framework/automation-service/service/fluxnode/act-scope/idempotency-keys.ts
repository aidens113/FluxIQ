// Durable owner/project key ownership. A key allocates an opaque execution once; its request comparison contains no secret values.
import { createHash, randomUUID } from "node:crypto";
import { canonicalJson } from "@fluxiq/contracts/fluxnode";
import { ProgramJsonStore } from "../../../../persistence/program-state/storage.ts";
import type { AutomationStudioService } from "../../../service.ts";
import type { FluxNodeCaller } from "../fluxnode-service.ts";
import type { FluxNodeRequestIdentity } from "./request-identity.ts";
import { fluxNodeExecutionOwner } from "./execution-owner.ts";

type Stored = { kind: "fluxnode_idempotency_key"; version: 1; request?: string; scope?: string };

export class FluxNodeIdempotencyKeys {
  private readonly memory = new Map<string, Stored>();
  private readonly pending = new Map<string, Promise<unknown>>();
  private readonly admissions = new Map<string, Promise<unknown>>();
  private readonly executions = new Map<string, Promise<unknown>>();

  constructor(private readonly service: AutomationStudioService) {}

  /** Serializes admission, not execution: a duplicate waits until its facade can return the first run. */
  async start<T>(key: string | undefined, work: () => Promise<T>): Promise<T> {
    if (key === undefined) return await work();
    return await this.queued(this.admissions, key, work);
  }

  async execution<T>(scope: string, work: () => Promise<T>): Promise<T> {
    return await this.queued(this.executions, scope, work);
  }

  private async queued<T>(queue: Map<string, Promise<unknown>>, key: string, work: () => Promise<T>): Promise<T> {
    const next = (queue.get(key) ?? Promise.resolve()).then(work, work);
    queue.set(key, next);
    try { return await next; }
    finally { if (queue.get(key) === next) queue.delete(key); }
  }

  async claim(projectId: string, caller: FluxNodeCaller, key: string, identity: FluxNodeRequestIdentity): Promise<{ scope: string } | "conflict" | "busy"> {
    // The caller is trusted by the service surface; requests cannot nominate a principal or project.
    const slot = createHash("sha256").update(canonicalJson({ principal: caller.principal, key })).digest("hex");
    const request = createHash("sha256").update(canonicalJson(identity.projection)).digest("hex");
    const found: { value?: Stored } = {};
    const change = (stored: Stored): Stored => {
      if (stored.kind !== "fluxnode_idempotency_key" || stored.version !== 1) throw new Error("FluxNode idempotency storage is unreadable.");
      if (stored.request !== undefined || stored.scope !== undefined) {
        if (typeof stored.request !== "string" || typeof stored.scope !== "string") throw new Error("FluxNode idempotency entry is unreadable.");
        return found.value = stored;
      }
      return found.value = { ...stored, request, scope: `fluxnode.key.${randomUUID()}` };
    };
    let release: (() => Promise<void>) | undefined;
    if (this.service.projectPaths.root) {
      await this.service.projects.ensureProjectStructure(projectId);
      const file = this.service.projectPaths.projectFile(projectId, "fluxnode", "idempotency", `${slot}.json`);
      const owner = await fluxNodeExecutionOwner(`${file}.owner`);
      if (!owner) return "busy";
      release = owner.release;
      try { await new ProgramJsonStore<Stored>(file, empty).update(change); }
      catch (error) {
        await release();
        throw error;
      }
    } else {
      const at = JSON.stringify([projectId, slot]);
      await this.queued(this.pending, at, async () => {
        this.memory.set(at, change(this.memory.get(at) ?? empty()));
      });
    }
    await release?.();
    return found.value?.request === request && found.value.scope ? { scope: found.value.scope } : "conflict";
  }
}

function empty(): Stored { return { kind: "fluxnode_idempotency_key", version: 1 }; }

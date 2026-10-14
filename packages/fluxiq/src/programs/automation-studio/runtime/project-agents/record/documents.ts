import path from "node:path";
import type { JsonObject } from "../../../../../core/index.ts";
import { ProgramJsonStore } from "../../../../_shared/storage.ts";
import type { AutomationStudioFlowPaths, AutomationStudioProjectPaths } from "../../service/paths/index.ts";
import type { AutomationStudioProjectBuildRef } from "./build-record.ts";

// Where a build record's documents live, and the one way they are changed.
//
// Under a storage root each document is a program-state file under
// `<flow>/project-builds/<buildId>/`: `build.json` for the supervisor's main
// file and `returns/<briefId>.json` for each brief's return. A service with no
// root keeps them in memory for its own lifetime. Either way every change to
// one document runs after the previous change to it has finished, so two
// writers of the same document never interleave, and writers of different
// documents never wait on each other.

export class AutomationStudioProjectBuildDocuments {
  private readonly memory = new Map<string, string>();
  private readonly chains = new Map<string, Promise<unknown>>();

  constructor(private readonly projects: AutomationStudioProjectPaths, private readonly flows: AutomationStudioFlowPaths) {}

  /** The document, or undefined when it was never written. */
  async read(ref: AutomationStudioProjectBuildRef, name: string): Promise<JsonObject | undefined> {
    if (!this.projects.root) {
      const held = this.memory.get(this.key(ref, name));
      return held === undefined ? undefined : (JSON.parse(held) as JsonObject);
    }
    const stored = await new ProgramJsonStore<JsonObject>(this.file(ref, name), () => ({})).read();
    return Object.keys(stored).length ? stored : undefined;
  }

  /** Replaces the document with what `change` makes of it, after any earlier change to it. */
  async update(ref: AutomationStudioProjectBuildRef, name: string, change: (current: JsonObject | undefined) => JsonObject): Promise<JsonObject> {
    const key = this.key(ref, name);
    const previous = this.chains.get(key) ?? Promise.resolve();
    const next = previous
      .catch(() => {
        /* best-effort: the earlier change's own caller already receives its failure */
      })
      .then(() => this.apply(ref, name, change));
    this.chains.set(key, next);
    try {
      return await next;
    } finally {
      if (this.chains.get(key) === next) this.chains.delete(key);
    }
  }

  private async apply(ref: AutomationStudioProjectBuildRef, name: string, change: (current: JsonObject | undefined) => JsonObject): Promise<JsonObject> {
    if (!this.projects.root) {
      const key = this.key(ref, name);
      const held = this.memory.get(key);
      const next = change(held === undefined ? undefined : (JSON.parse(held) as JsonObject));
      this.memory.set(key, JSON.stringify(next));
      return JSON.parse(JSON.stringify(next)) as JsonObject;
    }
    return new ProgramJsonStore<JsonObject>(this.file(ref, name), () => ({})).update((stored) => change(Object.keys(stored).length ? stored : undefined));
  }

  private key(ref: AutomationStudioProjectBuildRef, name: string): string {
    return JSON.stringify([ref.projectId, ref.flowId, ref.buildId, name]);
  }

  private file(ref: AutomationStudioProjectBuildRef, name: string): string {
    return path.join(this.flows.flowDirectory(ref.projectId, ref.flowId), "project-builds", ref.buildId, `${name}.json`);
  }
}

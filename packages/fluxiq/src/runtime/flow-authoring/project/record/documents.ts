import path from "node:path";
import { ProgramJsonStore } from "../../../../framework/persistence/state/index.ts";
import { AutomationStudioProjectWriteCompletion, invokeAutomationStudioProjectWriteCallback } from "../../execution/write-completion/index.ts";
import type { AutomationStudioFlowPaths, AutomationStudioProjectPaths } from "../../../../framework/persistence/paths/index.ts";
import type { AutomationStudioProjectBuildRef } from "../../../../flows/authoring/project/index.ts";
import type { JsonObject } from "../../../../core/index.ts";

const storageRead = ProgramJsonStore.prototype.read;
const storageUpdate = ProgramJsonStore.prototype.update;

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
  private readonly readCompletion: AutomationStudioProjectWriteCompletion;
  private readonly updateCompletion: AutomationStudioProjectWriteCompletion;

  constructor(private readonly projects: AutomationStudioProjectPaths, private readonly flows: AutomationStudioFlowPaths) {
    this.readCompletion = AutomationStudioProjectWriteCompletion.for(this, documentRead);
    this.updateCompletion = AutomationStudioProjectWriteCompletion.for(this, documentUpdate);
  }

  /** The document, or undefined when it was never written. */
  read(ref: AutomationStudioProjectBuildRef, name: string, invocation?: object): Promise<JsonObject | undefined> {
    const frame = AutomationStudioProjectWriteCompletion.capture(invocation);
    let acknowledged = false;
    const work = async (): Promise<JsonObject | undefined> => {
      if (!this.projects.root) {
        const held = this.memory.get(this.key(ref, name));
        const value = held === undefined ? undefined : (JSON.parse(held) as JsonObject);
        acknowledged = true;
        return value;
      }
      const store = new ProgramJsonStore<JsonObject>(this.file(ref, name), () => ({}));
      const callback = store.read;
      const stored = callback === storageRead
        ? await callback.call(store)
        : await invokeAutomationStudioProjectWriteCallback(frame, { receiver: store, callback, args: [] });
      acknowledged = callback === storageRead;
      return Object.keys(stored).length ? stored : undefined;
    };
    const returned = work().then(value => {
      if (acknowledged) this.readCompletion.completed(returned, frame, { disposition: "settled", completionDigest: "project.document.read_completed", assessmentDigest: "project.document.owned_storage" });
      return value;
    });
    return returned;
  }

  /** Replaces the document with what `change` makes of it, after any earlier change to it. */
  update(ref: AutomationStudioProjectBuildRef, name: string, change: (current: JsonObject | undefined) => JsonObject | Promise<JsonObject>, invocation?: object): Promise<JsonObject> {
    const frame = AutomationStudioProjectWriteCompletion.capture(invocation);
    const work = async () => {
      const key = this.key(ref, name);
      const previous = this.chains.get(key) ?? Promise.resolve();
      const apply = () => this.apply(ref, name, change, frame);
      // Each earlier caller retains its own failure; this tail preserves serialization.
      const next = previous.then(apply, apply);
      this.chains.set(key, next);
      try { return await next; }
      finally { if (this.chains.get(key) === next) this.chains.delete(key); }
    };
    const returned = work().then(({ value, acknowledged }) => {
      if (acknowledged) this.updateCompletion.completed(returned, frame, { disposition: "settled", completionDigest: "project.document.write_acknowledged", assessmentDigest: "project.document.owned_storage" });
      return value;
    });
    return returned;
  }

  private async apply(ref: AutomationStudioProjectBuildRef, name: string, change: (current: JsonObject | undefined) => JsonObject | Promise<JsonObject>, frame: ReturnType<typeof AutomationStudioProjectWriteCompletion.capture>): Promise<{ value: JsonObject; acknowledged: boolean }> {
    const changed = async (current: JsonObject | undefined, actual = frame) => await invokeAutomationStudioProjectWriteCallback(actual, { receiver: undefined, callback: change, args: [current] }, current);
    if (!this.projects.root) {
      const key = this.key(ref, name);
      const held = this.memory.get(key);
      const next = await changed(held === undefined ? undefined : (JSON.parse(held) as JsonObject));
      this.memory.set(key, JSON.stringify(next));
      return { value: JSON.parse(JSON.stringify(next)) as JsonObject, acknowledged: true };
    }
    const store = new ProgramJsonStore<JsonObject>(this.file(ref, name), () => ({}));
    const callback = store.update;
    const mutator = async (stored: JsonObject) => await changed(Object.keys(stored).length ? stored : undefined, AutomationStudioProjectWriteCompletion.capture(mutator) ?? frame);
    const value = callback === storageUpdate
      ? await callback.call(store, mutator)
      : await invokeAutomationStudioProjectWriteCallback(frame, { receiver: store, callback, args: [mutator] }, mutator);
    return { value, acknowledged: callback === storageUpdate };
  }

  private key(ref: AutomationStudioProjectBuildRef, name: string): string {
    return JSON.stringify([ref.projectId, ref.flowId, ref.buildId, name]);
  }

  private file(ref: AutomationStudioProjectBuildRef, name: string): string {
    return path.join(this.flows.flowDirectory(ref.projectId, ref.flowId), "project-builds", ref.buildId, `${name}.json`);
  }
}

const documentRead = AutomationStudioProjectBuildDocuments.prototype.read;
const documentUpdate = AutomationStudioProjectBuildDocuments.prototype.update;

import path from "node:path";
import type { JsonObject, JsonValue } from "../../../../core/index.ts";
import { ProgramJsonStore, safeSegment } from "../../../_shared/storage.ts";
import { AutomationStudioFlowPaths, type AutomationStudioProjectPaths } from "../service/paths/index.ts";
import { AutomationStudioDomainBuildStateDocument as Document } from "./document.ts";
import { AUTOMATION_STUDIO_DOMAIN_BUILD_STATE_LIMITS as LIMITS } from "./limits.ts";
import { AutomationStudioDomainBuildStateRefusal as Refusal } from "./refusal.ts";
import type { AutomationStudioDomainBuildStateScope } from "./types.ts";

// The durable memory a registered domain keeps per build or per Flow (t728,
// audit finding 8). A domain kept its per-build memories and the ways out a
// person cleared in process memory only, so a restarted host forgot them and
// two hosts could never share them; Core owns durable state, so Core keeps it.
//
// Under a storage root each domain's values for one Flow are one program-state
// file, `<flow>/domain-build-state/<domain>.json`, written through
// `ProgramJsonStore`, which serializes every change to one file. A service with
// no root keeps the same documents in memory for its own lifetime. Values are
// opaque to Core: never read into, never logged, and absent from every refusal.

export class AutomationStudioDomainBuildStateStore {
  private readonly memory = new Map<string, JsonObject>();

  /** `projects` is read when a value is first asked for, so the service can hand this out before its own paths exist. */
  constructor(private readonly projects: () => AutomationStudioProjectPaths) {}

  async get(domainId: string, scope: AutomationStudioDomainBuildStateScope, key: string): Promise<JsonValue | undefined> {
    checked(domainId, scope, key);
    const document = Document.parse(await this.read(domainId, scope), domainId);
    return document.get(scope.buildId, key);
  }

  async put(domainId: string, scope: AutomationStudioDomainBuildStateScope, key: string, value: JsonValue): Promise<void> {
    checked(domainId, scope, key);
    await this.update(domainId, scope, (document) => document.put(scope.buildId, key, value));
  }

  async drop(domainId: string, scope: AutomationStudioDomainBuildStateScope, key: string): Promise<boolean> {
    checked(domainId, scope, key);
    let dropped = false;
    await this.update(domainId, scope, (document) => {
      dropped = document.drop(scope.buildId, key);
    });
    return dropped;
  }

  private async read(domainId: string, scope: AutomationStudioDomainBuildStateScope): Promise<JsonObject> {
    const projects = this.projects();
    if (!projects.root) return structuredClone(this.memory.get(memoryKey(domainId, scope)) ?? {});
    return await new ProgramJsonStore<JsonObject>(fileOf(projects, domainId, scope), () => ({})).read();
  }

  /** Applies `change` to the stored document; a refusal inside it writes nothing. */
  private async update(domainId: string, scope: AutomationStudioDomainBuildStateScope, change: (document: Document) => void): Promise<void> {
    const projects = this.projects();
    if (!projects.root) {
      const key = memoryKey(domainId, scope);
      const document = Document.parse(structuredClone(this.memory.get(key) ?? {}), domainId);
      change(document);
      this.memory.set(key, document.toJson());
      return;
    }
    await new ProgramJsonStore<JsonObject>(fileOf(projects, domainId, scope), () => ({})).update((stored) => {
      const document = Document.parse(stored, domainId);
      change(document);
      return document.toJson();
    });
  }
}

/** Refuses an id or key outside its bound, naming which. */
function checked(domainId: string, scope: AutomationStudioDomainBuildStateScope, key: string): void {
  if (typeof domainId !== "string" || !LIMITS.id.test(domainId)) throw new Refusal("domain_build_state.scope_invalid", "domainId");
  if (typeof scope?.projectId !== "string" || !LIMITS.id.test(scope.projectId)) throw new Refusal("domain_build_state.scope_invalid", "projectId");
  if (typeof scope.flowId !== "string" || !LIMITS.id.test(scope.flowId)) throw new Refusal("domain_build_state.scope_invalid", "flowId");
  if (scope.buildId !== undefined && (typeof scope.buildId !== "string" || !LIMITS.id.test(scope.buildId))) throw new Refusal("domain_build_state.scope_invalid", "buildId");
  if (typeof key !== "string" || !LIMITS.key.test(key)) throw new Refusal("domain_build_state.key_invalid", "key");
}

/** One file per domain and Flow. The file name folds case, so the document says whose it is (`./document.ts`). */
function fileOf(projects: AutomationStudioProjectPaths, domainId: string, scope: AutomationStudioDomainBuildStateScope): string {
  return path.join(new AutomationStudioFlowPaths(projects).flowDirectory(scope.projectId, scope.flowId), "domain-build-state", `${safeSegment(domainId)}.json`);
}

/** The same folding in memory, so a service with no root refuses exactly what one with a root refuses. */
function memoryKey(domainId: string, scope: AutomationStudioDomainBuildStateScope): string {
  return JSON.stringify([safeSegment(domainId), safeSegment(scope.projectId), safeSegment(scope.flowId)]);
}

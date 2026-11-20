import { isDeepStrictEqual } from "node:util";
import type { JsonObject } from "../../../../../core/index.ts";
import { AutomationStudioInputBasisOwner, type AutomationStudioInputBasisOwnerPorts, type AutomationStudioInputBasisStorage, type AutomationStudioInputProducer, type AutomationStudioInputProducerOwner, type AutomationStudioInputRead, type AutomationStudioInputScope } from "../../../../../runtime/input-basis/index.ts";
import { automationStudioRunSecrets } from "../../../../../runtime/run-secrets/index.ts";
import type { AutomationStudioInputUseLayer } from "./layer.ts";

type Layer = Readonly<{ role: AutomationStudioInputUseLayer["role"]; values: JsonObject; origin: AutomationStudioInputUseLayer["origin"] }>;
type Secrecy = Awaited<ReturnType<NonNullable<AutomationStudioInputBasisOwnerPorts["secrecy"]>["inspect"]>>;

/**
 * The producers of one run's root entry: each layer the run actually assembled gets its own revision in the durable
 * normal-input owner, in a slot named by the entry's producer and the layer's role, and only after that layer's
 * declared origin is authenticated. Those layer revisions, in overlay order, are the entry's producer references,
 * verified current whenever the entry is. Nothing here reads a value's shape to decide where it came from.
 */
export class AutomationStudioInputUseProducers {
  readonly #storage: AutomationStudioInputBasisStorage;
  readonly #scope: AutomationStudioInputScope;
  readonly #layers: readonly Layer[];
  readonly #authenticated = new Set<Layer>();
  #issued: readonly AutomationStudioInputProducer[] | undefined;

  constructor(storage: AutomationStudioInputBasisStorage, scope: AutomationStudioInputScope, layers: readonly Layer[]) {
    this.#storage = storage;
    this.#scope = scope;
    this.#layers = layers;
  }

  /** The slot a role's layer is kept in: the entry's own producer, then the role. */
  static slot(scope: AutomationStudioInputScope, role: string): AutomationStudioInputScope {
    return { ...scope, producerId: `${scope.producerId}.${role}` };
  }

  /** The exact dictionary the layers assemble, later layers winning, as the engine's own overlay does. */
  static overlay(layers: readonly Pick<Layer, "values">[]): JsonObject {
    return Object.assign({}, ...layers.map(layer => layer.values)) as JsonObject;
  }

  /** Authenticates every layer's origin before anything is written, then issues each layer's revision. */
  async issue(signal: AbortSignal | undefined): Promise<AutomationStudioInputRead<readonly AutomationStudioInputProducer[]>> {
    if (this.#layers.some(layer => layer.origin === undefined)) return { status: "unknown", code: "origin_unverified" };
    for (const layer of this.#layers) {
      const origin = await this.origin(layer, signal);
      if (origin.status !== "bound") return origin;
      this.#authenticated.add(layer);
    }
    const owner = this.layerOwner(), issued: AutomationStudioInputProducer[] = [];
    for (const layer of this.#layers) {
      const read = await owner.observe(AutomationStudioInputUseProducers.slot(this.#scope, layer.role), layer.values, [], signal);
      if (read.status !== "bound") return read;
      // Only the reference is needed: the entry's own lease carries the execution copy.
      read.value.close();
      issued.push(Object.freeze({ role: layer.role, reference: read.value.reference }));
    }
    this.#issued = Object.freeze(issued);
    return { status: "bound", value: this.#issued };
  }

  /** The entry's owner: its producers must be exactly the layer revisions issued here, each still current. */
  entryOwner(): AutomationStudioInputBasisOwner {
    const layers = this.layerOwner();
    const verifier: AutomationStudioInputProducerOwner = {
      verifyCurrent: async (context, reference) => isDeepStrictEqual(context.scope, this.#scope)
        ? await layers.verifyCurrent(AutomationStudioInputUseProducers.slot(context.scope, context.role), reference)
        : { status: "unknown", code: "producer_unverified" }
    };
    return new AutomationStudioInputBasisOwner({ ...this.ports(), producerOwners: new Map((this.#issued ?? []).map(producer => [producer.reference.ownerId, verifier])),
      secrecy: { inspect: async capture => this.inspect(() => this.#issued !== undefined && isDeepStrictEqual(capture.scope, this.#scope)
        && isDeepStrictEqual(capture.producers, this.#issued) && isDeepStrictEqual(capture.values, AutomationStudioInputUseProducers.overlay(this.#layers))) } });
  }

  /** A layer's owner: a slot holds exactly its authenticated layer's values, with no further producers. */
  private layerOwner(): AutomationStudioInputBasisOwner {
    return new AutomationStudioInputBasisOwner({ ...this.ports(), secrecy: { inspect: async capture => this.inspect(() => capture.producers.length === 0 && [...this.#authenticated].some(layer =>
      isDeepStrictEqual(capture.scope, AutomationStudioInputUseProducers.slot(this.#scope, layer.role)) && isDeepStrictEqual(capture.values, layer.values))) } });
  }

  /**
   * A `request` origin is the operation's own authenticated channel, declared by the service code that read it. A
   * `revision` origin must reopen, as the current head of its slot under this same project, task and principal, with
   * an execution copy exactly equal to the layer: an earlier run's root input counts only through what was issued.
   */
  private async origin(layer: Layer, signal: AbortSignal | undefined): Promise<AutomationStudioInputRead<true>> {
    const origin = layer.origin;
    if (origin?.kind === "request") return { status: "bound", value: true };
    if (origin?.kind !== "revision") return { status: "unknown", code: "origin_unverified" };
    const stored = this.storedOwner(origin.reference.ownerId);
    const read = await stored.reopen({ ...this.#scope, producerId: origin.producerId }, origin.reference, signal);
    if (read.status !== "bound") return read;
    try {
      return isDeepStrictEqual(read.value.executionCopy(), layer.values) ? { status: "bound", value: true } : { status: "unknown", code: "origin_unverified" };
    } finally { read.value.close(); }
  }

  /**
   * Reopens a binding this owner issued earlier. Its values entered the owner only through a secrecy-approved
   * observation, so their origin is the owner's own private snapshot; an active secret context still refuses them,
   * and its stored producers are rechecked slot by slot, as the slot that issued them names them.
   */
  private storedOwner(ownerId: string): AutomationStudioInputBasisOwner {
    const verifier: AutomationStudioInputProducerOwner = {
      verifyCurrent: async (context, reference) => await owner.verifyCurrent(AutomationStudioInputUseProducers.slot(context.scope, context.role), reference)
    };
    const owner: AutomationStudioInputBasisOwner = new AutomationStudioInputBasisOwner({ ...this.ports(), producerOwners: new Map([[ownerId, verifier]]), secrecy: { inspect: async () => this.inspect(() => true) } });
    return owner;
  }

  private ports(): Pick<AutomationStudioInputBasisOwnerPorts, "storage" | "scopeAuthority"> {
    const trusted = this.#scope;
    return { storage: this.#storage, scopeAuthority: { authorize: async scope => scope.projectId === trusted.projectId && scope.taskId === trusted.taskId && scope.principalId === trusted.principalId } };
  }

  /** No normal-input claim while a secret context is active, whatever the values look like. */
  private inspect(matches: () => boolean): Secrecy {
    if (automationStudioRunSecrets() !== undefined) return "active";
    return matches() ? "nonsecret" : "unverified";
  }
}

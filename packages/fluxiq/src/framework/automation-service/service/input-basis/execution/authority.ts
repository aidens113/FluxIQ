import { isDeepStrictEqual } from "node:util";
import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioInputUseAuthority, AutomationStudioInputUseLease, AutomationStudioInputUseRead } from "../../../../../engine/automation/input-use/index.ts";
import { AutomationStudioInputBasisEncoding as Encoding, type AutomationStudioInputBasisOwner, type AutomationStudioInputBasisStorage, type AutomationStudioInputScope, type AutomationStudioNormalInputLease } from "../../../../../runtime/input-basis/index.ts";
import type { AutomationStudioInputUseEntry } from "./entry.ts";
import type { AutomationStudioInputUseLayer } from "./layer.ts";
import { AutomationStudioInputUseProducers as Producers } from "./producers.ts";

type Layer = Readonly<{ role: AutomationStudioInputUseLayer["role"]; values: JsonObject; origin: AutomationStudioInputUseLayer["origin"] }>;

/**
 * The service's trusted graph-entry authority for one run (t905 unit B). Its scope and the layers the run assembled
 * are fixed when the service opens it, isolated from the objects it was given; the engine's capture can never name
 * either. A root entry seals only when its exact effective dictionary is the overlay of declared layers whose origins
 * authenticate, issued through the durable normal-input owner. Absent provenance stays unknown.
 */
export class AutomationStudioInputUseServiceAuthority implements AutomationStudioInputUseAuthority {
  readonly #storage: AutomationStudioInputBasisStorage;
  readonly #scope: AutomationStudioInputScope | undefined;
  readonly #layers: readonly Layer[] | undefined;

  constructor(input: { storage: AutomationStudioInputBasisStorage; scope: AutomationStudioInputScope; entry: AutomationStudioInputUseEntry }) {
    this.#storage = input.storage;
    this.#scope = Encoding.scope(input.scope);
    this.#layers = layersOf(input.entry);
  }

  async open(capture: Parameters<AutomationStudioInputUseAuthority["open"]>[0], signal?: AbortSignal): Promise<AutomationStudioInputUseRead<AutomationStudioInputUseLease>> {
    signal?.throwIfAborted();
    // A child frame needs its own authenticated fork; this authority speaks for the run's root entry alone.
    if (capture.boundary !== undefined || capture.location.parentInvocationId !== undefined) return { status: "unknown", code: "unverified_frame" };
    if (!this.#scope) return { status: "unknown", code: "invalid_scope" };
    const values = Encoding.values(capture.values);
    if (!this.#layers || values.status !== "valid") return { status: "unknown", code: "unsupported_input" };
    // Root defaults belong to the executable's identity, and no executable-owned defaults producer exists here yet.
    if (capture.declaredInputDefaults !== undefined && Object.keys(capture.declaredInputDefaults).length > 0) return { status: "unknown", code: "origin_unverified" };
    // Every key must come from a declared layer, exactly as assembled: an unattributed value has no provenance.
    if (!isDeepStrictEqual(values.value, Producers.overlay(this.#layers))) return { status: "unknown", code: "origin_unverified" };
    const producers = new Producers(this.#storage, this.#scope, this.#layers);
    const issued = await producers.issue(signal);
    if (issued.status !== "bound") return issued;
    const owner = producers.entryOwner();
    const read = await owner.observe(this.#scope, values.value, issued.value, signal);
    return read.status === "bound" ? { status: "bound", value: lease(owner, this.#scope, read.value) } : read;
  }

  /**
   * A child's inputs are resolved from values the run produced after entry; no durable child-occurrence slot or
   * callee-to-executable correspondence exists yet to authenticate them, so a fork is never granted.
   */
  async child(_capture: Parameters<AutomationStudioInputUseAuthority["child"]>[0], signal?: AbortSignal): Promise<AutomationStudioInputUseRead<AutomationStudioInputUseAuthority>> {
    signal?.throwIfAborted();
    return { status: "unknown", code: "fork_unverified" };
  }
}

/** Isolates the declared layers once; a repeated role or unsupported JSON makes the whole entry unsupported. */
function layersOf(entry: AutomationStudioInputUseEntry): readonly Layer[] | undefined {
  if (!entry || !Array.isArray(entry.layers)) return undefined;
  const layers: Layer[] = [], roles = new Set<string>();
  for (const layer of entry.layers) {
    const values = Encoding.values(layer?.values);
    if (values.status !== "valid" || layer.role !== "inherited" && layer.role !== "caller" || roles.has(layer.role)) return undefined;
    roles.add(layer.role);
    layers.push(Object.freeze({ role: layer.role, values: values.value, origin: originOf(layer.origin) }));
  }
  return Object.freeze(layers);
}

function originOf(origin: AutomationStudioInputUseLayer["origin"]): AutomationStudioInputUseLayer["origin"] {
  if (origin?.kind === "request") return Object.freeze({ kind: "request" });
  if (origin?.kind !== "revision" || typeof origin.producerId !== "string") return undefined;
  const reference = Encoding.reference(origin.reference);
  return reference ? Object.freeze({ kind: "revision", producerId: origin.producerId, reference }) : undefined;
}

/** The engine's lease over the owner's: each current check goes back to the owner with the operation's own signal. */
function lease(owner: AutomationStudioInputBasisOwner, scope: AutomationStudioInputScope, normal: AutomationStudioNormalInputLease): AutomationStudioInputUseLease {
  let open = true;
  return Object.freeze({
    reference: normal.reference,
    executionCopy: () => normal.executionCopy(),
    verifyCurrent: async (signal?: AbortSignal): Promise<AutomationStudioInputUseRead<true>> => open ? await owner.verifyCurrent(scope, normal.reference, signal) : { status: "unknown", code: "lease_closed" },
    close: () => {
      open = false;
      normal.close();
    }
  });
}

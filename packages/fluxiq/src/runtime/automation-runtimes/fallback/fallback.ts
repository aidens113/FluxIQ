import type { AutomationStudioRuntimeFallbackState } from "./state.ts";
import type { AutomationStudioRuntimeView } from "../view.ts";
import { screenTrustedModuleIdentity } from "../../build-identity/modules/index.ts";

/** Existing bind operations can assign individual slots or atomically replace related slots. */
export class AutomationStudioRuntimeFallbackSlot implements AutomationStudioRuntimeView {
  #state: AutomationStudioRuntimeFallbackState;
  constructor(initial: AutomationStudioRuntimeFallbackState, private readonly accept: (next: AutomationStudioRuntimeFallbackState) => void, private readonly check: () => void) {
    this.#state = snapshot(initial);
    this.accept(this.#state);
  }
  rebind(patch: Partial<AutomationStudioRuntimeFallbackState>): void {
    const next = snapshot({ ...this.#state, ...patch });
    this.accept(next);
    this.#state = next;
  }
  get runtime() {
    this.check();
    return this.#state.runtime;
  }
  set runtime(value: AutomationStudioRuntimeView["runtime"]) { this.rebind({ runtime: value }); }
  get domainId() {
    this.check();
    return this.#state.domainId ?? this.#state.evidence?.domainId ?? this.#state.io?.domainId ?? null;
  }
  set domainId(value: string | null) { this.rebind({ domainId: value }); }
  get evidence() {
    this.check();
    return this.#state.evidence;
  }
  set evidence(value: AutomationStudioRuntimeView["evidence"]) { this.rebind({ evidence: value }); }
  get host() {
    this.check();
    return this.#state.host;
  }
  set host(value: AutomationStudioRuntimeView["host"]) { this.rebind({ host: value }); }
  get nodes() {
    this.check();
    return this.#state.nodes;
  }
  set nodes(value: AutomationStudioRuntimeView["nodes"]) { this.rebind({ nodes: value }); }
  get nodesIdentity() {
    this.check();
    return this.#state.nodesIdentity;
  }
  set nodesIdentity(value: AutomationStudioRuntimeView["nodesIdentity"]) { this.rebind({ nodesIdentity: value }); }
  get io() {
    this.check();
    return this.#state.io;
  }
  set io(value: AutomationStudioRuntimeView["io"]) { this.rebind({ io: value }); }
}

function snapshot(state: AutomationStudioRuntimeFallbackState): AutomationStudioRuntimeFallbackState {
  const nodesIdentity = state.nodesIdentity == null ? state.nodesIdentity : screenTrustedModuleIdentity(state.nodesIdentity);
  return Object.freeze({ ...state, nodesIdentity });
}

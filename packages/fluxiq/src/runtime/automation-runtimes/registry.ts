import { bindTrustedModuleIdentity, screenTrustedModuleIdentity } from "../build-identity/modules/index.ts";
import type { AutomationStudioRuntimeBundle } from "./bundle.ts";
import { AutomationStudioRuntimeFallbackSlot, type AutomationStudioRuntimeFallbackState } from "./fallback/index.ts";
import { validateAutomationStudioRuntimeBundles } from "./validation.ts";
import type { AutomationStudioRuntimeView } from "./view.ts";

/** Foundation only: callers must explicitly select and pass the chosen view to a service operation. */
export class AutomationStudioRuntimeBundles {
  readonly fallback: AutomationStudioRuntimeFallbackSlot;
  #fallbackState: AutomationStudioRuntimeFallbackState = {};
  readonly #bundles: AutomationStudioRuntimeView[] = [];
  readonly #views = new Map<AutomationStudioRuntimeView, AutomationStudioRuntimeView>();

  constructor(initial: AutomationStudioRuntimeFallbackState = {}) {
    this.fallback = new AutomationStudioRuntimeFallbackSlot(initial, (next) => {
      validateAutomationStudioRuntimeBundles(next, this.#bundles);
      this.#fallbackState = next;
    }, () => this.#validate());
  }
  register(bundle: AutomationStudioRuntimeBundle): void {
    const nodesIdentity = bundle.nodesIdentity == null ? bundle.nodesIdentity : screenTrustedModuleIdentity(bundle.nodesIdentity);
    const snapshot = Object.freeze({ runtime: bundle.runtime, domainId: bundle.domainId, evidence: bundle.evidence, host: bundle.host, nodes: bundle.nodes, nodesIdentity });
    validateAutomationStudioRuntimeBundles(this.#fallbackState, [...this.#bundles, snapshot]);
    const view = this.#view(snapshot);
    bindTrustedModuleIdentity(view, nodesIdentity);
    this.#bundles.push(snapshot);
    this.#views.set(snapshot, view);
  }
  forDomain(domainId: string | null): AutomationStudioRuntimeView {
    this.#validate();
    const bundle = this.#bundles.find((entry) => entry.domainId === domainId);
    return bundle ? this.#views.get(bundle)! : this.fallback;
  }
  forRuntime(runtime: string): AutomationStudioRuntimeView | undefined {
    this.#validate();
    const bundle = this.#bundles.find((entry) => entry.runtime === runtime);
    if (bundle) return this.#views.get(bundle)!;
    return this.#fallbackState.runtime === undefined || this.#fallbackState.runtime === runtime ? this.fallback : undefined;
  }
  list(): readonly AutomationStudioRuntimeView[] {
    this.#validate();
    return Object.freeze([this.fallback, ...this.#views.values()]);
  }
  get multiple(): boolean { return this.#bundles.length > 0; }
  #validate(): void { validateAutomationStudioRuntimeBundles(this.#fallbackState, this.#bundles); }
  #view(snapshot: AutomationStudioRuntimeView): AutomationStudioRuntimeView {
    const view = {} as AutomationStudioRuntimeView;
    for (const key of Object.keys(snapshot) as (keyof AutomationStudioRuntimeView)[]) {
      Object.defineProperty(view, key, { enumerable: true, get: () => {
        this.#validate();
        return snapshot[key];
      } });
    }
    return Object.freeze(view);
  }
}

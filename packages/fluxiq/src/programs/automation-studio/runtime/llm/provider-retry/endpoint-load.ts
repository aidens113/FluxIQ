// How many provider calls are in flight against one endpoint, so a retry knows
// whether it waits alone (t534).
//
// One loop against one endpoint has no herd: its backoff is the table's
// exactly (`limits.ts`). Concurrent builders share an endpoint, and two of them
// that met one rate limit together would ask again together. A call counts as
// in flight from its first attempt to its last, waits included, so a call
// waiting out a backoff still tells another that the endpoint is shared.

import type { AutomationStudioLlmProviderMetadata } from "../harness/index.ts";

export class AutomationStudioLlmProviderEndpointLoad {
  private readonly inFlight = new Map<string, number>();

  /** Count a call in flight against `endpoint` until the returned function is called; calling it again does nothing. */
  enter(endpoint: string): () => void {
    this.inFlight.set(endpoint, (this.inFlight.get(endpoint) ?? 0) + 1);
    let left = false;
    return () => {
      if (left) return;
      left = true;
      const remaining = (this.inFlight.get(endpoint) ?? 1) - 1;
      if (remaining > 0) this.inFlight.set(endpoint, remaining);
      else this.inFlight.delete(endpoint);
    };
  }

  /** Whether another call besides one's own is in flight against `endpoint`. */
  shared(endpoint: string): boolean {
    return (this.inFlight.get(endpoint) ?? 0) > 1;
  }

  /** The key calls share an endpoint by: the provider and the endpoint it names, whatever model each asks. */
  static key(metadata: Pick<AutomationStudioLlmProviderMetadata, "provider" | "endpoint">): string {
    return JSON.stringify([metadata.provider, metadata.endpoint ?? ""]);
  }
}

/** Core's own, counted by every call whose caller names no other. */
export const automationStudioLlmProviderEndpointLoad = new AutomationStudioLlmProviderEndpointLoad();

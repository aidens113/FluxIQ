import type { RuntimeAdapter } from "./adapter.ts";
// Keep the historical constructor name as well as its exact exported identity.
class AutomationStudioAdapterRegistry<TAdapter extends RuntimeAdapter = RuntimeAdapter> {
  private readonly adapters = new Map<string, TAdapter>();
  register(adapter: TAdapter): void {
    this.adapters.set(adapter.adapterId, adapter);
  }
  get(adapterId: string): TAdapter | undefined {
    return this.adapters.get(adapterId);
  }
  list(): TAdapter[] {
    return [...this.adapters.values()];
  }
}
export { AutomationStudioAdapterRegistry as RuntimeAdapterRegistry };

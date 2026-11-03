/** Membership comes from the original Core factory, never a tool id or returned flags. */
export class AutomationStudioBuildToolFactories {
  private static readonly originals = new WeakMap<object, "pure" | "frame" | "recall">();

  static remember(originalCallback: object, contract: "pure" | "frame" | "recall"): void {
    const existing = this.originals.get(originalCallback);
    if (existing && existing !== contract) throw new Error("execution_observation.tool_factory_changed");
    this.originals.set(originalCallback, contract);
  }

  static of(originalCallback: object): "pure" | "frame" | "recall" | undefined {
    return this.originals.get(originalCallback);
  }
}

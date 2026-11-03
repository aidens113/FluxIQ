/** Original Core frame receivers retain their request only in this private companion. */
export class AutomationStudioBuildToolCallbackContexts {
  private static readonly originals = new WeakMap<object, { readonly request: object }>();

  static request(originalCoreAnchor: object): object | undefined {
    return this.originals.get(originalCoreAnchor)?.request;
  }

  static bind(originalCoreAnchor: object, originalRequest: object): () => void {
    const previous = this.originals.get(originalCoreAnchor);
    const current = Object.freeze({ request: originalRequest });
    this.originals.set(originalCoreAnchor, current);
    return () => {
      if (this.originals.get(originalCoreAnchor) !== current) throw new Error("execution_observation.tool_callback_context_changed");
      if (previous) this.originals.set(originalCoreAnchor, previous);
      else this.originals.delete(originalCoreAnchor);
    };
  }
}

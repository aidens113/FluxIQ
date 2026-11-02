/** Exact read methods whose bodies are defined by Core, without importer calls. */
export class OutputPureCallbacks {
  private static readonly values = new WeakMap<object, Set<unknown>>();

  static register(receiver: unknown, callback: object): void {
    let receivers = this.values.get(callback);
    if (!receivers) {
      receivers = new Set();
      this.values.set(callback, receivers);
    }
    receivers.add(receiver);
  }

  static has(receiver: unknown, callback: object): boolean {
    return this.values.get(callback)?.has(receiver) === true;
  }
}

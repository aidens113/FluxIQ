/** Original callbacks registered only by the Core modules that define their bodies. */
export class AutomationPureCallbacks {
  private static readonly pairs = new WeakMap<object, Set<unknown>>();
  private static readonly lexical = new WeakSet<object>();
  static register(receiver: unknown, callback: object): void {
    let receivers = this.pairs.get(callback);
    if (!receivers) {
      receivers = new Set();
      this.pairs.set(callback, receivers);
    }
    receivers.add(receiver);
  }
  static registerLexical(callback: object): void { this.lexical.add(callback); }
  static has(receiver: unknown, callback: object): boolean { return this.lexical.has(callback) || this.pairs.get(callback)?.has(receiver) === true; }
}

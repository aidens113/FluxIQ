/** Core-defined orchestration delegates direct work into observed child producers. */
export class AutomationOrchestrationCallbacks {
  private static readonly values = new WeakSet<object>();

  static register(callback: object): void {
    this.values.add(callback);
  }

  static has(callback: object): boolean {
    return this.values.has(callback);
  }
}

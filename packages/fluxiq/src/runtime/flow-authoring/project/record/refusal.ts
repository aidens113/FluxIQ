// What the build record store throws when it refuses a write or a stored file:
// the code, and the path of the first thing refused.

export class AutomationStudioProjectRecordRefusal extends Error {
  constructor(readonly code: string, readonly path: string) {
    super(`${code} at ${path}`);
    this.name = "AutomationStudioProjectRecordRefusal";
  }
}

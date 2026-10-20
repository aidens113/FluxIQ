// What the domain build state throws when it refuses a read or a write: the
// code, and which part of the request it refused. Never the value, which is
// the domain's and opaque to Core.

export class AutomationStudioDomainBuildStateRefusal extends Error {
  constructor(readonly code: string, readonly part: string) {
    super(`${code} at ${part}`);
    this.name = "AutomationStudioDomainBuildStateRefusal";
  }
}

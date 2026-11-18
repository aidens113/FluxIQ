/** A policy denial contains no credential or policy-engine diagnostic. */
export class KeyManagementRefusal extends Error {
  constructor() {
    super("Key management is not permitted.");
    this.name = "KeyManagementRefusal";
  }
}

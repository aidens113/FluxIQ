/** A real saved-key recovery/configuration problem, never a client unlock requirement. */
export class SecretKeyAccessUnavailableError extends Error {
  constructor(readonly code: "legacy_recovery_required" | "host_protection_unavailable" | "ciphertext_invalid") {
    super(code === "legacy_recovery_required" ? "This saved key requires recovery from its original encryption material." : code === "host_protection_unavailable" ? "The host cannot open this saved key because its protection key is unavailable." : "This saved key could not be authenticated.");
    this.name = "SecretKeyAccessUnavailableError";
  }
}

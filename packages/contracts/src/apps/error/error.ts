/** Contract errors contain fixed words only, never rejected values or raw schema issues. */
export type AppContractErrorCode =
  | "app.invalid_manifest" | "app.invalid_operation" | "app.invalid_installation"
  | "app.invalid_invocation" | "app.invalid_resolution" | "app.unsupported_version"
  | "app.manifest_digest_mismatch" | "app.installation_pin_mismatch" | "app.grant_expansion"
  | "app.invalid_inputs" | "app.invalid_result" | "app.unavailable_crypto";

export type AppContractError = { code: AppContractErrorCode; message: string };

export function appContractError(code: AppContractErrorCode): AppContractError {
  const words: Record<AppContractErrorCode, string> = {
    "app.invalid_manifest": "The app manifest is not valid.",
    "app.invalid_operation": "The app operation is not valid.",
    "app.invalid_installation": "The app installation is not valid.",
    "app.invalid_invocation": "The app invocation is not valid.",
    "app.invalid_resolution": "The operation resolution is not valid.",
    "app.unsupported_version": "The app contract version is not supported.",
    "app.manifest_digest_mismatch": "The manifest digest does not match its content.",
    "app.installation_pin_mismatch": "The installation does not pin this manifest.",
    "app.grant_expansion": "The approved capabilities exceed the manifest request.",
    "app.invalid_inputs": "The inputs do not match the declared operation type.",
    "app.invalid_result": "The result does not match the declared operation type.",
    "app.unavailable_crypto": "Web Crypto is required to verify an app manifest."
  };
  return { code, message: words[code] };
}

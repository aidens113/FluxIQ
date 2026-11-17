import type { KeyRow } from "../model";

/** Saved-key metadata, without promising that a provider has accepted its value. */
export function KeyAvailability({ row }: { row: KeyRow | undefined }) {
  const state = row?.availability;
  let words = "Availability not known";
  if (row?.enabled === false) words = "Turned off";
  else if (state?.state === "available") words = "Available";
  else if (state?.state === "unavailable") {
    switch (state.code) {
      case "legacy_recovery_required":
        words = "Sign in to the panel once to upgrade this key, or add it again";
        break;
      case "host_protection_unavailable":
        words = "Host key protection unavailable";
        break;
      case "ciphertext_invalid":
        words = "Saved key could not be read";
        break;
      case "upgrade_required":
        words = "FluxIQ update required";
        break;
    }
  }
  const tone = row?.enabled === false ? "none" : state?.state === "available" ? "ok" : state?.state === "unavailable" ? "warn" : "none";
  return <span className="security-state" data-tone={tone}>{words}</span>;
}

import type { KeyRow } from "../model";

/** Whether FluxIQ can still open a saved login or key, in plain words. It never claims a provider accepted it. */
export function KeyAvailability({ row }: { row: KeyRow | undefined }) {
  const state = row?.availability;
  let words = "Not known";
  if (row?.enabled === false) words = "Turned off";
  else if (state?.state === "available") words = "Saved";
  else if (state?.state === "unavailable") {
    switch (state.code) {
      case "legacy_recovery_required":
        words = "FluxIQ can't open it any more. Replace it.";
        break;
      case "host_protection_unavailable":
        words = "This FluxIQ server can't open saved keys";
        break;
      case "ciphertext_invalid":
        words = "FluxIQ can't read it. Replace it.";
        break;
      case "upgrade_required":
        words = "FluxIQ needs an update";
        break;
    }
  }
  const tone = row?.enabled === false ? "none" : state?.state === "available" ? "ok" : state?.state === "unavailable" ? "warn" : "none";
  return <span className="security-state" data-tone={tone}>{words}</span>;
}

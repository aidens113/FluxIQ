import { parseRuntimeFailureRecord, type RuntimeFailureRecord } from "@fluxiq/contracts/runtime";
import type { FluxIQRuntimeCommandStatus } from "../../contracts.ts";
import { type ConfirmationOutcome } from "../confirmation/index.ts";
import { failureForCommandStatus } from "./command-status.ts";
import { outputDispatchFailure } from "./record.ts";
// A valid host-reported record wins. Otherwise Core names only what its own
// structured signals prove: a timed-out or rejected command, or a dispatched
// output whose bound confirmation input never arrived. Anything else is left
// to the legacy classifier.
export function dispatchFailure(dispatched: boolean, status: FluxIQRuntimeCommandStatus | undefined, reported: unknown, confirmation: ConfirmationOutcome | null): RuntimeFailureRecord | null {
  if (!dispatched)
    return parseRuntimeFailureRecord(reported) ?? failureForCommandStatus(status);
  if (confirmation && !confirmation.ok && !confirmation.cancelled)
    return outputDispatchFailure("output_not_observed", "output_confirmation.not_received", true, "confirmation");
  return null;
}

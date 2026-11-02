import { type ConfirmationOutcome } from "../confirmation/index.ts";
export function confirmationFailureMessage(confirmation: ConfirmationOutcome | null): string | undefined {
  return confirmation && !confirmation.ok ? confirmation.error : undefined;
}

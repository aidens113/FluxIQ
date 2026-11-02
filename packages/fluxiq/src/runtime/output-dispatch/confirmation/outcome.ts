export type ConfirmationOutcome = {
  ok: true;
} | {
  ok: false;
  error: string;
  cancelled: boolean;
};

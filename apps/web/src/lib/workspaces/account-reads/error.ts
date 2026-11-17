import type { WorkspaceRouteRefusal } from "../routes";

/** Only fixed safe refusals cross the read owner's internal boundary. */
export class AccountReadError extends Error {
  constructor(readonly refusal: WorkspaceRouteRefusal = { ok: false, status: 503, error: "Account data could not be read. Try again." }) {
    super(refusal.error);
    this.name = "AccountReadError";
  }
}

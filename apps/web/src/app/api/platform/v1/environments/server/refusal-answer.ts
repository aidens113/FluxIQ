import { EnvironmentRefusal } from "fluxiq/platform";
import type { EnvironmentRouteAnswer } from "./types";

/**
 * The answer for a refused operation, or null for anything that is not a
 * refusal (a driver's failure: the operation is recorded, and repeating it
 * with the same operation id finishes it). A refusal names its code, and the
 * plan's reason when admission refused (no plan, a lapsed plan, or every paid
 * browser in use). On an environment the route names (`named`), one the
 * caller may not act on answers exactly as one that does not exist, so
 * another workspace's environment is never disclosed.
 */
export function refusalAnswer(error: unknown, named: boolean): EnvironmentRouteAnswer | null {
  if (!(error instanceof EnvironmentRefusal)) return null;
  const forbidden = named ? notFound() : refused(403, "environments.forbidden", "This workspace may not have a dedicated browser.");
  switch (error.code) {
    case "invalid-request": return refused(400, "environments.invalid_request", "The request does not name a valid environment and operation.");
    case "admission-refused":
      if (error.admission === "not-authorized") return forbidden;
      return { status: 402, body: { ok: false, code: "environments.plan_required", reason: error.admission, error: "The workspace's plan does not admit another dedicated browser." } };
    case "not-authorized":
    case "not-dedicated": return forbidden;
    case "not-found":
    case "owned-elsewhere": return notFound();
    case "environment-exists": return refused(409, "environments.exists", "That environment already exists.");
    case "environment-deleted": return refused(409, "environments.deleted", "That environment was deleted.");
    case "operation-reused": return refused(409, "environments.operation_reused", "That operation id was already used for another operation.");
    case "driver-mismatch": return refused(409, "environments.driver_mismatch", "That environment runs on another driver.");
  }
}

function notFound(): EnvironmentRouteAnswer {
  return refused(404, "environments.not_found", "No such environment in this workspace.");
}

function refused(status: number, code: string, error: string): EnvironmentRouteAnswer {
  return { status, body: { ok: false, code, error } };
}

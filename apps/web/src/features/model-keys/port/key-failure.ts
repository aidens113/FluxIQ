import type { ApiResponse } from "../../programs/program-api";

const COULD_NOT = "That did not work. Try again.";
const NEEDS_PASSWORD = "FluxIQ needs your password to change this key. Check it and try again.";

/** The sentence a person reads when a key call failed: the server's own words, else a plain one. */
export function keyFailure(response: ApiResponse<unknown>): string {
  const detail = response.error?.trim();
  if (detail) return detail;
  return response.requiresRecheck ? NEEDS_PASSWORD : COULD_NOT;
}

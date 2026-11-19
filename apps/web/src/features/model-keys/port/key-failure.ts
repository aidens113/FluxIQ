import type { ApiResponse } from "../../programs/program-api";

const COULD_NOT = "That did not work. Try again.";

/** The sentence a person reads when a key call failed: the server's own words, else a plain one. */
export function keyFailure(response: ApiResponse<unknown>): string {
  const detail = response.error?.trim();
  if (detail) return detail;
  return COULD_NOT;
}

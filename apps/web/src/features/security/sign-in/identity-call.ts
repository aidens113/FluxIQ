import type { ApiResponse, JsonObject } from "../../programs/program-api";

/** The call a sign-in action goes through: the identity-access program's `post`. */
export type IdentityPost = <T = unknown>(endpoint: string, payload: JsonObject) => Promise<ApiResponse<T>>;

const NOT_REACHED = { ok: false, error: "FluxIQ could not be reached. Try again." } as const;

/** One identity-access call that never throws: a failure to reach it, or an answer that is not an answer, is a plain refusal the person can read. */
export async function identityCall<T = unknown>(post: IdentityPost, endpoint: string, payload: JsonObject): Promise<ApiResponse<T>> {
  let result: ApiResponse<T> | undefined;
  try {
    result = await post<T>(endpoint, payload);
  } catch {
    return NOT_REACHED;
  }
  return result && typeof result.ok === "boolean" ? result : NOT_REACHED;
}

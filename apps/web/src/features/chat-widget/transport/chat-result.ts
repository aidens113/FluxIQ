// A program response as a `ChatResult`: its payload on success, the failure
// the chat reads otherwise. Nothing throws through a port.

import type { ChatResult } from "@fluxiq/ui-components";
import type { ApiResponse } from "../../programs/program-api";
import { chatFailure } from "./chat-failure";

/** `response`'s payload as the value, or `pick(payload)` when only part of it may reach the chat. */
export function chatResult<T, P = unknown>(response: ApiResponse<P>, pick?: (payload: P | undefined) => T): ChatResult<T> {
  if (!response.ok) return chatFailure(response);
  return { ok: true, value: pick ? pick(response.payload) : (response.payload ?? {}) as T };
}

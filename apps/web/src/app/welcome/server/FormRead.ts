import type { AccountLinkResponse } from "./accountLinkResponse";

/**
 * What reading a posted body gives: its parsed value, or the refusal to answer with.
 * A tagged result, never a union of the posted value and an answer, so no posted
 * field can pass for a ready-made answer.
 */
export type FormRead<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly response: AccountLinkResponse };

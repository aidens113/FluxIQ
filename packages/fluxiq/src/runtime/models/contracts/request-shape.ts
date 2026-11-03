/** Diagnostic JSON preserves readonly collections and optional fields supplied by an adapter. */
export type ModelRequestShape = null | boolean | number | string | readonly ModelRequestShape[] | { readonly [key: string]: ModelRequestShape | undefined };

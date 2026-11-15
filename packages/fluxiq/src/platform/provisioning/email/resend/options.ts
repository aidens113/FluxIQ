import type { PlatformEmailTemplateOverrides } from "../types.ts";

/** Operator-supplied delivery configuration; never part of a public request. */
export type ResendEmailOptions = {
  apiKey: string;
  from: string;
  templates?: PlatformEmailTemplateOverrides;
  fetch?: typeof globalThis.fetch;
};

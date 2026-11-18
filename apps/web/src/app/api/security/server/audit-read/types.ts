import type { ActivityPage } from "../../../../../features/security/activity/model";

export type AuditActivityAnswer =
  | { readonly status: 200; readonly body: { readonly ok: true; readonly payload: ActivityPage } }
  | { readonly status: 400; readonly body: { readonly ok: false; readonly code: "invalid_input"; readonly error: string } };

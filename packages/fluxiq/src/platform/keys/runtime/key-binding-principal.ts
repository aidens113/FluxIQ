import { iamPrincipalFrn } from "../../iam/frn/index.ts";
import { KeySessionError, type KeyBinding } from "../model/index.ts";

/** Validate the binding before persisting it or constructing its IAM principal. */
export function keyBindingPrincipal(binding: KeyBinding) {
  if (typeof binding.userId !== "string" || typeof binding.workspaceId !== "string" || !binding.userId || !binding.workspaceId || binding.userId.length > 256 || binding.workspaceId.length > 256) throw new KeySessionError("key.bad_enrollment");
  let frn: string;
  try {
    frn = iamPrincipalFrn("user", binding.workspaceId, binding.userId);
  } catch {
    throw new KeySessionError("key.bad_enrollment");
  }
  return { type: "user" as const, id: binding.userId, workspaceId: binding.workspaceId, frn };
}

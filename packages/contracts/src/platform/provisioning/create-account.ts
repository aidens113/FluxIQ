import { z } from "zod";
import { provisioningFieldSchemas as field } from "./fields.ts";

const createAccountFields = {
  requestId: field.requestId,
  email: field.email,
  displayName: field.displayName,
  externalId: field.externalId.optional(),
  policies: field.policies,
  workspace: field.workspace,
  termsVersion: field.termsVersion.optional(),
  continueUrl: field.continueUrl.optional(),
  sendWelcome: z.boolean().optional()
};

/**
 * `createAccount` over the private HTTP listener: no password ever travels;
 * the person sets one through the welcome link. A body carrying `password`
 * (or any unknown field) is refused.
 */
export const createAccountHttpInputSchema = z.object(createAccountFields).strict();

/** `createAccount` in-process (owner claim, the admin "add user" form, plugin server entries): may pass the password once. */
export const createAccountInputSchema = z.object({ ...createAccountFields, password: field.password.optional() }).strict();

/**
 * The result. `created` names the new user and its workspace. `exists`
 * reports an email that already has an account, and only over HTTP: Core
 * mails the address "you already have an account", the website shows "check
 * your email" either way, and no id is returned. In-process the same case is
 * the `email_taken` error.
 */
export const createAccountResultSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("created"), userId: field.userId, workspaceId: field.workspaceId }).strict(),
  z.object({ status: z.literal("exists") }).strict()
]);

export type CreateAccountHttpInput = z.infer<typeof createAccountHttpInputSchema>;
export type CreateAccountInput = z.infer<typeof createAccountInputSchema>;
export type CreateAccountResult = z.infer<typeof createAccountResultSchema>;

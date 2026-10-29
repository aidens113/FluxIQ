import type { PanelEmailTemplate } from "@fluxiq/contracts/platform";
import type { PlatformEmailTemplateText } from "./types.ts";

/**
 * Core's stock text for every `PANEL_EMAIL_TEMPLATES` name. Placeholders:
 * welcome `displayName`, `welcomeUrl`, `expiresInHours`; account-exists
 * `signInUrl`, `resetUrl`; password-reset `displayName`, `resetUrl`,
 * `expiresInMinutes`; client-connected and credential-reused `displayName`,
 * `clientLabel`, `manageUrl`.
 */
export const STOCK_PLATFORM_EMAIL_TEMPLATES: Readonly<Record<PanelEmailTemplate, PlatformEmailTemplateText>> = Object.freeze({
  welcome: {
    subject: "Finish setting up your FluxIQ account",
    text: [
      "Hello {{displayName}},",
      "",
      "Your FluxIQ account is ready. Open this link to confirm your email address and choose a password:",
      "",
      "{{welcomeUrl}}",
      "",
      "The link works once and expires in {{expiresInHours}} hours. If you did not ask for an account, you can ignore this email."
    ].join("\n")
  },
  "account-exists": {
    subject: "You already have a FluxIQ account",
    text: [
      "Someone asked to create a FluxIQ account with this email address, which already has one.",
      "",
      "Sign in: {{signInUrl}}",
      "Forgotten your password? Reset it here: {{resetUrl}}",
      "",
      "If this was not you, you can ignore this email; nothing has changed."
    ].join("\n")
  },
  "password-reset": {
    subject: "Reset your FluxIQ password",
    text: [
      "Hello {{displayName}},",
      "",
      "Open this link to choose a new password:",
      "",
      "{{resetUrl}}",
      "",
      "The link works once and expires in {{expiresInMinutes}} minutes. Keys sealed under your old password cannot be read after a reset.",
      "If you did not ask for a reset, you can ignore this email."
    ].join("\n")
  },
  "client-connected": {
    subject: "A client was connected to your FluxIQ account",
    text: ["Hello {{displayName}},", "", "{{clientLabel}} was connected to your FluxIQ account.", "", "If this was not you, revoke it here: {{manageUrl}}"].join("\n")
  },
  "credential-reused": {
    subject: "A FluxIQ client credential was reused",
    text: [
      "Hello {{displayName}},",
      "",
      "An old credential of {{clientLabel}} was presented, so FluxIQ presumed it stolen and revoked the client.",
      "",
      "Review your connected clients here: {{manageUrl}}"
    ].join("\n")
  }
});

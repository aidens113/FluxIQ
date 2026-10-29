import type { PlatformEmailMessage } from "../types.ts";
import { STOCK_PLATFORM_EMAIL_TEMPLATES } from "./stock-email-templates.ts";
import type { PlatformEmailTemplateOverrides, RenderedPlatformEmail } from "./types.ts";

const PLACEHOLDER = /\{\{([A-Za-z][A-Za-z0-9]*)\}\}/gu;

/**
 * Renders one message: the product's template when it gives one, else the
 * stock text, with every `{{name}}` filled from `variables`. A name the
 * message does not carry becomes empty text, never the raw placeholder.
 */
export function renderPlatformEmail(message: PlatformEmailMessage, overrides: PlatformEmailTemplateOverrides = {}): RenderedPlatformEmail {
  const template = overrides[message.template] ?? STOCK_PLATFORM_EMAIL_TEMPLATES[message.template];
  const fill = (text: string): string => text.replace(PLACEHOLDER, (_match, name: string) => (Object.hasOwn(message.variables, name) ? (message.variables[name] ?? "") : ""));
  return { template: message.template, to: message.to, subject: fill(template.subject), text: fill(template.text) };
}

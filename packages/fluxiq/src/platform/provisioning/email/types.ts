import type { PanelEmailTemplate } from "@fluxiq/contracts/platform";

/** One template's words, with `{{name}}` placeholders. */
export type PlatformEmailTemplateText = {
  subject: string;
  text: string;
};

/** A product's branded templates (`PanelProduct.email.templates`), by name; a template not given falls back to the stock text. */
export type PlatformEmailTemplateOverrides = Partial<Readonly<Record<PanelEmailTemplate, PlatformEmailTemplateText>>>;

/** A rendered email, ready to send. */
export type RenderedPlatformEmail = {
  template: PanelEmailTemplate;
  to: string;
  subject: string;
  text: string;
};

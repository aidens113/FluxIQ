import type { PanelProduct } from "@fluxiq/contracts/platform";

export type PanelBranding = {
  name: string;
  shortName: string;
  logoUrl: string | null;
  faviconUrl: string | null;
  signInArtUrl: string | null;
  style: Record<string, string>;
  links: NonNullable<PanelProduct["links"]>;
  signInTitle: string | null;
  signInMessage: string | null;
  signUpUrl: string | null;
};

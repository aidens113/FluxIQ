import { z } from "zod";
import { parseClientGatewayOriginRule } from "../origin/index.ts";
import { isSecureOrLoopbackUrl } from "../url/index.ts";

/** Where the panel serves a product asset: `/product/assets/<name>`. */
export const PANEL_PRODUCT_ASSET_PATH = "/product/assets/";

/**
 * The emails a product may brand, by template name: the welcome link, "you
 * already have an account", a password reset, a newly connected client, and a
 * reused (presumed stolen) credential. A template not given falls back to
 * Core's stock text.
 */
export const PANEL_EMAIL_TEMPLATES = Object.freeze(["welcome", "account-exists", "password-reset", "client-connected", "credential-reused"] as const);

export type PanelEmailTemplate = (typeof PANEL_EMAIL_TEMPLATES)[number];

const assetName = z.string().regex(/^[a-z0-9][a-z0-9._-]{0,63}\.(?:svg|png|webp|ico|jpg|jpeg)$/u);
const absoluteUrl = z.string().refine((value) => isSecureOrLoopbackUrl(value, "http"), "an https URL, or http on loopback");
const hexColor = z.string().regex(/^#[0-9a-f]{6}$/u);
const accent = z.object({ primary: hexColor, primaryHover: hexColor, focus: hexColor }).strict();
const shortId = z.string().regex(/^[a-z][a-z0-9-]{0,63}$/u);
const label = z.string().min(1).max(60);
const emailTemplate = z.object({ subject: z.string().min(1).max(200), text: z.string().min(1).max(20_000) }).strict();

/**
 * Layer 1 of the panel's extension points: the product manifest a host module
 * registers (`registerFluxIQPlatform`), read by server components so there is
 * no unbranded flash. Without one, the panel shows stock branding.
 *
 * - `id`, `name`, `shortName`: the product's identity;
 * - `assets`: file names served at `/product/assets/<name>` (logo, favicon,
 *   sign-in art); the host module supplies the files;
 * - `brand`: the accent subset of the theme contract, per mode, as lower-case
 *   `#rrggbb`; the panel checks contrast against its own surfaces;
 * - `links`: website, terms, privacy, support and status pages;
 * - `auth`: the sign-in page's words and the sign-up URL discovery publishes;
 * - `extensionStores`: where to get the product's client ("Get the extension");
 * - `extensionClients`: the product's clients and their Origin allowlist
 *   entries, which feed the gateway's default allowlist;
 * - `email`: the sender, and the branded templates by `PANEL_EMAIL_TEMPLATES`
 *   name, with `{{name}}` placeholders the sender fills.
 *
 * Unknown fields are refused, so a misspelt key is an error at startup.
 */
export const panelProductSchema = z
  .object({
    id: shortId,
    name: label,
    shortName: z.string().min(1).max(24),
    assets: z.object({ logo: assetName.optional(), favicon: assetName.optional(), signInArt: assetName.optional() }).strict().optional(),
    brand: z.object({ light: accent.optional(), dark: accent.optional() }).strict().optional(),
    links: z
      .object({ website: absoluteUrl.optional(), terms: absoluteUrl.optional(), privacy: absoluteUrl.optional(), support: absoluteUrl.optional(), status: absoluteUrl.optional() })
      .strict()
      .optional(),
    auth: z.object({ signInTitle: z.string().min(1).max(80).optional(), signInMessage: z.string().min(1).max(300).optional(), signUpUrl: absoluteUrl.optional() }).strict().optional(),
    extensionStores: z.array(z.object({ id: shortId, label, url: absoluteUrl }).strict()).max(10).optional(),
    extensionClients: z
      .array(
        z
          .object({
            id: shortId,
            label,
            origins: z.array(z.string().refine((entry) => parseClientGatewayOriginRule(entry) !== null, "an Origin allowlist entry")).min(1).max(10)
          })
          .strict()
      )
      .max(10)
      .optional(),
    email: z
      .object({
        sender: z.object({ name: label, address: z.string().email().max(254) }).strict(),
        replyTo: z.string().email().max(254).optional(),
        templates: z.record(z.enum(PANEL_EMAIL_TEMPLATES), emailTemplate).optional()
      })
      .strict()
      .optional()
  })
  .strict();

export type PanelProduct = z.infer<typeof panelProductSchema>;

/** The same-origin URL of a product asset. */
export function panelProductAssetUrl(name: string): string {
  if (!assetName.safeParse(name).success) throw new TypeError(`Not a product asset name: ${JSON.stringify(name)}`);
  return `${PANEL_PRODUCT_ASSET_PATH}${name}`;
}

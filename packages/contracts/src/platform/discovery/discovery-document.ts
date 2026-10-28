import { z } from "zod";
import { FLUXIQ_PROFILES } from "../profile.ts";
import { isSameOriginPath, isSecureOrLoopbackOrigin, isSecureOrLoopbackUrl } from "../url/index.ts";

/** The discovery document version this contract describes. */
export const FLUXIQ_DISCOVERY_VERSION = 1;

/** How long a client may cache discovery, in seconds (`Cache-Control: max-age`). */
export const FLUXIQ_DISCOVERY_MAX_AGE_SECONDS = 300;

const samePath = z.string().refine(isSameOriginPath, "a same-origin path");
const protocolVersion = z.string().regex(/^\d{1,3}\.\d{1,3}$/u);
const clientVersion = z.string().regex(/^\d{1,4}\.\d{1,4}\.\d{1,6}$/u);

/**
 * `GET /.well-known/fluxiq` (served by `/api/discovery`): what a client needs
 * to connect to this instance. No secrets; cacheable for
 * `FLUXIQ_DISCOVERY_MAX_AGE_SECONDS`.
 *
 * - `origin`: the instance's own origin; a client refuses a document whose
 *   `origin` is not the origin it fetched it from (`parseFluxIQDiscoveryDocument`);
 * - `gatewayUrl`: `wss:` (or `ws:` on loopback);
 * - `connect`: same-origin paths, except `signUpUrl`, which is absolute
 *   (`https:`, or `http:` on loopback) and comes from the product manifest;
 * - `protocols.clientGateway`: the gateway protocol versions served;
 * - `minimumClient`: the oldest client version accepted, by client kind.
 *
 * Fields a client does not know are dropped, so a later additive field never
 * breaks it; an incompatible change raises `fluxiqDiscoveryVersion`. Under the
 * `service` profile, `origin` must be `https:` and `gatewayUrl` `wss:`.
 */
export const fluxiqDiscoveryDocumentSchema = z
  .object({
    fluxiqDiscoveryVersion: z.literal(FLUXIQ_DISCOVERY_VERSION),
    instance: z.object({
      name: z.string().min(1).max(100),
      profile: z.enum(FLUXIQ_PROFILES),
      product: z.object({ name: z.string().min(1).max(60), logoUrl: samePath.optional() }).optional()
    }),
    origin: z.string().refine(isSecureOrLoopbackOrigin, "an https origin, or http on loopback"),
    gatewayUrl: z.string().refine((value) => isSecureOrLoopbackUrl(value, "ws"), "a wss URL, or ws on loopback"),
    connect: z.object({
      authorizeUrl: samePath,
      tokenUrl: samePath,
      revokeUrl: samePath,
      codeEntryUrl: samePath,
      signUpUrl: z.string().refine((value) => isSecureOrLoopbackUrl(value, "http"), "an https URL, or http on loopback").optional()
    }),
    protocols: z.object({ clientGateway: z.array(protocolVersion).min(1).max(16) }),
    minimumClient: z.record(z.string().regex(/^[a-z][a-z0-9-]{0,63}$/u), clientVersion)
  })
  .superRefine((document, context) => {
    if (document.instance.profile !== "service") return;
    if (!document.origin.startsWith("https:")) context.addIssue({ code: z.ZodIssueCode.custom, path: ["origin"], message: "the service profile serves https" });
    if (!document.gatewayUrl.startsWith("wss:")) context.addIssue({ code: z.ZodIssueCode.custom, path: ["gatewayUrl"], message: "the service profile serves wss" });
  });

export type FluxIQDiscoveryDocument = z.infer<typeof fluxiqDiscoveryDocumentSchema>;

/**
 * Parses a fetched discovery document and checks it names the origin it was
 * fetched from; `success: false` carries every refusal.
 */
export function parseFluxIQDiscoveryDocument(value: unknown, fetchedFromOrigin: string): z.SafeParseReturnType<unknown, FluxIQDiscoveryDocument> {
  return fluxiqDiscoveryDocumentSchema
    .superRefine((document, context) => {
      if (document.origin !== fetchedFromOrigin) context.addIssue({ code: z.ZodIssueCode.custom, path: ["origin"], message: `the document names ${document.origin}, not ${fetchedFromOrigin}` });
    })
    .safeParse(value);
}

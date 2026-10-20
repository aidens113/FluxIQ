/**
 * The media type a content-address key is sealed under. The protection binds it
 * into the sealed form (AES-GCM authenticates project id, media type and host
 * key id), so a sealed address key opens only as an address key of its project.
 */
export const AUTOMATION_STUDIO_CONTENT_ADDRESS_KEY_MEDIA_TYPE = "application/vnd.fluxiq.content-address-key" as const;

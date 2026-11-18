import { z } from "zod";
import { isSecureOrLoopbackOrigin, isSecureOrLoopbackUrl } from "../../platform/url/index.ts";

/** Exact canonical registrations; no wildcard, URL credentials, fragment or arbitrary HTTP host. */
export const appOriginSchema = z.string().refine(value => !value.includes("*") && isSecureOrLoopbackOrigin(value));
export const appUrlSchema = z.string().refine(value => !value.includes("*") && isSecureOrLoopbackUrl(value, "http") && new URL(value).href === value);

import { z } from "zod";
import { isLoopbackHostname } from "../../platform/url/index.ts";
import { appOriginSchema, appUrlSchema, appUniqueList } from "../validation/index.ts";

export const appFrontendSchema = z.object({
  mode: z.enum(["production", "loopback-development"]),
  entryUrl: appUrlSchema,
  allowedOrigins: appUniqueList(appOriginSchema, value => value, 32).refine(values => values.length > 0),
  redirectUris: appUniqueList(appUrlSchema, value => value, 32).refine(values => values.length > 0)
}).strict().superRefine((frontend, context) => {
  const urls = [...frontend.allowedOrigins, frontend.entryUrl, ...frontend.redirectUris].map(value => new URL(value));
  const appropriate = frontend.mode === "production" ? urls.every(url => url.protocol === "https:") : urls.every(url => isLoopbackHostname(url.hostname));
  if (!appropriate || !frontend.allowedOrigins.includes(new URL(frontend.entryUrl).origin) || frontend.redirectUris.some(value => !frontend.allowedOrigins.includes(new URL(value).origin))) context.addIssue({ code: "custom", message: "Frontend URLs must match the exact registered origins and deployment mode." });
});

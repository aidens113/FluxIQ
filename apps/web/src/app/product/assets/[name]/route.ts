import { readFile } from "node:fs/promises";
import path from "node:path";
import { getPlatformRegistry } from "fluxiq/platform/panel";
import { ensurePlatformModulesLoaded } from "../../server";

export const runtime = "nodejs";

const TYPES: Readonly<Record<string, string>> = {
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg"
};

const notFound = (): Response => new Response(null, { status: 404 });

/** Serves one of the registered product's declared assets; anything else is a bare 404. Public: the sign-in page shows the logo. */
export async function GET(_request: Request, context: { params: Promise<{ name: string }> }): Promise<Response> {
  await ensurePlatformModulesLoaded();
  const { name } = await context.params;
  const registry = getPlatformRegistry();
  const declared = Object.values(registry.product()?.assets ?? {}).filter((value): value is string => typeof value === "string");
  const directory = registry.assetsDir();
  if (!directory || typeof name !== "string" || !declared.includes(name)) return notFound();
  const type = TYPES[path.extname(name).toLowerCase()];
  if (!type) return notFound();
  let body: Buffer;
  try {
    body = await readFile(path.join(directory, name));
  } catch {
    return notFound();
  }
  const headers: Record<string, string> = { "content-type": type, "cache-control": "public, max-age=3600", "x-content-type-options": "nosniff" };
  if (type === "image/svg+xml") headers["content-security-policy"] = "default-src 'none'; style-src 'unsafe-inline'";
  return new Response(new Uint8Array(body), { status: 200, headers });
}

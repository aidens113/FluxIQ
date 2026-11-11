import { fluxiqRuntimeTextWithholding } from "../../../../../runtime/index.ts";
import { withheldData } from "./withheld-data.ts";

/** `data` with every occurrence of the secret `texts` replaced by `[withheld]`, in any text and key at any depth. With none, `data` itself. */
export function fluxNodeWithheldRecords<T>(data: T, texts: readonly string[]): T {
  const secrets = texts.filter((text) => text !== "");
  return secrets.length ? (withheldData(data, fluxiqRuntimeTextWithholding(secrets), 0) as T) : data;
}

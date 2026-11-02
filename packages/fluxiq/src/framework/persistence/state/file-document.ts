import type { JsonObject } from "../../../core/index.ts";

export type JsonFileDocument<T extends JsonObject = JsonObject> = {
  version: 1;
  data: T;
};

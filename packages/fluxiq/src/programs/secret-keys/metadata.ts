import type { GlobalProgramDefinition } from "../_shared/types.ts";

export const SECRET_KEYS_PROGRAM: GlobalProgramDefinition = {
  id: "secret-keys",
  title: "Secret Keys",
  category: "Framework Control",
  description: "Manage encrypted LLM provider keys and custom framework secrets.",
  icon: "key-round",
  status: "preview"
};
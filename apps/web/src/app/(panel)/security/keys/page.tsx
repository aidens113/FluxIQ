import { redirect } from "next/navigation";

/** `/security/keys` is gone: AI keys live under Settings (`/settings#ai-keys`), and the logins and keys Flows use under Settings > Advanced. */
export default function SecurityKeysRoute(): never {
  redirect("/settings#ai-keys");
}

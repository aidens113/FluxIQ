import { redirect } from "next/navigation";

/** `/security` opens the first tab, Your sign-in. */
export default function SecurityRoute(): never {
  redirect("/security/sign-in");
}
